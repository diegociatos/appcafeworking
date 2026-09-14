-- ============================================================================
-- Venda pelo site — compra sem senha e acompanhamento do pagamento.
--
-- status_token: a página de pagamento do site acompanha a compra por este uuid
--   aleatório (função status-pagamento), sem expor id nem dado pessoal.
-- senha_definida=false: compra feita pelo site, sem senha; quando o pagamento
--   confirma, o asaas-webhook manda o link para o cliente criar a senha.
-- ============================================================================

alter table public.pending_signups
  add column if not exists status_token   uuid default gen_random_uuid(),
  add column if not exists senha_definida boolean not null default true;

update public.pending_signups set status_token = gen_random_uuid() where status_token is null;

alter table public.pending_signups alter column status_token set not null;

create unique index if not exists pending_signups_status_token_uk on public.pending_signups (status_token);
