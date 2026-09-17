-- 5 lançamentos importados no Luxemburgo com data 15/01/2025 por erro de digitação
-- (confirmado pelo Diego em 17/09/2026): passam a 15/01/2026, com ano 2026 gravado.
update public.app_state
set doc = doc || jsonb_build_object('data', '15/01/2026', 'ano', 2026)
where entity = 'lancamentos'
  and item_id in ('lc1786480788289_46', 'lc1786480788289_47', 'lc1786480788289_48', 'lc1786480788289_49', 'lc1786480788289_50')
  and doc->>'data' = '15/01/2025';

select item_id, doc->>'descricao' descricao, doc->>'data' data, doc->>'mes' mes, doc->>'ano' ano
from public.app_state
where entity = 'lancamentos'
  and item_id in ('lc1786480788289_46', 'lc1786480788289_47', 'lc1786480788289_48', 'lc1786480788289_49', 'lc1786480788289_50')
order by item_id;
