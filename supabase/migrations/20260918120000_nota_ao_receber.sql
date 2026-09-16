-- ============================================================================
-- CafeWorking · Nota fiscal automática ao receber (Asaas) + vínculo nota ↔ cobrança
--
-- 1) config_fiscal.emitir_ao_receber (padrão DESLIGADO): quando ligado, o
--    asaas-webhook emite a NFS-e da cobrança assim que o pagamento é
--    confirmado. Só emite de verdade (certificado + emissão ativa + Produção);
--    nunca simula.
--
-- 2) Idempotência por cobrança (o Asaas manda PAYMENT_CONFIRMED e
--    PAYMENT_RECEIVED para o mesmo pagamento, às vezes ao mesmo tempo):
--      • cobrancas.nota_status: null (nunca tentou) → 'emitindo' (reivindicada
--        por uma entrega do webhook) → 'emitida' | 'erro'. A reivindicação é um
--        update ... where nota_status is null: só uma entrega passa.
--      • cobrancas.nota_id: a nota emitida (automática ou manual).
--      • notas_fiscais.cobranca_id + índice único parcial: no máximo uma nota
--        processando/autorizada por cobrança (defesa final no banco).
--    Falha não é repetida sozinha (a nota pode ter sido transmitida antes do
--    erro): fica 'erro' com o motivo em nota_erro e a equipe emite à mão.
--
-- 3) A área do cliente (minhas-faturas) mostra as notas autorizadas também pela
--    cobrança do cliente (cobranca_id), além do CPF/CNPJ do cadastro.
--
-- RLS: nada muda. As colunas novas ficam sob as policies já existentes
-- (cobrancas/notas_fiscais: financeiro + cliente dono; config_fiscal: financeiro).
-- Escrita continua só pelo backend (service_role).
--
-- Idempotente. Produção não tinha cobrança, boleto nem nota nesta data.
-- ============================================================================

-- 1) Interruptor por unidade --------------------------------------------------
alter table public.config_fiscal
  add column if not exists emitir_ao_receber boolean not null default false;

comment on column public.config_fiscal.emitir_ao_receber is
  'Emite a NFS-e automaticamente quando o Asaas confirma o pagamento (exige certificado, emissão ativa e Produção)';

-- 2) Vínculo e estado da nota na cobrança --------------------------------------
alter table public.cobrancas
  add column if not exists nota_id     uuid,
  add column if not exists nota_status text,
  add column if not exists nota_erro   text;

alter table public.cobrancas drop constraint if exists cobrancas_nota_id_fkey;
alter table public.cobrancas add constraint cobrancas_nota_id_fkey
  foreign key (nota_id) references public.notas_fiscais (id) on delete set null;

alter table public.cobrancas drop constraint if exists cobrancas_nota_status_check;
alter table public.cobrancas add constraint cobrancas_nota_status_check
  check (nota_status is null or nota_status in ('emitindo', 'emitida', 'erro'));

comment on column public.cobrancas.nota_id is 'NFS-e emitida para esta cobrança (automática ao receber ou manual)';
comment on column public.cobrancas.nota_status is 'Emissão automática: null nunca tentou | emitindo | emitida | erro';
comment on column public.cobrancas.nota_erro is 'Motivo da última falha da emissão automática';

-- 3) Nota → cobrança ---------------------------------------------------------------
alter table public.notas_fiscais
  add column if not exists cobranca_id uuid;

alter table public.notas_fiscais drop constraint if exists notas_fiscais_cobranca_id_fkey;
alter table public.notas_fiscais add constraint notas_fiscais_cobranca_id_fkey
  foreign key (cobranca_id) references public.cobrancas (id) on delete set null;

-- Uma nota valendo por cobrança. Só usa valores do enum criados em 20260604120000
-- (processando/autorizada), nunca 'simulada': pode rodar na mesma transação que
-- a migration que criou esse valor.
drop index if exists public.notas_fiscais_cobranca_uk;
create unique index notas_fiscais_cobranca_uk
  on public.notas_fiscais (cobranca_id)
  where cobranca_id is not null and status in ('processando', 'autorizada');

comment on column public.notas_fiscais.cobranca_id is 'Cobrança (Asaas) que originou a nota, quando houver';
