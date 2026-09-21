-- Consumos feitos por clientes recorrentes e cobrados em uma única fatura no fechamento.
create table if not exists public.consumos_cafeteria (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id) on delete cascade,
  cliente_id text not null references public.clientes(id) on delete cascade,
  cliente_email text not null,
  competencia text not null check (competencia ~ '^\d{4}-\d{2}$'),
  itens jsonb not null default '[]'::jsonb,
  valor numeric(12,2) not null check (valor > 0),
  status text not null default 'aberto' check (status in ('aberto','faturado','cancelado')),
  pedido_id text,
  cobranca_id uuid references public.cobrancas(id) on delete set null,
  created_at timestamptz not null default now(),
  faturado_em timestamptz
);
create index if not exists consumos_cafeteria_fechamento_idx
  on public.consumos_cafeteria (competencia, status, unidade_id, cliente_id);
alter table public.consumos_cafeteria enable row level security;
drop policy if exists "consumos cafeteria: leitura por papel" on public.consumos_cafeteria;
create policy "consumos cafeteria: leitura por papel" on public.consumos_cafeteria for select using (
  public.is_platform_admin() or public.is_unidade_staff(unidade_id)
  or lower(cliente_email) = lower(auth.jwt() ->> 'email')
);

-- Trava de idempotência: um fechamento por cliente, unidade e competência.
create table if not exists public.fechamentos_cafeteria (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id) on delete cascade,
  cliente_id text not null references public.clientes(id) on delete cascade,
  competencia text not null check (competencia ~ '^\d{4}-\d{2}$'),
  valor numeric(12,2) not null check (valor > 0),
  status text not null default 'processando' check (status in ('processando','faturado','erro')),
  cobranca_id uuid references public.cobrancas(id) on delete set null,
  erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unidade_id, cliente_id, competencia)
);
alter table public.fechamentos_cafeteria enable row level security;
drop policy if exists "fechamentos cafeteria: leitura staff" on public.fechamentos_cafeteria;
create policy "fechamentos cafeteria: leitura staff" on public.fechamentos_cafeteria for select using (
  public.is_platform_admin() or public.is_unidade_staff(unidade_id)
);
drop trigger if exists set_updated_at on public.fechamentos_cafeteria;
create trigger set_updated_at before update on public.fechamentos_cafeteria
  for each row execute function public.tg_set_updated_at();
