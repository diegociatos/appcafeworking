// ============================================================================
// Edge Function: email-ms365  (admin da plataforma · Configurações → Integrações)
//
// POST /functions/v1/email-ms365   (JWT do admin; deploy --no-verify-jwt)
//
//   { acao: "status" }                                   → { pendente, redirectUri, email, adminEmail }
//   { acao: "salvar", tenant_id, client_id, client_secret?, envia_como? } → { ok, email, desconectou? }
//       client_secret em branco mantém o atual. Trocar tenant/client desconecta
//       a conta (o refresh token pertence ao app antigo).
//   { acao: "url_conexao" }                              → { url }
//       URL de autorização da Microsoft com state assinado (user id, 10 min).
//   { acao: "testar", para? }                            → { ok, remetente, para }
//       e-mail de teste pela Microsoft (mesmo antes de ativar).
//   { acao: "desconectar" }                              → { ok, email }
//   { acao: "ativar" } / { acao: "desativar" }           → { ok, email }
//
// Só o ADMIN DA PLATAFORMA (platform_admins). Segredos (client secret, refresh
// token) vão para o Vault e nunca voltam para a tela. Tudo auditado.
// Lógica compartilhada em ../_shared/msgraph.ts (mesmo desenho do ContaOne).
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { usuarioDoReq } from "../_shared/assinaturas.ts";
import { ipDaReq, registrarAuditoria } from "../_shared/audit.ts";
import { limparCacheEmail } from "../_shared/notify/index.ts";
import { MicrosoftGraphEmailProvider } from "../_shared/notify/MicrosoftGraphEmailProvider.ts";
import {
  armazemSupabase, assinarState, EMAIL_RE, prontaParaEnviar, REF_CLIENT_SECRET, REF_REFRESH_TOKEN,
  redirectUriCallback, segredoDoState, statusPublico, urlAutorizacao, validarDadosApp,
} from "../_shared/msgraph.ts";

const MIGRATION = "20260922120000_email_microsoft";

const HTML_TESTE = `<!doctype html><html><body style="margin:0;background:#F7F4EE;font-family:Georgia,'Times New Roman',serif;color:#1F1F1C">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;border:1px solid rgba(0,0,0,.06)">
<tr><td style="background:#6E4E3B;padding:18px 28px;color:#fff;font-size:18px;font-weight:bold;border-radius:16px 16px 0 0">CafeWorking</td></tr>
<tr><td style="padding:28px;font-size:15px;line-height:1.6;color:#3D3A35">
<h1 style="font-size:20px;margin:0 0 12px;color:#1F1F1C">Funcionou</h1>
Este é um e-mail de teste enviado pelo CafeWorking pela Microsoft 365.<br><br>
Se ele chegou na caixa de entrada (e não no spam), a integração está correta.
</td></tr></table></td></tr></table></body></html>`;

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405, req);

  try {
    const usuario = await usuarioDoReq(req);
    if (!usuario) return json({ error: "Sua sessão expirou. Entre de novo." }, 401, req);
    const admin = adminClient();
    const { data: pa } = await admin.from("platform_admins").select("user_id").eq("user_id", usuario.id).maybeSingle();
    if (!pa) return json({ error: "Só o administrador da plataforma pode configurar o e-mail." }, 403, req);

    const body = await req.json().catch(() => ({}));
    const acao = String(body?.acao || "status");
    const armazem = armazemSupabase(admin);
    const redirectUri = redirectUriCallback();
    const cfg = await armazem.lerConfig();

    const auditar = (acaoLog: string, detalhe: Record<string, unknown> = {}) => registrarAuditoria(admin, {
      unidade_id: null, ator_id: usuario.id, ator_email: usuario.email,
      acao: acaoLog, entidade: "integracao", entidade_id: "email_ms365", detalhe, ip: ipDaReq(req),
    });

    if (acao === "status") {
      return json({ pendente: cfg === null, redirectUri, email: statusPublico(cfg), adminEmail: usuario.email }, 200, req);
    }
    if (cfg === null) return json({ error: `Aplique a migration ${MIGRATION} para usar o e-mail pela Microsoft.` }, 400, req);

    // ---- salvar credenciais do app + caixa "enviar como" ----------------------
    if (acao === "salvar") {
      const v = validarDadosApp(body ?? {});
      if (!v.ok) return json({ error: v.erro }, 400, req);
      const secret = String(body?.client_secret ?? "").trim();
      if (!secret && !cfg.tem_secret) return json({ error: "Informe o Client Secret do aplicativo." }, 400, req);

      const trocouApp = !!cfg.conectado && (cfg.tenant_id !== v.tenant_id || cfg.client_id !== v.client_id);
      if (secret) await armazem.gravarSegredo(REF_CLIENT_SECRET, secret);
      const patch: Record<string, unknown> = {
        tenant_id: v.tenant_id, client_id: v.client_id, envia_como: v.envia_como, tem_secret: true,
      };
      if (trocouApp) {
        await armazem.apagarSegredo(REF_REFRESH_TOKEN);
        Object.assign(patch, { conectado: false, conta_email: "", conta_nome: "", conectado_em: null, ativo: false });
      }
      const config = await armazem.salvarConfig(patch);
      limparCacheEmail();
      await auditar("email_ms365.salvar", {
        tenant_id: v.tenant_id, client_id: v.client_id, envia_como: v.envia_como,
        trocou_secret: !!secret, desconectou: trocouApp,
      });
      return json({ ok: true, email: statusPublico(config), desconectou: trocouApp }, 200, req);
    }

    // ---- URL de autorização (abre a tela da Microsoft) ------------------------
    if (acao === "url_conexao") {
      if (!(cfg.tenant_id && cfg.client_id && cfg.tem_secret)) {
        return json({ error: "Salve Tenant ID, Client ID e Client Secret antes de conectar a conta." }, 400, req);
      }
      const state = await assinarState({ u: usuario.id }, segredoDoState());
      await auditar("email_ms365.conexao_iniciada");
      return json({ url: urlAutorizacao(cfg, redirectUri, state) }, 200, req);
    }

    // ---- e-mail de teste --------------------------------------------------------
    if (acao === "testar") {
      if (!prontaParaEnviar(cfg)) return json({ error: "Conecte a conta Microsoft antes de testar." }, 400, req);
      const para = String(body?.para || usuario.email || "").trim().toLowerCase();
      if (!EMAIL_RE.test(para)) return json({ error: "Informe um e-mail válido para o teste." }, 400, req);
      const provider = new MicrosoftGraphEmailProvider(armazem, cfg);
      const r = await provider.enviar({ para, assunto: "CafeWorking · teste de envio (Microsoft 365)", html: HTML_TESTE });
      await auditar("email_ms365.teste", { para, ok: r.ok, erro: r.ok ? null : r.erro });
      if (!r.ok) return json({ error: r.erro }, 502, req);
      return json({ ok: true, remetente: provider.remetente, para }, 200, req);
    }

    // ---- desconectar --------------------------------------------------------------
    if (acao === "desconectar") {
      await armazem.apagarSegredo(REF_REFRESH_TOKEN);
      const config = await armazem.salvarConfig({ conectado: false, conta_email: "", conta_nome: "", conectado_em: null, ativo: false });
      limparCacheEmail();
      await auditar("email_ms365.desconectar", { conta_email: cfg.conta_email || null });
      return json({ ok: true, email: statusPublico(config) }, 200, req);
    }

    // ---- ligar/desligar o uso da Microsoft como provedor ------------------------
    if (acao === "ativar" || acao === "desativar") {
      const ativo = acao === "ativar";
      if (ativo && !prontaParaEnviar(cfg)) {
        return json({ error: "Conecte a conta Microsoft (e envie um teste) antes de ativar." }, 400, req);
      }
      const config = await armazem.salvarConfig({ ativo });
      limparCacheEmail();
      await auditar(ativo ? "email_ms365.ativar" : "email_ms365.desativar");
      return json({ ok: true, email: statusPublico(config) }, 200, req);
    }

    return json({ error: "Ação inválida." }, 400, req);
  } catch (e) {
    console.error("[email-ms365]", (e as Error)?.message ?? e);
    return json({ error: "Não foi possível concluir. Tente de novo." }, 500, req);
  }
});
