-- ============================================================================
-- CafeWorking · Clientes — liberar escrita (write-through) com RLS por unidade
--
-- A tabela clientes só tinha política de SELECT, então cadastrar/editar pelo
-- app não persistia. Aqui adicionamos insert/update/delete restritos a quem é
-- membro da unidade (ou admin da plataforma). Mesma lógica do config_fiscal.
--
-- Depende de: 20260603120000_tenant.sql (is_unidade_member, is_platform_admin)
-- ============================================================================

drop policy if exists "clientes: insert na unidade" on public.clientes;
create policy "clientes: insert na unidade" on public.clientes for insert
  with check (public.is_platform_admin() or public.is_unidade_member(unidade_id));

drop policy if exists "clientes: update na unidade" on public.clientes;
create policy "clientes: update na unidade" on public.clientes for update
  using (public.is_platform_admin() or public.is_unidade_member(unidade_id))
  with check (public.is_platform_admin() or public.is_unidade_member(unidade_id));

drop policy if exists "clientes: delete na unidade" on public.clientes;
create policy "clientes: delete na unidade" on public.clientes for delete
  using (public.is_platform_admin() or public.is_unidade_member(unidade_id));
