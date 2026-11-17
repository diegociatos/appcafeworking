// ============================================================================
// pdvFechamento — fechamento de caixa da cafeteria por forma de pagamento.
// Puro e testável. As vendas já lançam a receita no financeiro (addPedido), então
// o fechamento é SÓ um resumo/conferência (não cria lançamento, não duplica).
// ============================================================================

const LABEL = {
  dinheiro: "Dinheiro", pix: "Pix", cartao: "Cartão", "cartão": "Cartão",
  credito: "Cartão de crédito", debito: "Cartão de débito",
  agora: "Pago na hora", mensal: "Faturado no plano (mensal)",
};

/** Rótulo amigável de uma forma de pagamento (aceita variações de caixa/acento). */
export function rotuloForma(forma) {
  const k = String(forma || "").trim().toLowerCase();
  return LABEL[k] || (forma ? String(forma) : "Não informado");
}

/**
 * Agrupa pedidos por forma de pagamento. Devolve
 * { linhas:[{forma,rotulo,n,total}], totalGeral, qtd }, ordenado por maior total.
 */
export function agruparPorForma(pedidos = []) {
  const map = new Map();
  for (const p of pedidos) {
    const forma = String(p?.formaPagamento || "").trim() || "—";
    const g = map.get(forma) || { forma, rotulo: rotuloForma(forma), n: 0, total: 0 };
    g.n += 1;
    g.total += Number(p?.total) || 0;
    map.set(forma, g);
  }
  const linhas = [...map.values()]
    .map((g) => ({ ...g, total: Math.round(g.total * 100) / 100 }))
    .sort((a, b) => b.total - a.total);
  const totalGeral = Math.round(linhas.reduce((s, g) => s + g.total, 0) * 100) / 100;
  const qtd = linhas.reduce((s, g) => s + g.n, 0);
  return { linhas, totalGeral, qtd };
}
