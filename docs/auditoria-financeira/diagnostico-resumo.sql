-- Diagnóstico financeiro CafeWorking — SOMENTE LEITURA (nenhuma mutação).
-- Resumo por unidade e classe de inconsistência. Rodar com:
--   supabase db query --linked -f docs/auditoria-financeira/diagnostico-resumo.sql -o table
-- Classes (independentes; um lançamento pode cair em mais de uma):
--   data_inval : campo `data` não é DD/MM/AAAA (dia solto, "—", parcial)
--   futuro     : recebível previsto com ano > ano corrente (projeção 2027+)
--   naocom     : entrada paga sem cliente classificada como Investimentos ou
--                Conta Movimentação (transferência/aporte) — não é recebimento comercial
--   semsub     : entrada sem subcategoria (o "—" do DRE)
with d as (
  select
    u.nome                               as unidade,
    (a.doc->>'data')                     as data,
    a.doc->>'tipo'                       as tipo,
    a.doc->>'status'                     as status,
    (a.doc->>'valor')::numeric           as valor,
    coalesce((a.doc->>'ano')::int, 2026) as anoi,
    coalesce(a.doc->>'clienteId','')     as cliente,
    coalesce(a.doc->>'categoria','')     as categoria,
    coalesce(a.doc->>'subcategoria','')  as sub
  from app_state a
  join unidades u on u.id = a.unidade_id
  where a.entity = 'lancamentos'
)
select
  unidade,
  count(*) filter (where data !~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$') as data_inval_n,
  round(coalesce(sum(valor) filter (where data !~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'),0),2) as data_inval_rs,
  count(*) filter (where tipo='entrada' and status='previsto' and anoi > 2026) as futuro_n,
  round(coalesce(sum(valor) filter (where tipo='entrada' and status='previsto' and anoi > 2026),0),2) as futuro_rs,
  count(*) filter (where tipo='entrada' and status='pago' and cliente='' and categoria in ('Investimentos/Dividendos','Conta Movimentação')) as naocom_n,
  round(coalesce(sum(valor) filter (where tipo='entrada' and status='pago' and cliente='' and categoria in ('Investimentos/Dividendos','Conta Movimentação')),0),2) as naocom_rs,
  count(*) filter (where tipo='entrada' and sub='') as semsub_n,
  round(coalesce(sum(valor) filter (where tipo='entrada' and sub=''),0),2) as semsub_rs
from d
group by unidade
order by unidade;
