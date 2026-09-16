-- ============================================================================
-- CafeWorking · Operação da recepção
--
-- 1) correspondencias: bucket PRIVADO para a foto/PDF da correspondência.
--    Antes a imagem ia em base64 dentro do doc do app_state (pesava a
--    hidratação de toda a equipe). Caminho <unidade_id>/<id_da_correspondencia>.<ext>.
--    Equipe da unidade (is_unidade_staff) ou admin da plataforma envia, lê,
--    troca e apaga. O cliente nunca lê direto: recebe link assinado de 10
--    minutos pela Edge Function minhas-correspondencias (service_role).
--
-- 2) acessos_clientes(unidade): para a tela Clientes saber quem já tem login no
--    app. Lê auth.users (security definer), mas só devolve e-mails que estão no
--    cadastro de clientes da unidade e só para a equipe/admin. Traz também a
--    data do último convite enviado (audit_logs 'cliente.acesso_enviado').
--
-- 3) usuario_id_por_email(email): usado só pela Edge Function convidar-cliente
--    (service_role) para achar o login existente sem paginar o Auth inteiro.
--
-- 4) creditos_ledger: lançamento manual da equipe (horas de sala do mês,
--    ajuste, créditos do plano) passa a ficar na trilha de auditoria. A escrita
--    vem do navegador com o JWT da equipe (RLS "creditos: insert staff"), e
--    audit_logs não aceita insert do front; um gatilho grava o log. created_by
--    passa a ser sempre o usuário logado (o navegador não escolhe o autor).
--    Inserções do service_role (Edge Functions, que já auditam) não duplicam.
--
-- Idempotente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Bucket privado das correspondências
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('correspondencias', 'correspondencias', false, 10485760, array['image/webp', 'image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "correspondencias_equipe_le" on storage.objects;
create policy "correspondencias_equipe_le" on storage.objects for select to authenticated
  using (
    bucket_id = 'correspondencias'
    and (public.is_platform_admin() or public.is_unidade_staff((storage.foldername(name))[1]))
  );

drop policy if exists "correspondencias_equipe_insere" on storage.objects;
create policy "correspondencias_equipe_insere" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'correspondencias'
    and (public.is_platform_admin() or public.is_unidade_staff((storage.foldername(name))[1]))
  );

drop policy if exists "correspondencias_equipe_altera" on storage.objects;
create policy "correspondencias_equipe_altera" on storage.objects for update to authenticated
  using (
    bucket_id = 'correspondencias'
    and (public.is_platform_admin() or public.is_unidade_staff((storage.foldername(name))[1]))
  );

drop policy if exists "correspondencias_equipe_apaga" on storage.objects;
create policy "correspondencias_equipe_apaga" on storage.objects for delete to authenticated
  using (
    bucket_id = 'correspondencias'
    and (public.is_platform_admin() or public.is_unidade_staff((storage.foldername(name))[1]))
  );

-- ----------------------------------------------------------------------------
-- 2) Quem da base de clientes já tem acesso ao app
-- ----------------------------------------------------------------------------
create or replace function public.acessos_clientes(p_unidade_id text)
returns table (email text, tem_login boolean, tem_acesso boolean, ultimo_login timestamptz, convidado_em timestamptz)
language sql security definer set search_path = public stable as $$
  with emails as (
    select distinct lower(trim(c.email)) as email
    from public.clientes c
    where c.unidade_id = p_unidade_id
      and coalesce(trim(c.email), '') <> ''
      and (public.is_platform_admin() or public.is_unidade_staff(p_unidade_id))
  )
  select
    e.email,
    u.id is not null,
    exists (select 1 from public.unidade_members m where m.user_id = u.id and m.unidade_id = p_unidade_id),
    u.last_sign_in_at,
    (select max(a.created_at) from public.audit_logs a
      where a.acao = 'cliente.acesso_enviado' and a.unidade_id = p_unidade_id and a.detalhe ->> 'email' = e.email)
  from emails e
  left join lateral (
    select au.id, au.last_sign_in_at from auth.users au
    where lower(au.email) = e.email order by au.created_at limit 1
  ) u on true;
$$;

revoke all on function public.acessos_clientes(text) from public, anon;
grant execute on function public.acessos_clientes(text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3) Login pelo e-mail (só service_role)
-- ----------------------------------------------------------------------------
create or replace function public.usuario_id_por_email(p_email text)
returns uuid
language sql security definer set search_path = public stable as $$
  select au.id from auth.users au
  where lower(au.email) = lower(trim(p_email))
  order by au.created_at limit 1;
$$;

revoke all on function public.usuario_id_por_email(text) from public, anon, authenticated;
grant execute on function public.usuario_id_por_email(text) to service_role;

-- ----------------------------------------------------------------------------
-- 4) Auditoria do lançamento manual de créditos
-- ----------------------------------------------------------------------------
create or replace function public.creditos_ledger_autor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists creditos_ledger_autor on public.creditos_ledger;
create trigger creditos_ledger_autor before insert on public.creditos_ledger
  for each row execute function public.creditos_ledger_autor();

create or replace function public.creditos_ledger_auditar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- service_role (Edge Functions) não tem auth.uid() e já registra a própria auditoria
  if auth.uid() is null then
    return new;
  end if;
  insert into public.audit_logs (unidade_id, ator_id, ator_email, acao, entidade, entidade_id, detalhe)
  values (
    new.unidade_id, auth.uid(), lower(auth.jwt() ->> 'email'), 'credito.lancado', 'cliente', new.cliente_id,
    jsonb_build_object(
      'lancamento_id', new.id, 'tipo', new.tipo, 'quantidade', new.quantidade, 'saldo_apos', new.saldo_apos,
      'origem', new.origem, 'motivo', new.motivo, 'referencia_id', new.referencia_id, 'cliente_email', new.cliente_email
    )
  );
  return new;
end;
$$;

revoke all on function public.creditos_ledger_autor() from public, anon, authenticated;
revoke all on function public.creditos_ledger_auditar() from public, anon, authenticated;

drop trigger if exists creditos_ledger_auditar on public.creditos_ledger;
create trigger creditos_ledger_auditar after insert on public.creditos_ledger
  for each row execute function public.creditos_ledger_auditar();
