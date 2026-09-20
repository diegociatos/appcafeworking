-- ============================================================================
-- CafeWorking · Rede de unidades parceiras: perfil, revisão e conversa
--
-- Continuação das fases 1 e 2 da rede (20260921120000 e 20260923120000). O
-- split 75/25, a tabela nacional, a candidatura pelo site, a aprovação do
-- parceiro e a blindagem financeira continuam como estão; aqui entra o que
-- falta para uma unidade parceira ir ao ar sem susto:
--
--   1) parceiro_requisitos — catálogo de documentos do imóvel que a CafeWorking
--      exige do parceiro. Espelha KIT_ENDERECO_PARCEIRO (fase 2, em
--      supabase/functions/_shared/parceiroCandidatura.ts): a lista de quais
--      documentos pedir vive lá, e QUAL deles trava a publicação vive aqui —
--      uma fonte da verdade para cada pergunta. O admin muda pela função
--      configurar_requisito_parceiro (nada é presumido em código).
--
--   2) parceiro_unidade_perfis — o que o parceiro preenche sobre a unidade
--      (empresa, imóvel, horários, fotos, serviços que quer vender) e a
--      revisão da CafeWorking. Só o master da conta parceira daquela unidade e
--      o admin da plataforma leem; a escrita é sempre por função.
--
--   3) unidade_documentos ganha revisao_status/revisao_observacoes.
--      REGRA: unidade PRÓPRIA continua exatamente como hoje — o documento
--      nasce 'aprovado' e a equipe da unidade cuida dele sozinha. Unidade
--      PARCEIRA é que passa por revisão: o documento nasce 'pendente' e só o
--      admin da plataforma muda a situação. Número, validade e arquivo
--      seguem imutáveis para todo mundo (para trocar, apaga e envia de novo),
--      que é o comportamento da migration 20260916200000.
--
--   4) unidade_publicavel / servico_publicavel / unidades_publicaveis —
--      um lugar só decide se uma unidade aparece no site e se um serviço pode
--      ser vendido. Unidade de conta PRÓPRIA (Luxemburgo, Estoril) continua
--      publicável e vendendo sem depender de perfil ou de revisão: a exigência
--      de perfil publicado, carteira Asaas e documentos aprovados é só para
--      conta 'parceiro'. unidades_publicaveis(text[]) responde a lista inteira
--      numa chamada só — o catálogo público não faz uma RPC por unidade.
--
--   5) unidade_mensagens — conversa entre a equipe da unidade e um cliente
--      daquela unidade, pelo app. Mensagem é imutável; o cliente só enxerga a
--      própria conversa; anon não lê nada.
--
--   6) presenca_reserva_parceira — check-in/conclusão da reserva na unidade
--      parceira, sem tocar em cobrança nem em crédito.
--
-- Lembrete (20260605140000): tabela e função novas nascem com permissão para
-- anon/authenticated; aqui tudo é revogado e concedido só no que precisa.
-- Idempotente. Sem begin/commit próprios: quem aplica (supabase db push) e os
-- dry-runs em supabase/tests já envolvem o arquivo inteiro numa transação — um
-- "commit" aqui dentro fecharia a transação do teste e gravaria de verdade.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) Helper: a unidade é de uma conta parceira?
--    Conta ausente ou tipo desconhecido conta como PRÓPRIA — nada que já vende
--    hoje pode sair do ar por causa de um cadastro incompleto.
-- ----------------------------------------------------------------------------
create or replace function public.unidade_de_parceiro(p_unidade text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.unidades u
    join public.contas c on c.id = u.franqueado_id
    where u.id = p_unidade and c.tipo = 'parceiro'
  );
$$;
revoke all on function public.unidade_de_parceiro(text) from public, anon;
grant execute on function public.unidade_de_parceiro(text) to authenticated, service_role;

create or replace function public.pode_gerir_perfil_parceiro(p_unidade text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or exists (
    select 1 from public.unidade_members m
    join public.unidades u on u.id = m.unidade_id
    join public.contas c on c.id = u.franqueado_id
    where m.user_id = auth.uid() and m.unidade_id = p_unidade
      and m.role = 'master' and c.tipo = 'parceiro'
  );
$$;
revoke all on function public.pode_gerir_perfil_parceiro(text) from public, anon;
grant execute on function public.pode_gerir_perfil_parceiro(text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 1) Catálogo de requisitos do imóvel
--    Semente igual ao KIT_ENDERECO_PARCEIRO da fase 2: IPTU é o único que trava
--    a publicação (todo imóvel tem); autorização do proprietário e AVCB são
--    pedidos, mas dependem do caso (imóvel próprio, prédio sem AVCB). O admin
--    aperta ou afrouxa com configurar_requisito_parceiro.
-- ----------------------------------------------------------------------------
create table if not exists public.parceiro_requisitos (
  tipo        text primary key,
  obrigatorio boolean not null default false,
  ativo       boolean not null default true
);

alter table public.parceiro_requisitos drop constraint if exists parceiro_requisitos_tipo_check;
alter table public.parceiro_requisitos add constraint parceiro_requisitos_tipo_check
  check (tipo in ('iptu', 'alvara', 'anuencia_modelo', 'comprovante_imovel', 'avcb', 'habite_se', 'autorizacao_proprietario', 'outro'));

-- on conflict do nothing: reaplicar a migration não desfaz a configuração do admin.
insert into public.parceiro_requisitos (tipo, obrigatorio, ativo) values
  ('iptu',                     true,  true),
  ('autorizacao_proprietario', false, true),
  ('avcb',                     false, true),
  ('alvara',                   false, true),
  ('anuencia_modelo',          false, true),
  ('comprovante_imovel',       false, true),
  ('habite_se',                false, true)
on conflict (tipo) do nothing;

comment on table public.parceiro_requisitos is
  'Quais documentos do imóvel travam a publicação da unidade parceira. A lista de quais pedir está em _shared/parceiroCandidatura.ts (KIT_ENDERECO_PARCEIRO).';

alter table public.parceiro_requisitos enable row level security;
drop policy if exists "parceiro_requisitos: leitura" on public.parceiro_requisitos;
create policy "parceiro_requisitos: leitura" on public.parceiro_requisitos for select to authenticated
  using (true);
revoke all on public.parceiro_requisitos from public, anon, authenticated;
grant select on public.parceiro_requisitos to authenticated;
grant all on public.parceiro_requisitos to service_role;

create or replace function public.configurar_requisito_parceiro(p_tipo text, p_obrigatorio boolean, p_ativo boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Somente a CafeWorking configura os requisitos'; end if;
  insert into public.parceiro_requisitos (tipo, obrigatorio, ativo) values (p_tipo, p_obrigatorio, p_ativo)
  on conflict (tipo) do update set obrigatorio = excluded.obrigatorio, ativo = excluded.ativo;
end $$;

-- ----------------------------------------------------------------------------
-- 2) Perfil da unidade parceira
-- ----------------------------------------------------------------------------
create table if not exists public.parceiro_unidade_perfis (
  unidade_id   text primary key references public.unidades (id) on delete cascade,
  dados        jsonb not null default '{}'::jsonb,
  status       text not null default 'rascunho',
  parecer      text not null default '',
  updated_at   timestamptz not null default now(),
  revisado_por uuid references auth.users (id)
);

alter table public.parceiro_unidade_perfis drop constraint if exists parceiro_unidade_perfis_dados_check;
alter table public.parceiro_unidade_perfis add constraint parceiro_unidade_perfis_dados_check
  check (jsonb_typeof(dados) = 'object' and octet_length(dados::text) < 40000);

alter table public.parceiro_unidade_perfis drop constraint if exists parceiro_unidade_perfis_status_check;
alter table public.parceiro_unidade_perfis add constraint parceiro_unidade_perfis_status_check
  check (status in ('rascunho', 'em_analise', 'rejeitado', 'publicado'));

alter table public.parceiro_unidade_perfis drop constraint if exists parceiro_unidade_perfis_parecer_check;
alter table public.parceiro_unidade_perfis add constraint parceiro_unidade_perfis_parecer_check
  check (length(parecer) <= 2000);

comment on table public.parceiro_unidade_perfis is
  'Cadastro da unidade parceira e a revisão da CafeWorking. dados.servicos usa as categorias de plano (endereco_fiscal, coworking, sala_hora, sala_privativa).';

alter table public.parceiro_unidade_perfis enable row level security;
drop policy if exists "parceiro_unidade_perfis: leitura" on public.parceiro_unidade_perfis;
create policy "parceiro_unidade_perfis: leitura" on public.parceiro_unidade_perfis for select to authenticated
  using (public.pode_gerir_perfil_parceiro(unidade_id));
revoke all on public.parceiro_unidade_perfis from public, anon, authenticated;
grant select on public.parceiro_unidade_perfis to authenticated;
grant all on public.parceiro_unidade_perfis to service_role;

-- ----------------------------------------------------------------------------
-- 3) Revisão dos documentos do kit
--    Coluna nova só na primeira aplicação: reaplicar a migration não pode
--    devolver para 'pendente' um documento que o admin já aprovou.
-- ----------------------------------------------------------------------------
do $bloco$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'unidade_documentos' and column_name = 'revisao_status'
  ) then
    alter table public.unidade_documentos
      add column revisao_status      text not null default 'aprovado',
      add column revisao_observacoes text not null default '';
    -- Documento de parceiro que já existia não sai certificado de graça.
    update public.unidade_documentos d set revisao_status = 'pendente'
    from public.unidades u join public.contas c on c.id = u.franqueado_id
    where d.unidade_id = u.id and c.tipo = 'parceiro';
  end if;
end
$bloco$;

alter table public.unidade_documentos drop constraint if exists unidade_documentos_revisao_status_check;
alter table public.unidade_documentos add constraint unidade_documentos_revisao_status_check
  check (revisao_status in ('pendente', 'em_analise', 'aprovado', 'rejeitado'));

alter table public.unidade_documentos drop constraint if exists unidade_documentos_revisao_observacoes_check;
alter table public.unidade_documentos add constraint unidade_documentos_revisao_observacoes_check
  check (length(revisao_observacoes) <= 2000);

comment on column public.unidade_documentos.revisao_status is
  'Unidade própria: nasce aprovado e a equipe cuida. Unidade parceira: nasce pendente e só o admin da plataforma muda.';

create or replace function public.revisao_documento_parceiro()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_parceira boolean;
begin
  -- Trocar o arquivo ou mudar a unidade nunca: apaga e envia de novo.
  if TG_OP = 'UPDATE' and (new.unidade_id <> old.unidade_id or new.storage_path <> old.storage_path) then
    raise exception 'Envie um novo documento para substituir o arquivo';
  end if;

  v_parceira := public.unidade_de_parceiro(new.unidade_id);

  if TG_OP = 'INSERT' then
    -- quem envia não escolhe a situação
    new.revisao_status := case when v_parceira then 'pendente' else 'aprovado' end;
    new.revisao_observacoes := '';
    return new;
  end if;

  -- UPDATE: unidade própria segue como sempre (a equipe resolve sozinha);
  -- unidade parceira é revisada pela CafeWorking.
  if v_parceira and not public.is_platform_admin() and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Somente a CafeWorking revisa documentos de unidade parceira';
  end if;
  return new;
end $$;
revoke all on function public.revisao_documento_parceiro() from public, anon, authenticated;

drop trigger if exists unidade_documentos_revisao on public.unidade_documentos;
create trigger unidade_documentos_revisao before insert or update on public.unidade_documentos
  for each row execute function public.revisao_documento_parceiro();

-- Só a situação da revisão é gravável pelo navegador: número, validade, título
-- e arquivo continuam sem grant de update, como na 20260916200000.
drop policy if exists "unidade_documentos: update revisao" on public.unidade_documentos;
create policy "unidade_documentos: update revisao" on public.unidade_documentos for update to authenticated
  using (
    public.is_platform_admin()
    or (public.is_unidade_staff(unidade_id) and not public.unidade_de_parceiro(unidade_id))
  )
  with check (
    public.is_platform_admin()
    or (public.is_unidade_staff(unidade_id) and not public.unidade_de_parceiro(unidade_id))
  );
grant update (revisao_status, revisao_observacoes) on public.unidade_documentos to authenticated;

-- ----------------------------------------------------------------------------
-- 4) Salvar e revisar o perfil
-- ----------------------------------------------------------------------------
create or replace function public.salvar_perfil_parceiro(p_unidade text, p_dados jsonb, p_enviar boolean default false)
returns public.parceiro_unidade_perfis language plpgsql security definer set search_path = public as $$
declare v public.parceiro_unidade_perfis;
begin
  if not public.pode_gerir_perfil_parceiro(p_unidade) then raise exception 'Sem acesso à unidade'; end if;
  if not public.unidade_de_parceiro(p_unidade) then raise exception 'Escolha uma unidade parceira'; end if;

  if jsonb_typeof(p_dados) <> 'object'
     or (p_dados ? 'servicos' and (
           jsonb_typeof(p_dados->'servicos') <> 'array'
           or not (p_dados->'servicos' <@ '["endereco_fiscal","coworking","sala_hora","sala_privativa"]'::jsonb)))
  then raise exception 'Serviços inválidos'; end if;

  if p_dados ? 'fotos' then
    if jsonb_typeof(p_dados->'fotos') <> 'array' or jsonb_array_length(p_dados->'fotos') > 20 then
      raise exception 'Envie até 20 links de fotos';
    end if;
    if exists (select 1 from jsonb_array_elements_text(p_dados->'fotos') f
               where f !~ '^https://[^[:space:]]+$' or length(f) > 2000) then
      raise exception 'Fotos precisam de links HTTPS válidos';
    end if;
  end if;

  if p_enviar and (
       coalesce(p_dados->>'empresa', '') = '' or coalesce(p_dados->>'responsavel', '') = ''
       or coalesce(p_dados->>'endereco', '') = '' or coalesce(p_dados->>'cidade', '') = ''
       or coalesce(p_dados->>'bairro', '') = '' or coalesce(p_dados->>'uf', '') !~ '^[A-Z]{2}$'
       or coalesce(p_dados->>'horarios', '') = ''
       or coalesce(jsonb_array_length(p_dados->'fotos'), 0) = 0
       or coalesce(jsonb_array_length(p_dados->'servicos'), 0) = 0
       or coalesce(p_dados->>'financeiroConferido', 'false') <> 'true')
  then raise exception 'Complete empresa, imóvel, fotos, serviços e conferência financeira'; end if;

  if p_enviar and p_dados->'servicos' <> '["endereco_fiscal"]'::jsonb
     and coalesce(p_dados->>'espacosConferidos', 'false') <> 'true' then
    raise exception 'Confira os espaços para oferecer estes serviços';
  end if;

  insert into public.parceiro_unidade_perfis (unidade_id, dados, status)
  values (p_unidade, p_dados, case when p_enviar then 'em_analise' else 'rascunho' end)
  on conflict (unidade_id) do update
    set dados = excluded.dados, status = excluded.status, parecer = '', revisado_por = null, updated_at = now()
  returning * into v;

  insert into public.audit_logs (unidade_id, ator_id, acao, entidade, entidade_id, detalhe)
  values (p_unidade, auth.uid(), 'parceiro.perfil_salvo', 'unidade', p_unidade, jsonb_build_object('status', v.status));
  return v;
end $$;

create or replace function public.revisar_perfil_parceiro(p_unidade text, p_status text, p_parecer text default '')
returns void language plpgsql security definer set search_path = public as $$
declare v public.parceiro_unidade_perfis;
begin
  if not public.is_platform_admin() then raise exception 'Somente a CafeWorking revisa o perfil'; end if;
  if p_status not in ('rejeitado', 'publicado') then raise exception 'Situação inválida'; end if;

  select * into v from public.parceiro_unidade_perfis where unidade_id = p_unidade for update;
  if v.status is distinct from 'em_analise' then raise exception 'Envie a unidade para análise primeiro'; end if;
  if p_status = 'rejeitado' and btrim(p_parecer) = '' then raise exception 'Informe as correções necessárias'; end if;

  if p_status = 'publicado' then
    if not exists (
      select 1 from public.unidades u join public.contas c on c.id = u.franqueado_id
      where u.id = p_unidade and c.parceiro_status = 'ativo' and coalesce(btrim(c.asaas_wallet_id), '') <> ''
    ) then raise exception 'Configure e ative o recebimento na conta'; end if;

    if exists (
      select 1 from public.parceiro_requisitos r
      where r.ativo and r.obrigatorio and not exists (
        select 1 from public.unidade_documentos d
        where d.unidade_id = p_unidade and d.tipo = r.tipo and d.revisao_status = 'aprovado'
          and (d.validade is null or d.validade >= current_date))
    ) then raise exception 'Há documentos obrigatórios pendentes'; end if;

    update public.unidades
       set endereco = v.dados->>'endereco',
           cidade = (v.dados->>'cidade') || '/' || (v.dados->>'uf')
     where id = p_unidade;
  end if;

  update public.parceiro_unidade_perfis
     set status = p_status, parecer = p_parecer, revisado_por = auth.uid(), updated_at = now()
   where unidade_id = p_unidade;

  insert into public.audit_logs (unidade_id, ator_id, acao, entidade, entidade_id, detalhe)
  values (p_unidade, auth.uid(), 'parceiro.perfil_revisado', 'unidade', p_unidade,
          jsonb_build_object('status', p_status, 'parecer', p_parecer));
end $$;

-- ACL explícita: o default do banco é permissivo demais.
revoke all on function
  public.salvar_perfil_parceiro(text, jsonb, boolean),
  public.revisar_perfil_parceiro(text, text, text),
  public.configurar_requisito_parceiro(text, boolean, boolean)
from public, anon;
grant execute on function
  public.salvar_perfil_parceiro(text, jsonb, boolean),
  public.revisar_perfil_parceiro(text, text, text),
  public.configurar_requisito_parceiro(text, boolean, boolean)
to authenticated;

-- ----------------------------------------------------------------------------
-- 5) Publicação centralizada
--    Conta PRÓPRIA (e qualquer unidade cuja conta não esteja marcada como
--    'parceiro') continua publicável só por estar ativa — é o que mantém
--    Luxemburgo e Estoril vendendo. A régua nova é só da conta 'parceiro'.
-- ----------------------------------------------------------------------------
create or replace function public.unidade_publicavel(p_unidade text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.unidades u
    left join public.contas c on c.id = u.franqueado_id
    left join public.parceiro_unidade_perfis p on p.unidade_id = u.id
    where u.id = p_unidade
      and u.ativa
      and (
        coalesce(c.tipo, 'propria') <> 'parceiro'
        or (
          c.parceiro_status = 'ativo'
          and coalesce(btrim(c.asaas_wallet_id), '') <> ''
          and p.status = 'publicado'
          and not exists (
            select 1 from public.parceiro_requisitos r
            where r.ativo and r.obrigatorio and not exists (
              select 1 from public.unidade_documentos d
              where d.unidade_id = u.id and d.tipo = r.tipo and d.revisao_status = 'aprovado'
                and (d.validade is null or d.validade >= current_date)))
        )
      )
  );
$$;

-- Uma chamada só para o catálogo público inteiro (nada de uma RPC por unidade).
create or replace function public.unidades_publicaveis(p_unidades text[])
returns table (unidade_id text) language sql stable security definer set search_path = public as $$
  select u.id
  from public.unidades u
  where u.id = any (coalesce(p_unidades, '{}'::text[]))
    and public.unidade_publicavel(u.id);
$$;

create or replace function public.servico_publicavel(p_unidade text, p_categoria text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.unidade_publicavel(p_unidade) and exists (
    select 1
    from public.unidades u
    left join public.contas c on c.id = u.franqueado_id
    left join public.parceiro_unidade_perfis p on p.unidade_id = u.id
    where u.id = p_unidade
      and (coalesce(c.tipo, 'propria') <> 'parceiro' or (p.dados->'servicos') ? p_categoria)
  );
$$;

revoke all on function
  public.unidade_publicavel(text),
  public.unidades_publicaveis(text[]),
  public.servico_publicavel(text, text)
from public, anon, authenticated;
grant execute on function
  public.unidade_publicavel(text),
  public.unidades_publicaveis(text[]),
  public.servico_publicavel(text, text)
to service_role;

-- ----------------------------------------------------------------------------
-- 6) Conversa entre a unidade e o cliente
--    Mensagem é imutável (sem update/delete). Uma conversa é o par
--    (unidade, cliente já cadastrado naquela unidade).
-- ----------------------------------------------------------------------------
create table if not exists public.unidade_mensagens (
  id          uuid primary key default gen_random_uuid(),
  unidade_id  text not null references public.unidades (id) on delete cascade,
  cliente_id  text not null references public.clientes (id) on delete cascade,
  autor_id    uuid not null default auth.uid() references auth.users (id),
  autor_papel text not null,
  texto       text not null,
  created_at  timestamptz not null default now()
);

alter table public.unidade_mensagens drop constraint if exists unidade_mensagens_autor_papel_check;
alter table public.unidade_mensagens add constraint unidade_mensagens_autor_papel_check
  check (autor_papel in ('cliente', 'unidade', 'admin'));

alter table public.unidade_mensagens drop constraint if exists unidade_mensagens_texto_check;
alter table public.unidade_mensagens add constraint unidade_mensagens_texto_check
  check (length(btrim(texto)) between 1 and 4000);

create index if not exists unidade_mensagens_conversa_idx
  on public.unidade_mensagens (unidade_id, cliente_id, created_at);

create or replace function public.pode_conversar_unidade(p_unidade text, p_cliente text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.clientes c
    where c.id = p_cliente and c.unidade_id = p_unidade
      and (
        public.is_platform_admin()
        or exists (select 1 from public.unidade_members m
                   where m.user_id = auth.uid() and m.unidade_id = p_unidade and m.role in ('master', 'recepcao'))
        or (lower(btrim(c.email)) = lower(auth.jwt()->>'email')
            and exists (select 1 from public.unidade_members m
                        where m.user_id = auth.uid() and m.unidade_id = p_unidade and m.role = 'cliente'))
      )
  );
$$;
revoke all on function public.pode_conversar_unidade(text, text) from public, anon;
grant execute on function public.pode_conversar_unidade(text, text) to authenticated, service_role;

alter table public.unidade_mensagens enable row level security;
drop policy if exists "unidade_mensagens: leitura da conversa" on public.unidade_mensagens;
create policy "unidade_mensagens: leitura da conversa" on public.unidade_mensagens for select to authenticated
  using (public.pode_conversar_unidade(unidade_id, cliente_id));
revoke all on public.unidade_mensagens from public, anon, authenticated;
grant select on public.unidade_mensagens to authenticated;
grant all on public.unidade_mensagens to service_role;

create or replace function public.enviar_mensagem_unidade(p_unidade text, p_cliente text, p_texto text)
returns void language plpgsql security definer set search_path = public as $$
declare papel text;
begin
  if not public.pode_conversar_unidade(p_unidade, p_cliente) then raise exception 'Sem acesso à conversa'; end if;
  papel := case
    when public.is_platform_admin() then 'admin'
    when exists (select 1 from public.unidade_members
                 where user_id = auth.uid() and unidade_id = p_unidade and role in ('master', 'recepcao')) then 'unidade'
    else 'cliente' end;
  insert into public.unidade_mensagens (unidade_id, cliente_id, autor_id, autor_papel, texto)
  values (p_unidade, p_cliente, auth.uid(), papel, btrim(p_texto));
end $$;
revoke all on function public.enviar_mensagem_unidade(text, text, text) from public, anon;
grant execute on function public.enviar_mensagem_unidade(text, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 7) Presença na reserva da unidade parceira
--    Só mexe no status da reserva: cobrança e crédito seguem onde estão.
-- ----------------------------------------------------------------------------
create or replace function public.presenca_reserva_parceira(p_reserva text, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.reservas;
begin
  select * into r from public.reservas where id = p_reserva for update;
  if r.id is null or not (
       public.is_platform_admin()
       or exists (select 1 from public.unidade_members m
                  where m.user_id = auth.uid() and m.unidade_id = r.unidade_id and m.role in ('master', 'recepcao'))
     ) then raise exception 'Sem acesso à reserva'; end if;
  if not public.unidade_de_parceiro(r.unidade_id) then raise exception 'Escolha uma unidade parceira'; end if;

  if p_status = 'checkin' and r.status = 'confirmada' and now() between r.start_at - interval '30 minutes' and r.end_at then
    update public.reservas set status = 'checkin', updated_at = now() where id = r.id;
  elsif p_status = 'concluida' and r.status = 'checkin' then
    update public.reservas set status = 'concluida', updated_at = now() where id = r.id;
  else
    raise exception 'Transição inválida ou fora do horário da reserva';
  end if;

  insert into public.audit_logs (unidade_id, ator_id, acao, entidade, entidade_id, detalhe)
  values (r.unidade_id, auth.uid(), 'parceiro.presenca', 'reserva', r.id, jsonb_build_object('status', p_status));
end $$;
revoke all on function public.presenca_reserva_parceira(text, text) from public, anon;
grant execute on function public.presenca_reserva_parceira(text, text) to authenticated;
