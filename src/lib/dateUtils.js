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

export { MESES_BR };
