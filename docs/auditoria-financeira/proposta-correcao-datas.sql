-- Simulação ANTES→DEPOIS da correção determinística de datas — SOMENTE LEITURA.
-- Para cada recebível com `data` inválida mas com dia + competência derivável,
-- mostra a data gravada e a data PROPOSTA (composta de dia + mês + ano que JÁ
-- existem — nada é inventado). Os sem dia derivável (ex.: "—") NÃO aparecem aqui:
-- vão para revisão humana. Esta query não altera nada.
--   supabase db query --linked -f docs/auditoria-financeira/proposta-correcao-datas.sql -o csv > <privado>.csv
with d as (
  select
    u.nome as unidade, a.item_id,
    a.doc->>'descricao' as descricao,
    (a.doc->>'valor')::numeric as valor,
    a.doc->>'data' as data_atual,
    a.doc->>'dataVencimento' as venc_atual,
    (a.doc->>'mes')::int as mes0,
    coalesce((a.doc->>'ano')::int, 2026) as ano,
    (regexp_match(a.doc->>'data', '^([0-9]{1,2})'))[1]::int as dia_raw
  from app_state a join unidades u on u.id = a.unidade_id
  where a.entity = 'lancamentos'
    and not (a.doc->>'data' ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$')
    and a.doc->>'data' ~ '^[0-9]{1,2}'
    and a.doc->>'mes' is not null
)
select
  unidade, item_id, descricao, valor,
  data_atual, venc_atual,
  to_char(
    make_date(ano, mes0 + 1,
      least(dia_raw, extract(day from (make_date(ano, mes0 + 1, 1) + interval '1 month - 1 day'))::int)),
    'DD/MM/YYYY') as data_proposta
from d
order by unidade, item_id;
