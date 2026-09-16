-- ============================================================================
-- Ajustes de catálogo apontados no levantamento de pendências (16/09/2026).
--   1. Empresarial e Full: "até 10h por dia" vira o horário real (8h às 18h).
--   2. Flex: tem café incluso no cadastro, mas o benefício não aparecia na lista.
--   3. Estoril igual ao Luxemburgo no endereço fiscal: Fiscal Pro com abertura e
--      fidelidade de 12 meses, Fiscal Pro + Certificado R$ 189 e Premium fora do site.
--      Contrato endereco_fiscal Estoril v2 (cláusulas 2.4 e 7.6) publicado junto.
-- ============================================================================

begin;

update public.app_state
set doc = jsonb_set(doc, '{beneficios,0}', to_jsonb('Acesso ilimitado das 8h às 18h, de segunda a sexta'::text))
where entity = 'planos' and unidade_id = 'un_cafeworkingluxembu_e78be3' and item_id = 'pl_site_cow_empresarial'
  and doc->'beneficios'->>0 = 'Acesso ilimitado, até 10h por dia';

update public.app_state
set doc = jsonb_set(doc, '{beneficios,0}', to_jsonb('Dia inteiro, das 8h às 18h'::text))
where entity = 'planos' and unidade_id = 'un_cafeworkingluxembu_e78be3' and item_id = 'pl_site_cow_full'
  and doc->'beneficios'->>0 = 'Dia inteiro, até 10h por dia';

update public.app_state
set doc = jsonb_set(doc, '{beneficios}', jsonb_build_array(
  'Manhã (8h às 12h) ou tarde (12h às 18h), à sua escolha', '2h/mês de sala de reunião',
  '1 café por dia', '20 impressões/mês', '1h/mês de consultoria Ciatos', '10% de desconto em eventos'))
where entity = 'planos' and unidade_id = 'un_cafeworkingluxembu_e78be3' and item_id = 'pl_site_cow_flex'
  and not (doc->'beneficios' ? '1 café por dia');

update public.app_state
set doc = doc || jsonb_build_object(
  'prazoMinimoMeses', 12,
  'beneficios', jsonb_build_array(
    'Endereço para CNPJ', 'Abertura da empresa inclusa (taxas oficiais à parte)',
    'Digitalização inclusa', 'Notificação por WhatsApp', '2h/mês de sala de reunião inclusa'),
  'direitos', coalesce(doc->'direitos', '{}'::jsonb) || '{"aberturaEmpresa": true}'::jsonb
)
where entity = 'planos' and unidade_id = 'un_cafeworkingestoril_a1c7e2' and item_id = 'pl_site_fiscal_pro_estoril';

update public.app_state set doc = doc || '{"ordem": 4, "venderNoSite": false}'::jsonb
where entity = 'planos' and unidade_id = 'un_cafeworkingestoril_a1c7e2' and item_id = 'pl_site_fiscal_premium_estoril';

insert into public.app_state (unidade_id, entity, item_id, doc)
select unidade_id, entity, 'pl_site_fiscal_pro_certificado_estoril', doc || jsonb_build_object(
  'id', 'pl_site_fiscal_pro_certificado_estoril', 'nome', 'Fiscal Pro + Certificado', 'preco', 189, 'ordem', 3, 'destaque', '',
  'descricao', 'Endereço fiscal com abertura da empresa e certificado digital e-CNPJ A1',
  'beneficios', jsonb_build_array(
    'Endereço para CNPJ', 'Abertura da empresa inclusa (taxas oficiais à parte)',
    'Certificado digital e-CNPJ A1 (1 ano)', 'Digitalização inclusa', 'Notificação por WhatsApp',
    '2h/mês de sala de reunião inclusa'),
  'direitos', coalesce(doc->'direitos', '{}'::jsonb) || '{"aberturaEmpresa": true, "certificadoDigital": true}'::jsonb
)
from public.app_state
where entity = 'planos' and unidade_id = 'un_cafeworkingestoril_a1c7e2' and item_id = 'pl_site_fiscal_pro_estoril'
on conflict (unidade_id, entity, item_id) do nothing;

commit;

select unidade_id, item_id, doc->>'nome' nome, doc->>'preco' preco, doc->>'prazoMinimoMeses' fid,
       doc->>'venderNoSite' site, doc->'beneficios'->>0 primeiro_beneficio, doc->'direitos' direitos
from public.app_state
where entity = 'planos'
  and item_id in ('pl_site_cow_empresarial', 'pl_site_cow_full', 'pl_site_cow_flex', 'pl_site_fiscal_pro_estoril',
                  'pl_site_fiscal_premium_estoril', 'pl_site_fiscal_pro_certificado_estoril')
order by unidade_id, item_id;
