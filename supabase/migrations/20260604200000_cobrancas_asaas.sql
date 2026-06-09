-- ============================================================================
-- CafeWorking · Cobranças via gateway (Asaas) — boleto + PIX + cartão
--
-- Em vez de integrar banco a banco (que exige parceria/credenciais por banco),
-- o Asaas é um gateway: uma conta + uma chave de API permitem cobrar por
-- boleto, PIX e cartão de crédito. A chave fica no Vault (ref asaas_<unidade>).
--
-- Depende de: 20260603120000_tenant.sql (is_unidade_member/is_platform_admin)
-- ============================================================================

create table if not exists public.cobrancas (
  id                 uuid primary key default gen_random_uuid(),
  unidade_id         text not null,
  cliente            text not null,
  cliente_documento  text,
  cliente_email      text,
  valor              numeric(12,2) not null check (valor > 0),
  vencimento         date,
  descricao          text,
  tipo               text not null default 'UNDEFINED',  -- BOLETO | PIX | CREDIT_CARD | UNDEFINED (cliente escolhe)
  gateway            text not null default 'asaas',
  asaas_customer_id  text,
  asaas_payment_id   text,
  status             text not null default 'pendente',   -- pendente | pago | vencido | cancelado | estornado
  invoice_url        text,   -- link de pagamento (fatura hospedada — aceita cartão)
  boleto_url         text,   -- PDF do boleto
  linha_digitavel    text,
  pix_payload        text,   -- copia e cola do PIX
  valor_pago         numeric(12,2),
  pago_em            timestamptz,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists cobrancas_unidade_idx on public.cobrancas (unidade_id);
create index if not exists cobrancas_status_idx on public.cobrancas (status);
create index if not exists cobrancas_asaas_idx on public.cobrancas (asaas_payment_id);

alter table public.cobrancas enable row level security;

-- Leitura pelos membros da unidade; escrita é feita pela Edge Function (service_role).
drop policy if exists "cobrancas: select da unidade" on public.cobrancas;
create policy "cobrancas: select da unidade" on public.cobrancas for select
  using (public.is_platform_admin() or public.is_unidade_member(unidade_id));

drop trigger if exists set_updated_at on public.cobrancas;
create trigger set_updated_at before update on public.cobrancas
  for each row execute function public.tg_set_updated_at();

-- A chave da API Asaas vai para o Vault (uma vez por unidade):
--   select vault.create_secret('{"api_key":"$aact_...","ambiente":"producao"}',
--     'asaas_lux', 'Asaas API key — Luxemburgo');
-- A Edge Function lê via get_bank_credentials('asaas_<unidade>').
