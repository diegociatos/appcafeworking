// ============================================================================
// dateUtils — competência financeira a partir da data real (sem datas fixas).
// `mes` é 0..11 (compatível com o restante do app e com Date.getMonth()).
// ============================================================================

const MESES_BR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** Competência (mês 0..11 + ano) de uma data — default: hoje. */
export function getCurrentCompetencia(date = new Date()) {
  return { mes: date.getMonth(), ano: date.getFullYear() };
}

/** dia/mes(0..11)/ano → ISO yyyy-mm-dd. */
export function toISODateFromDayMonthYear(dia, mes, ano) {
  const d = String(dia).padStart(2, "0");
  const m = String(mes + 1).padStart(2, "0");
  return `${ano}-${m}-${d}`;
}

/**
 * Extrai competência { mes, ano } de uma data em ISO (yyyy-mm-dd) ou BR
 * (dd/mm ou dd/mm/yyyy). Quando o ano não vier, usa o ano atual. Quando nada
 * for reconhecido, cai na competência de hoje.
 */
export function parseDateToCompetencia(data, hoje = new Date()) {
  if (!data) return getCurrentCompetencia(hoje);
  const s = String(data).trim();
  // ISO: yyyy-mm-dd
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { mes: parseInt(m[2], 10) - 1, ano: parseInt(m[1], 10) };
  // BR: dd/mm(/yyyy)
  m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (m) {
    const ano = m[3] ? (m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10)) : hoje.getFullYear();
    return { mes: Math.max(0, Math.min(11, parseInt(m[2], 10) - 1)), ano };
  }
  return getCurrentCompetencia(hoje);
}

/** Rótulo "Jun/2026". */
export function formatCompetencia(mes, ano) {
  return `${MESES_BR[mes] || "—"}/${ano}`;
}

/** "dd/mm/aaaa" (ou dd/mm, ou ISO yyyy-mm-dd) → Date à meia-noite local, ou
 *  null se não der pra reconhecer. Usado p/ calcular dias de atraso. */
export function parseDateBR(data, hoje = new Date()) {
  if (!data) return null;
  const s = String(data).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) { const d = new Date(+m[1], +m[2] - 1, +m[3]); return Number.isNaN(d.getTime()) ? null : d; }
  m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (!m) return null;
  const dia = parseInt(m[1], 10);
  const mes = parseInt(m[2], 10) - 1;
  const ano = m[3] ? (m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10)) : hoje.getFullYear();
  if (mes < 0 || mes > 11 || dia < 1 || dia > 31) return null;
  const d = new Date(ano, mes, dia);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ---------------------------------------------------------------------------
// Ano dos lançamentos. Até set/2026 o lançamento guardava só o mês (0..11).
// Os gravados sem `ano` são tratados como 2026: conferido no banco em
// 16/09/2026 (1227 lançamentos, todos criados em 2026). Cinco importados da
// planilha têm data "15/01/2025", provável erro de digitação: continuam em
// 2026 como sempre apareceram, até alguém corrigir o lançamento.
// Lançamento novo ou salvo grava o `ano`.
// ---------------------------------------------------------------------------
export const ANO_LEGADO = 2026;

/** Ano do lançamento (sem `ano` gravado → ANO_LEGADO). */
export function anoDoLancamento(l) {
  const a = Number(l?.ano);
  return Number.isInteger(a) && a >= 2000 && a <= 2100 ? a : ANO_LEGADO;
}

/** Número único e ordenável de uma competência (ano × 12 + mês). */
export function chaveCompetencia(ano, mes) {
  return ano * 12 + (Number(mes) || 0);
}

export function chaveDoLancamento(l) {
  return chaveCompetencia(anoDoLancamento(l), l?.mes);
}

/** O lançamento é da competência (ano, mês)? mes = null → ano inteiro. */
export function noPeriodo(l, ano, mes = null) {
  return anoDoLancamento(l) === ano && (mes == null || l?.mes === mes);
}

/** Anos para os seletores: os que têm lançamento + o ano atual, do mais recente ao mais antigo. */
export function anosDisponiveis(lancamentos = [], extras = []) {
  const anos = new Set([getCurrentCompetencia().ano, ...extras.filter(Boolean)]);
  for (const l of lancamentos) anos.add(anoDoLancamento(l));
  return [...anos].sort((a, b) => b - a);
}

/** Mês e ano de uma data com ano explícito (dd/mm/aaaa ou ISO); null se não tiver ano. */
export function competenciaComAno(data) {
  const s = String(data || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(s) && !/^\d{1,2}\/\d{1,2}\/\d{4}/.test(s)) return null;
  return parseDateToCompetencia(s);
}

export { MESES_BR };
