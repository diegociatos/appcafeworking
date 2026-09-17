-- ============================================================================
-- CafeWorking · Rede de parceiros, fase 1 (docs/PARCEIROS.md)
--
-- 1) CONTA PARCEIRA
--    contas ganha tipo ('propria' padrão | 'parceiro'), parceiro_percentual
--    (75), garantia_percentual (10, percentual DO REPASSE retido como garantia),
--    asaas_wallet_id (carteira que recebe o split), parceiro_status
--    (em_analise | ativo | suspenso | encerrado) e emails_aviso (lista).
--    Tipo de pessoa, documento e responsável já existiam (20260920120000).
--    As contas existentes (CAFEWORKING LTDA) ficam 'propria' pelo default.
--    Escrita continua só pelo backend (contas-plataforma, admin da plataforma).
--
-- 2) TABELA NACIONAL DE PREÇOS
--    • planos_modelo: um doc por plano (mesmo formato do plano do app), id
--      estável pl_nac_<slug>. RLS: só o admin da plataforma lê e grava.
--    • aplicar_planos_modelo(unidade?): o admin copia a tabela para o app_state
--      ('planos') das unidades de contas parceiras, com doc.modelo = true. A
--      unidade pode ter pausado um plano (pausadoNaUnidade): a cópia respeita.
--      Plano que saiu da tabela vira descontinuado (inativo, fora do site); não
--      é apagado porque assinaturas antigas citam o id.
--    • Automático: unidade criada (ou movida) para conta parceira, e conta que
--      vira parceira, recebem a tabela na hora (gatilhos).
--    • Trava no banco (gatilho em app_state, entity 'planos'): em unidade de
--      conta parceira, quem não é admin da plataforma nem backend
--        - não cria plano (nem forja um doc modelo);
--        - não apaga plano modelo;
--        - numa alteração, só o "ativo" vale (pausar/reativar na unidade); todo
--          o resto (preço, benefícios, direitos, fidelidade, site) volta ao que
--          está gravado. Coagir em vez de dar erro evita que um doc antigo no
--          navegador trave a sincronização depois de o admin mudar a tabela.
--      Unidades próprias continuam livres.
--
-- 3) SPLIT NAS COBRANÇAS
--    cobrancas guarda, para unidade parceira: conta, carteira e percentuais do
--    momento da cobrança (snapshot) e os valores: bruto, parte do parceiro
--    (75%), garantia retida (7,5%), repasse imediato (67,5%) e parte da
--    CafeWorking (25%). As Edge Functions gravam na criação e recalculam sobre o
--    valor pago no webhook. Check garante que as partes fecham.
--
-- 4) RAZÃO DE GARANTIA
--    parceiro_garantias: retencao (webhook, cobrança paga), estorno (webhook,
--    cobrança estornada), devolucao e uso (admin). Um lançamento por
--    (cobrança, tipo): reentrega do webhook não duplica. Só inserção: sem
--    update/delete para o app. RLS: admin lê e lança devolução/uso;
--    master/financeiro da conta parceira só leem os próprios.
--
-- Lembrete (20260605140000): tabela e função novas nascem com permissão para
-- anon/authenticated; aqui tudo é revogado e concedido só no que precisa.
-- Idempotente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) contas: dados do parceiro
-- ----------------------------------------------------------------------------
create or replace function public.lista_emails_valida(p text[])
returns boolean language sql immutable set search_path = public as $$
  select coalesce(bool_and(e ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and length(e) <= 200), true)
  from unnest(p) as e;
$$;
revoke all on function public.lista_emails_valida(text[]) from public, anon;
grant execute on function public.lista_emails_valida(text[]) to authenticated, service_role;

alter table public.contas
  add column if not exists tipo                text not null default 'propria',
  add column if not exists parceiro_percentual numeric(5,2) not null default 75,
  add column if not exists garantia_percentual numeric(5,2) not null default 10,
  add column if not exists asaas_wallet_id     text,
  add column if not exists parceiro_status     text,
  add column if not exists emails_aviso        text[] not null default '{}';

alter table public.contas drop constraint if exists contas_tipo_check;
alter table public.contas add constraint contas_tipo_check
  check (tipo in ('propria', 'parceiro'));

alter table public.contas drop constraint if exists contas_parceiro_percentual_check;
alter table public.contas add constraint contas_parceiro_percentual_check
  check (parceiro_percentual > 0 and parceiro_percentual < 100);

alter table public.contas drop constraint if exists contas_garantia_percentual_check;
alter table public.contas add constraint contas_garantia_percentual_check
  check (garantia_percentual >= 0 and garantia_percentual < 100);

alter table public.contas drop constraint if exists contas_parceiro_status_check;
alter table public.contas add constraint contas_parceiro_status_check
  check (
    (parceiro_status is null or parceiro_status in ('em_analise', 'ativo', 'suspenso', 'encerrado'))
    and (tipo <> 'parceiro' or parceiro_status is not null)
  );

alter table public.contas drop constraint if exists contas_asaas_wallet_id_check;
alter table public.contas add constraint contas_asaas_wallet_id_check
  check (asaas_wallet_id is null or asaas_wallet_id ~ '^[A-Za-z0-9-]{8,64}$');

alter table public.contas drop constraint if exists contas_emails_aviso_check;
alter table public.contas add constraint contas_emails_aviso_check
  check (cardinality(emails_aviso) <= 10 and public.lista_emails_valida(emails_aviso));

comment on column public.contas.tipo is 'propria (CafeWorking) | parceiro (rede de parceiros: split no Asaas e tabela nacional)';
comment on column public.contas.parceiro_percentual is 'Parte do parceiro sobre o valor da cobrança (padrão 75)';
comment on column public.contas.garantia_percentual is 'Percentual DO REPASSE do parceiro retido como garantia (padrão 10 → 7,5% do bruto)';
comment on column public.contas.asaas_wallet_id is 'walletId da conta Asaas do parceiro que recebe o split';
comment on column public.contas.emails_aviso is 'E-mails que recebem os avisos de venda, reserva, abertura e cancelamento (vazio = e-mail do master)';

-- ----------------------------------------------------------------------------
-- 2a) planos_modelo: tabela nacional
-- ----------------------------------------------------------------------------
create table if not exists public.planos_modelo (
  id          text primary key,
  doc         jsonb not null,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);

alter table public.planos_modelo drop constraint if exists planos_modelo_id_check;
alter table public.planos_modelo add constraint planos_modelo_id_check
  check (id ~ '^pl_nac_[a-z0-9_]{1,60}$');

alter table public.planos_modelo drop constraint if exists planos_modelo_doc_check;
alter table public.planos_modelo add constraint planos_modelo_doc_check
  check (
    jsonb_typeof(doc) = 'object'
    and coalesce(btrim(doc ->> 'nome'), '') <> ''
    and (
      coalesce(doc ->> 'sobConsulta', 'false') = 'true'
      or (case when (doc ->> 'preco') ~ '^[0-9]+(\.[0-9]+)?$' then (doc ->> 'preco')::numeric > 0 else false end)
    )
  );

comment on table public.planos_modelo is 'Tabela nacional de preços da rede de parceiros (admin da plataforma). Copiada para app_state das unidades parceiras.';

alter table public.planos_modelo enable row level security;
drop policy if exists "planos_modelo: admin" on public.planos_modelo;
create policy "planos_modelo: admin" on public.planos_modelo for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

revoke all on public.planos_modelo from anon, authenticated;
grant select, insert, update, delete on public.planos_modelo to authenticated;
grant all on public.planos_modelo to service_role;

drop trigger if exists set_updated_at on public.planos_modelo;
create trigger set_updated_at before update on public.planos_modelo
  for each row execute function public.tg_set_updated_at();

-- ----------------------------------------------------------------------------
-- 2b) Aplicar a tabela nas unidades parceiras
-- ----------------------------------------------------------------------------
create or replace function public.aplicar_planos_modelo_interno(p_unidade_id text default null, p_conta_id text default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  u         record;
  m         record;
  v_atual   jsonb;
  v_pausado boolean;
  v_doc     jsonb;
  v_n       integer := 0;
begin
  for u in
    select un.id
    from public.unidades un
    join public.contas c on c.id = un.franqueado_id
    where c.tipo = 'parceiro'
      and (p_unidade_id is null or un.id = p_unidade_id)
      and (p_conta_id is null or c.id = p_conta_id)
  loop
    for m in select pm.id, pm.doc, pm.ativo from public.planos_modelo pm loop
      select s.doc into v_atual from public.app_state s
      where s.unidade_id = u.id and s.entity = 'planos' and s.item_id = m.id;
      v_pausado := coalesce(v_atual ->> 'pausadoNaUnidade', 'false') = 'true';
      v_doc := (m.doc - 'id' - 'unidadeId' - 'modelo' - 'ativo' - 'pausadoNaUnidade' - 'descontinuado')
        || jsonb_build_object(
             'id', m.id, 'unidadeId', u.id, 'modelo', true,
             'pausadoNaUnidade', v_pausado, 'ativo', m.ativo and not v_pausado);
      insert into public.app_state (unidade_id, entity, item_id, doc)
      values (u.id, 'planos', m.id, v_doc)
      on conflict (unidade_id, entity, item_id) do update set doc = excluded.doc;
      v_n := v_n + 1;
    end loop;

    -- saiu da tabela nacional: fora de venda na unidade (sem apagar o id)
    update public.app_state s
       set doc = s.doc || jsonb_build_object('ativo', false, 'venderNoSite', false, 'descontinuado', true)
     where s.unidade_id = u.id and s.entity = 'planos' and s.item_id like 'pl\_nac\_%'
       and not exists (select 1 from public.planos_modelo pm where pm.id = s.item_id)
       and coalesce(s.doc ->> 'descontinuado', 'false') <> 'true';
  end loop;
  return v_n;
end $$;

revoke all on function public.aplicar_planos_modelo_interno(text, text) from public, anon, authenticated;
grant execute on function public.aplicar_planos_modelo_interno(text, text) to service_role;

-- Ação da tela "Tabela nacional" (admin) e do backend.
create or replace function public.aplicar_planos_modelo(p_unidade_id text default null)
returns integer
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_platform_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'SO_ADMIN: só o administrador da plataforma aplica a tabela nacional';
  end if;
  return public.aplicar_planos_modelo_interno(p_unidade_id, null);
end $$;

revoke all on function public.aplicar_planos_modelo(text) from public, anon;
grant execute on function public.aplicar_planos_modelo(text) to authenticated, service_role;

-- Unidade nova (ou que mudou de conta) em conta parceira recebe a tabela.
create or replace function public.tg_unidade_parceira_planos()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.franqueado_id is not null
     and exists (select 1 from public.contas c where c.id = new.franqueado_id and c.tipo = 'parceiro') then
    perform public.aplicar_planos_modelo_interno(new.id, null);
  end if;
  return null;
end $$;
revoke all on function public.tg_unidade_parceira_planos() from public, anon, authenticated;

drop trigger if exists aplicar_planos_modelo on public.unidades;
create trigger aplicar_planos_modelo after insert or update of franqueado_id on public.unidades
  for each row execute function public.tg_unidade_parceira_planos();

-- Conta que vira parceira: todas as unidades dela recebem a tabela.
create or replace function public.tg_conta_parceira_planos()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.tipo = 'parceiro' and old.tipo is distinct from 'parceiro' then
    perform public.aplicar_planos_modelo_interno(null, new.id);
  end if;
  return null;
end $$;
revoke all on function public.tg_conta_parceira_planos() from public, anon, authenticated;

drop trigger if exists aplicar_planos_modelo on public.contas;
create trigger aplicar_planos_modelo after update of tipo on public.contas
  for each row execute function public.tg_conta_parceira_planos();

-- ----------------------------------------------------------------------------
-- 2c) Trava dos planos em unidade parceira
-- ----------------------------------------------------------------------------
create or replace function public.tg_app_state_planos_parceiro()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_linha   public.app_state%rowtype;
  v_nac     boolean;
  v_pausado boolean;
  v_modelo  boolean;
begin
  if tg_op = 'DELETE' then v_linha := old; else v_linha := new; end if;
  if v_linha.entity <> 'planos' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- backend (service_role, migrations) e admin da plataforma: livres
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') or public.is_platform_admin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if not exists (
    select 1 from public.unidades u join public.contas c on c.id = u.franqueado_id
    where u.id = v_linha.unidade_id and c.tipo = 'parceiro'
  ) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' then
    -- upsert do app (insert ... on conflict do update): se a linha já existe, a
    -- trava de UPDATE decide; plano novo em unidade parceira é recusado.
    if exists (select 1 from public.app_state s
               where s.unidade_id = new.unidade_id and s.entity = new.entity and s.item_id = new.item_id) then
      return new;
    end if;
    raise exception 'PLANO_NACIONAL: unidade parceira vende só os planos da tabela nacional da CafeWorking';
  end if;

  v_modelo := old.item_id like 'pl\_nac\_%' or coalesce(old.doc ->> 'modelo', 'false') = 'true';

  if tg_op = 'DELETE' then
    if v_modelo then
      raise exception 'PLANO_NACIONAL: plano da tabela nacional não pode ser excluído na unidade (pause em vez de excluir)';
    end if;
    return old;
  end if;

  -- UPDATE: só pausar/reativar na unidade
  if new.unidade_id is distinct from old.unidade_id or new.item_id is distinct from old.item_id
     or new.entity is distinct from old.entity then
    raise exception 'PLANO_NACIONAL: plano da unidade parceira não muda de lugar';
  end if;

  if (new.doc -> 'ativo') is distinct from (old.doc -> 'ativo') then
    v_pausado := coalesce(new.doc ->> 'ativo', 'true') = 'false';
  else
    v_pausado := coalesce(old.doc ->> 'pausadoNaUnidade', 'false') = 'true'
                 or (not v_modelo and coalesce(old.doc ->> 'ativo', 'true') = 'false');
  end if;

  if v_modelo then
    select pm.ativo into v_nac from public.planos_modelo pm where pm.id = old.item_id;
    new.doc := old.doc || jsonb_build_object(
      'pausadoNaUnidade', v_pausado,
      'ativo', coalesce(v_nac, false) and not v_pausado and coalesce(old.doc ->> 'descontinuado', 'false') <> 'true');
  else
    -- plano próprio de antes da parceria: só pausa/reativa (e não é vendido: as
    -- Edge Functions só vendem plano modelo em unidade parceira)
    new.doc := old.doc || jsonb_build_object('ativo', not v_pausado);
  end if;
  return new;
end $$;
revoke all on function public.tg_app_state_planos_parceiro() from public, anon, authenticated;

drop trigger if exists planos_parceiro on public.app_state;
create trigger planos_parceiro before insert or update or delete on public.app_state
  for each row execute function public.tg_app_state_planos_parceiro();

-- ----------------------------------------------------------------------------
-- 3) cobrancas: divisão do split
-- ----------------------------------------------------------------------------
alter table public.cobrancas
  add column if not exists parceiro_conta_id  text,
  add column if not exists asaas_wallet_id    text,
  add column if not exists split_parceiro_pct numeric(5,2),
  add column if not exists split_garantia_pct numeric(5,2),
  add column if not exists valor_bruto        numeric(12,2),
  add column if not exists valor_parceiro     numeric(12,2),
  add column if not exists valor_garantia     numeric(12,2),
  add column if not exists valor_repasse      numeric(12,2),
  add column if not exists valor_cafeworking  numeric(12,2);

alter table public.cobrancas drop constraint if exists cobrancas_split_check;
alter table public.cobrancas add constraint cobrancas_split_check
  check (
    (parceiro_conta_id is null
      and split_parceiro_pct is null and split_garantia_pct is null
      and valor_bruto is null and valor_parceiro is null and valor_garantia is null
      and valor_repasse is null and valor_cafeworking is null)
    -- coalesce: comparação com null não pode deixar a linha pela metade passar
    or coalesce(parceiro_conta_id is not null
      and split_parceiro_pct > 0 and split_parceiro_pct < 100
      and split_garantia_pct >= 0 and split_garantia_pct < 100
      and valor_bruto > 0
      and valor_parceiro >= 0 and valor_garantia >= 0 and valor_repasse >= 0 and valor_cafeworking >= 0
      and valor_parceiro = valor_garantia + valor_repasse
      and valor_bruto = valor_parceiro + valor_cafeworking, false)
  );

create index if not exists cobrancas_parceiro_idx on public.cobrancas (parceiro_conta_id) where parceiro_conta_id is not null;

comment on column public.cobrancas.parceiro_conta_id is 'Conta parceira da unidade quando a cobrança saiu com split (null = unidade própria)';
comment on column public.cobrancas.valor_parceiro is 'Parte do parceiro (parceiro_pct do bruto) = garantia + repasse';
comment on column public.cobrancas.valor_garantia is 'Garantia retida pela CafeWorking (garantia_pct da parte do parceiro)';
comment on column public.cobrancas.valor_repasse is 'Repasse imediato ao parceiro no split do Asaas';
comment on column public.cobrancas.valor_cafeworking is 'Parte da CafeWorking (plataforma e intermediação) = base da nota da CafeWorking';

-- ----------------------------------------------------------------------------
-- 4) parceiro_garantias: razão de garantia
-- ----------------------------------------------------------------------------
create table if not exists public.parceiro_garantias (
  id          uuid primary key default gen_random_uuid(),
  conta_id    text not null references public.contas (id) on delete cascade,
  unidade_id  text not null,
  cobranca_id uuid references public.cobrancas (id) on delete set null,
  tipo        text not null,
  valor       numeric(12,2) not null,
  observacao  text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

alter table public.parceiro_garantias drop constraint if exists parceiro_garantias_tipo_check;
alter table public.parceiro_garantias add constraint parceiro_garantias_tipo_check
  check (tipo in ('retencao', 'estorno', 'devolucao', 'uso'));
alter table public.parceiro_garantias drop constraint if exists parceiro_garantias_valor_check;
alter table public.parceiro_garantias add constraint parceiro_garantias_valor_check
  check (valor > 0);
alter table public.parceiro_garantias drop constraint if exists parceiro_garantias_observacao_check;
alter table public.parceiro_garantias add constraint parceiro_garantias_observacao_check
  check (observacao is null or length(observacao) <= 500);

-- um lançamento por cobrança e tipo: o webhook reenviado não duplica
create unique index if not exists parceiro_garantias_cobranca_tipo_uk
  on public.parceiro_garantias (cobranca_id, tipo) where cobranca_id is not null;
create index if not exists parceiro_garantias_conta_idx on public.parceiro_garantias (conta_id, created_at);

comment on table public.parceiro_garantias is 'Razão de garantia por parceiro. Saldo = retencao − estorno − devolucao − uso.';

alter table public.parceiro_garantias enable row level security;

drop policy if exists "parceiro_garantias: leitura" on public.parceiro_garantias;
create policy "parceiro_garantias: leitura" on public.parceiro_garantias for select
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.unidade_members m
      where m.user_id = auth.uid() and m.franqueado_id = parceiro_garantias.conta_id
        and m.role in ('master', 'financeiro')
    )
  );

drop policy if exists "parceiro_garantias: admin lança devolução e uso" on public.parceiro_garantias;
create policy "parceiro_garantias: admin lança devolução e uso" on public.parceiro_garantias for insert
  with check (public.is_platform_admin() and tipo in ('devolucao', 'uso'));

revoke all on public.parceiro_garantias from anon, authenticated;
grant select, insert on public.parceiro_garantias to authenticated;
grant all on public.parceiro_garantias to service_role;
