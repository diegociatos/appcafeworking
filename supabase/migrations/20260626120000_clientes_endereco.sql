-- ============================================================================
-- CafeWorking · clientes: endereço e CEP
-- Necessários para correspondências e para o endereço do tomador.
-- ============================================================================

alter table public.clientes add column if not exists endereco text;
alter table public.clientes add column if not exists cep text;
