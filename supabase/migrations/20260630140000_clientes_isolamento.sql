-- ============================================================================
-- CafeWorking · CORREÇÃO DE ISOLAMENTO — tabela `clientes`
--
-- Lacuna encontrada no checklist final: a `clientes` ainda usava
-- `is_unidade_member(unidade_id)` (de 20260603120000 + 20260604160000), que é
-- true para o cliente final. Resultado: um cliente logado podia LER e ESCREVER
-- os dados (nome, CPF/CNPJ, e-mail, telefone) de TODOS os clientes da unidade —
-- enumeração de PII e escrita indevida.
--
-- Correção (mesmo modelo da 20260627120000_rls_por_papel):
--   • SELECT: admin OU staff OU o PRÓPRIO registro (email = e-mail do JWT).
--   • INSERT/UPDATE/DELETE: apenas admin/staff. O cadastro do cliente final no
--     fluxo de auto-checkout é feito por Edge Function (service_role), que ignora
--     RLS — então não precisa de insert pelo papel 'cliente'.
-- Idempotente.
-- ============================================================================

-- SELECT — cliente vê só o próprio cadastro.
drop policy if exists "clientes: da unidade" on public.clientes;
drop policy if exists "clientes: select por papel" on public.clientes;
create policy "clientes: select por papel" on public.clientes for select
  using (
    public.is_platform_admin()
    or public.is_unidade_staff(unidade_id)
    or email = (auth.jwt() ->> 'email')
  );

-- INSERT — só staff/admin (cliente final entra via service_role).
drop policy if exists "clientes: insert na unidade" on public.clientes;
drop policy if exists "clientes: insert staff" on public.clientes;
create policy "clientes: insert staff" on public.clientes for insert
  with check (public.is_platform_admin() or public.is_unidade_staff(unidade_id));

-- UPDATE — só staff/admin.
drop policy if exists "clientes: update na unidade" on public.clientes;
drop policy if exists "clientes: update staff" on public.clientes;
create policy "clientes: update staff" on public.clientes for update
  using (public.is_platform_admin() or public.is_unidade_staff(unidade_id))
  with check (public.is_platform_admin() or public.is_unidade_staff(unidade_id));

-- DELETE — só staff/admin.
drop policy if exists "clientes: delete na unidade" on public.clientes;
drop policy if exists "clientes: delete staff" on public.clientes;
create policy "clientes: delete staff" on public.clientes for delete
  using (public.is_platform_admin() or public.is_unidade_staff(unidade_id));
