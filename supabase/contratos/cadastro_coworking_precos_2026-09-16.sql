-- ============================================================================
-- Coworking Luxemburgo: precos e beneficios corrigidos pelo Diego (16/09/2026). Aplicado em producao.
--   Flex R$ 490; Diario R$ 600/mes, uso livre (dia inteiro ou meio periodo), mesa fixa, 1h/mes de sala.
-- ============================================================================

update app_state
set doc = doc || jsonb_build_object(
  'preco', 600,
  'descricao', 'Uso livre em qualquer dia útil: dia inteiro ou meio período',
  'beneficios', jsonb_build_array('Segunda a sexta, dia inteiro ou meio período, como preferir', 'Mesa fixa reservada', '1h/mês de sala de reunião'),
  'direitos', coalesce(doc->'direitos', '{}'::jsonb) || '{"horasReuniao": 1, "cafeIncluso": false}'::jsonb
)
where entity = 'planos' and unidade_id = 'un_cafeworkingluxembu_e78be3' and item_id = 'pl_site_cow_diario'
;
update app_state set doc = doc || '{"preco": 490}'::jsonb
where entity='planos' and unidade_id='un_cafeworkingluxembu_e78be3' and item_id='pl_site_cow_flex';
