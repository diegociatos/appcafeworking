-- ============================================================================
-- CafeWorking · VENDA PELO SITE — fase 1 (backend)
--
-- O site cafeworking.com.br passa a vender direto neste banco: endereço fiscal,
-- planos de coworking, sala privativa (como plano) e sala de reunião por hora.
-- Visão geral e decisões em docs/VENDA-PELO-SITE.md.
--
--   0) permissões: EXECUTE fechado nas funções do Vault e na criar_reserva_segura
--   1) contratos_modelos — versões imutáveis dos termos, hash calculado no banco
--   2) aceites_contrato  — prova do aceite (versão, hash, IP, navegador), append-only
--   3) assinaturas       — assinatura mensal no Asaas, por cliente
--   4) colunas novas em pending_signups, cobrancas, salas e reservas
--   5) criar_reserva_segura respeita horário segurado aguardando pagamento
--   6) confirmar_reserva_paga e liberar_reservas_expiradas
--
-- ATENÇÃO para quem escrever a próxima migration: 20260605140000_grants_authenticated
-- fez `alter default privileges ... grant all on functions to anon, authenticated`.
-- Toda função criada depois nasce executável por visitante anônimo. Função
-- SECURITY DEFINER precisa de `revoke ... from public, anon, authenticated`
-- explícito E de checagem de papel no corpo.
--
-- Depende de: tenant, cobrancas_asaas, pending_signups, rls_por_papel,
-- reservas_relacional. Idempotente.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ----------------------------------------------------------------------------
-- 0) Permissões
--
-- As migrations originais revogavam EXECUTE destas funções, mas a
-- 20260605140000_grants_authenticated devolveu EXECUTE em TODAS as funções para
-- anon e authenticated. As do Vault não ficaram exploráveis porque recusam no
-- corpo quem não é service_role; fecha-se a permissão de novo como segunda
-- barreira. As Edge Functions usam service_role e não são afetadas.
-- ----------------------------------------------------------------------------
revoke all on function public.get_bank_credentials(text)         from public, anon, authenticated;
revoke all on function public.get_fiscal_credentials(text)       from public, anon, authenticated;
revoke all on function public.upsert_bank_secret(text, text)     from public, anon, authenticated;
revoke all on function public.upsert_fiscal_secret(text, text)   from public, anon, authenticated;
grant execute on function public.get_bank_credentials(text)       to service_role;
grant execute on function public.get_fiscal_credentials(text)     to service_role;
grant execute on function public.upsert_bank_secret(text, text)   to service_role;
grant execute on function public.upsert_fiscal_secret(text, text) to service_role;

-- Utilitário de updated_at para as tabelas desta migration.
create or replace function public.venda_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ----------------------------------------------------------------------------
-- 1) contratos_modelos
--
-- Cada publicação é uma nova versão. O texto de uma versão nunca muda depois de
-- gravado (trigger), porque é ele que o cliente aceitou. unidade_id nulo = vale
-- para todas as unidades; uma versão da própria unidade tem preferência.
-- Sem FK para unidades de propósito: apagar uma unidade não pode apagar prova.
-- ----------------------------------------------------------------------------
create table if not exists public.contratos_modelos (
  id          uuid primary key default gen_random_uuid(),
  unidade_id  text,
  categoria   text not null check (categoria in ('endereco_fiscal', 'coworking', 'sala_privativa', 'sala_hora')),
  versao      int  not null check (versao > 0),
  titulo      text not null,
  corpo       text not null check (length(corpo) > 0),
  hash        text not null default '',
  vigente     boolean not null default false,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  constraint contratos_modelos_versao_uk unique nulls not distinct (unidade_id, categoria, versao)
);
create unique index if not exists contratos_modelos_vigente_uk
  on public.contratos_modelos (coalesce(unidade_id, '*'), categoria) where vigente;

create or replace function public.contratos_modelos_guarda()
returns trigger language plpgsql set search_path = public, extensions as $$
begin
  if tg_op = 'INSERT' then
    -- hash calculado aqui, não recebido do cliente: é a fonte da verdade
    new.hash := encode(digest(convert_to(new.corpo, 'UTF8'), 'sha256'), 'hex');
    return new;
  end if;
  if new.corpo is distinct from old.corpo or new.titulo is distinct from old.titulo
     or new.versao is distinct from old.versao or new.categoria is distinct from old.categoria
     or new.unidade_id is distinct from old.unidade_id or new.hash is distinct from old.hash then
    raise exception 'CONTRATO_IMUTAVEL: publique uma nova versão em vez de editar' using errcode = '22000';
  end if;
  return new;
end $$;
drop trigger if exists contratos_modelos_guarda on public.contratos_modelos;
create trigger contratos_modelos_guarda before insert or update on public.contratos_modelos
  for each row execute function public.contratos_modelos_guarda();

alter table public.contratos_modelos enable row level security;
-- Texto vigente é público (o visitante lê antes de comprar). Histórico: staff/admin.
drop policy if exists "contratos_modelos: leitura" on public.contratos_modelos;
create policy "contratos_modelos: leitura" on public.contratos_modelos for select
  using (
    vigente
    or public.is_platform_admin()
    or (unidade_id is not null and public.is_unidade_staff(unidade_id))
  );
-- Sem policy de escrita: publica-se pela função abaixo.

create or replace function public.publicar_contrato_modelo(
  p_unidade_id text, p_categoria text, p_titulo text, p_corpo text
) returns public.contratos_modelos
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_versao int;
  v_row    public.contratos_modelos;
begin
  if auth.role() <> 'service_role'
     and not (public.is_platform_admin() or (p_unidade_id is not null and public.is_unidade_staff(p_unidade_id))) then
    raise exception 'ACESSO_NEGADO' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('contrato:' || coalesce(p_unidade_id, '*') || ':' || p_categoria));

  select coalesce(max(versao), 0) + 1 into v_versao
  from public.contratos_modelos
  where unidade_id is not distinct from p_unidade_id and categoria = p_categoria;

  update public.contratos_modelos set vigente = false
  where unidade_id is not distinct from p_unidade_id and categoria = p_categoria and vigente;

  insert into public.contratos_modelos (unidade_id, categoria, versao, titulo, corpo, vigente)
  values (p_unidade_id, p_categoria, v_versao, p_titulo, p_corpo, true)
  returning * into v_row;

  return v_row;
end $$;
revoke all on function public.publicar_contrato_modelo(text, text, text, text) from public, anon;
grant execute on function public.publicar_contrato_modelo(text, text, text, text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2) aceites_contrato — prova do aceite no checkout. Append-only de verdade:
--    o trigger barra UPDATE/DELETE até para service_role.
-- ----------------------------------------------------------------------------
create table if not exists public.aceites_contrato (
  id                 uuid primary key default gen_random_uuid(),
  modelo_id          uuid not null references public.contratos_modelos (id),
  categoria          text not null,
  versao             int  not null,
  hash               text not null,
  unidade_id         text not null,
  cliente_nome       text not null,
  cliente_email      text not null,
  cliente_documento  text,
  plano_id           text,
  plano_nome         text,
  valor              numeric(12,2),
  recorrencia        text,
  prazo_minimo_meses int,
  referencia_tipo    text,           -- signup | reserva
  referencia_id      text,
  ip                 text,
  user_agent         text,
  origem             text not null default 'site',
  aceito_em          timestamptz not null default now()
);
create index if not exists aceites_contrato_unidade_idx on public.aceites_contrato (unidade_id, aceito_em desc);
create index if not exists aceites_contrato_email_idx on public.aceites_contrato (lower(cliente_email));
create index if not exists aceites_contrato_ref_idx on public.aceites_contrato (referencia_tipo, referencia_id);

create or replace function public.venda_registro_imutavel()
returns trigger language plpgsql as $$
begin
  raise exception 'REGISTRO_IMUTAVEL: % não aceita %', tg_table_name, tg_op using errcode = '22000';
end $$;
drop trigger if exists aceites_contrato_imutavel on public.aceites_contrato;
create trigger aceites_contrato_imutavel before update or delete on public.aceites_contrato
  for each row execute function public.venda_registro_imutavel();

alter table public.aceites_contrato enable row level security;
drop policy if exists "aceites_contrato: select por papel" on public.aceites_contrato;
create policy "aceites_contrato: select por papel" on public.aceites_contrato for select
  using (
    public.is_platform_admin()
    or public.is_unidade_staff(unidade_id)
    or cliente_email = (auth.jwt() ->> 'email')
  );
-- Sem policy de escrita: só as Edge Functions (service_role) registram aceite.

-- ----------------------------------------------------------------------------
-- 3) assinaturas — uma por plano mensal contratado (assinatura no Asaas)
-- ----------------------------------------------------------------------------
create table if not exists public.assinaturas (
  id                     uuid primary key default gen_random_uuid(),
  unidade_id             text not null,
  cliente_id             text,
  cliente_nome           text not null,
  cliente_email          text not null,
  cliente_documento      text,
  plano_id               text not null,
  plano_nome             text not null,
  categoria              text,
  valor                  numeric(12,2) not null check (valor > 0),
  recorrencia            text not null default 'mensal',
  prazo_minimo_meses     int not null default 0,
  fidelidade_ate         date,
  direitos               jsonb not null default '{}',
  asaas_customer_id      text,
  asaas_subscription_id  text unique,
  aceite_id              uuid references public.aceites_contrato (id),
  pending_signup_id      uuid,
  status                 text not null default 'ativa'
                           check (status in ('ativa', 'inadimplente', 'cancelada')),
  inicio                 date not null default current_date,
  cancelada_em           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists assinaturas_unidade_idx on public.assinaturas (unidade_id, status);
create index if not exists assinaturas_email_idx on public.assinaturas (lower(cliente_email));

drop trigger if exists assinaturas_touch on public.assinaturas;
create trigger assinaturas_touch before update on public.assinaturas
  for each row execute function public.venda_touch_updated_at();

alter table public.assinaturas enable row level security;
drop policy if exists "assinaturas: select por papel" on public.assinaturas;
create policy "assinaturas: select por papel" on public.assinaturas for select
  using (
    public.is_platform_admin()
    or public.is_unidade_staff(unidade_id)
    or cliente_email = (auth.jwt() ->> 'email')
  );
-- Escrita só pelo backend: cancelar exige cancelar também no Asaas.

-- ----------------------------------------------------------------------------
-- 4) Colunas novas
-- ----------------------------------------------------------------------------
alter table public.pending_signups
  add column if not exists categoria             text,
  add column if not exists recorrencia           text,
  add column if not exists prazo_minimo_meses    int,
  add column if not exists direitos              jsonb,
  add column if not exists asaas_subscription_id text,
  add column if not exists aceite_id             uuid,
  add column if not exists origem                text default 'app';
create index if not exists pending_signups_sub_idx on public.pending_signups (asaas_subscription_id);
comment on column public.pending_signups.status is 'aguardando | ativando | ativo | cancelado';

alter table public.cobrancas
  add column if not exists origem                text,
  add column if not exists assinatura_id         uuid,
  add column if not exists reserva_id            text,
  add column if not exists asaas_subscription_id text;
create index if not exists cobrancas_assinatura_idx on public.cobrancas (assinatura_id);
create index if not exists cobrancas_reserva_idx on public.cobrancas (reserva_id);

-- Um pagamento do Asaas = uma linha de cobrança. Protege contra o webhook
-- chegando duas vezes ao mesmo tempo (CONFIRMED e RECEIVED quase juntos).
do $$
begin
  if exists (
    select 1 from public.cobrancas
    where asaas_payment_id is not null
    group by asaas_payment_id having count(*) > 1
  ) then
    raise notice 'cobrancas com asaas_payment_id duplicado: índice único NÃO criado — limpar e rodar de novo';
  else
    create unique index if not exists cobrancas_asaas_payment_uk
      on public.cobrancas (asaas_payment_id) where asaas_payment_id is not null;
  end if;
end $$;

alter table public.salas
  add column if not exists reserva_online boolean not null default false;
comment on column public.salas.reserva_online is 'Aparece no site para reserva paga por hora (exige valor_hora > 0)';

alter table public.reservas
  add column if not exists expira_em         timestamptz,
  add column if not exists asaas_payment_id  text,
  add column if not exists cliente_documento text,
  add column if not exists cliente_telefone  text;
create index if not exists reservas_asaas_idx on public.reservas (asaas_payment_id);
create index if not exists reservas_espera_idx on public.reservas (expira_em) where status = 'aguardando_pagamento';
comment on column public.reservas.status is
  'solicitada | confirmada | checkin | concluida | cancelada | aguardando_pagamento (segura o horário até expira_em)';

-- ----------------------------------------------------------------------------
-- 5) criar_reserva_segura — mesma regra de conflito, agora sabendo que um
--    horário aguardando pagamento (ainda não expirado) também está ocupado.
--
--    Parâmetros novos têm default, então a Edge criar-reserva (que chama por
--    nome com os 11 originais) continua funcionando sem mudança.
--
--    Correção de segurança: antes esta função era executável por qualquer
--    usuário logado — um cliente conseguia criar reserva confirmada para
--    qualquer e-mail e valor pela API, sem passar pela Edge. Agora só o backend.
-- ----------------------------------------------------------------------------
drop function if exists public.criar_reserva_segura(text, text, text, text, text, text, timestamptz, timestamptz, int, text, numeric);

create or replace function public.criar_reserva_segura(
  p_id                text,
  p_unidade_id        text,
  p_sala_id           text,
  p_cliente_id        text,
  p_cliente_nome      text,
  p_cliente_email     text,
  p_start_at          timestamptz,
  p_end_at            timestamptz,
  p_base              int,
  p_origem            text,
  p_valor             numeric,
  p_status            text        default 'confirmada',
  p_expira_em         timestamptz default null,
  p_cliente_documento text        default null,
  p_cliente_telefone  text        default null,
  p_somente_online    boolean     default false
) returns public.reservas
language plpgsql security definer set search_path = public as $$
declare
  v_sala  public.salas;
  v_row   public.reservas;
begin
  if p_start_at >= p_end_at then
    raise exception 'PERIODO_INVALIDO' using errcode = '22000';
  end if;
  if coalesce(p_status, 'confirmada') not in ('confirmada', 'solicitada', 'aguardando_pagamento') then
    raise exception 'STATUS_INVALIDO' using errcode = '22000';
  end if;
  if p_status = 'aguardando_pagamento' and (p_expira_em is null or p_expira_em <= now()) then
    raise exception 'EXPIRACAO_INVALIDA' using errcode = '22000';
  end if;

  select * into v_sala from public.salas where id = p_sala_id;
  if not found then raise exception 'SALA_INEXISTENTE' using errcode = '22000'; end if;
  if v_sala.unidade_id <> p_unidade_id then raise exception 'SALA_DE_OUTRA_UNIDADE' using errcode = '22000'; end if;
  if coalesce(v_sala.active, true) = false then raise exception 'SALA_INATIVA' using errcode = '22000'; end if;
  if coalesce(v_sala.contratada, false) = true then raise exception 'SALA_CONTRATADA' using errcode = '22000'; end if;
  if p_somente_online and coalesce(v_sala.reserva_online, false) = false then
    raise exception 'SALA_SEM_RESERVA_ONLINE' using errcode = '22000';
  end if;

  if coalesce(v_sala.bases, 0) > 0 then
    if p_base is null or p_base < 1 or p_base > v_sala.bases then
      raise exception 'BASE_INVALIDA' using errcode = '22000';
    end if;
  end if;

  -- Serializa concorrência por sala (+ base).
  perform pg_advisory_xact_lock(hashtext(p_sala_id || ':' || coalesce(p_base::text, '*')));

  if exists (
    select 1 from public.reservas x
    where x.sala_id = p_sala_id
      and (
        x.status in ('solicitada', 'confirmada', 'checkin')
        or (x.status = 'aguardando_pagamento' and x.expira_em > now())
      )
      and (coalesce(v_sala.bases, 0) = 0 or x.base is not distinct from p_base)
      and tstzrange(x.start_at, x.end_at) && tstzrange(p_start_at, p_end_at)
  ) then
    raise exception 'CONFLITO' using errcode = '23505';
  end if;

  insert into public.reservas (
    id, unidade_id, sala_id, cliente_id, cliente_nome, cliente_email,
    start_at, end_at, base, status, origem, valor,
    expira_em, cliente_documento, cliente_telefone
  ) values (
    coalesce(p_id, 'r_' || replace(gen_random_uuid()::text, '-', '')),
    p_unidade_id, p_sala_id, p_cliente_id, p_cliente_nome, p_cliente_email,
    p_start_at, p_end_at, p_base, coalesce(p_status, 'confirmada'), coalesce(p_origem, 'recepcao'), p_valor,
    case when p_status = 'aguardando_pagamento' then p_expira_em end, p_cliente_documento, p_cliente_telefone
  ) returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.criar_reserva_segura(text, text, text, text, text, text, timestamptz, timestamptz, int, text, numeric, text, timestamptz, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.criar_reserva_segura(text, text, text, text, text, text, timestamptz, timestamptz, int, text, numeric, text, timestamptz, text, text, boolean)
  to service_role;

-- ----------------------------------------------------------------------------
-- 6) Pagamento da reserva
-- ----------------------------------------------------------------------------

-- Chamada pelo asaas-webhook quando o pagamento de uma reserva confirma.
-- Retorna: confirmada | ja_confirmada | sem_horario | nao_reconfirmavel | inexistente
--   sem_horario       → pagou depois de expirar e alguém já ocupou: marcar p/ estorno
--   nao_reconfirmavel → reserva cancelada pela equipe: não ressuscita, marcar p/ estorno
create or replace function public.confirmar_reserva_paga(p_id text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  r      public.reservas;
  v_sala public.salas;
begin
  select * into r from public.reservas where id = p_id for update;
  if not found then return 'inexistente'; end if;

  if r.status in ('confirmada', 'checkin', 'concluida') then
    update public.reservas set payment_status = 'pago', updated_at = now() where id = p_id;
    return 'ja_confirmada';
  end if;

  if not (r.status = 'aguardando_pagamento' or (r.status = 'cancelada' and r.payment_status = 'expirado')) then
    update public.reservas set payment_status = 'pago_sem_horario', updated_at = now() where id = p_id;
    return 'nao_reconfirmavel';
  end if;

  select * into v_sala from public.salas where id = r.sala_id;
  perform pg_advisory_xact_lock(hashtext(r.sala_id || ':' || coalesce(r.base::text, '*')));

  if exists (
    select 1 from public.reservas x
    where x.sala_id = r.sala_id and x.id <> r.id
      and (
        x.status in ('solicitada', 'confirmada', 'checkin')
        or (x.status = 'aguardando_pagamento' and x.expira_em > now())
      )
      and (coalesce(v_sala.bases, 0) = 0 or x.base is not distinct from r.base)
      and tstzrange(x.start_at, x.end_at) && tstzrange(r.start_at, r.end_at)
  ) then
    update public.reservas set status = 'cancelada', payment_status = 'pago_sem_horario', updated_at = now() where id = p_id;
    return 'sem_horario';
  end if;

  update public.reservas
  set status = 'confirmada', payment_status = 'pago', expira_em = null, updated_at = now()
  where id = p_id;
  return 'confirmada';
end $$;
revoke all on function public.confirmar_reserva_paga(text) from public, anon, authenticated;
grant execute on function public.confirmar_reserva_paga(text) to service_role;

-- Libera horários segurados cujo pagamento não chegou a tempo. Chamada de forma
-- preguiçosa pelas Edge Functions do site (não depende de cron).
create or replace function public.liberar_reservas_expiradas()
returns int
language sql security definer set search_path = public as $$
  with liberadas as (
    update public.reservas
    set status = 'cancelada', payment_status = 'expirado', updated_at = now()
    where status = 'aguardando_pagamento' and expira_em < now()
    returning 1
  )
  select count(*)::int from liberadas;
$$;
revoke all on function public.liberar_reservas_expiradas() from public, anon, authenticated;
grant execute on function public.liberar_reservas_expiradas() to service_role;

-- ----------------------------------------------------------------------------
-- Grants de tabela (RLS decide o que cada papel vê)
-- ----------------------------------------------------------------------------
grant select on public.contratos_modelos, public.aceites_contrato, public.assinaturas to anon, authenticated;
grant all on public.contratos_modelos, public.aceites_contrato, public.assinaturas to service_role;
