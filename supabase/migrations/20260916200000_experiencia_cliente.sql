-- ============================================================================
-- CafeWorking · Experiência do cliente (auditoria de 15/09/2026)
--
--   1) unidade_documentos + bucket privado documentos-unidade
--      Kit do endereço fiscal (IPTU, alvará/dispensa, modelo de anuência,
--      comprovante do imóvel). A equipe envia; o cliente só recebe link
--      assinado pela Edge Function kit-endereco, e só com assinatura de
--      endereço fiscal ativa e documentos aprovados.
--   2) preferencias_notificacao — escolha do cliente sobre e-mails opcionais
--      (lembretes, reservas, novidades). Transacionais sempre saem.
--   3) criar_reserva_segura recusa horário que já passou
--   4) cancelar_reserva_cliente — cancelamento pelo próprio cliente até 24h
--      antes, devolvendo as horas do plano consumidas pela reserva
--
-- Lembrete (20260605140000): toda tabela e função nova nasce com permissão
-- para anon/authenticated. Aqui tudo é revogado e concedido de novo só no que
-- precisa. Idempotente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Documentos da unidade (kit do endereço fiscal)
-- ----------------------------------------------------------------------------
create table if not exists public.unidade_documentos (
  id            uuid primary key default gen_random_uuid(),
  unidade_id    text not null,
  tipo          text not null check (tipo in ('iptu', 'alvara', 'anuencia_modelo', 'comprovante_imovel', 'outro')),
  titulo        text not null check (length(btrim(titulo)) between 1 and 200),
  nome_arquivo  text not null,
  mime          text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png')),
  bytes         int  not null check (bytes > 0 and bytes <= 10485760),
  storage_path  text not null unique,
  validade      date,
  enviado_por   uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  -- o arquivo precisa estar na pasta da própria unidade
  constraint unidade_documentos_caminho_ck check (storage_path like unidade_id || '/%')
);
create index if not exists unidade_documentos_unidade_idx on public.unidade_documentos (unidade_id, created_at desc);

alter table public.unidade_documentos enable row level security;

drop policy if exists "unidade_documentos: select equipe" on public.unidade_documentos;
create policy "unidade_documentos: select equipe" on public.unidade_documentos for select
  using (public.is_platform_admin() or public.is_unidade_staff(unidade_id));

drop policy if exists "unidade_documentos: insert equipe" on public.unidade_documentos;
create policy "unidade_documentos: insert equipe" on public.unidade_documentos for insert
  with check (public.is_platform_admin() or public.is_unidade_staff(unidade_id));

drop policy if exists "unidade_documentos: delete equipe" on public.unidade_documentos;
create policy "unidade_documentos: delete equipe" on public.unidade_documentos for delete
  using (public.is_platform_admin() or public.is_unidade_staff(unidade_id));
-- Sem update: para trocar um documento, apaga e envia de novo.

revoke all on public.unidade_documentos from public, anon, authenticated;
grant select, insert, delete on public.unidade_documentos to authenticated;
grant all on public.unidade_documentos to service_role;

-- Bucket privado. Caminho <unidade_id>/<arquivo>. A equipe da unidade envia,
-- lê (para gerar link de conferência) e apaga; cliente nunca acessa direto.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos-unidade', 'documentos-unidade', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "documentos_unidade_equipe_insere" on storage.objects;
create policy "documentos_unidade_equipe_insere" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documentos-unidade'
    and (public.is_platform_admin() or public.is_unidade_staff((storage.foldername(name))[1]))
  );

drop policy if exists "documentos_unidade_equipe_le" on storage.objects;
create policy "documentos_unidade_equipe_le" on storage.objects for select to authenticated
  using (
    bucket_id = 'documentos-unidade'
    and (public.is_platform_admin() or public.is_unidade_staff((storage.foldername(name))[1]))
  );

drop policy if exists "documentos_unidade_equipe_apaga" on storage.objects;
create policy "documentos_unidade_equipe_apaga" on storage.objects for delete to authenticated
  using (
    bucket_id = 'documentos-unidade'
    and (public.is_platform_admin() or public.is_unidade_staff((storage.foldername(name))[1]))
  );

-- ----------------------------------------------------------------------------
-- 2) Preferências de e-mail do cliente (por e-mail do login)
-- ----------------------------------------------------------------------------
create table if not exists public.preferencias_notificacao (
  email       text primary key check (email = lower(btrim(email)) and email like '%@%'),
  lembretes   boolean not null default true,
  reservas    boolean not null default true,
  novidades   boolean not null default false,
  updated_at  timestamptz not null default now()
);

drop trigger if exists preferencias_notificacao_touch on public.preferencias_notificacao;
create trigger preferencias_notificacao_touch before update on public.preferencias_notificacao
  for each row execute function public.venda_touch_updated_at();

alter table public.preferencias_notificacao enable row level security;

drop policy if exists "preferencias_notificacao: dono le" on public.preferencias_notificacao;
create policy "preferencias_notificacao: dono le" on public.preferencias_notificacao for select
  using (public.is_platform_admin() or email = lower(auth.jwt() ->> 'email'));

drop policy if exists "preferencias_notificacao: dono cria" on public.preferencias_notificacao;
create policy "preferencias_notificacao: dono cria" on public.preferencias_notificacao for insert
  with check (email = lower(auth.jwt() ->> 'email'));

drop policy if exists "preferencias_notificacao: dono altera" on public.preferencias_notificacao;
create policy "preferencias_notificacao: dono altera" on public.preferencias_notificacao for update
  using (email = lower(auth.jwt() ->> 'email'))
  with check (email = lower(auth.jwt() ->> 'email'));

revoke all on public.preferencias_notificacao from public, anon, authenticated;
grant select, insert, update on public.preferencias_notificacao to authenticated;
grant all on public.preferencias_notificacao to service_role;

-- ----------------------------------------------------------------------------
-- 3) criar_reserva_segura: mesma função de 20260914120000, agora recusando
--    início no passado (tolerância de 30 min para a recepção registrar quem
--    acabou de chegar). O cliente tem regra mais rígida na Edge criar-reserva.
-- ----------------------------------------------------------------------------
create or replace function public.criar_reserva_segura(
  p_id                text,
  p_unidade_id        text,
  p_sala_id           text,
  p_cliente_id        text,
  p_cliente_nome      text,
  p_cliente_email     text,
  p_start_at          timestamptz,
  p_end_at            timestamptz,
  p_base              int,
  p_origem            text,
  p_valor             numeric,
  p_status            text        default 'confirmada',
  p_expira_em         timestamptz default null,
  p_cliente_documento text        default null,
  p_cliente_telefone  text        default null,
  p_somente_online    boolean     default false
) returns public.reservas
language plpgsql security definer set search_path = public as $$
declare
  v_sala  public.salas;
  v_row   public.reservas;
begin
  if p_start_at >= p_end_at then
    raise exception 'PERIODO_INVALIDO' using errcode = '22000';
  end if;
  if p_start_at < now() - interval '30 minutes' then
    raise exception 'PERIODO_PASSADO' using errcode = '22000';
  end if;
  if coalesce(p_status, 'confirmada') not in ('confirmada', 'solicitada', 'aguardando_pagamento') then
    raise exception 'STATUS_INVALIDO' using errcode = '22000';
  end if;
  if p_status = 'aguardando_pagamento' and (p_expira_em is null or p_expira_em <= now()) then
    raise exception 'EXPIRACAO_INVALIDA' using errcode = '22000';
  end if;

  select * into v_sala from public.salas where id = p_sala_id;
  if not found then raise exception 'SALA_INEXISTENTE' using errcode = '22000'; end if;
  if v_sala.unidade_id <> p_unidade_id then raise exception 'SALA_DE_OUTRA_UNIDADE' using errcode = '22000'; end if;
  if coalesce(v_sala.active, true) = false then raise exception 'SALA_INATIVA' using errcode = '22000'; end if;
  if coalesce(v_sala.contratada, false) = true then raise exception 'SALA_CONTRATADA' using errcode = '22000'; end if;
  if p_somente_online and coalesce(v_sala.reserva_online, false) = false then
    raise exception 'SALA_SEM_RESERVA_ONLINE' using errcode = '22000';
  end if;

  if coalesce(v_sala.bases, 0) > 0 then
    if p_base is null or p_base < 1 or p_base > v_sala.bases then
      raise exception 'BASE_INVALIDA' using errcode = '22000';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext(p_sala_id || ':' || coalesce(p_base::text, '*')));

  if exists (
    select 1 from public.reservas x
    where x.sala_id = p_sala_id
      and (
        x.status in ('solicitada', 'confirmada', 'checkin')
        or (x.status = 'aguardando_pagamento' and x.expira_em > now())
      )
      and (coalesce(v_sala.bases, 0) = 0 or x.base is not distinct from p_base)
      and tstzrange(x.start_at, x.end_at) && tstzrange(p_start_at, p_end_at)
  ) then
    raise exception 'CONFLITO' using errcode = '23505';
  end if;

  insert into public.reservas (
    id, unidade_id, sala_id, cliente_id, cliente_nome, cliente_email,
    start_at, end_at, base, status, origem, valor,
    expira_em, cliente_documento, cliente_telefone
  ) values (
    coalesce(p_id, 'r_' || replace(gen_random_uuid()::text, '-', '')),
    p_unidade_id, p_sala_id, p_cliente_id, p_cliente_nome, p_cliente_email,
    p_start_at, p_end_at, p_base, coalesce(p_status, 'confirmada'), coalesce(p_origem, 'recepcao'), p_valor,
    case when p_status = 'aguardando_pagamento' then p_expira_em end, p_cliente_documento, p_cliente_telefone
  ) returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.criar_reserva_segura(text, text, text, text, text, text, timestamptz, timestamptz, int, text, numeric, text, timestamptz, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.criar_reserva_segura(text, text, text, text, text, text, timestamptz, timestamptz, int, text, numeric, text, timestamptz, text, text, boolean)
  to service_role;

-- ----------------------------------------------------------------------------
-- 4) cancelar_reserva_cliente
--    Chamada só pela Edge reservas-cliente (service_role), que passa o e-mail do
--    JWT. Trava a linha, confere dono, status, antecedência e pagamento, cancela
--    e devolve as horas do plano consumidas por esta reserva (id determinístico:
--    repetir a chamada não devolve duas vezes).
-- ----------------------------------------------------------------------------
create or replace function public.cancelar_reserva_cliente(
  p_id                text,
  p_email             text,
  p_antecedencia_horas int default 24
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r          public.reservas;
  c          record;
  v_saldo    numeric;
  v_horas    numeric := 0;
begin
  if coalesce(btrim(p_email), '') = '' then
    raise exception 'SEM_ACESSO' using errcode = '42501';
  end if;

  select * into r from public.reservas where id = p_id for update;
  if not found then raise exception 'RESERVA_INEXISTENTE' using errcode = '22000'; end if;
  if lower(coalesce(r.cliente_email, '')) <> lower(btrim(p_email)) then
    raise exception 'SEM_ACESSO' using errcode = '42501';
  end if;
  if r.status not in ('confirmada', 'solicitada') then
    raise exception 'NAO_CANCELAVEL' using errcode = '22000';
  end if;
  if r.start_at < now() + make_interval(hours => greatest(p_antecedencia_horas, 0)) then
    raise exception 'PRAZO_CANCELAMENTO' using errcode = '22000';
  end if;
  if coalesce(r.payment_status, '') = 'pago' and coalesce(r.valor, 0) > 0 then
    raise exception 'PAGA_FALE_CONOSCO' using errcode = '22000';
  end if;

  update public.reservas
  set status = 'cancelada',
      payment_status = case when coalesce(payment_status, 'pendente') = 'pendente' then 'cancelado' else payment_status end,
      updated_at = now()
  where id = p_id;

  for c in
    select l.tipo, -sum(l.quantidade) as horas
    from public.creditos_ledger l
    where l.referencia_id = p_id and l.origem = 'consumo'
    group by l.tipo
    having sum(l.quantidade) < 0
  loop
    select coalesce(sum(quantidade), 0) into v_saldo
    from public.creditos_ledger
    where unidade_id = r.unidade_id and lower(cliente_email) = lower(r.cliente_email) and tipo = c.tipo;

    insert into public.creditos_ledger (id, unidade_id, cliente_id, cliente_email, tipo, quantidade, saldo_apos, origem, motivo, referencia_id)
    values ('cl_estorno_' || p_id || '_' || c.tipo, r.unidade_id, r.cliente_id, lower(r.cliente_email), c.tipo, c.horas,
            v_saldo + c.horas, 'estorno', 'Reserva cancelada pelo cliente', p_id)
    on conflict (id) do nothing;
    if found then v_horas := v_horas + c.horas; end if;
  end loop;

  return jsonb_build_object('ok', true, 'horas_devolvidas', v_horas);
end;
$$;

revoke all on function public.cancelar_reserva_cliente(text, text, int) from public, anon, authenticated;
grant execute on function public.cancelar_reserva_cliente(text, text, int) to service_role;
