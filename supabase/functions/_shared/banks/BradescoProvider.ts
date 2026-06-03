// ============================================================================
// BradescoProvider — Bradesco · API de Cobrança Registrada
//
// Autenticação: mTLS + OAuth2 com CLIENT ASSERTION (JWT assinado em RS256 com
// a chave privada do certificado). O token é trocado pelo assertion.
//
// A chave (key_pem) deve estar em PKCS#8 ("-----BEGIN PRIVATE KEY-----").
//
// ⚠️ Os paths/campos de cobrança seguem o padrão documentado do Bradesco;
// confirme a versão da sua API no portal (há variações de envelope).
//
// Docs: https://developers.bradesco.com.br/
// ============================================================================

import type { BankProvider } from "./BankProvider.ts";
import {
  type BankAccount,
  type BankCredentials,
  BankError,
  type CancelarResult,
  type ConsultaResult,
  type EmitirBoletoInput,
  type EmitirBoletoResult,
  type WebhookEvento,
} from "./types.ts";

const BASE_URL: Record<string, string> = {
  prod: "https://openapi.bradesco.com.br",
  sandbox: "https://proxy.api.prebanco.com.br", // homologação
};
const TOKEN_PATH = "/auth/server/v1.1/token";
const BOLETO_PATH = "/v1/cobranca-registrada/boletos";

interface TokenCache { accessToken: string; expiresAt: number; }

export class BradescoProvider implements BankProvider {
  readonly banco = "bradesco" as const;

  private readonly base: string;
  private httpClient: Deno.HttpClient | null = null;
  private token: TokenCache | null = null;

  constructor(
    private readonly account: BankAccount,
    private readonly creds: BankCredentials,
  ) {
    this.base = BASE_URL[account.ambiente] ?? BASE_URL.sandbox;
    if (!creds.cert_pem || !creds.key_pem) {
      throw new BankError("Bradesco exige certificado mTLS (cert_pem/key_pem)", "bradesco");
    }
  }

  private client(): Deno.HttpClient {
    if (!this.httpClient) {
      this.httpClient = Deno.createHttpClient({ cert: this.creds.cert_pem, key: this.creds.key_pem });
    }
    return this.httpClient;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 30_000) return this.token.accessToken;

    const now = Math.floor(Date.now() / 1000);
    const assertion = await signJwt(
      { iss: this.creds.client_id, sub: this.creds.client_id, aud: `${this.base}${TOKEN_PATH}`, iat: now, exp: now + 3600, jti: crypto.randomUUID() },
      this.creds.key_pem!,
    );
    const body = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: assertion,
    });
    const res = await fetch(`${this.base}${TOKEN_PATH}`, {
      method: "POST",
      client: this.client(),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new BankError("Falha no OAuth do Bradesco", "bradesco", res.status, await safeText(res));
    const json = await res.json();
    this.token = { accessToken: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
    return this.token.accessToken;
  }

  private async api<T>(method: string, path: string, payload?: unknown): Promise<T> {
    const token = await this.accessToken();
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
      accept: "application/json",
    };
    if (payload !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(`${this.base}${path}`, {
      method, client: this.client(), headers,
      body: payload !== undefined ? JSON.stringify(payload) : undefined,
    });
    if (!res.ok) throw new BankError(`Bradesco ${method} ${path} → ${res.status}`, "bradesco", res.status, await safeText(res));
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  async emitirBoleto(input: EmitirBoletoInput): Promise<EmitirBoletoResult> {
    const doc = onlyDigits(input.pagador.documento);
    const payload = {
      cdBanco: 237,
      cdAgencia: onlyDigits(this.account.agencia ?? ""),
      cdConta: onlyDigits(this.account.conta ?? ""),
      cdCarteira: this.account.carteira ?? "09",
      nuTitulo: input.seuNumero,
      vlNominalTitulo: centavos(input.valor),
      dtVencimentoTitulo: input.vencimento, // YYYY-MM-DD
      cdEspecieTitulo: "02",
      pagador: {
        nuCpfCnpj: doc,
        tpPessoa: doc.length > 11 ? "J" : "F",
        nome: input.pagador.nome,
        logradouro: input.pagador.logradouro ?? "Não informado",
        bairro: input.pagador.bairro ?? "Centro",
        cidade: input.pagador.cidade ?? "Belo Horizonte",
        uf: input.pagador.uf ?? "MG",
        cep: onlyDigits(input.pagador.cep ?? "30000000"),
      },
      ...(input.instrucoes ? { mensagem: input.instrucoes.slice(0, 80) } : {}),
      ...(input.multaPercent ? { percentualMulta: input.multaPercent } : {}),
      ...(input.moraPercent ? { percentualJuros: input.moraPercent } : {}),
    };
    const r = await this.api<BradescoBoleto>("POST", BOLETO_PATH, payload);
    return {
      bancoBoletoId: String(r.nuTituloGerado ?? r.idBoleto ?? input.seuNumero),
      nossoNumero: r.nossoNumero ?? r.nuNossoNumero,
      linhaDigitavel: r.linhaDigitavel ?? r.cdLinhaDigitavel,
      codigoBarras: r.codigoBarras ?? r.cdBarras,
      status: (r.linhaDigitavel ?? r.cdLinhaDigitavel) ? "registrado" : "emitido",
      raw: r,
    };
  }

  async consultarBoleto(bancoBoletoId: string): Promise<ConsultaResult> {
    const r = await this.api<BradescoBoleto>("GET", `${BOLETO_PATH}/${bancoBoletoId}`);
    return {
      bancoBoletoId,
      status: mapStatusBradesco(r.situacao ?? r.cdSituacao, !!(r.linhaDigitavel ?? r.cdLinhaDigitavel)),
      nossoNumero: r.nossoNumero ?? r.nuNossoNumero,
      linhaDigitavel: r.linhaDigitavel ?? r.cdLinhaDigitavel,
      codigoBarras: r.codigoBarras ?? r.cdBarras,
      pagoEm: r.dtPagamento ?? null,
      raw: r,
    };
  }

  async cancelarBoleto(bancoBoletoId: string, _motivo?: string): Promise<CancelarResult> {
    // Baixa do título registrado.
    await this.api("POST", `${BOLETO_PATH}/${bancoBoletoId}/baixa`, { cdMotivoBaixa: "1" });
    return { bancoBoletoId, status: "cancelado" };
  }

  // Bradesco: notificação de liquidação configurada no portal.
  registrarWebhook(_callbackUrl: string): Promise<void> {
    return Promise.resolve();
  }

  parseWebhook(req: Request): Promise<WebhookEvento[]> {
    return BradescoProvider.parseWebhook(req);
  }

  static async parseWebhook(req: Request): Promise<WebhookEvento[]> {
    const body = await req.json();
    const itens: BradescoBoleto[] = Array.isArray(body) ? body : (body?.boletos ?? [body]);
    return itens.map((c) => ({
      banco: "bradesco" as const,
      bancoBoletoId: String(c.nuTituloGerado ?? c.idBoleto ?? c.nuTitulo ?? ""),
      nossoNumero: c.nossoNumero ?? c.nuNossoNumero,
      seuNumero: c.nuTitulo,
      status: mapWebhookBradesco(c.situacao ?? c.cdSituacao),
      valorPago: c.vlPago ? Number(c.vlPago) / 100 : undefined,
      pagoEm: c.dtPagamento ?? null,
      raw: c,
    }));
  }
}

// --- JWT (RS256) assinatura do client assertion -----------------------------
async function signJwt(claims: Record<string, unknown>, keyPem: string): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" };
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8", pemToDer(keyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, key, new TextEncoder().encode(data));
  return `${data}.${b64urlBytes(new Uint8Array(sig))}`;
}
function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}
function b64url(s: string): string { return b64urlBytes(new TextEncoder().encode(s)); }
function b64urlBytes(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// --- helpers ----------------------------------------------------------------
interface BradescoBoleto {
  nuTituloGerado?: string; idBoleto?: string; nuTitulo?: string;
  nossoNumero?: string; nuNossoNumero?: string;
  linhaDigitavel?: string; cdLinhaDigitavel?: string;
  codigoBarras?: string; cdBarras?: string;
  situacao?: string; cdSituacao?: string; dtPagamento?: string; vlPago?: string | number;
}
function mapStatusBradesco(s: string | undefined, temLinha: boolean): ConsultaResult["status"] {
  switch ((s ?? "").toUpperCase()) {
    case "LIQUIDADO": case "PAGO": case "BAIXADO_LIQUIDACAO": return "pago";
    case "BAIXADO": case "CANCELADO": return "cancelado";
    case "VENCIDO": case "EXPIRADO": return "vencido";
    case "REGISTRADO": case "ABERTO": return "registrado";
    default: return temLinha ? "registrado" : "emitido";
  }
}
function mapWebhookBradesco(s: string | undefined): WebhookEvento["status"] {
  const r = mapStatusBradesco(s, true);
  return r === "pago" || r === "cancelado" || r === "vencido" ? r : "registrado";
}
async function safeText(res: Response): Promise<string> { try { return await res.text(); } catch { return ""; } }
const onlyDigits = (s: string) => (s ?? "").replace(/\D/g, "");
const centavos = (n: number) => Math.round(n * 100);
