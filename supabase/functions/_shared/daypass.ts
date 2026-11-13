// ============================================================================
// Day pass na agenda — regras puras (sem rede e sem banco).
//
// O Day pass (sala compartilhada, plano com direitos.dayPass > 0) vira uma
// reserva na agenda numa data escolhida no checkout. Tudo o que decide a data,
// o bloco de horário e a base livre fica aqui, testável sem Supabase nem Asaas.
//
//   deno test supabase/functions/_shared/daypass_test.ts
// ============================================================================

import { hojeBRT } from "./venda.ts";

/** Sala de coworking (day pass) da Luxemburgo: 8 estações, bloco 08h–18h BRT. */
export const SALA_DAYPASS = "s_lux_compartilhada";
export const UNIDADE_DAYPASS = "un_cafeworkingluxembu_e78be3";
export const CAPACIDADE_DAYPASS = 8;
/** Até quantos dias à frente o cliente pode escolher a data no checkout. */
export const MAX_DIAS_DAYPASS = 90;

// deno-lint-ignore no-explicit-any
type Linha = Record<string, any>;

/** É uma venda de day pass? (categoria coworking + direito dayPass no plano) */
export function ehDayPass(ps: Linha | null | undefined): boolean {
  return !!ps && ps.categoria === "coworking" && Number(ps?.direitos?.dayPass || 0) > 0;
}

/** YYYY-MM-DD → [ano, mês(1-12), dia], ou null se o formato não bater. */
function partesData(valor: unknown): [number, number, number] | null {
  const s = String(valor ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const a = Number(m[1]), mes = Number(m[2]), d = Number(m[3]);
  // valida que a data existe de verdade (ex.: 2026-02-30 é inválida)
  const dt = new Date(Date.UTC(a, mes - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== mes - 1 || dt.getUTCDate() !== d) return null;
  return [a, mes, d];
}

export type ResultadoDataUso = { ok: true; data: string } | { ok: false; erro: string };

/**
 * Valida a data de uso do day pass escolhida no checkout. Mensagens em pt-BR
 * (o site mostra direto). Regras: data válida, dia útil (seg–sex, no fuso de
 * Brasília), não no passado, até `maxDias` à frente.
 */
export function validarDataUso(
  valor: unknown, agora: Date = new Date(), maxDias: number = MAX_DIAS_DAYPASS,
): ResultadoDataUso {
  const partes = partesData(valor);
  if (!partes) return { ok: false, erro: "Escolha a data do day pass (um dia útil)." };
  const [a, mes, d] = partes;

  // dia da semana da data-calendário (0 = domingo … 6 = sábado)
  const diaSemana = new Date(Date.UTC(a, mes - 1, d)).getUTCDay();
  if (diaSemana === 0 || diaSemana === 6) {
    return { ok: false, erro: "O day pass vale só em dia útil (segunda a sexta). Escolha outra data." };
  }

  const dataISO = `${a}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const hoje = hojeBRT(agora);
  if (dataISO < hoje) {
    return { ok: false, erro: "Escolha uma data futura para o day pass." };
  }

  // limite = hoje + maxDias (em dias-calendário)
  const [ha, hm, hd] = hoje.split("-").map(Number);
  const limite = new Date(Date.UTC(ha, hm - 1, hd + maxDias));
  const escolhida = new Date(Date.UTC(a, mes - 1, d));
  if (escolhida > limite) {
    return { ok: false, erro: `Escolha uma data em até ${maxDias} dias.` };
  }

  return { ok: true, data: dataISO };
}

/**
 * Bloco 08h–18h (America/Sao_Paulo) de uma data YYYY-MM-DD, em ISO UTC. O Brasil
 * é UTC-3 fixo (sem horário de verão desde 2019): 08h BRT = 11:00Z, 18h = 21:00Z.
 */
export function blocoDayPass(dataISO: string): { startISO: string; endISO: string } {
  return { startISO: `${dataISO}T11:00:00.000Z`, endISO: `${dataISO}T21:00:00.000Z` };
}

/**
 * Menor base livre (1..capacidade) dado o conjunto de bases já ocupadas no dia.
 * null quando o dia está lotado. Bases nulas de reservas antigas são ignoradas.
 */
export function menorBaseLivre(ocupadas: Array<number | null | undefined>, capacidade: number = CAPACIDADE_DAYPASS): number | null {
  const tomadas = new Set(ocupadas.map((b) => Number(b)).filter((b) => Number.isInteger(b) && b >= 1));
  for (let b = 1; b <= capacidade; b++) {
    if (!tomadas.has(b)) return b;
  }
  return null;
}
