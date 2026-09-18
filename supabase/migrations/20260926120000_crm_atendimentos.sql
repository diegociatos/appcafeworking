-- Histórico separado do app_state: uma edição antiga do card não apaga conversas.
create table public.crm_atendimentos (
  unidade_id text not null references public.unidades(id),
  lead_id text not null,
  responsavel_id uuid not null references auth.users(id),
  responsavel_nome text not null,
  assumido_em timestamptz not null default now(),
  primary key (unidade_id, lead_id)
);
create table public.crm_comentarios (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null,
  lead_id text not null,
  autor_id uuid not null references auth.users(id),
  autor_nome text not null,
  texto text not null check (length(texto) between 1 and 4000),
  created_at timestamptz not null default now(),
  foreign key (unidade_id, lead_id) references public.crm_atendimentos(unidade_id, lead_id)
);
create table public.crm_retornos (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null,
  lead_id text not null,
  comentario_id uuid not null references public.crm_comentarios(id),
  responsavel_id uuid not null references auth.users(id),
  agendado_para timestamptz not null,
  status text not null default 'agendado' check (status in ('agendado','processando','enviado','erro','cancelado','concluido')),
  created_at timestamptz not null default now(),
  processado_em timestamptz,
  enviado_em timestamptz,
  erro text,
  foreign key (unidade_id, lead_id) references public.crm_atendimentos(unidade_id, lead_id)
);
create index crm_comentarios_lead on public.crm_comentarios(unidade_id, lead_id, created_at);
create index crm_retornos_pendentes on public.crm_retornos(agendado_para) where status='agendado';
create index crm_retornos_lead on public.crm_retornos(unidade_id, lead_id);
alter table public.crm_atendimentos enable row level security;
alter table public.crm_comentarios enable row level security;
alter table public.crm_retornos enable row level security;
create policy "crm: equipe le atendimento" on public.crm_atendimentos for select to authenticated
  using (public.is_platform_admin() or public.is_unidade_staff(unidade_id));
create policy "crm: equipe le comentarios" on public.crm_comentarios for select to authenticated
  using (public.is_platform_admin() or public.is_unidade_staff(unidade_id));
create policy "crm: equipe le retornos" on public.crm_retornos for select to authenticated
  using (public.is_platform_admin() or public.is_unidade_staff(unidade_id));
revoke all on public.crm_atendimentos, public.crm_comentarios, public.crm_retornos from anon, authenticated;
grant select on public.crm_atendimentos, public.crm_comentarios, public.crm_retornos to authenticated;
grant all on public.crm_atendimentos, public.crm_comentarios, public.crm_retornos to service_role;

-- Autor, responsável e datas vêm do JWT/banco, nunca do navegador.
create or replace function public.crm_registrar_atendimento(
  p_unidade_id text, p_lead_id text, p_acao text, p_texto text default null,
  p_retorno_em timestamptz default null, p_retorno_id uuid default null
) returns void language plpgsql security definer set search_path=public as $$
declare
  v_user uuid := auth.uid(); v_nome text; v_dono uuid; v_comentario uuid;
begin
  if v_user is null or not (public.is_platform_admin() or public.is_unidade_staff(p_unidade_id)) then
    raise exception 'Sem permissão para atender nesta unidade.';
  end if;
  -- Bloqueio comum às mutações: assume, comenta, conclui ou agenda serialmente.
  perform 1 from public.app_state where unidade_id=p_unidade_id and entity='leads' and item_id=p_lead_id for update;
  if not found then raise exception 'Lead não encontrado. Atualize o quadro.'; end if;
  select coalesce(nullif(trim(raw_user_meta_data->>'nome'),''),nullif(trim(raw_user_meta_data->>'name'),''),email,'Usuário')
    into v_nome from auth.users where id=v_user;
  select responsavel_id into v_dono from public.crm_atendimentos where unidade_id=p_unidade_id and lead_id=p_lead_id;
  if p_acao='assumir' then
    if v_dono is not null and v_dono<>v_user then raise exception 'Este atendimento já foi assumido por outro usuário. Atualize o quadro.'; end if;
    insert into public.crm_atendimentos(unidade_id,lead_id,responsavel_id,responsavel_nome)
      values(p_unidade_id,p_lead_id,v_user,v_nome) on conflict do nothing;
    return;
  end if;
  if v_dono is null then raise exception 'Assuma o atendimento antes de registrar a conversa.'; end if;
  if p_acao='comentar' then
    if p_texto is null or length(trim(p_texto)) not between 1 and 4000 then raise exception 'Escreva um comentário de até 4.000 caracteres.'; end if;
    if p_retorno_em is not null and (p_retorno_em<=now() or p_retorno_em>now()+interval '1 year') then
      raise exception 'Escolha um retorno futuro, em até um ano.';
    end if;
    if p_retorno_em is not null and exists(select 1 from public.crm_retornos where unidade_id=p_unidade_id and lead_id=p_lead_id and status in ('agendado','processando')) then
      raise exception 'Já há um retorno pendente. Conclua ou cancele antes de agendar outro.';
    end if;
    insert into public.crm_comentarios(unidade_id,lead_id,autor_id,autor_nome,texto)
      values(p_unidade_id,p_lead_id,v_user,v_nome,trim(p_texto)) returning id into v_comentario;
    if p_retorno_em is not null then
      insert into public.crm_retornos(unidade_id,lead_id,comentario_id,responsavel_id,agendado_para)
        values(p_unidade_id,p_lead_id,v_comentario,v_dono,p_retorno_em);
    end if;
    return;
  end if;
  if p_acao in ('concluir','cancelar') then
    update public.crm_retornos set status=case when p_acao='concluir' then 'concluido' else 'cancelado' end
      where id=p_retorno_id and unidade_id=p_unidade_id and lead_id=p_lead_id and status in ('agendado','enviado','erro');
    if not found then raise exception 'Retorno não encontrado ou envio já em processamento. Atualize o atendimento.'; end if;
    return;
  end if;
  raise exception 'Ação inválida.';
end $$;
revoke all on function public.crm_registrar_atendimento(text,text,text,text,timestamptz,uuid) from public, anon;
grant execute on function public.crm_registrar_atendimento(text,text,text,text,timestamptz,uuid) to authenticated;

-- Só o worker pode retirar itens da fila; SKIP LOCKED evita e-mail duplicado
-- quando duas execuções do agendador se sobrepõem. Falhas não são reenviadas automaticamente.
create or replace function public.crm_retirar_retornos() returns setof public.crm_retornos
language sql security definer set search_path=public as $$
  update public.crm_retornos set status='processando',processado_em=now()
  where id in (select id from public.crm_retornos where status='agendado' and agendado_para<=now()
    order by agendado_para limit 50 for update skip locked)
  returning *;
$$;
revoke all on function public.crm_retirar_retornos() from public,anon,authenticated;
grant execute on function public.crm_retirar_retornos() to service_role;
