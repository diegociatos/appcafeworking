-- Fase B — carteira única: vincula o instrumento de cobrança (boleto/cobrança
-- Asaas) à OBRIGAÇÃO (lançamento em app_state), para conciliação idempotente.
-- Aditivo e não destrutivo: só acrescenta colunas nuláveis + índices. Nenhum
-- dado é alterado. Aplicar com `supabase db push` após revisão.
begin;

alter table if exists public.boletos
  add column if not exists lancamento_id text;

alter table if exists public.cobrancas
  add column if not exists lancamento_id text;

create index if not exists boletos_lancamento_id_idx on public.boletos (lancamento_id);
create index if not exists cobrancas_lancamento_id_idx on public.cobrancas (lancamento_id);

comment on column public.boletos.lancamento_id is
  'app_state lancamentos.item_id da obrigacao que este boleto cobra (conciliacao).';
comment on column public.cobrancas.lancamento_id is
  'app_state lancamentos.item_id da obrigacao que esta cobranca cobra (conciliacao).';

commit;
