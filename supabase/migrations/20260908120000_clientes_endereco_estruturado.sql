-- ============================================================================
-- CafeWorking · clientes: endereço estruturado (bairro, cidade, uf)
-- Completa o endereço do cliente (já havia endereco/cep/numero) para padronizar
-- com o pagador do boleto e o tomador da NFS-e. Colunas nullable e aditivas.
-- ============================================================================

alter table public.clientes add column if not exists bairro text;
alter table public.clientes add column if not exists cidade text;
alter table public.clientes add column if not exists uf text;
