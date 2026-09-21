export type ProdutoPublico = { id: string; unidade_id: string; nome: string; categoria: string; preco: number; emoji: string; foto: string };

const texto = (v: unknown, max: number) => typeof v === "string" ? v.trim().slice(0, max) : "";

export function produtoPublico(doc: Record<string, unknown>, unidadeId: string): ProdutoPublico | null {
  if (doc.tipo !== "produto" || doc.ativo === false || doc.publicarNoSite !== true) return null;
  const nome = texto(doc.nome, 120);
  const preco = Number(doc.preco);
  if (!nome || !Number.isFinite(preco) || preco < 0) return null;
  const fotoBruta = texto(doc.foto, 1600);
  const foto = /^https:\/\//i.test(fotoBruta) ? fotoBruta : "";
  return {
    id: texto(doc.id, 120), unidade_id: unidadeId, nome,
    categoria: texto(doc.categoria, 60) || "Outros",
    preco: Math.round(preco * 100) / 100,
    emoji: texto(doc.emoji, 8) || "☕", foto,
  };
}
