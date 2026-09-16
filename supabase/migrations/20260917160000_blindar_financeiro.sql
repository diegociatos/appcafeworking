-- ============================================================================
-- CafeWorking · Blindagem do financeiro (permissão do dinheiro no banco)
--
-- PROBLEMA
--   As policies de cobrancas, boletos, notas_fiscais, config_fiscal e
--   bank_accounts usavam is_unidade_staff(), que vale para QUALQUER papel de
--   equipe (master, financeiro e recepção). Quem escondia o financeiro da
--   recepção era só o menu do app: com o JWT da recepção dava para ler boletos,
--   cobranças, notas e a configuração fiscal direto pela API REST.
--
-- DECISÃO (conferida nas telas e Edge Functions em 16/09/2026)
--   Novo helper is_unidade_financeiro(unidade) = vínculo com role in
--   ('master', 'financeiro'). Admin da plataforma continua vendo tudo.
--
--   Restrito a admin + master/financeiro (cliente mantém o que já via):
--     • cobrancas      — select (cliente segue vendo as próprias por e-mail/doc)
--     • boletos        — select (cliente segue vendo os próprios pelo documento)
--     • notas_fiscais  — select (cliente segue vendo as próprias pelo documento)
--     • config_fiscal  — select/insert/update (cliente nunca viu)
--     • bank_accounts  — select/insert/update/delete (referência das credenciais
--                        bancárias; a recepção não usa)
--     • notificacoes   — os avisos de dinheiro (evento boleto_*, cobranca_*,
--                        nfse_*) ficam só com o financeiro; a recepção segue
--                        vendo os demais (reserva, correspondência, cafeteria…)
--                        e o cliente segue vendo os que foram para ele.
--
--   Mantido como está (a recepção precisa para atender):
--     • assinaturas / assinatura_documentos — a recepção tem "Assinaturas e
--       contratos" no menu, confere documentos e atribui sala. A lista vem da
--       Edge Function gestao-assinaturas, que agora só inclui as últimas
--       cobranças para master/financeiro. Estorno (reprovar documentos,
--       cancelamento com devolução) e acerto financeiro exigem financeiro na
--       Edge Function.
--     • creditos_ledger — a recepção consome e ajusta créditos de sala nas
--       reservas (supabaseDb.insertCreditoDb). É saldo de uso, não dinheiro.
--     • app_state — os lançamentos do financeiro moram lá junto com salas,
--       reservas, estoque e PDV (doc por entidade). Separar exige mover os
--       lançamentos para tabela própria: fica registrado como ponto em aberto.
--
--   Escrita em cobrancas/boletos/notas_fiscais continua só pelo backend
--   (service_role nas Edge Functions); não há policy de escrita para authenticated.
--
-- NUMERAÇÃO DA DPS (NFS-e Nacional)
--   Antes o número vinha de count(*) das notas da unidade: duas emissões ao
--   mesmo tempo pegavam o mesmo número. Agora:
--     • nfse_numeracao (unidade, série) → último número, incrementado por
--       proximo_numero_dps() com insert ... on conflict do update ... returning
--       (a linha fica travada até o fim da transação: sem corrida);
--     • notas_fiscais ganha serie_dps/numero_dps com unique (unidade, série, número).
--   Nota simulada não consome número (numero_dps nulo).
--
-- STATUS 'simulada' em nfse_status: nota de teste (ambiente de homologação sem
-- certificado). Não tem valor fiscal e não vai por e-mail ao cliente.
--
-- Idempotente. Não havia cobrança, boleto nem nota em produção nesta data.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Helper: master ou financeiro da unidade
-- ----------------------------------------------------------------------------
create or replace function public.is_unidade_financeiro(p_unidade_id text)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.unidade_members m
    where m.user_id = auth.uid() and m.unidade_id = p_unidade_id
      and m.role in ('master', 'financeiro')
  );
$$;

revoke all on function public.is_unidade_financeiro(text) from public, anon;
grant execute on function public.is_unidade_financeiro(text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2) cobrancas — financeiro vê todas da unidade; cliente vê só as próprias
-- ----------------------------------------------------------------------------
drop policy if exists "cobrancas: select por papel" on public.cobrancas;
create policy "cobrancas: select por papel" on public.cobrancas for select
  using (
    public.is_platform_admin()
    or public.is_unidade_financeiro(unidade_id)
    or cliente_email = (auth.jwt() ->> 'email')
    or exists (
      select 1 from public.clientes c
      where c.email = (auth.jwt() ->> 'email')
        and c.unidade_id = cobrancas.unidade_id
        and c.documento is not null
        and c.documento = cobrancas.cliente_documento
    )
  );

-- ----------------------------------------------------------------------------
-- 3) boletos — financeiro vê todos da unidade; cliente vê só os próprios
-- ----------------------------------------------------------------------------
drop policy if exists "boletos: select por papel" on public.boletos;
create policy "boletos: select por papel" on public.boletos for select
  using (
    public.is_platform_admin()
    or public.is_unidade_financeiro(unidade_id)
    or exists (
      select 1 from public.clientes c
      where c.email = (auth.jwt() ->> 'email')
        and c.unidade_id = boletos.unidade_id
        and c.documento is not null
        and c.documento = boletos.sacado_documento
    )
  );

-- ----------------------------------------------------------------------------
-- 4) notas_fiscais — financeiro vê todas da unidade; cliente vê só as próprias
-- ----------------------------------------------------------------------------
drop policy if exists "notas_fiscais: select por papel" on public.notas_fiscais;
create policy "notas_fiscais: select por papel" on public.notas_fiscais for select
  using (
    public.is_platform_admin()
    or public.is_unidade_financeiro(unidade_id)
    or exists (
      select 1 from public.clientes c
      where c.email = (auth.jwt() ->> 'email')
        and c.unidade_id = notas_fiscais.unidade_id
        and c.documento is not null
        and c.documento = notas_fiscais.tomador_documento
    )
  );

-- ----------------------------------------------------------------------------
-- 5) config_fiscal — só financeiro/admin
-- ----------------------------------------------------------------------------
drop policy if exists "config_fiscal: select staff" on public.config_fiscal;
drop policy if exists "config_fiscal: select financeiro" on public.config_fiscal;
create policy "config_fiscal: select financeiro" on public.config_fiscal for select
  using (public.is_platform_admin() or public.is_unidade_financeiro(unidade_id));
drop policy if exists "config_fiscal: insert staff" on public.config_fiscal;
drop policy if exists "config_fiscal: insert financeiro" on public.config_fiscal;
create policy "config_fiscal: insert financeiro" on public.config_fiscal for insert
  with check (public.is_platform_admin() or public.is_unidade_financeiro(unidade_id));
drop policy if exists "config_fiscal: update staff" on public.config_fiscal;
drop policy if exists "config_fiscal: update financeiro" on public.config_fiscal;
create policy "config_fiscal: update financeiro" on public.config_fiscal for update
  using (public.is_platform_admin() or public.is_unidade_financeiro(unidade_id))
  with check (public.is_platform_admin() or public.is_unidade_financeiro(unidade_id));

-- ----------------------------------------------------------------------------
-- 6) bank_accounts — só financeiro/admin
-- ----------------------------------------------------------------------------
drop policy if exists "bank_accounts: select staff" on public.bank_accounts;
drop policy if exists "bank_accounts: select financeiro" on public.bank_accounts;
create policy "bank_accounts: select financeiro" on public.bank_accounts for select
  using (public.is_platform_admin() or public.is_unidade_financeiro(unidade_id));
drop policy if exists "bank_accounts: insert staff" on public.bank_accounts;
drop policy if exists "bank_accounts: insert financeiro" on public.bank_accounts;
create policy "bank_accounts: insert financeiro" on public.bank_accounts for insert
  with check (public.is_platform_admin() or public.is_unidade_financeiro(unidade_id));
drop policy if exists "bank_accounts: update staff" on public.bank_accounts;
drop policy if exists "bank_accounts: update financeiro" on public.bank_accounts;
create policy "bank_accounts: update financeiro" on public.bank_accounts for update
  using (public.is_platform_admin() or public.is_unidade_financeiro(unidade_id))
  with check (public.is_platform_admin() or public.is_unidade_financeiro(unidade_id));
drop policy if exists "bank_accounts: delete staff" on public.bank_accounts;
drop policy if exists "bank_accounts: delete financeiro" on public.bank_accounts;
create policy "bank_accounts: delete financeiro" on public.bank_accounts for delete
  using (public.is_platform_admin() or public.is_unidade_financeiro(unidade_id));

-- ----------------------------------------------------------------------------
-- 7) notificacoes — avisos de dinheiro só para o financeiro
-- ----------------------------------------------------------------------------
drop policy if exists "notificacoes: select por papel" on public.notificacoes;
create policy "notificacoes: select por papel" on public.notificacoes for select
  using (
    public.is_platform_admin()
    or public.is_unidade_financeiro(unidade_id)
    or (
      public.is_unidade_staff(unidade_id)
      and evento not like 'boleto\_%'
      and evento not like 'cobranca\_%'
      and evento not like 'nfse\_%'
    )
    or destinatario = (auth.jwt() ->> 'email')
  );

-- ----------------------------------------------------------------------------
-- 8) NFS-e: status 'simulada' e numeração da DPS sem corrida
-- ----------------------------------------------------------------------------
alter type public.nfse_status add value if not exists 'simulada';

alter table public.notas_fiscais
  add column if not exists serie_dps  text,
  add column if not exists numero_dps bigint;

alter table public.notas_fiscais drop constraint if exists notas_fiscais_numero_dps_check;
alter table public.notas_fiscais add constraint notas_fiscais_numero_dps_check
  check (numero_dps is null or (numero_dps > 0 and serie_dps ~ '^[0-9]{5}$'));

alter table public.notas_fiscais drop constraint if exists notas_fiscais_dps_unica;
alter table public.notas_fiscais add constraint notas_fiscais_dps_unica
  unique (unidade_id, serie_dps, numero_dps);

comment on column public.notas_fiscais.serie_dps is 'Série da DPS (5 dígitos) usada na emissão; nula na nota simulada';
comment on column public.notas_fiscais.numero_dps is 'nDPS reservado por proximo_numero_dps(); nulo na nota simulada';

create table if not exists public.nfse_numeracao (
  unidade_id    text not null,
  serie         text not null check (serie ~ '^[0-9]{5}$'),
  ultimo_numero bigint not null check (ultimo_numero > 0),
  updated_at    timestamptz not null default now(),
  primary key (unidade_id, serie)
);

comment on table public.nfse_numeracao is 'Último nDPS usado por unidade e série. Só o backend lê/grava (proximo_numero_dps).';

alter table public.nfse_numeracao enable row level security;
revoke all on public.nfse_numeracao from anon, authenticated;
grant all on public.nfse_numeracao to service_role;
-- Sem policy: authenticated não lê nem grava.

-- Reserva o próximo nDPS da unidade/série. O insert ... on conflict do update
-- trava a linha até o fim da transação, então duas emissões simultâneas nunca
-- recebem o mesmo número. Na primeira vez parte do maior número já gravado em
-- notas_fiscais (se houver).
create or replace function public.proximo_numero_dps(p_unidade_id text, p_serie text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_numero bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'acesso negado: a numeração da DPS só é reservada pelo backend';
  end if;
  if p_unidade_id is null or btrim(p_unidade_id) = '' then
    raise exception 'unidade obrigatória para numerar a DPS';
  end if;
  if p_serie is null or p_serie !~ '^[0-9]{5}$' then
    raise exception 'série da DPS inválida: %', p_serie;
  end if;

  insert into public.nfse_numeracao as n (unidade_id, serie, ultimo_numero)
  values (
    p_unidade_id, p_serie,
    coalesce((select max(nf.numero_dps) from public.notas_fiscais nf
              where nf.unidade_id = p_unidade_id and nf.serie_dps = p_serie), 0) + 1
  )
  on conflict (unidade_id, serie) do update
    set ultimo_numero = n.ultimo_numero + 1, updated_at = now()
  returning n.ultimo_numero into v_numero;

  return v_numero;
end $$;

revoke all on function public.proximo_numero_dps(text, text) from public, anon, authenticated;
grant execute on function public.proximo_numero_dps(text, text) to service_role;
