-- ============================================================================
-- CafeWorking · CRÉDITOS DO PLANO — LEDGER RELACIONAL (Fase 2)
--
-- A Fase 1 mantinha o ledger de créditos no app_state (client-side). Como o
-- cliente final NÃO escreve app_state (invariante de segurança), o consumo de
-- crédito na reserva self-service do cliente precisa ser gravado pelo servidor.
-- Esta tabela passa a ser a fonte da verdade dos créditos.
--
-- saldo(cliente, tipo) = soma de `quantidade` (concessões + , consumos − ).
--
-- RLS:
--   • LEITURA: admin tudo; staff a própria unidade; cliente os PRÓPRIOS
--     (cliente_email = e-mail do JWT).
--   • ESCRITA (insert): admin/staff (concessão do plano, ajuste manual). O
--     cliente NÃO insere — os consumos são gravados pelas Edge Functions com
--     service_role (ex.: criar-reserva). Append-only: sem update/delete.
--
-- `unidade_id` text (casa com is_unidade_staff). Idempotente.
-- ============================================================================

create table if not exists public.creditos_ledger (
  id            text primary key,
  unidade_id    text not null,
  cliente_id    text,
  cliente_email text,
  tipo          text not null,                 -- sala_reuniao|coworking|daypass|correspondencia
  quantidade    numeric not null,              -- + concessão, − consumo
  saldo_apos    numeric,
  origem        text,                          -- plano|consumo|ajuste_manual|excedente
  motivo        text,
  referencia_id text,                          -- id da reserva, do plano, etc.
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid()
);

create index if not exists creditos_ledger_cliente_idx
  on public.creditos_ledger (unidade_id, cliente_id, tipo);
create index if not exists creditos_ledger_email_idx
  on public.creditos_ledger (unidade_id, cliente_email, tipo);

alter table public.creditos_ledger enable row level security;

-- Leitura por papel.
drop policy if exists "creditos: select por papel" on public.creditos_ledger;
create policy "creditos: select por papel" on public.creditos_ledger for select
  using (
    public.is_platform_admin()
    or public.is_unidade_staff(unidade_id)
    or cliente_email = (auth.jwt() ->> 'email')
  );

-- Escrita (concessão/ajuste): apenas admin/staff. Consumos vêm via service_role.
drop policy if exists "creditos: insert staff" on public.creditos_ledger;
create policy "creditos: insert staff" on public.creditos_ledger for insert
  with check (public.is_platform_admin() or public.is_unidade_staff(unidade_id));

-- Sem policy de update/delete ⇒ ledger append-only.
