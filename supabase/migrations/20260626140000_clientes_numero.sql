-- ============================================================================
-- CafeWorking · clientes: número do endereço
-- ============================================================================

alter table public.clientes add column if not exists numero text;
