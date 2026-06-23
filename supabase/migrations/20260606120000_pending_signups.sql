-- ============================================================================
-- CafeWorking · Autocheckout no cadastro (assinatura com pagamento)
--
-- O cliente escolhe um plano da unidade e paga (cartão/PIX/boleto via Asaas) já
-- no cadastro. A conta SÓ é ativada quando o pagamento confirma (webhook).
--
-- Fluxo:
--   1. iniciar-assinatura: cria o login (BLOQUEADO/banido), a cobrança no Asaas
--      e uma linha aqui (status 'aguardando'); devolve o link de pagamento.
--   2. asaas-webhook (pago): desbanir o login, criar cliente + unidade_member,
--      marcar aqui como 'ativo'. A partir daí o cliente consegue entrar.
--
-- Depende de: 20260603120000_tenant.sql (is_unidade_member/is_platform_admin)
-- ============================================================================

create table if not exists public.pending_signups (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid,                 -- login criado no Auth (banido até pagar)
  unidade_id        text not null,
  franqueado_id     text,
  nome              text not null,
  email             text not null,
  telefone          text,
  documento         text,
  plano_id          text,
  plano_nome        text,
  valor             numeric(12,2) not null check (valor > 0),
  emite_nf          boolean not null default false,
  asaas_customer_id text,
  asaas_payment_id  text,
  invoice_url       text,
  status            text not null default 'aguardando', -- aguardando | ativo | cancelado
  ativado_em        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists pending_signups_unidade_idx on public.pending_signups (unidade_id);
create index if not exists pending_signups_asaas_idx on public.pending_signups (asaas_payment_id);
create unique index if not exists pending_signups_email_pend_idx
  on public.pending_signups (lower(email)) where status = 'aguardando';

alter table public.pending_signups enable row level security;

-- Leitura pela equipe da unidade (acompanhar cadastros aguardando pagamento).
-- Escrita é só pela Edge Function (service_role).
drop policy if exists "pending_signups: select da unidade" on public.pending_signups;
create policy "pending_signups: select da unidade" on public.pending_signups for select
  using (public.is_platform_admin() or public.is_unidade_member(unidade_id));

drop trigger if exists set_updated_at on public.pending_signups;
create trigger set_updated_at before update on public.pending_signups
  for each row execute function public.tg_set_updated_at();

-- GRANTs (padrão Supabase) — RLS continua sendo a camada de segurança.
grant all privileges on public.pending_signups to service_role;
grant select on public.pending_signups to anon, authenticated;
