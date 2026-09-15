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
  /** o cliente escolhe manhã ou tarde na contratação (planos Turno e Flex) */
  escolhaTurno: boolean;
  /** sala privativa: quantas ainda podem ser vendidas; null = não se aplica */
  disponiveis: number | null;
}

/** Turnos do coworking de meio período (Diego, 15/09/2026). */
export const TURNOS: Record<string, string> = {
  manha: "Manhã (8h às 12h)",
  tarde: "Tarde (12h às 18h)",
};

export const turnoValido = (t: unknown): t is "manha" | "tarde" => typeof t === "string" && t in TURNOS;

/**
 * Quantas salas privativas de um tamanho ainda podem ser vendidas: salas livres
 * menos as já vendidas que aguardam entrega (assinatura sem sala atribuída) e
 * as compras em andamento (aguardando pagamento).
 */
export function vagasDeSala(livres: number, vendidasSemSala: number, emAndamento: number): number {
  return Math.max(0, livres - vendidasSemSala - emAndamento);
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
    escolhaTurno: p.escolhaTurno === true,
    disponiveis: null,
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
