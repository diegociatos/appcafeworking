// ============================================================================
// Mensagens de erro para quem usa o app — nunca o texto cru do servidor.
//
// As Edge Functions já devolvem frases prontas no campo `error`; aqui cuidamos
// do que não vem pronto (queda de rede, sessão vencida, erro 500 genérico,
// resposta do Storage/PostgREST) e mandamos o detalhe técnico só ao console.
// ============================================================================

export const MSG = {
  semConexao: "Sem conexão com o servidor. Confira a internet e tente de novo.",
  sessao: "Sua sessão expirou. Entre de novo.",
  demo: "Esta tela usa os dados reais da sua conta e não funciona na demonstração.",
  generico: "Não foi possível concluir agora. Tente de novo em instantes.",
  permissao: "Você não tem acesso a esta informação.",
  naoEncontrado: "Não encontramos o que você procurou.",
  arquivoGrande: "Arquivo acima do tamanho permitido.",
  tipoArquivo: "Tipo de arquivo não aceito. Envie PDF, JPG ou PNG.",
};

// Frase de servidor que parece técnica (inglês, códigos, SQL) não vai para a tela.
const TECNICO = /(violates|constraint|duplicate key|syntax|postgres|jwt|token|fetch|undefined|null|exception|stack|\bTypeError\b|\bError:|status code|[a-z_]+\.[a-z_]+\(|Resend \d|Falha \()/i;

/** Monta um Error com mensagem humana a partir da resposta HTTP. */
export function erroDaResposta(status, data, contexto = "") {
  const doServidor = typeof data?.error === "string" ? data.error.trim() : "";
  if (doServidor || data?.message) console.warn(`[${contexto || "api"}] ${status}`, data);
  let msg;
  if (status === 401) msg = MSG.sessao;
  else if (doServidor && !TECNICO.test(doServidor)) msg = doServidor;
  else if (status === 403) msg = MSG.permissao;
  else if (status === 404) msg = MSG.naoEncontrado;
  else if (status === 413) msg = MSG.arquivoGrande;
  else if (status === 415) msg = MSG.tipoArquivo;
  else msg = MSG.generico;
  const erro = new Error(msg);
  erro.status = status;
  erro.codigo = data?.codigo;
  return erro;
}

/** Erro de rede (fetch lançou) → mensagem humana. */
export function erroDeRede(e, contexto = "") {
  console.warn(`[${contexto || "api"}] rede`, e);
  const erro = new Error(MSG.semConexao);
  erro.status = 0;
  return erro;
}

/** Texto para a tela a partir de qualquer erro (garante que nada técnico passa). */
export function mensagemDe(e, padrao = MSG.generico) {
  const m = typeof e?.message === "string" ? e.message : "";
  return m && !TECNICO.test(m) ? m : padrao;
}
