// ============================================================================
// Edge Function: email-ms365-callback  (retorno do OAuth da Microsoft)
//
// GET /functions/v1/email-ms365-callback?code=...&state=...
//   (PÚBLICA: deploy --no-verify-jwt — é a navegação do navegador vinda da
//    Microsoft, sem JWT do Supabase)
//
// A autenticidade vem do `state` assinado (HMAC-SHA256, 10 min) gerado pela
// email-ms365 (acao url_conexao), que já exige o admin da plataforma logado.
// Aqui ainda se confere que o usuário do state continua em platform_admins.
//
// Troca o code por tokens, lê /me (quem conectou), guarda o refresh token no
// Vault e conta_email/conta_nome/conectado_em na config. Responde uma página
// simples com link de volta para Configurações.
//
// Nunca registra em log o code nem tokens.
// ============================================================================

import { adminClient } from "../_shared/supabaseAdmin.ts";
import { registrarAuditoria } from "../_shared/audit.ts";
import { limparCacheEmail } from "../_shared/notify/index.ts";
import {
  armazemSupabase, lerMe, REF_CLIENT_SECRET, REF_REFRESH_TOKEN, redirectUriCallback,
  segredoDoState, trocarCodigo, verificarState,
} from "../_shared/msgraph.ts";

const APP_URL = (Deno.env.get("APP_URL") ?? "https://app.cafeworking.com.br").replace(/\/+$/, "");
const VOLTAR = `${APP_URL}/?p=config`;

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function pagina(ok: boolean, mensagem: string): Response {
  const cor = ok ? "#3D7A5A" : "#A8552E";
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CafeWorking · Microsoft 365</title>
<style>body{margin:0;background:#F7F4EE;font-family:Georgia,'Times New Roman',serif;color:#1F1F1C;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}
.card{background:#fff;border:1px solid rgba(31,31,28,.1);border-radius:16px;max-width:460px;padding:32px;text-align:center}
h1{font-size:20px;margin:0 0 8px;color:${cor}}p{color:#6B6560;font-size:15px;line-height:1.5;margin:0 0 20px;font-family:system-ui,Segoe UI,Arial,sans-serif}
a{display:inline-block;background:#6E4E3B;color:#fff;text-decoration:none;font-family:system-ui,Segoe UI,Arial,sans-serif;font-weight:600;padding:11px 18px;border-radius:11px}</style></head>
<body><div class="card"><h1>${ok ? "Conta Microsoft conectada" : "Não foi possível conectar"}</h1><p>${esc(mensagem)}</p>
<a href="${esc(VOLTAR)}">Voltar para Configurações</a></div></body></html>`;
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "GET") return new Response("Método não permitido", { status: 405 });
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const erroMs = url.searchParams.get("error_description") || url.searchParams.get("error");

  if (erroMs) return pagina(false, `A Microsoft recusou a conexão: ${String(erroMs).split("\r\n")[0].slice(0, 300)}`);
  if (!code || !state) return pagina(false, "Retorno inválido da Microsoft. Tente conectar de novo.");

  let segredo: string;
  try {
    segredo = segredoDoState();
  } catch {
    return pagina(false, "Configuração do servidor incompleta. Avise o suporte.");
  }
  const dados = await verificarState(state, segredo);
  if (!dados) return pagina(false, "O link de conexão expirou ou é inválido. Volte ao CafeWorking e clique em Conectar de novo.");

  try {
    const admin = adminClient();
    const { data: pa } = await admin.from("platform_admins").select("user_id").eq("user_id", dados.u).maybeSingle();
    if (!pa) return pagina(false, "Só o administrador da plataforma pode conectar a conta de e-mail.");

    const armazem = armazemSupabase(admin);
    const cfg = await armazem.lerConfig();
    if (!cfg || !(cfg.tenant_id && cfg.client_id && cfg.tem_secret)) {
      return pagina(false, "As credenciais do aplicativo não estão salvas. Salve Tenant ID, Client ID e Client Secret e tente de novo.");
    }
    const secret = await armazem.lerSegredo(REF_CLIENT_SECRET);
    if (!secret) return pagina(false, "Client Secret não encontrado. Salve as credenciais de novo e tente outra vez.");

    const tok = await trocarCodigo(cfg, secret, code, redirectUriCallback());
    if (!tok.refresh_token) {
      return pagina(false, "A Microsoft não devolveu o token de renovação. Confira a permissão offline_access no aplicativo do Azure.");
    }
    const me = await lerMe(tok.access_token);

    await armazem.gravarSegredo(REF_REFRESH_TOKEN, tok.refresh_token);
    await armazem.salvarConfig({
      conectado: true, conta_email: me.email, conta_nome: me.nome, conectado_em: new Date().toISOString(),
    });
    limparCacheEmail();
    await registrarAuditoria(admin, {
      unidade_id: null, ator_id: dados.u, acao: "email_ms365.conectado",
      entidade: "integracao", entidade_id: "email_ms365", detalhe: { conta_email: me.email || null },
      ip: req.headers.get("x-forwarded-for")?.split(",")[0].trim() || null,
    });

    const aviso = cfg.ativo ? "" : " Envie um e-mail de teste e ligue \"Usar Microsoft 365 para todos os e-mails\".";
    return pagina(true, `Conta conectada${me.email ? `: ${me.email}` : ""}.${aviso}`);
  } catch (e) {
    // A mensagem de erro da Microsoft/Vault não contém code nem tokens.
    const msg = (e as Error)?.message ?? "erro desconhecido";
    console.error("[email-ms365-callback]", msg);
    return pagina(false, `Erro ao concluir a conexão. ${msg.slice(0, 300)}`);
  }
});
