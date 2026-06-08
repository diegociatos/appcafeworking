// ============================================================================
// Edge Function: bank-oauth-callback
//
// Recebe o retorno do consentimento do banco (authorization code), troca o
// `code` por tokens (access_token + refresh_token), guarda no Vault e marca a
// conta como conectada. Depois redireciona de volta para o app.
//
// O banco redireciona para:
//   https://<proj>.supabase.co/functions/v1/bank-oauth-callback?code=...&state=<banco>:<bankAccountId>
//
// PRÉ-REQUISITO: o CafeWorking precisa estar cadastrado como APP PARCEIRO em
// cada banco (client_id/secret + esta redirect_uri aprovados). É o que faz o
// "Omie" aparecer na tela de consentimento do BTG.
//
// Rodar com --no-verify-jwt (o banco não envia JWT do Supabase).
// ============================================================================

import { adminClient } from "../_shared/supabaseAdmin.ts";

const APP_URL = Deno.env.get("APP_URL") ?? "https://app.cafeworking.com.br";

// Endpoints de token (authorization_code) e credenciais de PARCEIRO por banco.
const TOKEN_URL: Record<string, string> = {
  btg: "https://id.btgpactual.com/token",
  inter: "https://cdpj.partners.bancointer.com.br/oauth/v2/token",
  itau: "https://sts.itau.com.br/api/oauth/token",
  bradesco: "https://openapi.bradesco.com.br/auth/server/v1.1/token",
};
const partnerCreds = (banco: string) => ({
  clientId: Deno.env.get(`${banco.toUpperCase()}_CLIENT_ID`) ?? "",
  clientSecret: Deno.env.get(`${banco.toUpperCase()}_CLIENT_SECRET`) ?? "",
});

function redirect(to: string) {
  return new Response(null, { status: 302, headers: { location: to } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const erro = url.searchParams.get("error");
  const [banco, bankAccountId] = state.split(":");

  if (erro) return redirect(`${APP_URL}/boletos?conexao=erro&banco=${banco}`);
  if (!code || !banco || !bankAccountId) return redirect(`${APP_URL}/boletos?conexao=invalido`);

  const tokenUrl = TOKEN_URL[banco];
  const { clientId, clientSecret } = partnerCreds(banco);
  const redirectUri = `${url.origin}/functions/v1/bank-oauth-callback`;
  if (!tokenUrl || !clientId) return redirect(`${APP_URL}/boletos?conexao=nao_configurado&banco=${banco}`);

  try {
    // 1) troca o code por tokens
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: "Basic " + btoa(`${clientId}:${clientSecret}`),
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
      }),
    });
    if (!res.ok) {
      console.error("token exchange falhou:", await res.text().catch(() => ""));
      return redirect(`${APP_URL}/boletos?conexao=erro&banco=${banco}`);
    }
    const tok = await res.json();

    const admin = adminClient();
    // 2) carrega a conta p/ saber a referência do Vault
    const { data: conta } = await admin.from("bank_accounts").select("credenciais_ref").eq("id", bankAccountId).single();
    const ref = `${conta?.credenciais_ref || `oauth_${banco}_${bankAccountId}`}`;

    // 3) guarda os tokens no Vault (cria ou atualiza o segredo)
    const segredo = JSON.stringify({
      oauth: true, access_token: tok.access_token, refresh_token: tok.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + (tok.expires_in ?? 3600), scope: tok.scope,
    });
    await admin.rpc("upsert_bank_oauth", { p_ref: ref, p_secret: segredo }).catch(async () => {
      // fallback: cria o segredo se a função não existir
      await admin.rpc("vault_create_secret_if_absent", { p_name: ref, p_secret: segredo }).catch(() => {});
    });

    // 4) marca a conta como conectada
    await admin.from("bank_accounts").update({
      conexao_status: "conectado",
      conexao: { status: "conectado", boleto: true, pix: (tok.scope || "").includes("pix"), conectadoEm: new Date().toISOString().slice(0, 10) },
    }).eq("id", bankAccountId);

    return redirect(`${APP_URL}/boletos?conexao=ok&banco=${banco}`);
  } catch (e) {
    console.error("bank-oauth-callback:", e);
    return redirect(`${APP_URL}/boletos?conexao=erro&banco=${banco}`);
  }
});
