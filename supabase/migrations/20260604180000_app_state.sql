-- ============================================================================
-- CafeWorking · app_state — persistência genérica das entidades operacionais
--
-- Em vez de uma tabela relacional por entidade (salas, reservas, lançamentos,
-- estoque, etc.), guardamos cada item como um documento JSON, chaveado por
-- (unidade_id, entity, item_id). Isso persiste TODO o estado operacional do app
-- com um único schema + RLS, sem mapear coluna a coluna.
--
-- Entidades já com tabela própria NÃO usam isto: clientes, config_fiscal,
-- bank_accounts, boletos, notas_fiscais.
--
-- Depende de: 20260603120000_tenant.sql (is_unidade_member, is_platform_admin)
-- ============================================================================

create table if not exists public.app_state (
  unidade_id text not null,
  entity     text not null,   -- 'salas','reservas','lancamentos','contas',
                              -- 'catalogo','estoque','patrimonio','contratos',
                              -- 'correspondencias','pedidos','conversas'
  item_id    text not null,
  doc        jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (unidade_id, entity, item_id)
);

create index if not exists app_state_unidade_entity_idx
  on public.app_state (unidade_id, entity);

alter table public.app_state enable row level security;

-- Membros da unidade (ou admin da plataforma) leem e escrevem o estado da
-- própria unidade. Mesma lógica de clientes/config_fiscal.
drop policy if exists "app_state: rw da unidade" on public.app_state;
create policy "app_state: rw da unidade" on public.app_state for all
  using (public.is_platform_admin() or public.is_unidade_member(unidade_id))
  with check (public.is_platform_admin() or public.is_unidade_member(unidade_id));

-- updated_at automático (reutiliza o trigger do módulo de boletos)
drop trigger if exists set_updated_at on public.app_state;
create trigger set_updated_at before update on public.app_state
  for each row execute function public.tg_set_updated_at();
