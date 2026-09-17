-- ============================================================================
-- CafeWorking · E-mail pela Microsoft 365 (caixa envio@grupociatos.com.br)
--
-- PROBLEMA: os e-mails saem pelo Resend e clientes não estavam recebendo. O
-- dono quer enviar direto pela Microsoft 365 (Graph, OAuth delegado), no mesmo
-- desenho já usado no ContaOne: app registrado no Azure, uma conta conecta pela
-- tela da Microsoft e o sistema guarda o refresh token para enviar depois.
--
--   1) integracoes_plataforma — config NÃO secreta por tipo (tenant_id,
--      client_id, conta_email, conta_nome, conectado_em, envia_como, ativo).
--      RLS ligada e sem política: anon e authenticated não leem nem gravam.
--      Tudo passa pelas Edge Functions email-ms365 / email-ms365-callback
--      (service_role), que conferem platform_admins.
--   2) upsert_email_secret / read_email_secret / delete_email_secret — client
--      secret e refresh token ficam no Supabase Vault. Só service_role e só
--      referências com prefixo "email_ms365_" (não tocam segredo de banco,
--      Asaas ou certificado fiscal).
--
-- ATENÇÃO (herdado da 20260605140000_grants_authenticated): funções e tabelas
-- novas nascem com permissão para anon/authenticated. Por isso os revoke
-- explícitos abaixo, além da checagem de papel no corpo das funções.
--
-- Idempotente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) integracoes_plataforma
-- ----------------------------------------------------------------------------
create table if not exists public.integracoes_plataforma (
  tipo          text primary key,
  config        jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);

comment on table public.integracoes_plataforma is
  'Integrações da plataforma (ex.: email_ms365). Só config sem segredo; segredos no Vault. Acesso só pelo backend.';

alter table public.integracoes_plataforma enable row level security;
revoke all on table public.integracoes_plataforma from public, anon, authenticated;
grant all on table public.integracoes_plataforma to service_role;

create or replace function public.integracoes_plataforma_touch()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists set_atualizado_em on public.integracoes_plataforma;
create trigger set_atualizado_em before update on public.integracoes_plataforma
  for each row execute function public.integracoes_plataforma_touch();

-- ----------------------------------------------------------------------------
-- 2) Segredos do e-mail no Vault (só backend, só refs email_ms365_*)
-- ----------------------------------------------------------------------------
create or replace function public.upsert_email_secret(p_ref text, p_secret text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'acesso negado: só o backend pode gravar segredos de e-mail';
  end if;
  if p_ref is null or p_ref !~ '^email_ms365_[a-z0-9_]+$' then
    raise exception 'referência de segredo de e-mail inválida: %', p_ref;
  end if;
  if coalesce(p_secret, '') = '' then
    raise exception 'segredo vazio';
  end if;

  select id into v_id from vault.secrets where name = p_ref limit 1;
  if v_id is null then
    perform vault.create_secret(p_secret, p_ref, 'E-mail Microsoft 365 (CafeWorking)');
  else
    perform vault.update_secret(v_id, p_secret, p_ref, 'E-mail Microsoft 365 (CafeWorking)');
  end if;
end $$;

create or replace function public.read_email_secret(p_ref text)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'acesso negado: segredo de e-mail só pode ser lido pelo backend';
  end if;
  if p_ref is null or p_ref !~ '^email_ms365_[a-z0-9_]+$' then
    raise exception 'referência de segredo de e-mail inválida: %', p_ref;
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = p_ref
  limit 1;

  return v_secret;  -- null quando não existe
end $$;

create or replace function public.delete_email_secret(p_ref text)
returns boolean
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'acesso negado: só o backend pode apagar segredos de e-mail';
  end if;
  if p_ref is null or p_ref !~ '^email_ms365_[a-z0-9_]+$' then
    raise exception 'referência de segredo de e-mail inválida: %', p_ref;
  end if;
  delete from vault.secrets where name = p_ref;
  return found;
end $$;

revoke all on function public.upsert_email_secret(text, text) from public, anon, authenticated;
revoke all on function public.read_email_secret(text)         from public, anon, authenticated;
revoke all on function public.delete_email_secret(text)       from public, anon, authenticated;
revoke all on function public.integracoes_plataforma_touch()  from public, anon, authenticated;
grant execute on function public.upsert_email_secret(text, text) to service_role;
grant execute on function public.read_email_secret(text)         to service_role;
grant execute on function public.delete_email_secret(text)       to service_role;
