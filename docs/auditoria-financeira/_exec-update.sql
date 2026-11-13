-- Execução: aplica a data composta (dia + competência) nos 208 composáveis.
-- Só altera `data` e `dataVencimento` (nunca `valor`/cliente/categoria).
-- Idempotente: após virar DD/MM/AAAA, o filtro deixa de pegá-los.
update app_state s
set doc = jsonb_set(jsonb_set(s.doc, '{data}', to_jsonb(v.data_nova)), '{dataVencimento}', to_jsonb(v.data_nova)),
    updated_at = now()
from (
  select a.unidade_id, a.item_id,
    to_char(make_date(coalesce((a.doc->>'ano')::int, 2026), (a.doc->>'mes')::int + 1,
      least((regexp_match(a.doc->>'data', '^([0-9]{1,2})'))[1]::int,
            extract(day from (make_date(coalesce((a.doc->>'ano')::int,2026),(a.doc->>'mes')::int+1,1) + interval '1 month - 1 day'))::int)),
      'DD/MM/YYYY') as data_nova
  from app_state a
  where a.entity = 'lancamentos'
    and not (a.doc->>'data' ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$')
    and a.doc->>'data' ~ '^[0-9]{1,2}'
    and a.doc->>'mes' is not null
) v
where s.entity = 'lancamentos' and s.unidade_id = v.unidade_id and s.item_id = v.item_id;

-- Verificação: deve sobrar só a inconsistente não-composável.
select
  count(*) filter (where not (doc->>'data' ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$')) as ainda_invalida_total,
  count(*) filter (where not (doc->>'data' ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$') and doc->>'data' ~ '^[0-9]{1,2}' and doc->>'mes' is not null) as ainda_composavel
from app_state where entity = 'lancamentos';
