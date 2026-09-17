-- ============================================================================
-- CafeWorking · Rede de parceiros, fases 2 e 3 (docs/PARCEIROS.md)
--
-- 1) PARCEIRO_CANDIDATURAS
--    O escritório se candidata pelo site (Edge Function parceiro-candidatura,
--    pública, com Turnstile). A linha nasce 'nova' e só o admin da plataforma lê
--    e move a situação. Aprovar é trabalho da Edge Function aprovar-parceiro
--    (service_role), que grava aqui o que já criou (conta, unidade, login,
--    aceite) para poder ser chamada de novo sem duplicar nada.
--    Escrita pelo app: nenhuma. Leitura: só o admin da plataforma.
--
-- 2) CONTRATO DE PARCERIA
--    contratos_modelos ganha a categoria 'parceria' (unidade_id nulo = modelo
--    geral da rede). O aceite do parceiro é registrado em aceites_contrato como
--    qualquer outro, com referencia_tipo 'parceria'. Enquanto o Diego não
--    publicar o texto, a aprovação segue sem aceite e a tela avisa.
--
-- 3) PRAZO DE CORRESPONDÊNCIA (1 DIA ÚTIL)
--    Correspondência registrada numa unidade parceira precisa de aviso ao
--    cliente até o fim do dia útil seguinte. proximo_dia_util() e
--    correspondencias_fora_prazo() calculam isso a partir do app_state (entity
--    'correspondencias'); a rotina-diaria usa a versão sem unidade e a tela da
--    unidade, a versão com unidade.
--    parceiro_alertas guarda o que já foi avisado: a rotina roda todo dia e não
--    repete o mesmo alerta.
--
-- 4) INDICADORES POR PARCEIRO
--    parceiro_indicadores(): clientes ativos, receita do mês, garantia
--    acumulada e correspondências fora do prazo, por conta parceira. Só o admin
--    da plataforma (a tela Parceiros).
--
-- Lembrete (20260605140000): tabela e função novas nascem com permissão para
-- anon/authenticated; aqui tudo é revogado e concedido só no que precisa.
-- Idempotente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) parceiro_candidaturas
-- ----------------------------------------------------------------------------
create table if not exists public.parceiro_candidaturas (
  id             uuid primary key default gen_random_uuid(),
  situacao       text not null default 'nova',
  escritorio     text not null,
  tipo_pessoa    text not null default 'PJ',
  documento      text not null,
  responsavel    text not null,
  email          text not null,
  whatsapp       text not null,
  cidade         text not null,
  uf             text not null,
  endereco       text not null,
  servicos       text[] not null default '{}',
  salas          int not null default 0,
  observacoes    text,
  aceite_texto   text,                 -- rótulo do que o candidato aceitou no site
  aceite_modelo  uuid,                 -- versão do contrato de parceria mostrada no site
  aceite_hash    text,
  pagina         text,
  ip             text,
  user_agent     text,
  -- preenchido pela aprovação (aprovar-parceiro), um passo por vez
  conta_id       text,
  unidade_id     text,
  user_id        uuid,
  aceite_id      uuid references public.aceites_contrato (id),
  motivo         text,                 -- motivo da recusa, mostrado ao candidato
  decidida_em    timestamptz,
  decidida_por   uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.parceiro_candidaturas drop constraint if exists parceiro_candidaturas_situacao_check;
alter table public.parceiro_candidaturas add constraint parceiro_candidaturas_situacao_check
  check (situacao in ('nova', 'em_analise', 'aprovada', 'recusada'));

alter table public.parceiro_candidaturas drop constraint if exists parceiro_candidaturas_tipo_pessoa_check;
alter table public.parceiro_candidaturas add constraint parceiro_candidaturas_tipo_pessoa_check
  check (tipo_pessoa in ('PF', 'PJ'));

alter table public.parceiro_candidaturas drop constraint if exists parceiro_candidaturas_documento_check;
alter table public.parceiro_candidaturas add constraint parceiro_candidaturas_documento_check
  check (documento ~ '^[A-Z0-9]{11,14}$');

alter table public.parceiro_candidaturas drop constraint if exists parceiro_candidaturas_email_check;
alter table public.parceiro_candidaturas add constraint parceiro_candidaturas_email_check
  check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and length(email) <= 200);

alter table public.parceiro_candidaturas drop constraint if exists parceiro_candidaturas_uf_check;
alter table public.parceiro_candidaturas add constraint parceiro_candidaturas_uf_check
  check (uf ~ '^[A-Z]{2}$');

alter table public.parceiro_candidaturas drop constraint if exists parceiro_candidaturas_salas_check;
alter table public.parceiro_candidaturas add constraint parceiro_candidaturas_salas_check
  check (salas >= 0 and salas <= 999);

alter table public.parceiro_candidaturas drop constraint if exists parceiro_candidaturas_servicos_check;
alter table public.parceiro_candidaturas add constraint parceiro_candidaturas_servicos_check
  check (
    cardinality(servicos) between 1 and 4
    and servicos <@ array['endereco_fiscal', 'sala_privativa', 'escritorio_compartilhado', 'sala_reuniao']
  );

alter table public.parceiro_candidaturas drop constraint if exists parceiro_candidaturas_textos_check;
alter table public.parceiro_candidaturas add constraint parceiro_candidaturas_textos_check
  check (
    length(btrim(escritorio)) between 2 and 200
    and length(btrim(responsavel)) between 3 and 200
    and length(btrim(whatsapp)) between 10 and 30
    and length(btrim(cidade)) between 2 and 120
    and length(btrim(endereco)) between 10 and 300
    and (observacoes is null or length(observacoes) <= 2000)
    and (motivo is null or length(motivo) <= 1000)
  );

-- Recusar só com motivo (é o texto do e-mail ao candidato).
alter table public.parceiro_candidaturas drop constraint if exists parceiro_candidaturas_recusa_check;
alter table public.parceiro_candidaturas add constraint parceiro_candidaturas_recusa_check
  check (situacao <> 'recusada' or coalesce(btrim(motivo), '') <> '');

-- O mesmo CNPJ/CPF não fica com dois pedidos abertos (reenvio do formulário).
create unique index if not exists parceiro_candidaturas_documento_aberta_uk
  on public.parceiro_candidaturas (documento) where situacao in ('nova', 'em_analise');
create index if not exists parceiro_candidaturas_situacao_idx
  on public.parceiro_candidaturas (situacao, created_at desc);

comment on table public.parceiro_candidaturas is 'Pedidos do "Seja parceiro CafeWorking" (site). Aprovação em aprovar-parceiro.';
comment on column public.parceiro_candidaturas.conta_id is 'Conta criada na aprovação; presente = a etapa já foi feita (idempotência)';

drop trigger if exists set_updated_at on public.parceiro_candidaturas;
create trigger set_updated_at before update on public.parceiro_candidaturas
  for each row execute function public.tg_set_updated_at();

alter table public.parceiro_candidaturas enable row level security;

-- Leitura e mudança de situação: só o admin da plataforma. O formulário do site
-- grava pela Edge Function (service_role), nunca pelo navegador.
drop policy if exists "parceiro_candidaturas: admin lê" on public.parceiro_candidaturas;
create policy "parceiro_candidaturas: admin lê" on public.parceiro_candidaturas for select
  using (public.is_platform_admin());

drop policy if exists "parceiro_candidaturas: admin anota" on public.parceiro_candidaturas;
create policy "parceiro_candidaturas: admin anota" on public.parceiro_candidaturas for update
  using (public.is_platform_admin())
  with check (public.is_platform_admin() and situacao in ('nova', 'em_analise'));

revoke all on public.parceiro_candidaturas from anon, authenticated;
grant select, update on public.parceiro_candidaturas to authenticated;
grant all on public.parceiro_candidaturas to service_role;

-- ----------------------------------------------------------------------------
-- 2) contrato de parceria
-- ----------------------------------------------------------------------------
alter table public.contratos_modelos drop constraint if exists contratos_modelos_categoria_check;
alter table public.contratos_modelos add constraint contratos_modelos_categoria_check
  check (categoria in ('endereco_fiscal', 'coworking', 'sala_privativa', 'sala_hora', 'abertura_empresa', 'parceria'));

comment on constraint contratos_modelos_categoria_check on public.contratos_modelos is
  'parceria = contrato do parceiro credenciado (docs/contratos-parceiros), publicado sem unidade';

-- ----------------------------------------------------------------------------
-- 3) prazo de correspondência em unidade parceira
-- ----------------------------------------------------------------------------

-- Próximo dia útil (sábado e domingo saem; feriado não é tratado: o prazo do
-- contrato é "o dia útil seguinte" e feriado empurra a cobrança do parceiro
-- para o dia seguinte, o que joga a favor dele).
create or replace function public.proximo_dia_util(p_data date)
returns date language sql immutable set search_path = public as $$
  select case extract(dow from p_data + 1)
           when 6 then p_data + 3   -- sábado → segunda
           when 0 then p_data + 2   -- domingo → segunda
           else p_data + 1
         end;
$$;
revoke all on function public.proximo_dia_util(date) from public, anon;
grant execute on function public.proximo_dia_util(date) to authenticated, service_role;

/**
 * Correspondências de unidade PARCEIRA que passaram do prazo de 1 dia útil sem
 * o cliente ser avisado. Sem unidade: todas (rotina-diaria e tela Parceiros).
 * Com unidade: a da unidade (tela da unidade).
 * Só o admin da plataforma, a equipe da unidade pedida e o backend.
 */
create or replace function public.correspondencias_fora_prazo(p_unidade_id text default null)
returns table (
  conta_id    text,
  unidade_id  text,
  unidade     text,
  item_id     text,
  cliente     text,
  remetente   text,
  recebido_em date,
  prazo_em    date,
  dias        int
)
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    if p_unidade_id is null then
      if not public.is_platform_admin() then
        raise exception 'SO_ADMIN: a lista geral de atrasos é do administrador da plataforma';
      end if;
    elsif not (public.is_platform_admin() or public.is_unidade_staff(p_unidade_id)) then
      raise exception 'SEM_ACESSO: você não atende esta unidade';
    end if;
  end if;

  return query
  with base as (
    select
      c.id   as conta_id,
      u.id   as unidade_id,
      u.nome as unidade,
      s.item_id,
      coalesce(nullif(btrim(s.doc ->> 'cliente'), ''), 'Cliente sem nome') as cliente,
      coalesce(nullif(btrim(s.doc ->> 'remetente'), ''), 'Remetente não informado') as remetente,
      ((s.doc ->> 'recebidoEm')::timestamptz at time zone 'America/Sao_Paulo')::date as recebido_em,
      s.doc ->> 'status' as status,
      s.doc ->> 'notificadoEm' as notificado_em
    from public.app_state s
    join public.unidades u on u.id = s.unidade_id
    join public.contas   c on c.id = u.franqueado_id
    where s.entity = 'correspondencias'
      and c.tipo = 'parceiro'
      and (p_unidade_id is null or s.unidade_id = p_unidade_id)
      and (s.doc ->> 'recebidoEm') is not null
  )
  select
    b.conta_id, b.unidade_id, b.unidade, b.item_id, b.cliente, b.remetente,
    b.recebido_em,
    public.proximo_dia_util(b.recebido_em) as prazo_em,
    (((now() at time zone 'America/Sao_Paulo')::date) - public.proximo_dia_util(b.recebido_em))::int as dias
  from base b
  where b.notificado_em is null
    and coalesce(b.status, 'aguardando') not in ('notificado', 'retirada')
    and public.proximo_dia_util(b.recebido_em) < ((now() at time zone 'America/Sao_Paulo')::date)
  order by b.recebido_em;
end $$;
revoke all on function public.correspondencias_fora_prazo(text) from public, anon;
grant execute on function public.correspondencias_fora_prazo(text) to authenticated, service_role;

-- Avisos já mandados (a rotina roda todo dia e não repete o mesmo alerta).
create table if not exists public.parceiro_alertas (
  id          uuid primary key default gen_random_uuid(),
  conta_id    text not null references public.contas (id) on delete cascade,
  unidade_id  text not null,
  tipo        text not null,
  referencia  text not null,
  detalhe     text,
  created_at  timestamptz not null default now()
);

alter table public.parceiro_alertas drop constraint if exists parceiro_alertas_tipo_check;
alter table public.parceiro_alertas add constraint parceiro_alertas_tipo_check
  check (tipo in ('correspondencia_atrasada'));

create unique index if not exists parceiro_alertas_uk
  on public.parceiro_alertas (tipo, unidade_id, referencia);
create index if not exists parceiro_alertas_conta_idx
  on public.parceiro_alertas (conta_id, created_at desc);

comment on table public.parceiro_alertas is 'Alerta já enviado ao parceiro e à CafeWorking (rotina-diaria). Um por correspondência.';

alter table public.parceiro_alertas enable row level security;

drop policy if exists "parceiro_alertas: leitura" on public.parceiro_alertas;
create policy "parceiro_alertas: leitura" on public.parceiro_alertas for select
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.unidade_members m
      where m.user_id = auth.uid() and m.franqueado_id = parceiro_alertas.conta_id
        and m.role in ('master', 'financeiro')
    )
  );
-- Sem policy de escrita: só a rotina (service_role) registra.

revoke all on public.parceiro_alertas from anon, authenticated;
grant select on public.parceiro_alertas to authenticated;
grant all on public.parceiro_alertas to service_role;

-- ----------------------------------------------------------------------------
-- 4) indicadores por parceiro (tela Parceiros)
-- ----------------------------------------------------------------------------
create or replace function public.parceiro_indicadores()
returns table (
  conta_id          text,
  conta             text,
  parceiro_status   text,
  tem_carteira      boolean,
  unidades          int,
  clientes_ativos   int,
  receita_mes       numeric,
  parte_parceiro_mes numeric,
  garantia_saldo    numeric,
  corresp_atrasadas int
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_inicio date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') and not public.is_platform_admin() then
    raise exception 'SO_ADMIN: os indicadores da rede são do administrador da plataforma';
  end if;

  return query
  with atrasos as (
    select f.conta_id, count(*)::int as n from public.correspondencias_fora_prazo(null) f group by f.conta_id
  )
  select
    c.id,
    c.nome,
    c.parceiro_status,
    coalesce(btrim(c.asaas_wallet_id), '') <> '',
    (select count(*)::int from public.unidades u where u.franqueado_id = c.id),
    (select count(*)::int from public.assinaturas a
      join public.unidades u on u.id = a.unidade_id
      where u.franqueado_id = c.id and a.status in ('ativa', 'inadimplente')),
    -- receita do mês = o que entrou de verdade (data do pagamento)
    coalesce((select sum(cb.valor_bruto) from public.cobrancas cb
      where cb.parceiro_conta_id = c.id and cb.status = 'pago'
        and (coalesce(cb.pago_em, cb.created_at) at time zone 'America/Sao_Paulo')::date >= v_inicio), 0),
    coalesce((select sum(cb.valor_parceiro) from public.cobrancas cb
      where cb.parceiro_conta_id = c.id and cb.status = 'pago'
        and (coalesce(cb.pago_em, cb.created_at) at time zone 'America/Sao_Paulo')::date >= v_inicio), 0),
    coalesce((select sum(case when g.tipo = 'retencao' then g.valor else -g.valor end)
      from public.parceiro_garantias g where g.conta_id = c.id), 0),
    coalesce((select a.n from atrasos a where a.conta_id = c.id), 0)
  from public.contas c
  where c.tipo = 'parceiro'
  order by c.nome;
end $$;
revoke all on function public.parceiro_indicadores() from public, anon;
grant execute on function public.parceiro_indicadores() to authenticated, service_role;
