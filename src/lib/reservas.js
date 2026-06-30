// ============================================================================
// Motor de reservas (híbrido) — aceita o formato antigo (dia/inicio/dur,
// relativo à semana) e o novo (startAt/endAt ISO). Funções puras, testáveis,
// e prontas para a futura Edge Function transacional.
// ============================================================================

import { HORARIOS } from "./data.js";

export const TZ = "America/Sao_Paulo";

// Segunda-feira (00:00) da semana de uma data de referência.
function mondayOf(date) {
  const d = new Date(date);
  const dow = (d.getDay() + 6) % 7; // 0 = segunda
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - dow);
  return d;
}

/** Reserva legada (dia 0..6 + índice de horário + duração) → { start, end } Date. */
export function legacyReservaToDateRange(r, semanaReferencia = new Date()) {
  const monday = mondayOf(semanaReferencia);
  const start = new Date(monday);
  start.setDate(monday.getDate() + (r.dia || 0));
  const [h, m] = (HORARIOS[r.inicio] || "07:00").split(":").map(Number);
  start.setHours(h, m || 0, 0, 0);
  const end = new Date(start);
  end.setHours(start.getHours() + (r.dur || 1));
  return { start, end };
}

/** startAt/endAt → { dia 0..6, inicio (índice HORARIOS), dur } para a agenda semanal. */
export function dateRangeToLegacy(startAt, endAt) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const dia = (start.getDay() + 6) % 7; // 0 = segunda
  const inicio = Math.max(0, start.getHours() - 7); // HORARIOS começa às 07:00
  const dur = Math.max(1, Math.round((end - start) / 3_600_000));
  return { dia, inicio, dur };
}

export function getReservaStart(r) {
  return r.startAt ? new Date(r.startAt) : legacyReservaToDateRange(r).start;
}
export function getReservaEnd(r) {
  return r.endAt ? new Date(r.endAt) : legacyReservaToDateRange(r).end;
}

/** Os intervalos de duas reservas se sobrepõem no tempo? */
export function reservaOverlaps(a, b) {
  return getReservaStart(a) < getReservaEnd(b) && getReservaStart(b) < getReservaEnd(a);
}

const STATUS_ATIVOS = new Set(["solicitada", "confirmada", "checkin"]);
export function reservaAtiva(r) {
  return !r.status || STATUS_ATIVOS.has(r.status);
}

/**
 * Há conflito da `nova` reserva com as `existentes`?
 *  - sala compartilhada (salaTemBases): conflito só na MESMA base;
 *  - sala normal: conflito em qualquer sobreposição na sala.
 * Ignora canceladas/concluídas e a própria reserva (mesmo id).
 */
export function temConflito(nova, existentes = [], { salaTemBases = false } = {}) {
  return existentes.some((r) => {
    if (!r || r.id === nova.id) return false;
    if (r.sala !== nova.sala) return false;
    if (!reservaAtiva(r)) return false;
    if (salaTemBases && (r.base ?? null) !== (nova.base ?? null)) return false;
    return reservaOverlaps(nova, r);
  });
}
