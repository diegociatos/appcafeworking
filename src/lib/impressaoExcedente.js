// ============================================================================
// impressaoExcedente — apuração do excedente de impressão (espelho FRONTEND da
// regra do servidor em supabase/functions/_shared/impressao.ts). SÓ cálculo para
// EXIBIR quanto cada cliente passou da franquia — não gera cobrança (isso é a
// Fase 3, decisão humana). Franquia = folhas/mês do plano (direitos.impressaoMensal).
// Excedente custa R$ 1,50 por folha acima da franquia.
// ============================================================================

export const PRECO_FOLHA_EXCEDENTE = 1.5;

/** Folhas acima da franquia (nunca negativo). */
export function excedenteFolhas(folhasMes, franquia) {
  const total = Math.max(0, Math.floor(Number(folhasMes) || 0));
  const fr = Math.max(0, Math.floor(Number(franquia) || 0));
  return Math.max(0, total - fr);
}

/** Valor em R$ do excedente do mês. */
export function valorExcedente(folhasMes, franquia, preco = PRECO_FOLHA_EXCEDENTE) {
  return Math.round(excedenteFolhas(folhasMes, franquia) * preco * 100) / 100;
}

/** Apuração completa de uma linha: { folhas, franquia, excedente, valor }. */
export function apurarExcedente(folhasMes, franquia, preco = PRECO_FOLHA_EXCEDENTE) {
  const folhas = Math.max(0, Math.floor(Number(folhasMes) || 0));
  const fr = Math.max(0, Math.floor(Number(franquia) || 0));
  const excedente = Math.max(0, folhas - fr);
  return { folhas, franquia: fr, excedente, valor: Math.round(excedente * preco * 100) / 100 };
}
