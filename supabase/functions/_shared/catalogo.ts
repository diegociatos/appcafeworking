// ============================================================================
// Catálogo público — o que o site e o autocadastro podem saber de um plano.
// Os planos vivem no app_state (entity 'planos'), cadastrados na tela Planos.
// ============================================================================

import { categoriaValida, descontoAnualValido, precoAnual } from "./venda.ts";

export interface PlanoPublico {
  id: string; unidade_id: string; nome: string;
  preco: number | null; precoAnual: number | null; descontoAnualPct: number;
  recorrencia: "mensal" | "avulso"; emiteNF: boolean; descricao: string;
  categoria: string | null; prazoMinimoMeses: number; capacidade: number | null;
  direitos: Record<string, unknown>; venderNoSite: boolean; sobConsulta: boolean;
  destaque: string | null; beneficios: string[]; ordem: number;
}

// deno-lint-ignore no-explicit-any
export function planoPublico(p: any, unidadeId: string, descontoPct: number): PlanoPublico {
  const sobConsulta = p.sobConsulta === true;
  const preco = Number(p.preco || 0);
  const recorrencia = p.recorrencia === "avulso" ? "avulso" : "mensal";
  const desconto = descontoAnualValido(descontoPct);
  const ordem = Number(p.ordem);
  return {
    id: String(p.id),
    unidade_id: unidadeId,
    nome: String(p.nome || ""),
    preco: sobConsulta ? null : preco,
    precoAnual: !sobConsulta && preco > 0 && recorrencia === "mensal" ? precoAnual(preco, desconto) : null,
    descontoAnualPct: desconto,
    recorrencia,
    emiteNF: !!p.emiteNF,
    descricao: String(p.descricao || ""),
    categoria: categoriaValida(p.categoria) ? p.categoria : null,
    prazoMinimoMeses: Math.max(0, Math.floor(Number(p.prazoMinimoMeses || 0))),
    capacidade: Number(p.capacidade) > 0 ? Number(p.capacidade) : null,
    direitos: p.direitos || {},
    venderNoSite: p.venderNoSite === true,
    sobConsulta,
    destaque: String(p.destaque || "").trim() || null,
    beneficios: Array.isArray(p.beneficios)
      ? p.beneficios.map((b: unknown) => String(b).trim()).filter(Boolean).slice(0, 12)
      : [],
    ordem: p.ordem !== null && p.ordem !== "" && p.ordem !== undefined && Number.isFinite(ordem) ? ordem : 999,
  };
}

export function visivelNoSite(p: PlanoPublico): boolean {
  return p.venderNoSite && !!p.categoria && (p.sobConsulta || (p.preco ?? 0) > 0);
}

export function ordenarPlanos(a: PlanoPublico, b: PlanoPublico): number {
  if (a.ordem !== b.ordem) return a.ordem - b.ordem;
  const pa = a.preco ?? Number.POSITIVE_INFINITY;
  const pb = b.preco ?? Number.POSITIVE_INFINITY;
  return pa - pb;
}
