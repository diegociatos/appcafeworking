// ============================================================================
// Nome da unidade para o cliente ler.
//
// No cadastro a unidade se chama "CafeWorkingLuxemburgo"; para o cliente basta
// "Luxemburgo". Mesma regra do site (cafeworking/assets/js/cards-plano.js) e do
// app (src/lib/unidadeNome.js). Só muda a exibição: a chave e o nome gravado
// continuam os mesmos.
// ============================================================================

export function nomeExibicaoUnidade(nome: unknown): string {
  const original = String(nome ?? "").trim();
  return original.replace(/^\s*cafe\s*working\s*/i, "").trim() || original;
}
