-- ============================================================================
-- CafeWorking · RLS REFORÇADA POR PAPEL (correção crítica de isolamento)
--
-- CONTEXTO DO PROBLEMA
--   O cliente final do coworking entra em `unidade_members` com role='cliente'.
--   Várias policies usavam `public.is_unidade_member(unidade_id)`, que retorna
--   true para QUALQUER vínculo — inclusive o do cliente. Resultado: o cliente
--   final podia ler (e às vezes escrever) dados internos da unidade.
--
-- TRÊS PAPÉIS (deixe claro):
--   • platform_admin  → vê TUDO (is_platform_admin()).
--   • staff da unidade → master | financeiro | recepcao  (is_unidade_staff():
--                        existe vínculo com role <> 'cliente'). Opera a unidade.
--   • cliente final    → role='cliente'. Vê só os PRÓPRIOS dados (por e-mail/doc).
--
-- `is_unidade_member()` continua existindo (uso interno/compat), mas NÃO deve
-- mais liberar dados internos. Esta migration troca as policies sensíveis para
-- `is_platform_admin() OR is_unidade_staff()` e adiciona acesso do cliente só
-- aos próprios documentos onde faz sentido (cobranças, boletos, notas).
--
-- Idempotente: drop policy if exists + create policy.
-- ============================================================================

-- Garante o helper de staff (já criado em 20260604240000, recriado aqui por
-- segurança/ordem de aplicação).
create or replace function public.is_unidade_staff(p_unidade_id text)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.unidade_members m
    where m.user_id = auth.uid() and m.unidade_id = p_unidade_id and m.role <> 'cliente'
  );
$$;

-- ============================================================================
-- 1) app_state — APENAS staff/admin. O cliente NÃO lê nem escreve o estado
--    operacional (salas, reservas, leads, estoque, contratos, conversas,
--    lançamentos, pedidos, planos, recibos, eventos, correspondências).
-- ============================================================================
drop policy if exists "app_state: rw da unidade" on public.app_state;
create policy "app_state: rw staff" on public.app_state for all
  using (public.is_platform_admin() or public.is_unidade_staff(unidade_id))
  with check (public.is_platform_admin() or public.is_unidade_staff(unidade_id));

-- ============================================================================
-- 2) bank_accounts — credenciais bancárias: só staff/admin.
-- ============================================================================
drop policy if exists "bank_accounts: select da unidade" on public.bank_accounts;
create policy "bank_accounts: select staff" on public.bank_accounts for select
  using (public.is_platform_admin() or public.is_unidade_staff(unidade_id));
drop policy if exists "bank_accounts: insert na unidade" on public.bank_accounts;
create policy "bank_accounts: insert staff" on public.bank_accounts for insert
  with check (public.is_platform_admin() or public.is_unidade_staff(unidade_id));
drop policy if exists "bank_accounts: update da unidade" on public.bank_accounts;
create policy "bank_accounts: update staff" on public.bank_accounts for update
  using (public.is_platform_admin() or public.is_unidade_staff(unidade_id))
  with check (public.is_platform_admin() or public.is_unidade_staff(unidade_id));
drop policy if exists "bank_accounts: delete da unidade" on public.bank_accounts;
create policy "bank_accounts: delete staff" on public.bank_accounts for delete
  using (public.is_platform_admin() or public.is_unidade_staff(unidade_id));

-- ============================================================================
-- 3) config_fiscal — configuração fiscal + referência do certificado: só staff.
-- ============================================================================
drop policy if exists "config_fiscal: select da unidade" on public.config_fiscal;
create policy "config_fiscal: select staff" on public.config_fiscal for select
  using (public.is_platform_admin() or public.is_unidade_staff(unidade_id));
drop policy if exists "config_fiscal: insert na unidade" on public.config_fiscal;
create policy "config_fiscal: insert staff" on public.config_fiscal for insert
  with check (public.is_platform_admin() or public.is_unidade_staff(unidade_id));
drop policy if exists "config_fiscal: update da unidade" on public.config_fiscal;
create policy "config_fiscal: update staff" on public.config_fiscal for update
  using (public.is_platform_admin() or public.is_unidade_staff(unidade_id))
  with check (public.is_platform_admin() or public.is_unidade_staff(unidade_id));

-- ============================================================================
-- 4) usuarios (equipe) — só staff/admin vê a equipe.
-- ============================================================================
drop policy if exists "usuarios: da unidade" on public.usuarios;
create policy "usuarios: staff" on public.usuarios for select
  using (public.is_platform_admin() or public.is_unidade_staff(unidade_id));

-- ============================================================================
-- 5) pending_signups — cadastros aguardando pagamento: só staff/admin.
-- ============================================================================
drop policy if exists "pending_signups: select da unidade" on public.pending_signups;
create policy "pending_signups: staff" on public.pending_signups for select
  using (public.is_platform_admin() or public.is_unidade_staff(unidade_id));

-- ============================================================================
-- 6) notificacoes — staff vê o histórico da unidade; o cliente vê só as
--    notificações destinadas a ele (destinatario = e-mail do JWT).
-- ============================================================================
drop policy if exists "notificacoes: select da unidade" on public.notificacoes;
create policy "notificacoes: select por papel" on public.notificacoes for select
  using (
    public.is_platform_admin()
    or public.is_unidade_staff(unidade_id)
    or destinatario = (auth.jwt() ->> 'email')
  );

-- 6b) cliente_notif_prefs — staff vê as da unidade; cliente vê só a própria.
drop policy if exists "prefs: unidade" on public.cliente_notif_prefs;
create policy "prefs: por papel" on public.cliente_notif_prefs for select
  using (
    public.is_platform_admin()
    or public.is_unidade_staff(unidade_id)
    or email = (auth.jwt() ->> 'email')
  );

-- ============================================================================
-- 7) boletos — staff vê todos da unidade; cliente vê só os próprios (vínculo
--    seguro: existe um cliente com o e-mail do JWT e documento = sacado).
-- ============================================================================
drop policy if exists "boletos: select da unidade" on public.boletos;
create policy "boletos: select por papel" on public.boletos for select
  using (
    public.is_platform_admin()
    or public.is_unidade_staff(unidade_id)
    or exists (
      select 1 from public.clientes c
      where c.email = (auth.jwt() ->> 'email')
        and c.unidade_id = boletos.unidade_id
        and c.documento is not null
        and c.documento = boletos.sacado_documento
    )
  );

-- ============================================================================
-- 8) cobrancas — staff vê todas da unidade; cliente vê só as próprias
--    (cliente_email = e-mail do JWT, ou documento próprio).
-- ============================================================================
drop policy if exists "cobrancas: select da unidade" on public.cobrancas;
create policy "cobrancas: select por papel" on public.cobrancas for select
  using (
    public.is_platform_admin()
    or public.is_unidade_staff(unidade_id)
    or cliente_email = (auth.jwt() ->> 'email')
    or exists (
      select 1 from public.clientes c
      where c.email = (auth.jwt() ->> 'email')
        and c.unidade_id = cobrancas.unidade_id
        and c.documento is not null
        and c.documento = cobrancas.cliente_documento
    )
  );

-- ============================================================================
-- 9) notas_fiscais — staff vê todas da unidade; cliente vê só as próprias
--    (tomador_documento = documento do cliente com o e-mail do JWT).
-- ============================================================================
drop policy if exists "notas_fiscais: select da unidade" on public.notas_fiscais;
create policy "notas_fiscais: select por papel" on public.notas_fiscais for select
  using (
    public.is_platform_admin()
    or public.is_unidade_staff(unidade_id)
    or exists (
      select 1 from public.clientes c
      where c.email = (auth.jwt() ->> 'email')
        and c.unidade_id = notas_fiscais.unidade_id
        and c.documento is not null
        and c.documento = notas_fiscais.tomador_documento
    )
  );
