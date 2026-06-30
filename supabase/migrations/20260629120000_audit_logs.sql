-- ============================================================================
-- CafeWorking · TRILHA DE AUDITORIA (audit_logs)
--
-- Registro append-only de ações sensíveis (criar reserva, excluir usuário da
-- equipe, emitir nota fiscal, etc.). Escrito SEMPRE pelo backend com
-- service_role (Edge Functions), nunca pelo front-end — assim o log não é
-- forjável pelo cliente nem pela recepção.
--
-- LEITURA (RLS):
--   • platform_admin → vê tudo;
--   • staff da unidade (is_unidade_staff) → vê a própria unidade;
--   • cliente final → não vê nada.
-- ESCRITA: sem policy de insert/update/delete ⇒ bloqueada para anon e
--   authenticated. Apenas service_role (que ignora RLS) grava. Append-only.
--
-- `unidade_id` é text para casar com is_unidade_staff(p_unidade_id text).
-- Idempotente.
-- ============================================================================

create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  unidade_id  text,
  ator_id     uuid,
  ator_email  text,
  acao        text not null,                       -- ex.: 'reserva.criada'
  entidade    text,                                -- ex.: 'reserva'
  entidade_id text,
  detalhe     jsonb not null default '{}'::jsonb,
  ip          text,
  created_at  timestamptz not null default now()
);

create index if not exists audit_logs_unidade_created_idx
  on public.audit_logs (unidade_id, created_at desc);
create index if not exists audit_logs_acao_idx
  on public.audit_logs (acao);

alter table public.audit_logs enable row level security;

-- Leitura: admin da plataforma vê tudo; staff vê a própria unidade.
drop policy if exists "audit_logs: select staff" on public.audit_logs;
create policy "audit_logs: select staff" on public.audit_logs for select
  using (public.is_platform_admin() or public.is_unidade_staff(unidade_id));

-- Nenhuma policy de escrita: insert/update/delete só via service_role.
