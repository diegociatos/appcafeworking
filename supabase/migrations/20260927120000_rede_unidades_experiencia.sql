-- SOMENTE para revisão/local. Não aplicar em produção sem autorização.
-- Reutiliza contas, unidades, clientes, memberships e bucket privado existentes.
begin;
create or replace function public.pode_gerir_perfil_parceiro(p_unidade text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or exists (
    select 1 from public.unidade_members m join public.unidades u on u.id=m.unidade_id
    join public.contas c on c.id=u.franqueado_id
    where m.user_id=auth.uid() and m.unidade_id=p_unidade and m.role='master' and c.tipo='parceiro'
  );
$$;
revoke all on function public.pode_gerir_perfil_parceiro(text) from public, anon;
grant execute on function public.pode_gerir_perfil_parceiro(text) to authenticated, service_role;

create table public.parceiro_unidade_perfis (
  unidade_id text primary key references public.unidades(id),
  dados jsonb not null default '{}' check (jsonb_typeof(dados)='object' and octet_length(dados::text)<40000),
  status text not null default 'rascunho' check (status in ('rascunho','em_analise','rejeitado','publicado')),
  parecer text not null default '' check (length(parecer)<=2000),
  updated_at timestamptz not null default now(),
  revisado_por uuid references auth.users(id)
);
alter table public.parceiro_unidade_perfis enable row level security;
create policy perfil_leitura on public.parceiro_unidade_perfis for select to authenticated
using (public.pode_gerir_perfil_parceiro(unidade_id));
revoke all on public.parceiro_unidade_perfis from public, anon, authenticated;
grant select on public.parceiro_unidade_perfis to authenticated;
grant all on public.parceiro_unidade_perfis to service_role;

create table public.parceiro_requisitos (
  tipo text primary key check (tipo in ('iptu','alvara','anuencia_modelo','comprovante_imovel','avcb','habite_se','autorizacao_proprietario','outro')),
  obrigatorio boolean not null default false,
  ativo boolean not null default true
);
-- Catálogo existente; nenhum novo requisito legal presumido, admin configura.
insert into public.parceiro_requisitos(tipo) values ('iptu'),('alvara'),('anuencia_modelo'),('comprovante_imovel'),('avcb'),('habite_se'),('autorizacao_proprietario');
alter table public.parceiro_requisitos enable row level security;
create policy requisitos_leitura on public.parceiro_requisitos for select to authenticated using (true);
revoke all on public.parceiro_requisitos from public, anon, authenticated;
grant select on public.parceiro_requisitos to authenticated;
grant all on public.parceiro_requisitos to service_role;
create function public.configurar_requisito_parceiro(p_tipo text,p_obrigatorio boolean,p_ativo boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_platform_admin() then raise exception 'Somente admin'; end if;
  insert into public.parceiro_requisitos values (p_tipo,p_obrigatorio,p_ativo)
  on conflict(tipo) do update set obrigatorio=excluded.obrigatorio,ativo=excluded.ativo;
end $$;

alter table public.unidade_documentos add column revisao_status text not null default 'aprovado'
  check (revisao_status in ('pendente','em_analise','aprovado','rejeitado')),
  add column revisao_observacoes text not null default '' check (length(revisao_observacoes)<=2000);
-- Não certificar automaticamente documentos de parceiros preexistentes.
update public.unidade_documentos d set revisao_status='pendente'
from public.unidades u join public.contas c on c.id=u.franqueado_id
where d.unidade_id=u.id and c.tipo='parceiro';
create function public.revisao_documento_parceiro() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if TG_OP='UPDATE' and (new.unidade_id<>old.unidade_id or new.storage_path<>old.storage_path) then
    raise exception 'Envie um novo documento para substituir o arquivo';
  end if;
  if TG_OP='INSERT' and exists(select 1 from public.unidades u join public.contas c on c.id=u.franqueado_id where u.id=new.unidade_id and c.tipo='parceiro') then
    new.revisao_status:='pendente'; new.revisao_observacoes:='';
  elsif TG_OP='UPDATE' and not public.is_platform_admin() and coalesce(auth.role(),'')<>'service_role' then
    raise exception 'Somente admin revisa documentos';
  end if;
  return new;
end $$;
revoke all on function public.revisao_documento_parceiro() from public,anon,authenticated;
create trigger revisao_documento before insert or update on public.unidade_documentos
for each row execute function public.revisao_documento_parceiro();
create policy documento_revisao on public.unidade_documentos for update to authenticated
using (public.is_platform_admin()) with check (public.is_platform_admin());
grant update(revisao_status,revisao_observacoes) on public.unidade_documentos to authenticated;

create function public.salvar_perfil_parceiro(p_unidade text,p_dados jsonb,p_enviar boolean default false)
returns public.parceiro_unidade_perfis language plpgsql security definer set search_path=public as $$
declare v public.parceiro_unidade_perfis;
begin
  if not public.pode_gerir_perfil_parceiro(p_unidade) then raise exception 'Sem acesso à unidade'; end if;
  if not exists(select 1 from public.unidades u join public.contas c on c.id=u.franqueado_id where u.id=p_unidade and c.tipo='parceiro') then raise exception 'Escolha uma unidade parceira'; end if;
  if jsonb_typeof(p_dados)<>'object' or (p_dados ? 'servicos' and (jsonb_typeof(p_dados->'servicos')<>'array' or not (p_dados->'servicos' <@ '["endereco_fiscal","coworking","sala_hora","sala_privativa"]'::jsonb))) then raise exception 'Serviços inválidos'; end if;
  if p_dados ? 'fotos' then
    if jsonb_typeof(p_dados->'fotos')<>'array' or jsonb_array_length(p_dados->'fotos')>20 then raise exception 'Envie até 20 links de fotos'; end if;
    if exists(select 1 from jsonb_array_elements_text(p_dados->'fotos') f where f !~ '^https://[^[:space:]]+$' or length(f)>2000) then raise exception 'Fotos precisam de links HTTPS válidos'; end if;
  end if;
  if p_enviar and (coalesce(p_dados->>'empresa','')='' or coalesce(p_dados->>'responsavel','')='' or coalesce(p_dados->>'endereco','')='' or coalesce(p_dados->>'cidade','')='' or coalesce(p_dados->>'bairro','')='' or coalesce(p_dados->>'uf','') !~ '^[A-Z]{2}$' or coalesce(p_dados->>'horarios','')='' or coalesce(jsonb_array_length(p_dados->'fotos'),0)=0 or coalesce(jsonb_array_length(p_dados->'servicos'),0)=0 or coalesce(p_dados->>'financeiroConferido','false')<>'true') then
    raise exception 'Complete empresa, imóvel, fotos, serviços e conferência financeira';
  end if;
  if p_enviar and p_dados->'servicos'<>'["endereco_fiscal"]'::jsonb and coalesce(p_dados->>'espacosConferidos','false')<>'true' then raise exception 'Confira os espaços para oferecer estes serviços'; end if;
  insert into public.parceiro_unidade_perfis(unidade_id,dados,status)
  values(p_unidade,p_dados,case when p_enviar then 'em_analise' else 'rascunho' end)
  on conflict(unidade_id) do update set dados=excluded.dados,status=excluded.status,parecer='',revisado_por=null,updated_at=now()
  returning * into v;
  insert into public.audit_logs(unidade_id,ator_id,acao,entidade,entidade_id,detalhe)
  values(p_unidade,auth.uid(),'parceiro.perfil_salvo','unidade',p_unidade,jsonb_build_object('status',v.status));
  return v;
end $$;
create function public.revisar_perfil_parceiro(p_unidade text,p_status text,p_parecer text default '')
returns void language plpgsql security definer set search_path=public as $$
declare v public.parceiro_unidade_perfis;
begin
  if not public.is_platform_admin() then raise exception 'Somente admin'; end if;
  if p_status not in ('rejeitado','publicado') then raise exception 'Situação inválida'; end if;
  select * into v from public.parceiro_unidade_perfis where unidade_id=p_unidade for update;
  if v.status is distinct from 'em_analise' then raise exception 'Envie a unidade para análise primeiro'; end if;
  if p_status='rejeitado' and btrim(p_parecer)='' then raise exception 'Informe as correções necessárias'; end if;
  if p_status='publicado' then
    if not exists(select 1 from public.unidades u join public.contas c on c.id=u.franqueado_id where u.id=p_unidade and c.parceiro_status='ativo' and coalesce(btrim(c.asaas_wallet_id),'')<>'') then raise exception 'Configure e ative o recebimento na conta'; end if;
    if exists(select 1 from public.parceiro_requisitos r where r.ativo and r.obrigatorio and not exists(select 1 from public.unidade_documentos d where d.unidade_id=p_unidade and d.tipo=r.tipo and d.revisao_status='aprovado' and (d.validade is null or d.validade>=current_date))) then raise exception 'Há documentos obrigatórios pendentes'; end if;
    update public.unidades set endereco=v.dados->>'endereco',cidade=(v.dados->>'cidade')||'/'||(v.dados->>'uf') where id=p_unidade;
  end if;
  update public.parceiro_unidade_perfis set status=p_status,parecer=p_parecer,revisado_por=auth.uid(),updated_at=now() where unidade_id=p_unidade;
  insert into public.audit_logs(unidade_id,ator_id,acao,entidade,entidade_id,detalhe)
  values(p_unidade,auth.uid(),'parceiro.perfil_revisado','unidade',p_unidade,jsonb_build_object('status',p_status,'parecer',p_parecer));
end $$;
-- ACL explícita: default privileges anteriores são permissivos.
revoke all on function public.salvar_perfil_parceiro(text,jsonb,boolean),public.revisar_perfil_parceiro(text,text,text),public.configurar_requisito_parceiro(text,boolean,boolean) from public,anon;
grant execute on function public.salvar_perfil_parceiro(text,jsonb,boolean),public.revisar_perfil_parceiro(text,text,text),public.configurar_requisito_parceiro(text,boolean,boolean) to authenticated;

-- Publicação centralizada: conta própria preservada; parceiro precisa de revisão.
create function public.unidade_publicavel(p_unidade text) returns boolean
language sql stable security definer set search_path=public as $$
select exists(select 1 from public.unidades u join public.contas c on c.id=u.franqueado_id
left join public.parceiro_unidade_perfis p on p.unidade_id=u.id
where u.id=p_unidade and u.ativa and (c.tipo='propria' or (c.tipo='parceiro' and c.parceiro_status='ativo' and coalesce(btrim(c.asaas_wallet_id),'')<>'' and p.status='publicado'
and not exists(select 1 from public.parceiro_requisitos r where r.ativo and r.obrigatorio and not exists(select 1 from public.unidade_documentos d where d.unidade_id=u.id and d.tipo=r.tipo and d.revisao_status='aprovado' and (d.validade is null or d.validade>=current_date))))));
$$;
revoke all on function public.unidade_publicavel(text) from public,anon,authenticated;
grant execute on function public.unidade_publicavel(text) to service_role;
create function public.servico_publicavel(p_unidade text,p_categoria text) returns boolean
language sql stable security definer set search_path=public as $$
  select public.unidade_publicavel(p_unidade) and exists(select 1 from public.unidades u join public.contas c on c.id=u.franqueado_id
  left join public.parceiro_unidade_perfis p on p.unidade_id=u.id
  where u.id=p_unidade and (c.tipo='propria' or (p.dados->'servicos') ? p_categoria));
$$;
revoke all on function public.servico_publicavel(text,text) from public,anon,authenticated;
grant execute on function public.servico_publicavel(text,text) to service_role;

-- Mensagens imutáveis. Uma conversa é o par (unidade, cliente existente).
create table public.unidade_mensagens (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id),
  cliente_id text not null references public.clientes(id),
  autor_id uuid not null default auth.uid() references auth.users(id),
  autor_papel text not null check (autor_papel in ('cliente','unidade','admin')),
  texto text not null check(length(btrim(texto)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index on public.unidade_mensagens(unidade_id,cliente_id,created_at);
create function public.pode_conversar_unidade(p_unidade text,p_cliente text) returns boolean
language sql stable security definer set search_path=public as $$
select exists(select 1 from public.clientes c where c.id=p_cliente and c.unidade_id=p_unidade and
 (public.is_platform_admin() or exists(select 1 from public.unidade_members m where m.user_id=auth.uid() and m.unidade_id=p_unidade and m.role in ('master','recepcao'))
 or (lower(btrim(c.email))=lower(auth.jwt()->>'email') and exists(select 1 from public.unidade_members m where m.user_id=auth.uid() and m.unidade_id=p_unidade and m.role='cliente'))));
$$;
revoke all on function public.pode_conversar_unidade(text,text) from public,anon;
grant execute on function public.pode_conversar_unidade(text,text) to authenticated,service_role;
alter table public.unidade_mensagens enable row level security;
create policy mensagens_leitura on public.unidade_mensagens for select to authenticated
using(public.pode_conversar_unidade(unidade_id,cliente_id));
revoke all on public.unidade_mensagens from public,anon,authenticated;
grant select on public.unidade_mensagens to authenticated;
grant all on public.unidade_mensagens to service_role;
create function public.enviar_mensagem_unidade(p_unidade text,p_cliente text,p_texto text)
returns void language plpgsql security definer set search_path=public as $$
declare papel text;
begin
  if not public.pode_conversar_unidade(p_unidade,p_cliente) then raise exception 'Sem acesso à conversa'; end if;
  papel:=case when public.is_platform_admin() then 'admin' when exists(select 1 from public.unidade_members where user_id=auth.uid() and unidade_id=p_unidade and role in ('master','recepcao')) then 'unidade' else 'cliente' end;
  insert into public.unidade_mensagens(unidade_id,cliente_id,autor_id,autor_papel,texto) values(p_unidade,p_cliente,auth.uid(),papel,btrim(p_texto));
end $$;
revoke all on function public.enviar_mensagem_unidade(text,text,text) from public,anon;
grant execute on function public.enviar_mensagem_unidade(text,text,text) to authenticated;

-- Operação presencial sobre a reserva existente, sem mexer em cobrança/crédito.
create function public.presenca_reserva_parceira(p_reserva text,p_status text)
returns void language plpgsql security definer set search_path=public as $$
declare r public.reservas;
begin
  select * into r from public.reservas where id=p_reserva for update;
  if r.id is null or not (public.is_platform_admin() or exists(select 1 from public.unidade_members m where m.user_id=auth.uid() and m.unidade_id=r.unidade_id and m.role in ('master','recepcao'))) then raise exception 'Sem acesso à reserva'; end if;
  if not exists(select 1 from public.unidades u join public.contas c on c.id=u.franqueado_id where u.id=r.unidade_id and c.tipo='parceiro') then raise exception 'Escolha uma unidade parceira'; end if;
  if p_status='checkin' and r.status='confirmada' and now() between r.start_at-interval '30 minutes' and r.end_at then
    update public.reservas set status='checkin',updated_at=now() where id=r.id;
  elsif p_status='concluida' and r.status='checkin' then
    update public.reservas set status='concluida',updated_at=now() where id=r.id;
  else raise exception 'Transição inválida ou fora do horário da reserva'; end if;
  insert into public.audit_logs(unidade_id,ator_id,acao,entidade,entidade_id,detalhe)
  values(r.unidade_id,auth.uid(),'parceiro.presenca','reserva',r.id,jsonb_build_object('status',p_status));
end $$;
revoke all on function public.presenca_reserva_parceira(text,text) from public,anon;
grant execute on function public.presenca_reserva_parceira(text,text) to authenticated;
commit;
