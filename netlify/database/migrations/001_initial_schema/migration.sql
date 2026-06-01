create extension if not exists pgcrypto;

create table if not exists unidades (
  id text primary key,
  nome text not null,
  endereco text not null,
  salas integer not null default 0,
  ocupacao integer not null default 0,
  membros integer not null default 0,
  receita numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj text,
  plano text,
  unidade_id text references unidades(id),
  fiscal boolean not null default false,
  status text not null default 'ativo',
  contato text,
  email text,
  telefone text,
  created_at timestamptz not null default now()
);

create table if not exists salas (
  id text primary key,
  nome text not null,
  unidade_id text references unidades(id),
  capacidade integer not null default 1,
  tipo text not null,
  valor_hora numeric(10, 2)
);

create table if not exists reservas (
  id uuid primary key default gen_random_uuid(),
  sala_id text references salas(id),
  cliente_id uuid references clientes(id),
  inicio timestamptz not null,
  fim timestamptz not null,
  status text not null default 'confirmada',
  created_at timestamptz not null default now()
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  origem text,
  interesse text,
  etapa text not null default 'novo',
  valor numeric(12, 2) not null default 0,
  probabilidade integer not null default 0,
  telefone text,
  created_at timestamptz not null default now()
);

create table if not exists faturas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes(id),
  valor numeric(12, 2) not null,
  vencimento date not null,
  status text not null default 'aberto',
  plano text,
  created_at timestamptz not null default now()
);

create table if not exists produtos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  categoria text not null,
  preco numeric(10, 2) not null,
  cmv numeric(10, 2) not null default 0,
  ativo boolean not null default true
);

create table if not exists correspondencias (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes(id),
  remetente text not null,
  tipo text not null,
  recebido_em timestamptz not null default now(),
  status text not null default 'aguardando',
  urgente boolean not null default false,
  foto_url text
);
