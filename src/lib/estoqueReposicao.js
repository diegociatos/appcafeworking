// ============================================================================
// estoqueReposicao — transforma o alerta de estoque baixo numa tarefa de compra:
// quanto comprar de cada item e o custo estimado. Puro e testável.
// ============================================================================

/**
 * Sugestão de compra para repor um item abaixo do mínimo até um nível saudável
 * (alvo = fatorAlvo × estoqueMínimo, nunca menor que mínimo+1). Devolve
 * { sugestao (unidades a comprar), custoEstimado, alvo }.
 */
export function sugestaoReposicao(item, fatorAlvo = 2) {
  const min = Math.max(0, Math.floor(Number(item?.estoqueMinimo) || 0));
  const qtd = Math.max(0, Number(item?.quantidade) || 0);
  const alvo = Math.max(min + 1, Math.ceil(min * fatorAlvo));
  const sugestao = Math.max(1, Math.ceil(alvo - qtd));
  const custoEstimado = Math.round(sugestao * (Number(item?.custo) || 0) * 100) / 100;
  return { sugestao, custoEstimado, alvo };
}

/** Lista de reposição a partir dos itens baixos. Ordena pelo maior custo
 *  estimado. Devolve { linhas:[{item,sugestao,custoEstimado,alvo}], totalEstimado }. */
export function listaReposicao(itensBaixos = [], fatorAlvo = 2) {
  const linhas = itensBaixos
    .map((item) => ({ item, ...sugestaoReposicao(item, fatorAlvo) }))
    .sort((a, b) => b.custoEstimado - a.custoEstimado);
  const totalEstimado = Math.round(linhas.reduce((s, l) => s + l.custoEstimado, 0) * 100) / 100;
  return { linhas, totalEstimado };
}
