export type ProdutoLoja = {
  id: string;
  nome: string;
  categoria: string;
  preco: number;
  foto: string | null;
  emoji: string;
};

type LinhaCatalogo = { item_id?: unknown; doc?: Record<string, unknown> | null };

export function produtosDaAreaCliente(linhas: LinhaCatalogo[]): ProdutoLoja[] {
  return linhas.flatMap((linha) => {
    const d = linha.doc || {};
    const preco = Number(d.preco);
    if (d.tipo !== "produto" || d.ativo === false || d.venderNoAppCliente !== true || !(preco > 0)) return [];
    return [{
      id: String(d.id || linha.item_id || ""),
      nome: String(d.nome || "Produto").slice(0, 120),
      categoria: String(d.categoria || "Outros").slice(0, 60),
      preco: Math.round(preco * 100) / 100,
      foto: typeof d.foto === "string" && /^https:\/\//i.test(d.foto) ? d.foto : null,
      emoji: String(d.emoji || "☕").slice(0, 4),
    }];
  }).filter((p) => p.id).sort((a, b) => a.categoria.localeCompare(b.categoria, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR"));
}

export function montarCompra(produtos: ProdutoLoja[], pedido: unknown) {
  if (!Array.isArray(pedido)) throw new Error("CARRINHO_VAZIO");
  const porId = new Map(produtos.map((p) => [p.id, p]));
  const itens = pedido.map((i) => {
    const linha = i as { id?: unknown; quantidade?: unknown };
    const produto = porId.get(String(linha?.id || ""));
    const quantidade = Math.floor(Number(linha?.quantidade));
    if (!produto || quantidade < 1 || quantidade > 50) throw new Error("ITEM_INVALIDO");
    return { ...produto, quantidade, subtotal: Math.round(produto.preco * quantidade * 100) / 100 };
  });
  if (!itens.length || itens.length > 30) throw new Error("CARRINHO_VAZIO");
  const total = Math.round(itens.reduce((s, i) => s + i.subtotal, 0) * 100) / 100;
  if (!(total > 0)) throw new Error("TOTAL_INVALIDO");
  return { itens, total };
}
