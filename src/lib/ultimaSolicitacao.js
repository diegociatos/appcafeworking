// Invalida respostas antigas quando a pessoa troca de data ou sai da tela.
export function ultimaSolicitacao() {
  let versao = 0;
  return {
    iniciar() { const atual = ++versao; return () => atual === versao; },
    invalidar() { versao++; },
  };
}
