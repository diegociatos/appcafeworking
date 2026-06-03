-- ============================================================================
-- CafeWorking · Módulo de Boletos Bancários
-- Schema: bank_accounts + boletos, RLS por unidade, credenciais no Vault.
--
-- Bancos suportados: Banco Inter, Itaú, BTG, Bradesco.
-- Boletos são emitidos pela conta do FRANQUEADO ou do FRANQUEADOR.
-- As credenciais sensíveis (client_id/secret, certificados mTLS .pfx/.pem)
-- NUNCA ficam em colunas comuns — vão para o Supabase Vault e são
-- referenciadas por `credenciais_ref`.
-- ============================================================================

create extension if not exists pgcrypto;       -- gen_random_uuid()
create extension if not exists supabase_vault;  -- Vault (vault.secrets / decrypted_secrets)

-- ----------------------------------------------------------------------------
-- ENUMs
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.banco_provedor as enum ('inter', 'itau', 'btg', 'bradesco');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.conta_titularidade as enum ('franqueado', 'franqueador');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.banco_ambiente as enum ('sandbox', 'prod');
exception when duplicate_object then null; end $$;

do $$ begin
  -- emitido      : aceito na nossa base, ainda registrando no banco
  -- registrado   : registrado no banco, linha digitável/pix disponíveis
  -- pago         : baixa confirmada (via webhook)
  -- vencido      : passou do vencimento sem pagamento
  -- cancelado    : cancelado/baixado pelo emissor
  -- erro         : falha na emissão
  create type public.boleto_status as enum
    ('emitido', 'registrado', 'pago', 'vencido', 'cancelado', 'erro');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Membership: quem enxerga cada unidade (base do RLS).
-- unidade_id é TEXT para casar com os ids do app ("lux", "est", "savassi"...).
-- ----------------------------------------------------------------------------
create table if not exists public.unidade_members (
  user_id     uuid not null references auth.users (id) on delete cascade,
  unidade_id  text not null,
  franqueado_id text,
  role        text not null default 'member',  -- master | financeiro | recepcao | ...
  created_at  timestamptz not null default now(),
  primary key (user_id, unidade_id)
);
alter table public.unidade_members enable row level security;

-- Cada usuário lê só os próprios vínculos.
drop policy if exists "membros: ver próprios vínculos" on public.unidade_members;
create policy "membros: ver próprios vínculos"
  on public.unidade_members for select
  using (user_id = auth.uid());

-- Helper SECURITY DEFINER: a unidade pertence ao usuário autenticado?
create or replace function public.is_unidade_member(p_unidade_id text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.unidade_members m
    where m.user_id = auth.uid()
      and m.unidade_id = p_unidade_id
  );
$$;

-- ----------------------------------------------------------------------------
-- bank_accounts: credenciais por unidade/titular (franqueado x franqueador)
-- ----------------------------------------------------------------------------
create table if not exists public.bank_accounts (
  id              uuid primary key default gen_random_uuid(),
  unidade_id      text not null,
  franqueado_id   text,                                   -- conta do franqueado; null = plataforma
  banco           public.banco_provedor not null,
  tipo            public.conta_titularidade not null,     -- franqueado | franqueador
  apelido         text not null default '',               -- ex.: "Inter · Grupo Ciatos"
  ambiente        public.banco_ambiente not null default 'sandbox',

  -- Dados do beneficiário (cedente) — NÃO sensíveis
  beneficiario_nome      text,
  beneficiario_documento text,                            -- CPF/CNPJ do cedente
  agencia         text,
  conta           text,
  carteira        text,                                   -- carteira/convênio quando aplicável
  pix_chave       text,                                   -- chave PIX p/ boleto híbrido (Inter)

  -- Referência ao segredo no Vault (client_id/secret + certificados mTLS).
  -- NUNCA guardar a credencial aqui — só o nome/uuid do secret.
  credenciais_ref text not null,

  webhook_secret_ref text,                                -- segredo p/ validar webhook do banco
  ativo           boolean not null default true,
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists bank_accounts_unidade_idx on public.bank_accounts (unidade_id);
create index if not exists bank_accounts_franqueado_idx on public.bank_accounts (franqueado_id);

alter table public.bank_accounts enable row level security;

-- RLS: cada unidade só acessa suas próprias contas bancárias.
drop policy if exists "bank_accounts: select da unidade" on public.bank_accounts;
create policy "bank_accounts: select da unidade"
  on public.bank_accounts for select
  using (public.is_unidade_member(unidade_id));

drop policy if exists "bank_accounts: insert na unidade" on public.bank_accounts;
create policy "bank_accounts: insert na unidade"
  on public.bank_accounts for insert
  with check (public.is_unidade_member(unidade_id));

drop policy if exists "bank_accounts: update da unidade" on public.bank_accounts;
create policy "bank_accounts: update da unidade"
  on public.bank_accounts for update
  using (public.is_unidade_member(unidade_id))
  with check (public.is_unidade_member(unidade_id));

drop policy if exists "bank_accounts: delete da unidade" on public.bank_accounts;
create policy "bank_accounts: delete da unidade"
  on public.bank_accounts for delete
  using (public.is_unidade_member(unidade_id));

-- ----------------------------------------------------------------------------
-- boletos
-- ----------------------------------------------------------------------------
create table if not exists public.boletos (
  id               uuid primary key default gen_random_uuid(),
  bank_account_id  uuid not null references public.bank_accounts (id) on delete restrict,
  unidade_id       text not null,                         -- denormalizado p/ RLS rápido

  -- Sacado (pagador)
  sacado           text not null,
  sacado_documento text not null,                         -- CPF/CNPJ
  sacado_email     text,

  valor            numeric(12,2) not null check (valor > 0),
  vencimento       date not null,
  instrucoes       text,
  seu_numero       text,                                  -- nosso identificador enviado ao banco

  -- Retorno do banco
  nosso_numero     text,
  linha_digitavel  text,
  codigo_barras    text,
  pix_copia_cola   text,                                  -- EMV do PIX (Inter entrega integrado)
  pix_txid         text,
  banco_boleto_id  text,                                  -- id/codigoSolicitacao no banco
  pdf_url          text,

  status           public.boleto_status not null default 'emitido',
  erro             text,
  webhook_evento   jsonb,                                 -- último payload de baixa recebido

  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  paid_at          timestamptz
);

create index if not exists boletos_unidade_idx on public.boletos (unidade_id);
create index if not exists boletos_account_idx on public.boletos (bank_account_id);
create index if not exists boletos_status_idx on public.boletos (status);
create index if not exists boletos_nosso_numero_idx on public.boletos (nosso_numero);

alter table public.boletos enable row level security;

drop policy if exists "boletos: select da unidade" on public.boletos;
create policy "boletos: select da unidade"
  on public.boletos for select
  using (public.is_unidade_member(unidade_id));

-- Inserção/baixa de boletos é feita pela Edge Function (service_role, que
-- ignora RLS). Para o cliente, liberamos apenas leitura. Caso queira permitir
-- emissão direta autenticada, descomente o insert abaixo.
-- drop policy if exists "boletos: insert na unidade" on public.boletos;
-- create policy "boletos: insert na unidade"
--   on public.boletos for insert
--   with check (public.is_unidade_member(unidade_id));

-- ----------------------------------------------------------------------------
-- updated_at automático
-- ----------------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists set_updated_at on public.bank_accounts;
create trigger set_updated_at before update on public.bank_accounts
  for each row execute function public.tg_set_updated_at();

drop trigger if exists set_updated_at on public.boletos;
create trigger set_updated_at before update on public.boletos
  for each row execute function public.tg_set_updated_at();

-- ----------------------------------------------------------------------------
-- Vault: leitura de credenciais SOMENTE pelo service_role (Edge Functions).
-- A Edge Function lê o segredo cru via `vault.decrypted_secrets`.
-- Esta função encapsula isso e bloqueia qualquer role que não seja service_role.
-- ----------------------------------------------------------------------------
create or replace function public.get_bank_credentials(p_ref text)
returns jsonb
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'acesso negado: credenciais só podem ser lidas pelo backend';
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = p_ref
  limit 1;

  if v_secret is null then
    raise exception 'credencial % não encontrada no Vault', p_ref;
  end if;

  return v_secret::jsonb;  -- { client_id, client_secret, cert_pem, key_pem, ... }
end $$;

revoke all on function public.get_bank_credentials(text) from public, anon, authenticated;

-- Comentário de uso:
-- Para cadastrar uma credencial (rodar no SQL editor com service_role):
--   select vault.create_secret(
--     '{"client_id":"...","client_secret":"...","cert_pem":"-----BEGIN CERTIFICATE-----\n...","key_pem":"-----BEGIN PRIVATE KEY-----\n..."}',
--     'inter_grupo_ciatos_prod',           -- <- este nome vira o credenciais_ref
--     'Credenciais Inter Cobrança v3 (mTLS) — Grupo Ciatos'
--   );
