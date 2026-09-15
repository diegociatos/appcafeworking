// ============================================================================
// Nome da unidade para o cliente: "CafeWorkingLuxemburgo" → "Luxemburgo".
// Mesma regra do site e das Edge Functions (_shared/unidadeNome.ts). Só muda a
// exibição; a chave e o nome gravado continuam os mesmos.
// ============================================================================

export function nomeExibicaoUnidade(nome) {
  const original = String(nome ?? "").trim();
  return original.replace(/^\s*cafe\s*working\s*/i, "").trim() || original;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/**
 * "Cliente desde": data completa quando o cadastro tem (AAAA-MM-DD), senão o
 * que estiver gravado (cadastros antigos têm só o ano).
 */
export function textoDesde(desde) {
  const v = String(desde ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (m) return `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}`;
  return v;
}
