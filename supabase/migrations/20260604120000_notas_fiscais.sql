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
