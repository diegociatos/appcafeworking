-- ============================================================================
-- CafeWorking · Reservas/Salas relacionais (Fase 1 da migração do app_state)
--   + função transacional anti-corrida criar_reserva_segura (Prompt 9).
--
-- RLS por papel: platform_admin vê tudo; staff vê salas/reservas da unidade;
-- cliente vê apenas as PRÓPRIAS reservas (por e-mail/cliente). Mantém o
-- app_state durante a transição (o front continua lendo o que já existe).
-- Idempotente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- salas
-- ----------------------------------------------------------------------------
create table if not exists public.salas (
  id           text primary key,
  unidade_id   text references public.unidades (id) on delete cascade,
  nome         text not null,
  tipo         text,
  capacidade   int,
  bases        int default 0,
  descricao    text,
  comodidades  jsonb default '[]',
  fotos        jsonb default '[]',
  valor_hora   numeric(12,2),
  valor_mensal numeric(12,2),
  contratada   boolean default false,
  active       boolean default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists salas_unidade_idx on public.salas (unidade_id);

alter table public.salas enable row level security;
drop policy if exists "salas: select por papel" on public.salas;
create policy "salas: select por papel" on public.salas for select
  using (public.is_platform_admin() or public.is_unidade_staff(unidade_id) or public.is_unidade_member(unidade_id));
drop policy if exists "salas: escrita staff" on public.salas;
create policy "salas: escrita staff" on public.salas for all
  using (public.is_platform_admin() or public.is_unidade_staff(unidade_id))
  with check (public.is_platform_admin() or public.is_unidade_staff(unidade_id));

-- ----------------------------------------------------------------------------
-- reservas
-- ----------------------------------------------------------------------------
create table if not exists public.reservas (
  id             text primary key,
  unidade_id     text references public.unidades (id) on delete cascade,
  sala_id        text references public.salas (id) on delete cascade,
  cliente_id     text,
  cliente_nome   text,
  cliente_email  text,
  start_at       timestamptz not null,
  end_at         timestamptz not null,
  timezone       text default 'America/Sao_Paulo',
  base           int,
  status         text not null default 'confirmada', -- solicitada|confirmada|checkin|concluida|cancelada
  origem         text default 'recepcao',
  valor          numeric(12,2),
  payment_status text default 'pendente',
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (start_at < end_at)
);
create index if not exists reservas_unidade_periodo_idx on public.reservas (unidade_id, start_at, end_at);
create index if not exists reservas_sala_periodo_idx on public.reservas (sala_id, start_at, end_at);
create index if not exists reservas_cliente_idx on public.reservas (cliente_id);
create index if not exists reservas_status_idx on public.reservas (status);

alter table public.reservas enable row level security;
-- staff vê as da unidade; cliente vê só as próprias (e-mail do JWT ou cliente_id).
drop policy if exists "reservas: select por papel" on public.reservas;
create policy "reservas: select por papel" on public.reservas for select
  using (
    public.is_platform_admin()
    or public.is_unidade_staff(unidade_id)
    or cliente_email = (auth.jwt() ->> 'email')
  );
-- escrita direta só para staff/admin (o cliente cria via função/Edge segura).
drop policy if exists "reservas: escrita staff" on public.reservas;
create policy "reservas: escrita staff" on public.reservas for all
  using (public.is_platform_admin() or public.is_unidade_staff(unidade_id))
  with check (public.is_platform_admin() or public.is_unidade_staff(unidade_id));

drop trigger if exists set_updated_at on public.salas;
create trigger set_updated_at before update on public.salas
  for each row execute function public.tg_set_updated_at();
drop trigger if exists set_updated_at on public.reservas;
create trigger set_updated_at before update on public.reservas
  for each row execute function public.tg_set_updated_at();

grant select on public.salas, public.reservas to anon, authenticated;
grant all on public.salas, public.reservas to service_role;

-- ----------------------------------------------------------------------------
-- criar_reserva_segura — transacional, anti-corrida (Prompt 9).
-- Trava por (sala, base) com advisory lock dentro da transação, valida e insere.
-- Lança exceção 'CONFLITO' se o horário/base já estiver ocupado.
-- ----------------------------------------------------------------------------
create or replace function public.criar_reserva_segura(
  p_id            text,
  p_unidade_id    text,
  p_sala_id       text,
  p_cliente_id    text,
  p_cliente_nome  text,
  p_cliente_email text,
  p_start_at      timestamptz,
  p_end_at        timestamptz,
  p_base          int,
  p_origem        text,
  p_valor         numeric
) returns public.reservas
language plpgsql security definer set search_path = public as $$
declare
  v_sala  public.salas;
  v_row   public.reservas;
begin
  if p_start_at >= p_end_at then
    raise exception 'PERIODO_INVALIDO' using errcode = '22000';
  end if;

  select * into v_sala from public.salas where id = p_sala_id;
  if not found then raise exception 'SALA_INEXISTENTE' using errcode = '22000'; end if;
  if v_sala.unidade_id <> p_unidade_id then raise exception 'SALA_DE_OUTRA_UNIDADE' using errcode = '22000'; end if;
  if coalesce(v_sala.active, true) = false then raise exception 'SALA_INATIVA' using errcode = '22000'; end if;
  if coalesce(v_sala.contratada, false) = true then raise exception 'SALA_CONTRATADA' using errcode = '22000'; end if;

  if coalesce(v_sala.bases, 0) > 0 then
    if p_base is null or p_base < 1 or p_base > v_sala.bases then
      raise exception 'BASE_INVALIDA' using errcode = '22000';
    end if;
  end if;

  -- Serializa concorrência por sala (+ base): duas requisições simultâneas no
  -- mesmo espaço/horário não passam ao mesmo tempo.
  perform pg_advisory_xact_lock(hashtext(p_sala_id || ':' || coalesce(p_base::text, '*')));

  if exists (
    select 1 from public.reservas x
    where x.sala_id = p_sala_id
      and x.status in ('solicitada', 'confirmada', 'checkin')
      and (coalesce(v_sala.bases, 0) = 0 or x.base is not distinct from p_base)
      and tstzrange(x.start_at, x.end_at) && tstzrange(p_start_at, p_end_at)
  ) then
    raise exception 'CONFLITO' using errcode = '23505';
  end if;

  insert into public.reservas (
    id, unidade_id, sala_id, cliente_id, cliente_nome, cliente_email,
    start_at, end_at, base, status, origem, valor
  ) values (
    coalesce(p_id, 'r_' || replace(gen_random_uuid()::text, '-', '')),
    p_unidade_id, p_sala_id, p_cliente_id, p_cliente_nome, p_cliente_email,
    p_start_at, p_end_at, p_base, 'confirmada', coalesce(p_origem, 'recepcao'), p_valor
  ) returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.criar_reserva_segura(text, text, text, text, text, text, timestamptz, timestamptz, int, text, numeric) from public, anon;
