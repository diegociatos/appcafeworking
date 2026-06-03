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
