-- ============================================================================
-- Abertura de empresa no site (Diego, 16/09/2026). Aplicado em produção.
--   Abertura avulsa R$ 299, à vista, taxas oficiais por conta do cliente.
--   Fiscal Pro R$ 149 passa a incluir a abertura, com fidelidade de 12 meses.
--   Fiscal Pro + Certificado R$ 189: abertura + e-CNPJ A1 de 1 ano, fidelidade de 12 meses.
-- Contratos: endereco_fiscal v2 (cláusulas 2.4 e 7.6) e abertura_empresa v1.
-- ============================================================================

begin;

update public.app_state
set doc = doc || jsonb_build_object(
  'prazoMinimoMeses', 12,
  'beneficios', jsonb_build_array(
    'Endereço para CNPJ', 'Abertura da empresa inclusa (taxas oficiais à parte)',
    'Digitalização inclusa', 'Notificação por WhatsApp', '2h/mês de sala de reunião inclusa'),
  'direitos', coalesce(doc->'direitos', '{}'::jsonb) || '{"aberturaEmpresa": true}'::jsonb
)
where entity = 'planos' and unidade_id = 'un_cafeworkingluxembu_e78be3' and item_id = 'pl_site_fiscal_pro';

update public.app_state set doc = doc || '{"ordem": 4}'::jsonb
where entity = 'planos' and unidade_id = 'un_cafeworkingluxembu_e78be3' and item_id = 'pl_site_fiscal_premium';

insert into public.app_state (unidade_id, entity, item_id, doc)
select unidade_id, entity, 'pl_site_fiscal_pro_certificado', doc || jsonb_build_object(
  'id', 'pl_site_fiscal_pro_certificado', 'nome', 'Fiscal Pro + Certificado', 'preco', 189, 'ordem', 3, 'destaque', '',
  'descricao', 'Endereço fiscal com abertura da empresa e certificado digital e-CNPJ A1',
  'beneficios', jsonb_build_array(
    'Endereço para CNPJ', 'Abertura da empresa inclusa (taxas oficiais à parte)',
    'Certificado digital e-CNPJ A1 (1 ano)', 'Digitalização inclusa', 'Notificação por WhatsApp',
    '2h/mês de sala de reunião inclusa'),
  'direitos', coalesce(doc->'direitos', '{}'::jsonb) || '{"aberturaEmpresa": true, "certificadoDigital": true}'::jsonb
)
from public.app_state
where entity = 'planos' and unidade_id = 'un_cafeworkingluxembu_e78be3' and item_id = 'pl_site_fiscal_pro'
on conflict (unidade_id, entity, item_id) do nothing;

insert into public.app_state (unidade_id, entity, item_id, doc)
select unidade_id, entity, 'pl_site_abertura', doc || jsonb_build_object(
  'id', 'pl_site_abertura', 'nome', 'Abertura de empresa', 'preco', 299, 'recorrencia', 'avulso',
  'categoria', 'abertura_empresa', 'prazoMinimoMeses', 0, 'ordem', 1, 'destaque', '',
  'descricao', 'Abertura de MEI, empresário individual ou LTDA com a Ciatos Contabilidade',
  'beneficios', jsonb_build_array(
    'MEI, empresário individual ou LTDA', 'Orientação sobre atividades e impostos',
    'Viabilidade, registro na Junta e CNPJ', 'Inscrição municipal', 'Feito com a Ciatos Contabilidade',
    'Taxas oficiais pagas à parte'),
  'direitos', '{"aberturaEmpresa": true}'::jsonb
)
from public.app_state
where entity = 'planos' and unidade_id = 'un_cafeworkingluxembu_e78be3' and item_id = 'pl_site_fiscal_pro'
on conflict (unidade_id, entity, item_id) do nothing;

select item_id, doc->>'nome' nome, doc->>'preco' preco, doc->>'recorrencia' rec, doc->>'categoria' cat,
       doc->>'prazoMinimoMeses' fid, doc->>'ordem' ordem, doc->'direitos' direitos
from public.app_state
where entity = 'planos' and unidade_id = 'un_cafeworkingluxembu_e78be3'
  and item_id in ('pl_site_fiscal_pro', 'pl_site_fiscal_pro_certificado', 'pl_site_abertura', 'pl_site_fiscal_premium')
order by item_id;

commit;
