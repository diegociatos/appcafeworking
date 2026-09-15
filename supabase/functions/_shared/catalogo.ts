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
  /** sala privativa: as salas daquele tamanho, cada uma com nome, fotos e se está ocupada */
  salas: SalaPublica[] | null;
}

export interface SalaPublica {
  id: string; nome: string; capacidade: number; descricao: string;
  comodidades: string[]; fotos: string[]; ocupada: boolean;
}

/** Só endereço https vai para o site: foto antiga gravada como data: URL pesa megabytes. */
export const fotosPublicas = (fotos: unknown): string[] =>
  (Array.isArray(fotos) ? fotos : []).filter((f): f is string => typeof f === "string" && /^https:\/\//.test(f)).slice(0, 12);

/**
 * Marca quais salas de um tamanho aparecem ocupadas no site.
 * - alugada no app, com assinatura ativa ou segurada por compra em andamento: ocupada;
 * - vendas sem sala escolhida (antigas) ocupam as últimas livres, para a conta fechar.
 * Livres primeiro, depois por nome.
 */
export function marcarOcupadas<T extends { id: string; nome: string; contratada?: boolean }>(
  salas: T[], seguradas: Set<string>, vendasSemSala: number,
): (T & { ocupada: boolean })[] {
  const ordem = (a: T, b: T) => String(a.nome).localeCompare(String(b.nome), "pt-BR", { numeric: true });
  const marcadas = salas.slice().sort(ordem).map((s) => ({ ...s, ocupada: s.contratada === true || seguradas.has(s.id) }));
  let sobra = Math.max(0, vendasSemSala);
  for (let i = marcadas.length - 1; i >= 0 && sobra > 0; i--) {
    if (!marcadas[i].ocupada) { marcadas[i].ocupada = true; sobra--; }
  }
  return marcadas.sort((a, b) => Number(a.ocupada) - Number(b.ocupada) || ordem(a, b));
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
    salas: null,
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
