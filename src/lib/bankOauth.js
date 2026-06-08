// ============================================================================
// Conexão por consentimento (OAuth authorization code) com os bancos —
// o fluxo "Conectar conta" igual ao Omie → BTG.
//
// Em produção: o botão redireciona o usuário para o consentimento do banco
// (ex.: id.btgpactual.com). O banco redireciona de volta para a Edge Function
// `bank-oauth-callback`, que troca o `code` por tokens e guarda no Vault.
//
// PRÉ-REQUISITO: o CafeWorking precisa ser cadastrado como APP PARCEIRO em cada
// banco (client_id + redirect_uri aprovados) — é assim que "Omie" aparece na
// tela de consentimento do BTG. Sem esse client_id, roda em modo demonstração.
// ============================================================================

const ENV = import.meta.env || {};
const SUPA = ENV.VITE_SUPABASE_URL || "";

// client_id de PARCEIRO do CafeWorking em cada banco (nível plataforma, não por conta).
const PARTNER = {
  btg: ENV.VITE_BTG_CLIENT_ID || "",
  inter: ENV.VITE_INTER_CLIENT_ID || "",
  itau: ENV.VITE_ITAU_CLIENT_ID || "",
  bradesco: ENV.VITE_BRADESCO_CLIENT_ID || "",
};
const AUTHORIZE = {
  btg: "https://id.btgpactual.com/authorize",
  inter: "https://conta.bancointer.com.br/oauth/authorize",
  itau: "https://sts.itau.com.br/authorize",
  bradesco: "https://openapi.bradesco.com.br/authorize",
};
const SCOPES = {
  btg: "openid boletos pix-cobranca",
  inter: "openid boleto-cobranca",
  itau: "openid boletos",
  bradesco: "openid cobranca",
};

export function oauthConfigured(banco) {
  return Boolean(PARTNER[banco] && SUPA);
}

export function authorizeUrl(banco, bankAccountId) {
  const redirectUri = `${SUPA}/functions/v1/bank-oauth-callback`;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: PARTNER[banco] || "",
    redirect_uri: redirectUri,
    scope: SCOPES[banco] || "openid",
    state: `${banco}:${bankAccountId}`,
  });
  return `${AUTHORIZE[banco]}?${params.toString()}`;
}

/** Inicia o consentimento — redireciona o navegador para o banco. */
export function conectarNoBanco(banco, bankAccountId) {
  window.location.href = authorizeUrl(banco, bankAccountId);
}
