-- Inventário por registro afetado — SOMENTE LEITURA. Uma linha por (registro, classe).
-- Saída com dados de cliente/valores: manter em ambiente privado autorizado.
--   supabase db query --linked -f docs/auditoria-financeira/diagnostico-registros.sql -o csv > <local privado>.csv
with d as (
  select
    u.nome as unidade, a.item_id,
    a.doc->>'descricao' as descricao, a.doc->>'tipo' as tipo, a.doc->>'status' as status,
    (a.doc->>'valor')::numeric as valor, a.doc->>'mes' as mes, a.doc->>'ano' as ano,
    a.doc->>'data' as data, a.doc->>'dataVencimento' as venc, a.doc->>'dataPagamento' as pag,
    coalesce(a.doc->>'clienteId','') as cliente,
    coalesce(a.doc->>'categoria','') as categoria, coalesce(a.doc->>'subcategoria','') as sub
  from app_state a join unidades u on u.id = a.unidade_id
  where a.entity = 'lancamentos'
)
select 'A_DATA_INVALIDA' problema, unidade, item_id, descricao, tipo, status, valor, mes, ano, data, venc, pag, cliente, categoria, sub
  from d where data !~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'
union all
select 'B_RECEBIVEL_FUTURO', unidade, item_id, descricao, tipo, status, valor, mes, ano, data, venc, pag, cliente, categoria, sub
  from d where tipo='entrada' and status='previsto' and coalesce(ano::int,2026) > 2026
union all
select 'C_NAO_COMERCIAL_SEM_CLIENTE', unidade, item_id, descricao, tipo, status, valor, mes, ano, data, venc, pag, cliente, categoria, sub
  from d where tipo='entrada' and status='pago' and cliente='' and categoria in ('Investimentos/Dividendos','Conta Movimentação')
union all
select 'D_SEM_SUBCATEGORIA', unidade, item_id, descricao, tipo, status, valor, mes, ano, data, venc, pag, cliente, categoria, sub
  from d where tipo='entrada' and sub=''
union all
-- Candidatos à conciliação: previsto aberto com um pago de mesmo cliente e valor (ex.: Ciatos 1.570,74)
select 'E_PAGO_ABERTO_CANDIDATO', prev.unidade, prev.item_id, prev.descricao, prev.tipo, prev.status, prev.valor, prev.mes, prev.ano, prev.data, prev.venc, prev.pag, prev.cliente, prev.categoria, prev.sub
  from d prev
  where prev.tipo='entrada' and prev.status='previsto' and prev.cliente <> ''
    and exists (select 1 from d pg where pg.tipo='entrada' and pg.status='pago' and pg.cliente = prev.cliente and pg.valor = prev.valor)
order by 1, unidade, cliente, valor;
