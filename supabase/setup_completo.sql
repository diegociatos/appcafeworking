-- ============================================================
-- CafeWorking — setup completo (rode UMA vez no SQL Editor)
-- Gerado a partir de supabase/migrations/* + supabase/seed_demo.sql
-- ============================================================


-- >>>>>>>>>> supabase/migrations/20260602120000_boletos.sql <<<<<<<<<<

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


-- >>>>>>>>>> supabase/migrations/20260602140000_notificacoes.sql <<<<<<<<<<

-- ============================================================================
-- CafeWorking · Notificações ao cliente (Fase 1: e-mail)
--
-- Outbox + log de tudo que é enviado ao cliente. O ENVIO acontece numa Edge
-- Function (Deno) chamando o provedor (Resend) — a API key fica no Vault/secrets,
-- nunca no front-end. WhatsApp fica como canal previsto (stub) para depois.
-- ============================================================================

create extension if not exists pgcrypto;

do $$ begin
  create type public.notif_canal as enum ('email', 'whatsapp');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notif_status as enum ('fila', 'enviado', 'erro', 'cancelado');
exception when duplicate_object then null; end $$;

create table if not exists public.notificacoes (
  id            uuid primary key default gen_random_uuid(),
  unidade_id    text not null,
  cliente_nome  text,
  destinatario  text not null,                       -- e-mail (ou telefone no whatsapp)
  canal         public.notif_canal not null default 'email',
  -- evento de negócio: boleto_nova | boleto_pago | boleto_lembrete | boleto_vencido
  --                    | correspondencia | cafe_pedido | cafe_pronto | reserva | ...
  evento        text not null,
  template      text not null,
  dados         jsonb not null default '{}',         -- variáveis do template
  assunto       text,
  status        public.notif_status not null default 'fila',
  provider_id   text,                                -- id no provedor (Resend)
  erro          text,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz
);

create index if not exists notificacoes_unidade_idx on public.notificacoes (unidade_id);
create index if not exists notificacoes_status_idx on public.notificacoes (status);
create index if not exists notificacoes_evento_idx on public.notificacoes (evento);

alter table public.notificacoes enable row level security;

-- A equipe da unidade lê o histórico (auditoria). O envio (insert/update) é
-- feito pela Edge Function com service_role, que ignora RLS.
drop policy if exists "notificacoes: select da unidade" on public.notificacoes;
create policy "notificacoes: select da unidade"
  on public.notificacoes for select
  using (public.is_unidade_member(unidade_id));

-- ----------------------------------------------------------------------------
-- Opt-in do cliente por categoria (transacionais sempre vão; opcionais não).
-- Categorias: cobranca | correspondencia | cafeteria | reservas | novidades
-- ----------------------------------------------------------------------------
create table if not exists public.cliente_notif_prefs (
  cliente_id   text not null,
  unidade_id   text not null,
  email        text,
  cobranca         boolean not null default true,    -- transacional (recomendado on)
  correspondencia  boolean not null default true,
  cafeteria        boolean not null default true,
  reservas         boolean not null default true,
  novidades        boolean not null default false,   -- marketing (opt-in explícito)
  atualizado_em timestamptz not null default now(),
  primary key (cliente_id, unidade_id)
);
alter table public.cliente_notif_prefs enable row level security;

drop policy if exists "prefs: unidade" on public.cliente_notif_prefs;
create policy "prefs: unidade"
  on public.cliente_notif_prefs for select
  using (public.is_unidade_member(unidade_id));


-- >>>>>>>>>> supabase/migrations/20260603120000_tenant.sql <<<<<<<<<<

-- ============================================================================
-- CafeWorking · Estrutura multi-tenant no banco
--   contas (coworkings que assinam) → unidades → usuários (equipe) / clientes
--
-- RLS: um usuário enxerga os dados da(s) conta(s) em que é membro
-- (unidade_members). O admin da plataforma (platform_admins) enxerga tudo.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Admin da plataforma (franqueador) — vê todas as contas.
-- ----------------------------------------------------------------------------
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.platform_admins enable row level security;
drop policy if exists "platform_admins: self" on public.platform_admins;
create policy "platform_admins: self" on public.platform_admins for select using (user_id = auth.uid());

create or replace function public.is_platform_admin()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.platform_admins a where a.user_id = auth.uid());
$$;

-- Contas (franqueados) do usuário logado (via unidade_members).
create or replace function public.user_franqueados()
returns setof text language sql security definer set search_path = public stable as $$
  select distinct franqueado_id from public.unidade_members
  where user_id = auth.uid() and franqueado_id is not null;
$$;

-- ----------------------------------------------------------------------------
-- contas (cada coworking que assina o app)
-- ----------------------------------------------------------------------------
create table if not exists public.contas (
  id           text primary key,                 -- ex.: "fr_ciatos"
  nome         text not null,
  master       text,
  email        text,
  documento    text,
  telefone     text,
  plano        text default 'Essencial',
  mensalidade  numeric(10,2) default 0,
  criado_em    text,
  created_at   timestamptz not null default now()
);
alter table public.contas enable row level security;
drop policy if exists "contas: minha conta ou admin" on public.contas;
create policy "contas: minha conta ou admin" on public.contas for select
  using (public.is_platform_admin() or id in (select public.user_franqueados()));

-- ----------------------------------------------------------------------------
-- unidades (cada coworking físico, pertence a uma conta)
-- ----------------------------------------------------------------------------
create table if not exists public.unidades (
  id            text primary key,                -- ex.: "lux"
  franqueado_id text references public.contas (id) on delete cascade,
  nome          text not null,
  endereco      text,
  cor           text default '#6E4E3B',
  salas         int default 0,
  ocupacao      int default 0,
  membros       int default 0,
  receita       numeric(12,2) default 0,
  ativa         boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists unidades_franqueado_idx on public.unidades (franqueado_id);
alter table public.unidades enable row level security;
drop policy if exists "unidades: da minha conta ou admin" on public.unidades;
create policy "unidades: da minha conta ou admin" on public.unidades for select
  using (public.is_platform_admin() or franqueado_id in (select public.user_franqueados()) or public.is_unidade_member(id));

-- ----------------------------------------------------------------------------
-- usuarios (equipe) — perfil de acesso por unidade
-- ----------------------------------------------------------------------------
create table if not exists public.usuarios (
  id          text primary key,
  unidade_id  text references public.unidades (id) on delete cascade,
  nome        text not null,
  email       text,
  perfil      text not null default 'recepcao',  -- master | financeiro | recepcao
  ativo       boolean not null default true,
  auth_user_id uuid references auth.users (id),  -- vínculo com o login (quando houver)
  created_at  timestamptz not null default now()
);
create index if not exists usuarios_unidade_idx on public.usuarios (unidade_id);
alter table public.usuarios enable row level security;
drop policy if exists "usuarios: da unidade" on public.usuarios;
create policy "usuarios: da unidade" on public.usuarios for select
  using (public.is_platform_admin() or public.is_unidade_member(unidade_id));

-- ----------------------------------------------------------------------------
-- clientes (membros do coworking)
-- ----------------------------------------------------------------------------
create table if not exists public.clientes (
  id          text primary key,
  unidade_id  text references public.unidades (id) on delete cascade,
  nome        text not null,
  documento   text,                              -- CPF/CNPJ
  plano       text,
  fiscal      boolean default false,             -- usa endereço fiscal
  status      text default 'ativo',
  desde       text,
  contato     text,
  email       text,
  telefone    text,
  created_at  timestamptz not null default now()
);
create index if not exists clientes_unidade_idx on public.clientes (unidade_id);
alter table public.clientes enable row level security;
drop policy if exists "clientes: da unidade" on public.clientes;
create policy "clientes: da unidade" on public.clientes for select
  using (public.is_platform_admin() or public.is_unidade_member(unidade_id));


-- >>>>>>>>>> supabase/migrations/20260603140000_boletos_oauth.sql <<<<<<<<<<

-- ============================================================================
-- CafeWorking · Conexão OAuth (consentimento) das contas bancárias
--   - colunas de status de conexão em bank_accounts
--   - helper de Vault para gravar/atualizar tokens OAuth (só service_role)
-- ============================================================================

alter table public.bank_accounts add column if not exists conexao jsonb;
alter table public.bank_accounts add column if not exists conexao_status text;

-- Grava OU atualiza um segredo no Vault (tokens OAuth do banco), referenciado
-- por nome. Usada pela Edge Function `bank-oauth-callback`.
create or replace function public.upsert_bank_secret(p_ref text, p_secret text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'acesso negado: só o backend pode gravar credenciais';
  end if;

  select id into v_id from vault.secrets where name = p_ref limit 1;
  if v_id is null then
    perform vault.create_secret(p_secret, p_ref, 'Token/credencial bancária (CafeWorking)');
  else
    perform vault.update_secret(v_id, p_secret);
  end if;
end $$;

revoke all on function public.upsert_bank_secret(text, text) from public, anon, authenticated;


-- >>>>>>>>>> supabase/migrations/20260604120000_notas_fiscais.sql <<<<<<<<<<

-- ============================================================================
-- CafeWorking · Módulo de Nota Fiscal de Serviço (NFS-e)
-- Schema: config_fiscal (por unidade) + notas_fiscais, RLS por unidade.
--
-- Cada UNIDADE tem sua própria configuração fiscal e emite suas próprias
-- notas (emissor "nacional" = NFS-e Nacional / SERPRO; "bhiss" = BH municipal).
-- O certificado digital A1 (e-CNPJ) NUNCA fica em coluna comum — vai para o
-- Supabase Vault e é referenciado por `certificado_ref`.
--
-- Depende de: 20260602120000_boletos.sql (public.is_unidade_member,
-- public.tg_set_updated_at, extensões pgcrypto/supabase_vault).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENUMs
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.nfse_emissor as enum ('nacional', 'bhiss');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.nfse_ambiente as enum ('homologacao', 'producao');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.nfse_status as enum ('processando', 'autorizada', 'cancelada', 'erro');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- config_fiscal: 1 linha por unidade
-- ----------------------------------------------------------------------------
create table if not exists public.config_fiscal (
  id                  uuid primary key default gen_random_uuid(),
  unidade_id          text not null unique,            -- "lux", "est", ...
  municipio           text not null default '',
  uf                  text not null default '',
  cnpj                text,                             -- CNPJ do prestador (unidade)
  razao_social        text,
  inscricao_municipal text,                            -- CCM
  regime              text not null default 'Simples Nacional',
  codigo_servico      text not null default '',        -- item LC 116 (ex.: 08.01)
  descricao_servico   text not null default '',
  aliquota_iss        numeric(5,2) not null default 0, -- %
  emissor             public.nfse_emissor not null default 'nacional',
  ambiente            public.nfse_ambiente not null default 'homologacao',
  certificado_ref     text not null default '',        -- nome do segredo no Vault
  emissao_ativa       boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.config_fiscal enable row level security;

drop policy if exists "config_fiscal: select da unidade" on public.config_fiscal;
create policy "config_fiscal: select da unidade"
  on public.config_fiscal for select
  using (public.is_unidade_member(unidade_id));

drop policy if exists "config_fiscal: insert na unidade" on public.config_fiscal;
create policy "config_fiscal: insert na unidade"
  on public.config_fiscal for insert
  with check (public.is_unidade_member(unidade_id));

drop policy if exists "config_fiscal: update da unidade" on public.config_fiscal;
create policy "config_fiscal: update da unidade"
  on public.config_fiscal for update
  using (public.is_unidade_member(unidade_id))
  with check (public.is_unidade_member(unidade_id));

-- ----------------------------------------------------------------------------
-- notas_fiscais
-- ----------------------------------------------------------------------------
create table if not exists public.notas_fiscais (
  id                 uuid primary key default gen_random_uuid(),
  unidade_id         text not null,                    -- denormalizado p/ RLS rápido
  numero             text,                             -- número da NFS-e
  rps_numero         text,                             -- RPS (nosso sequencial)

  tomador            text not null,
  tomador_documento  text not null,                    -- CPF/CNPJ
  descricao          text,
  valor              numeric(12,2) not null check (valor > 0),
  iss                numeric(12,2),

  emissor            public.nfse_emissor not null default 'nacional',
  nfse_id            text,                             -- chave/id no emissor
  codigo_verificacao text,
  status             public.nfse_status not null default 'processando',
  erro               text,

  boleto_id          uuid references public.boletos (id) on delete set null,
  pdf_url            text,
  xml_url            text,

  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists notas_fiscais_unidade_idx on public.notas_fiscais (unidade_id);
create index if not exists notas_fiscais_status_idx on public.notas_fiscais (status);
create index if not exists notas_fiscais_boleto_idx on public.notas_fiscais (boleto_id);

alter table public.notas_fiscais enable row level security;

-- Emissão/cancelamento são feitos pela Edge Function (service_role). Para o
-- cliente, liberamos apenas leitura.
drop policy if exists "notas_fiscais: select da unidade" on public.notas_fiscais;
create policy "notas_fiscais: select da unidade"
  on public.notas_fiscais for select
  using (public.is_unidade_member(unidade_id));

-- ----------------------------------------------------------------------------
-- updated_at automático (reutiliza public.tg_set_updated_at do módulo boletos)
-- ----------------------------------------------------------------------------
drop trigger if exists set_updated_at on public.config_fiscal;
create trigger set_updated_at before update on public.config_fiscal
  for each row execute function public.tg_set_updated_at();

drop trigger if exists set_updated_at on public.notas_fiscais;
create trigger set_updated_at before update on public.notas_fiscais
  for each row execute function public.tg_set_updated_at();

-- ----------------------------------------------------------------------------
-- Vault: leitura do certificado A1 SOMENTE pelo service_role (Edge Functions).
-- ----------------------------------------------------------------------------
create or replace function public.get_fiscal_credentials(p_ref text)
returns jsonb
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'acesso negado: certificado só pode ser lido pelo backend';
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = p_ref
  limit 1;

  if v_secret is null then
    raise exception 'certificado % não encontrado no Vault', p_ref;
  end if;

  return v_secret::jsonb;  -- { cert_pfx_base64, cert_senha, ... }
end $$;

revoke all on function public.get_fiscal_credentials(text) from public, anon, authenticated;

-- Comentário de uso:
-- Cadastrar um certificado A1 (rodar no SQL editor com service_role):
--   select vault.create_secret(
--     '{"cert_pfx_base64":"<base64 do .pfx>","cert_senha":"<senha>"}',
--     'cert_nfse_luxemburgo',              -- <- este nome vira o certificado_ref
--     'Certificado A1 e-CNPJ — Luxemburgo (NFS-e)'
--   );


-- >>>>>>>>>> supabase/migrations/20260604140000_nfse_certificado.sql <<<<<<<<<<

-- ============================================================================
-- CafeWorking · NFS-e — upload do certificado A1 + gravação no Vault
--
-- Adiciona metadados do certificado em config_fiscal (validade/titular, sem o
-- segredo) e a função upsert_fiscal_secret() que grava/atualiza o certificado
-- no Vault (espelha upsert_bank_secret do módulo de boletos). O .pfx e a senha
-- NUNCA ficam em coluna comum nem no front — só no Vault.
--
-- Depende de: 20260604120000_notas_fiscais.sql
-- ============================================================================

-- Metadados não sensíveis do certificado (para a UI mostrar status/validade).
alter table public.config_fiscal
  add column if not exists certificado_titular   text,
  add column if not exists certificado_validade  date,
  add column if not exists certificado_enviado_em timestamptz;

-- ----------------------------------------------------------------------------
-- upsert_fiscal_secret(p_ref, p_secret): cria/atualiza um segredo no Vault.
-- SECURITY DEFINER, restrito ao service_role (Edge Function salvar-certificado).
-- ----------------------------------------------------------------------------
create or replace function public.upsert_fiscal_secret(p_ref text, p_secret text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'acesso negado: só o backend pode gravar certificados';
  end if;

  select id into v_id from vault.secrets where name = p_ref limit 1;

  if v_id is null then
    perform vault.create_secret(p_secret, p_ref, 'Certificado A1 NFS-e (CafeWorking)');
  else
    perform vault.update_secret(v_id, p_secret, p_ref, 'Certificado A1 NFS-e (CafeWorking)');
  end if;
end $$;

revoke all on function public.upsert_fiscal_secret(text, text) from public, anon, authenticated;


-- >>>>>>>>>> supabase/seed_demo.sql <<<<<<<<<<

-- ============================================================================
-- CafeWorking · Seed de demonstração (espelha o seed do front-end).
-- Rode UMA vez após as migrations, para o banco nascer com os dados do app.
-- `on conflict do nothing` torna idempotente.
-- ============================================================================

-- Contas (coworkings assinantes) -------------------------------------------
insert into public.contas (id, nome, master, email, documento, telefone, plano, mensalidade, criado_em) values
  ('fr_ciatos', 'Grupo Ciatos',     'Diego Garcia',    'diego.garcia@grupociatos.com.br', '20.351.761/0001-03', '(31) 99712-9789', 'Pro',       597, '2024-01'),
  ('fr1',       'Franquia Savassi',  'Rafael Nogueira', 'rafael@franquiasavassi.com.br',   '42.518.770/0001-22', '',                'Essencial', 297, '2026-05')
on conflict (id) do nothing;

-- Unidades ------------------------------------------------------------------
insert into public.unidades (id, franqueado_id, nome, endereco, cor, salas, ocupacao, membros, receita) values
  ('lux',     'fr_ciatos', 'Luxemburgo', 'Rua Guaicuí, 715 · BH/MG',         '#6E4E3B', 14, 86, 92, 184500),
  ('est',     'fr_ciatos', 'Estoril',    'Av. Raja Gabaglia, 2000 · BH/MG',  '#0E4B4F',  9, 71, 58, 121300),
  ('savassi', 'fr1',       'Savassi',    'Rua Antônio de Albuquerque, 100 · BH/MG', '#B8862F', 0, 0, 0, 0)
on conflict (id) do nothing;

-- Equipe (usuários) ---------------------------------------------------------
insert into public.usuarios (id, unidade_id, nome, email, perfil, ativo) values
  ('us1', 'lux',     'Marina Souza',    'recepcao.lux@cafeworking.com.br', 'recepcao',   true),
  ('us2', 'lux',     'Paulo Andrade',   'financeiro@ciatos.com.br',        'financeiro', true),
  ('us3', 'est',     'Júlia Reis',      'recepcao.est@cafeworking.com.br', 'recepcao',   true),
  ('us4', 'savassi', 'Rafael Nogueira', 'rafael@franquiasavassi.com.br',   'master',     true)
on conflict (id) do nothing;

-- Clientes ------------------------------------------------------------------
insert into public.clientes (id, unidade_id, nome, documento, plano, fiscal, status, desde, contato, email, telefone) values
  ('c1', 'lux', 'Ciatos Log Transportes', '20.351.761/0001-03', 'Sala Privativa',  true, 'ativo', '2023', 'Rafael Mendes', 'rafael@ciatoslog.com.br', '(31) 99100-2030'),
  ('c2', 'lux', 'Mendes Advocacia',       '31.882.004/0001-77', 'Endereço Fiscal', true, 'ativo', '2024', 'Carla Mendes',  'carla@mendesadv.com.br',  '(31) 98822-1140')
on conflict (id) do nothing;

-- Configuração fiscal por unidade (NFS-e) -----------------------------------
-- Começa em 'homologacao' (produção restrita): emite só para teste até validar.
-- Troque o CNPJ/IM/alíquota conforme o contador. O certificado A1 é enviado
-- depois pela tela (Edge Function salvar-certificado → Vault).
insert into public.config_fiscal
  (unidade_id, municipio, uf, cnpj, inscricao_municipal, regime, codigo_servico, descricao_servico, aliquota_iss, emissor, ambiente, certificado_ref, emissao_ativa) values
  ('lux', 'Belo Horizonte', 'MG', '00.000.000/0001-00', '1.234.567/001-8', 'Simples Nacional', '08.01', 'Locação de espaço para coworking e salas', 2, 'nacional', 'homologacao', 'cert_nfse_lux', true),
  ('est', 'Belo Horizonte', 'MG', '00.000.000/0002-00', '1.234.567/002-6', 'Simples Nacional', '08.01', 'Locação de espaço para coworking e salas', 2, 'nacional', 'homologacao', 'cert_nfse_est', true)
on conflict (unidade_id) do nothing;

-- ============================================================================
-- Vínculos de acesso (preencher COM os ids reais do Supabase Auth)
-- Depois de criar os usuários no Auth, descubra o uuid e rode:
--
--   -- Diego = master do Grupo Ciatos (vê lux + est)
--   insert into public.unidade_members (user_id, unidade_id, franqueado_id, role) values
--     ('<uuid-do-diego>', 'lux', 'fr_ciatos', 'master'),
--     ('<uuid-do-diego>', 'est', 'fr_ciatos', 'master');
--
--   -- Admin da plataforma (vê todas as contas)
--   insert into public.platform_admins (user_id) values ('<uuid-do-admin>');
-- ============================================================================

