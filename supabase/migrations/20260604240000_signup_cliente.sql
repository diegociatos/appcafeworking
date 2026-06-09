-- ============================================================================
-- CafeWorking · Autocadastro do cliente do coworking
--
-- O cliente final (membro do coworking) se cadastra sozinho na tela de login,
-- escolhendo CIDADE e UNIDADE. A Edge Function cadastrar-cliente cria o login
-- (Auth) + o registro em clientes + o vínculo unidade_members (role 'cliente').
--
-- Também corrige a privacidade: a EQUIPE (master/recepção/financeiro) vê todos
-- os clientes da unidade; o CLIENTE vê apenas o próprio cadastro.
-- Depende de: 20260603120000_tenant.sql + 20260604160000_clientes_rw.sql
-- ============================================================================

alter table public.unidades
  add column if not exists cidade text;

update public.unidades set cidade = 'Belo Horizonte' where id in ('lux', 'est') and cidade is null;

-- É membro da EQUIPE da unidade (qualquer papel que não seja "cliente")?
create or replace function public.is_unidade_staff(p_unidade_id text)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.unidade_members m
    where m.user_id = auth.uid() and m.unidade_id = p_unidade_id and m.role <> 'cliente'
  );
$$;
revoke all on function public.is_unidade_staff(text) from public, anon;

-- SELECT de clientes: admin OU equipe da unidade OU o próprio cliente (e-mail).
drop policy if exists "clientes: da unidade" on public.clientes;
drop policy if exists "clientes: select acesso" on public.clientes;
create policy "clientes: select acesso" on public.clientes for select
  using (
    public.is_platform_admin()
    or public.is_unidade_staff(unidade_id)
    or email = (auth.jwt() ->> 'email')
  );

-- O cliente pode editar o PRÓPRIO cadastro.
drop policy if exists "clientes: edita o proprio" on public.clientes;
create policy "clientes: edita o proprio" on public.clientes for update
  using (email = (auth.jwt() ->> 'email'))
  with check (email = (auth.jwt() ->> 'email'));
