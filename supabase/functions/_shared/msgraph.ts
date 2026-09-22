// ============================================================================
// Microsoft 365 / Graph — envio de e-mail por OAuth delegado.
//
// Mesmo desenho do ContaOne (netlify/functions/_shared/msgraph.mjs), adaptado
// ao CafeWorking:
//   • config sem segredo em public.integracoes_plataforma (tipo 'email_ms365');
//   • client secret e refresh token no Supabase Vault (RPCs upsert/read/
//     delete_email_secret, só service_role, refs "email_ms365_*");
//   • state do OAuth assinado com HMAC-SHA256 (WebCrypto) e validade de 10 min;
//   • access token renovado pelo refresh token; se a Microsoft devolver um
//     refresh token novo, ele é regravado no Vault.
//
// Envio: POST /me/sendMail com `from` = caixa "enviar como" (envia_como). A
// conta conectada precisa ter permissão "Enviar como" (Send As) nessa caixa no
// Exchange. O nome exibido ao destinatário é o nome da própria caixa no
// Exchange: o Graph ignora `from.name` diferente do cadastrado, então o nome
// ("CafeWorking", "Grupo Ciatos"...) se ajusta no Exchange, não aqui.
//
// Nunca registre em log o code, o client secret nem tokens.
// ============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const TIPO_EMAIL_MS365 = "email_ms365";
export const REF_CLIENT_SECRET = "email_ms365_client_secret";
export const REF_REFRESH_TOKEN = "email_ms365_refresh_token";
export const SCOPE = "offline_access https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read";
export const GRAPH = "https://graph.microsoft.com/v1.0";
export const STATE_VALIDADE_MS = 10 * 60 * 1000;

const authBase = (tenant: string) => `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0`;

/** Config não secreta guardada em integracoes_plataforma.config. */
export interface ConfigMs365 {
  tenant_id?: string;
  client_id?: string;
  tem_secret?: boolean;     // há client secret no Vault
  conectado?: boolean;      // há refresh token no Vault
  conta_email?: string;
  conta_nome?: string;
  conectado_em?: string | null;
  envia_como?: string;
  ativo?: boolean;          // usar a Microsoft para todos os e-mails
}

/** Acesso ao armazenamento (tabela + Vault). Abstraído para os testes. */
export interface ArmazemEmail {
  /** null = tabela ainda não existe (migration não aplicada). */
  lerConfig(): Promise<ConfigMs365 | null>;
  salvarConfig(patch: Partial<ConfigMs365>): Promise<ConfigMs365>;
  lerSegredo(ref: string): Promise<string | null>;
  gravarSegredo(ref: string, valor: string): Promise<void>;
  apagarSegredo(ref: string): Promise<void>;
}

export type FetchFn = typeof fetch;

// ---------------------------------------------------------------------------
// Armazém real (service_role)
// ---------------------------------------------------------------------------
export function armazemSupabase(admin: SupabaseClient): ArmazemEmail {
  const lerConfig = async (): Promise<ConfigMs365 | null> => {
    const { data, error } = await admin.from("integracoes_plataforma").select("config").eq("tipo", TIPO_EMAIL_MS365).maybeSingle();
    if (error) {
      // 42P01 = tabela inexistente (migration 20260922120000 não aplicada)
      if (error.code === "42P01" || /does not exist|não existe|schema cache/i.test(error.message)) return null;
      throw new Error(`Não foi possível ler a configuração de e-mail: ${error.message}`);
    }
    return (data?.config as ConfigMs365) ?? {};
  };
  return {
    lerConfig,
    async salvarConfig(patch) {
      const atual = await lerConfig();
      if (atual === null) throw new Error("Aplique a migration 20260922120000_email_microsoft antes de configurar o e-mail.");
      const config = { ...atual, ...patch };
      const { data, error } = await admin.from("integracoes_plataforma")
        .upsert({ tipo: TIPO_EMAIL_MS365, config }, { onConflict: "tipo" })
        .select("config").single();
      if (error) throw new Error(`Não foi possível salvar a configuração de e-mail: ${error.message}`);
      return data.config as ConfigMs365;
    },
    async lerSegredo(ref) {
      const { data, error } = await admin.rpc("read_email_secret", { p_ref: ref });
      if (error) throw new Error(`Vault: não foi possível ler o segredo de e-mail (${ref})`);
      return typeof data === "string" && data ? data : null;
    },
    async gravarSegredo(ref, valor) {
      const { error } = await admin.rpc("upsert_email_secret", { p_ref: ref, p_secret: valor });
      if (error) throw new Error(`Vault: não foi possível gravar o segredo de e-mail (${ref})`);
    },
    async apagarSegredo(ref) {
      const { error } = await admin.rpc("delete_email_secret", { p_ref: ref });
      if (error) throw new Error(`Vault: não foi possível apagar o segredo de e-mail (${ref})`);
    },
  };
}

// ---------------------------------------------------------------------------
// Visão pública (sem segredos) e regras de uso
// ---------------------------------------------------------------------------
export function statusPublico(cfg: ConfigMs365 | null) {
  const c = cfg ?? {};
  return {
    appConfigurado: !!(c.tenant_id && c.client_id && c.tem_secret),
    tenant_id: c.tenant_id || "",
    client_id: c.client_id || "",
    temSecret: !!c.tem_secret,
    conectado: !!c.conectado,
    conta_email: c.conta_email || "",
    conta_nome: c.conta_nome || "",
    conectado_em: c.conectado_em || "",
    envia_como: c.envia_como || "",
    ativo: !!c.ativo,
  };
}

/** Microsoft pronta para envio (app configurado + conta conectada). */
export function prontaParaEnviar(cfg: ConfigMs365 | null): boolean {
  return !!(cfg && cfg.tenant_id && cfg.client_id && cfg.tem_secret && cfg.conectado);
}

/** Microsoft escolhida como provedor de todos os e-mails. */
export function usarMicrosoft(cfg: ConfigMs365 | null): boolean {
  return prontaParaEnviar(cfg) && !!cfg?.ativo;
}

export const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TENANT_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[a-z0-9-]+(\.[a-z0-9-]+)+)$/i;

/** Valida o que vem da tela em "Salvar". */
export function validarDadosApp(b: { tenant_id?: unknown; client_id?: unknown; envia_como?: unknown }):
  { ok: true; tenant_id: string; client_id: string; envia_como: string } | { ok: false; erro: string } {
  const tenant_id = String(b.tenant_id ?? "").trim();
  const client_id = String(b.client_id ?? "").trim();
  const envia_como = String(b.envia_como ?? "").trim().toLowerCase();
  if (!TENANT_RE.test(tenant_id)) return { ok: false, erro: "Informe o Tenant ID (ID do diretório) do Azure." };
  if (!GUID_RE.test(client_id)) return { ok: false, erro: "Informe o Client ID (ID do aplicativo) do Azure." };
  if (envia_como && !EMAIL_RE.test(envia_como)) return { ok: false, erro: "O campo \"Enviar como\" precisa ser um e-mail válido." };
  return { ok: true, tenant_id, client_id, envia_como };
}

// ---------------------------------------------------------------------------
// state assinado (prova que o "conectar" partiu do admin autenticado)
// ---------------------------------------------------------------------------
const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function deB64url(s: string): Uint8Array<ArrayBuffer> {
  const p = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(p + "=".repeat((4 - (p.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Segredo do HMAC: MS_STATE_SECRET, ou derivado do SUPABASE_SERVICE_ROLE_KEY. */
export function segredoDoState(env: (k: string) => string | undefined = (k) => Deno.env.get(k)): string {
  const proprio = env("MS_STATE_SECRET");
  if (proprio) return proprio;
  const sr = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!sr) throw new Error("Sem segredo para assinar a conexão (MS_STATE_SECRET ou SUPABASE_SERVICE_ROLE_KEY).");
  return `cafeworking:email-ms365-state:${sr}`;
}

async function chaveHmac(segredo: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest("SHA-256", enc.encode(segredo));
  return crypto.subtle.importKey("raw", material, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function assinarState(dados: { u: string }, segredo: string, agora = Date.now()): Promise<string> {
  const corpo = { u: dados.u, exp: agora + STATE_VALIDADE_MS, n: crypto.randomUUID() };
  const p = b64url(enc.encode(JSON.stringify(corpo)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await chaveHmac(segredo), enc.encode(p)));
  return `${p}.${b64url(sig)}`;
}

/** Devolve { u } se a assinatura confere e não expirou; senão null. */
export async function verificarState(state: string, segredo: string, agora = Date.now()): Promise<{ u: string } | null> {
  const [p, sig, extra] = String(state || "").split(".");
  if (!p || !sig || extra !== undefined) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await chaveHmac(segredo), deB64url(sig), enc.encode(p));
    if (!ok) return null;
    const d = JSON.parse(new TextDecoder().decode(deB64url(p)));
    if (!d || typeof d.u !== "string" || typeof d.exp !== "number") return null;
    if (d.exp < agora || d.exp > agora + STATE_VALIDADE_MS + 60_000) return null;
    return { u: d.u };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------
export function redirectUriCallback(supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/email-ms365-callback`;
}

export function urlAutorizacao(cfg: ConfigMs365, redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: cfg.client_id ?? "", response_type: "code", redirect_uri: redirectUri,
    response_mode: "query", scope: SCOPE, state, prompt: "select_account",
  });
  return `${authBase(cfg.tenant_id ?? "")}/authorize?${q.toString()}`;
}

export interface TokensMs {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

/** POST no endpoint de token. Erro: "Microsoft <status>: <descrição>" (sem ecoar segredo). */
export async function trocarToken(
  cfg: ConfigMs365, clientSecret: string, params: Record<string, string>, fetchFn: FetchFn = fetch,
): Promise<TokensMs> {
  const body = new URLSearchParams({ client_id: cfg.client_id ?? "", client_secret: clientSecret, scope: SCOPE, ...params });
  const r = await fetchFn(`${authBase(cfg.tenant_id ?? "")}/token`, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body,
  });
  // deno-lint-ignore no-explicit-any
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j?.access_token) {
    const desc = String(j?.error_description || j?.error || "falha ao autenticar").split("\r\n")[0].slice(0, 300);
    throw new ErroMicrosoft(r.ok ? 502 : r.status, desc, String(j?.error || ""));
  }
  return j as TokensMs;
}

export class ErroMicrosoft extends Error {
  constructor(readonly status: number, readonly detalhe: string, readonly codigo = "") {
    super(`Microsoft ${status}: ${detalhe}`);
    this.name = "ErroMicrosoft";
  }
}

export function trocarCodigo(cfg: ConfigMs365, clientSecret: string, code: string, redirectUri: string, fetchFn: FetchFn = fetch) {
  return trocarToken(cfg, clientSecret, { grant_type: "authorization_code", code, redirect_uri: redirectUri }, fetchFn);
}

/**
 * Access token a partir do refresh token guardado. Se a Microsoft mandar um
 * refresh token novo, regrava no Vault (falha ao regravar não derruba o envio:
 * o anterior continua válido por um tempo).
 */
export async function renovarAccessToken(
  armazem: ArmazemEmail, cfg: ConfigMs365, fetchFn: FetchFn = fetch,
): Promise<{ token: string; expiraEm: number }> {
  const [refresh, secret] = await Promise.all([
    armazem.lerSegredo(REF_REFRESH_TOKEN), armazem.lerSegredo(REF_CLIENT_SECRET),
  ]);
  if (!refresh) throw new Error("Nenhuma conta Microsoft conectada. Conecte a conta em Configurações → Integrações.");
  if (!secret) throw new Error("Client Secret da Microsoft não cadastrado. Salve as credenciais em Configurações → Integrações.");
  const j = await trocarToken(cfg, secret, { grant_type: "refresh_token", refresh_token: refresh }, fetchFn);
  if (j.refresh_token && j.refresh_token !== refresh) {
    try {
      await armazem.gravarSegredo(REF_REFRESH_TOKEN, j.refresh_token);
    } catch (e) {
      console.warn("[msgraph] não regravou o refresh token novo:", (e as Error).message);
    }
  }
  const segundos = Number(j.expires_in) > 0 ? Number(j.expires_in) : 3600;
  return { token: j.access_token, expiraEm: Date.now() + segundos * 1000 };
}

// ---------------------------------------------------------------------------
// Envio
// ---------------------------------------------------------------------------
export interface EmailGraph {
  para: string | string[];
  assunto: string;
  html: string;
  replyTo?: string;
  anexos?: Array<{ nome: string; contentType: string; contentBase64: string }>;
}

/** Corpo do POST /me/sendMail. */
export function montarSendMail(e: EmailGraph, enviaComo?: string) {
  const dest = (Array.isArray(e.para) ? e.para : [e.para]).map((a) => String(a || "").trim()).filter(Boolean);
  // deno-lint-ignore no-explicit-any
  const message: Record<string, any> = {
    subject: e.assunto || "",
    body: { contentType: "HTML", content: e.html || "" },
    toRecipients: dest.map((address) => ({ emailAddress: { address } })),
  };
  if (e.replyTo) message.replyTo = [{ emailAddress: { address: e.replyTo } }];
  if (enviaComo) message.from = { emailAddress: { address: enviaComo } };
  if (e.anexos?.length) message.attachments = e.anexos.map((a) => ({
    "@odata.type": "#microsoft.graph.fileAttachment",
    name: a.nome,
    contentType: a.contentType,
    contentBytes: a.contentBase64,
  }));
  return { message, saveToSentItems: true };
}

/** POST /me/sendMail. Graph responde 202 sem corpo (não há id da mensagem). */
export async function enviarSendMail(token: string, corpo: unknown, fetchFn: FetchFn = fetch): Promise<void> {
  const r = await fetchFn(`${GRAPH}/me/sendMail`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
  if (!r.ok) {
    // deno-lint-ignore no-explicit-any
    const j: any = await r.json().catch(() => ({}));
    const msg = String(j?.error?.message || j?.error?.code || r.statusText || "falha no envio").slice(0, 300);
    throw new ErroMicrosoft(r.status, msg, String(j?.error?.code || ""));
  }
}

/** Quem conectou (para mostrar na tela). */
export async function lerMe(token: string, fetchFn: FetchFn = fetch): Promise<{ email: string; nome: string }> {
  try {
    const r = await fetchFn(`${GRAPH}/me?$select=mail,userPrincipalName,displayName`, { headers: { authorization: `Bearer ${token}` } });
    // deno-lint-ignore no-explicit-any
    const j: any = await r.json().catch(() => ({}));
    return { email: String(j?.mail || j?.userPrincipalName || "").toLowerCase(), nome: String(j?.displayName || "") };
  } catch {
    return { email: "", nome: "" };
  }
}
