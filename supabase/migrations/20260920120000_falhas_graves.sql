-- ============================================================================
-- CafeWorking · Falhas graves (auditoria de 17/09/2026)
--
-- 1) CANCELAR RESERVA PELA EQUIPE
--    PROBLEMA: na Agenda de Salas, "Cancelar reserva" só tirava a reserva da
--    memória do navegador. A linha continuava em public.reservas como
--    confirmada, o horário seguia bloqueado para o cliente e para o site, as
--    horas do plano consumidas não voltavam e a reserva reaparecia ao recarregar.
--
--    O QUE MUDA
--    • reservas ganha cancelada_em, cancelada_por e cancelamento_motivo.
--    • devolver_creditos_reserva(id, motivo): devolve em creditos_ledger as horas
--      consumidas pela reserva (um estorno por tipo de crédito, id determinístico
--      "cl_estorno_<reserva>_<tipo>": repetir não devolve duas vezes). É a mesma
--      lógica que estava dentro de cancelar_reserva_cliente, agora compartilhada;
--      o saldo do estorno usa o e-mail do consumo ou, sem e-mail (cliente do
--      cadastro sem e-mail), o cliente_id.
--    • cancelar_reserva_cliente passa a usar a função acima (mesmas regras de
--      antes: dono, 24h, reserva paga não cancela pelo app).
--    • cancelar_reserva_equipe(id, ator, motivo, confirmar_paga): sem regra de
--      antecedência. Cancela solicitada, confirmada ou aguardando pagamento;
--      reserva paga (payment_status 'pago' com valor) só com confirmação
--      explícita (erro PAGA_CONFIRMAR). O papel de quem pede é conferido na Edge
--      Function cancelar-reserva (admin da plataforma ou equipe da unidade, sem
--      contabilidade e sem cliente). Só service_role executa.
--    O horário fica livre porque criar_reserva_segura e confirmar_reserva_paga
--    só contam solicitada/confirmada/checkin/aguardando_pagamento vigente.
--
-- 2) CONTRATO E EDIÇÃO DA CONTA (tela Franqueados/Contas)
--    PROBLEMA: editar a conta só mudava a memória, e o contrato anexado (data
--    URL no navegador) se perdia sempre.
--    • contas ganha os campos que a tela já pedia (tipo_pessoa, nome_fantasia,
--      responsavel, endereco, cidade, observacoes) e o contrato em Storage
--      (contrato_path, contrato_nome, contrato_mime, contrato_bytes,
--      contrato_enviado_em), com updated_at.
--    • Escrita em contas só pelo backend (Edge Functions criar-coworking e
--      contas-plataforma, que exigem admin da plataforma). Revoga insert/update/
--      delete de anon e authenticated: a RLS já não tinha policy de escrita, aqui
--      fica explícito.
--    • Bucket PRIVADO contratos-contas (PDF/JPG/PNG até 10 MB), caminho
--      "<conta_id>/<uuid>-<nome>". Sem policy para authenticated: envio por link
--      assinado de uso único e download por link assinado de 10 minutos, ambos
--      gerados pela Edge Function contas-plataforma.
--
-- Lembrete (20260605140000): função nova nasce com execute para public; aqui
-- tudo é revogado e concedido só a service_role. Idempotente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1a) reservas: quem cancelou, quando e por quê
-- ----------------------------------------------------------------------------
alter table public.reservas
  add column if not exists cancelada_em        timestamptz,
  add column if not exists cancelada_por       uuid,
  add column if not exists cancelamento_motivo text;

alter table public.reservas drop constraint if exists reservas_cancelamento_motivo_check;
alter table public.reservas add constraint reservas_cancelamento_motivo_check
  check (cancelamento_motivo is null or length(cancelamento_motivo) <= 500);

comment on column public.reservas.cancelada_por is 'Usuário da equipe que cancelou (null quando foi o cliente, o site ou a expiração)';

-- ----------------------------------------------------------------------------
-- 1b) devolver_creditos_reserva
-- ----------------------------------------------------------------------------
create or replace function public.devolver_creditos_reserva(p_id text, p_motivo text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c           record;
  v_saldo     numeric;
  v_horas     numeric := 0;
  v_itens     jsonb := '[]'::jsonb;
  v_ledger_id text;
begin
  for c in
    select l.unidade_id, l.tipo,
           -sum(l.quantidade)                       as horas,
           max(lower(nullif(btrim(l.cliente_email), ''))) as email,
           max(l.cliente_id)                        as cliente_id
    from public.creditos_ledger l
    where l.referencia_id = p_id and l.origem = 'consumo'
    group by l.unidade_id, l.tipo
    having sum(l.quantidade) < 0
  loop
    if c.email is not null then
      select coalesce(sum(quantidade), 0) into v_saldo from public.creditos_ledger
      where unidade_id = c.unidade_id and lower(cliente_email) = c.email and tipo = c.tipo;
    else
      select coalesce(sum(quantidade), 0) into v_saldo from public.creditos_ledger
      where unidade_id = c.unidade_id and cliente_id = c.cliente_id and tipo = c.tipo;
    end if;

    v_ledger_id := 'cl_estorno_' || p_id || '_' || c.tipo;
    insert into public.creditos_ledger (id, unidade_id, cliente_id, cliente_email, tipo, quantidade, saldo_apos, origem, motivo, referencia_id)
    values (v_ledger_id, c.unidade_id, c.cliente_id, c.email, c.tipo, c.horas,
            v_saldo + c.horas, 'estorno', coalesce(nullif(btrim(p_motivo), ''), 'Reserva cancelada'), p_id)
    on conflict (id) do nothing;
    if found then
      v_horas := v_horas + c.horas;
      v_itens := v_itens || jsonb_build_object('id', v_ledger_id, 'tipo', c.tipo, 'horas', c.horas, 'saldo_apos', v_saldo + c.horas,
                                               'cliente_id', c.cliente_id, 'cliente_email', c.email);
    end if;
  end loop;

  return jsonb_build_object('horas_devolvidas', v_horas, 'devolucoes', v_itens);
end;
$$;

revoke all on function public.devolver_creditos_reserva(text, text) from public, anon, authenticated;
grant execute on function public.devolver_creditos_reserva(text, text) to service_role;

-- ----------------------------------------------------------------------------
-- 1c) cancelar_reserva_cliente (mesmas regras, devolução compartilhada)
-- ----------------------------------------------------------------------------
create or replace function public.cancelar_reserva_cliente(
  p_id                text,
  p_email             text,
  p_antecedencia_horas int default 24
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r   public.reservas;
  v_d jsonb;
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
      cancelada_em = now(),
      updated_at = now()
  where id = p_id;

  v_d := public.devolver_creditos_reserva(p_id, 'Reserva cancelada pelo cliente');
  return jsonb_build_object('ok', true, 'horas_devolvidas', v_d -> 'horas_devolvidas');
end;
$$;

revoke all on function public.cancelar_reserva_cliente(text, text, int) from public, anon, authenticated;
grant execute on function public.cancelar_reserva_cliente(text, text, int) to service_role;

-- ----------------------------------------------------------------------------
-- 1d) cancelar_reserva_equipe
-- ----------------------------------------------------------------------------
create or replace function public.cancelar_reserva_equipe(
  p_id             text,
  p_ator           uuid,
  p_motivo         text    default null,
  p_confirmar_paga boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r      public.reservas;
  v_paga boolean;
  v_pag  text;
  v_d    jsonb;
begin
  select * into r from public.reservas where id = p_id for update;
  if not found then raise exception 'RESERVA_INEXISTENTE' using errcode = '22000'; end if;
  if r.status = 'cancelada' then raise exception 'JA_CANCELADA' using errcode = '22000'; end if;
  if r.status not in ('solicitada', 'confirmada', 'aguardando_pagamento') then
    raise exception 'NAO_CANCELAVEL' using errcode = '22000';
  end if;

  v_paga := coalesce(r.payment_status, '') = 'pago' and coalesce(r.valor, 0) > 0;
  if v_paga and not coalesce(p_confirmar_paga, false) then
    raise exception 'PAGA_CONFIRMAR' using errcode = '22000';
  end if;

  v_pag := case when coalesce(r.payment_status, 'pendente') = 'pendente' then 'cancelado' else r.payment_status end;

  update public.reservas
  set status = 'cancelada',
      payment_status = v_pag,
      expira_em = null,
      cancelada_em = now(),
      cancelada_por = p_ator,
      cancelamento_motivo = nullif(left(btrim(coalesce(p_motivo, '')), 500), ''),
      updated_at = now()
  where id = p_id;

  v_d := public.devolver_creditos_reserva(p_id, 'Reserva cancelada pela equipe');

  return jsonb_build_object(
    'ok', true,
    'status_anterior', r.status,
    'paga', v_paga,
    'payment_status', v_pag,
    'asaas_payment_id', r.asaas_payment_id,
    'valor', coalesce(r.valor, 0),
    'origem', r.origem,
    'unidade_id', r.unidade_id,
    'sala_id', r.sala_id,
    'cliente_nome', r.cliente_nome,
    'cliente_email', r.cliente_email,
    'start_at', r.start_at,
    'end_at', r.end_at,
    'horas_devolvidas', v_d -> 'horas_devolvidas',
    'devolucoes', v_d -> 'devolucoes'
  );
end;
$$;

revoke all on function public.cancelar_reserva_equipe(text, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.cancelar_reserva_equipe(text, uuid, text, boolean) to service_role;

-- ----------------------------------------------------------------------------
-- 2a) contas: campos da tela + contrato em Storage
-- ----------------------------------------------------------------------------
alter table public.contas
  add column if not exists tipo_pessoa         text,
  add column if not exists nome_fantasia       text,
  add column if not exists responsavel         text,
  add column if not exists endereco            text,
  add column if not exists cidade              text,
  add column if not exists observacoes         text,
  add column if not exists contrato_path       text,
  add column if not exists contrato_nome       text,
  add column if not exists contrato_mime       text,
  add column if not exists contrato_bytes      int,
  add column if not exists contrato_enviado_em timestamptz,
  add column if not exists updated_at          timestamptz not null default now();

alter table public.contas drop constraint if exists contas_tipo_pessoa_check;
alter table public.contas add constraint contas_tipo_pessoa_check
  check (tipo_pessoa is null or tipo_pessoa in ('PF', 'PJ'));

alter table public.contas drop constraint if exists contas_observacoes_check;
alter table public.contas add constraint contas_observacoes_check
  check (observacoes is null or length(observacoes) <= 2000);

-- o arquivo precisa estar na pasta da própria conta, com os metadados juntos
alter table public.contas drop constraint if exists contas_contrato_check;
alter table public.contas add constraint contas_contrato_check
  check (
    contrato_path is null
    or (
      contrato_path like id || '/%'
      and contrato_path not like '%..%'
      and contrato_mime in ('application/pdf', 'image/jpeg', 'image/png')
      and contrato_bytes > 0 and contrato_bytes <= 10485760
      and coalesce(btrim(contrato_nome), '') <> ''
    )
  );

comment on column public.contas.contrato_path is 'Contrato de assinatura no bucket privado contratos-contas (<conta_id>/<uuid>-<nome>)';

drop trigger if exists set_updated_at on public.contas;
create trigger set_updated_at before update on public.contas
  for each row execute function public.tg_set_updated_at();

-- escrita só pelo backend (service_role)
revoke insert, update, delete on public.contas from anon, authenticated;
grant all on public.contas to service_role;

-- ----------------------------------------------------------------------------
-- 2b) Bucket privado dos contratos das contas
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contratos-contas', 'contratos-contas', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
-- Sem policy em storage.objects para este bucket: authenticated não lê nem grava.
