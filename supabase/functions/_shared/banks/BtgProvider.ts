// ============================================================================
// BtgProvider — BTG · API de Cobrança (Corporate / Banking-as-a-Service)
//
// Autenticação: OAuth2 client_credentials (NÃO usa mTLS — só client_id/secret).
// Webhook é registrável via API (subscriptions).
//
// ⚠️ Confirme base/paths no seu contrato BTG (a BAAS tem variações por produto).
//
// Docs: https://developer.btgpactual.com/
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
  prod: "https://api.btgpactual.com",
  sandbox: "https://api.sandbox.btgpactual.com",
};
const TOKEN_PATH = "/oauth/token";
const BOLETO_PATH = "/billing/v1/bankslips";

interface TokenCache { accessToken: string; expiresAt: number; }

export class BtgProvider implements BankProvider {
  readonly banco = "btg" as const;

  private readonly base: string;
  private token: TokenCache | null = null;

  constructor(
    private readonly account: BankAccount,
    private readonly creds: BankCredentials,
  ) {
    this.base = BASE_URL[account.ambiente] ?? BASE_URL.sandbox;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 30_000) return this.token.accessToken;
    const basic = btoa(`${this.creds.client_id}:${this.creds.client_secret}`);

    // (1) Modelo de CONSENTIMENTO (authorization_code): a conta foi conectada
    // via bank-oauth-callback e os tokens estão no Vault. Usa o access_token e
    // renova com o refresh_token quando expira.
    const accessVault = this.creds.access_token as string | undefined;
    const refresh = this.creds.refresh_token as string | undefined;
    const expVault = this.creds.expires_at ? Number(this.creds.expires_at) * 1000 : 0;
    if (accessVault && expVault > Date.now() + 30_000) {
      this.token = { accessToken: accessVault, expiresAt: expVault };
      return accessVault;
    }
    if (refresh) {
      const r = await fetch(`${this.base}${TOKEN_PATH}`, {
        method: "POST",
        headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh }),
      });
      if (r.ok) {
        const j = await r.json();
        this.token = { accessToken: j.access_token, expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000 };
        return j.access_token;
      }
      // refresh falhou → tenta client_credentials abaixo
    }

    // (2) Fallback: client_credentials (credencial direta, sem consentimento).
    const res = await fetch(`${this.base}${TOKEN_PATH}`, {
      method: "POST",
      headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", scope: "billing" }),
    });
    if (!res.ok) throw new BankError("Falha no OAuth do BTG", "btg", res.status, await safeText(res));
    const json = await res.json();
    this.token = { accessToken: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
    return this.token.accessToken;
  }

  private async api<T>(method: string, path: string, payload?: unknown): Promise<T> {
    const token = await this.accessToken();
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      "x-idempotency-key": crypto.randomUUID(),
    };
    if (payload !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers,
      body: payload !== undefined ? JSON.stringify(payload) : undefined,
    });
    if (!res.ok) {
      throw new BankError(`BTG ${method} ${path} → ${res.status}`, "btg", res.status, await safeText(res));
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  async emitirBoleto(input: EmitirBoletoInput): Promise<EmitirBoletoResult> {
    const doc = onlyDigits(input.pagador.documento);
    const payload = {
      externalId: input.seuNumero,
      amount: round2(input.valor),
      dueDate: input.vencimento, // YYYY-MM-DD
      payer: {
        name: input.pagador.nome,
        document: doc,
        documentType: doc.length > 11 ? "CNPJ" : "CPF",
        email: input.pagador.email,
        address: {
          street: input.pagador.logradouro ?? "Não informado",
          neighborhood: input.pagador.bairro ?? "Centro",
          city: input.pagador.cidade ?? "Belo Horizonte",
          state: input.pagador.uf ?? "MG",
          zipCode: onlyDigits(input.pagador.cep ?? "30000000"),
        },
      },
      instructions: input.instrucoes ? [input.instrucoes.slice(0, 80)] : undefined,
      fine: input.multaPercent ? { type: "PERCENTAGE", value: input.multaPercent } : undefined,
      interest: input.moraPercent ? { type: "MONTHLY_PERCENTAGE", value: input.moraPercent } : undefined,
      discount: input.descontoValor ? { type: "FIXED", value: input.descontoValor } : undefined,
      pix: { enabled: true }, // BTG entrega boleto híbrido com PIX quando habilitado
    };
    const r = await this.api<BtgBoleto>("POST", BOLETO_PATH, payload);
    return {
      bancoBoletoId: String(r.id ?? r.bankSlipId ?? ""),
      nossoNumero: r.ourNumber,
      linhaDigitavel: r.digitableLine,
      codigoBarras: r.barcode,
      pixCopiaCola: r.pix?.emv ?? r.pix?.copyPaste,
      pixTxid: r.pix?.txid,
      status: r.digitableLine ? "registrado" : "emitido",
      raw: r,
    };
  }

  async consultarBoleto(bancoBoletoId: string): Promise<ConsultaResult> {
    const r = await this.api<BtgBoleto>("GET", `${BOLETO_PATH}/${bancoBoletoId}`);
    return {
      bancoBoletoId,
      status: mapStatusBtg(r.status, !!r.digitableLine),
      nossoNumero: r.ourNumber,
      linhaDigitavel: r.digitableLine,
      codigoBarras: r.barcode,
      pixCopiaCola: r.pix?.emv ?? r.pix?.copyPaste,
      pagoEm: r.paidAt ?? null,
      raw: r,
    };
  }

  async cancelarBoleto(bancoBoletoId: string, _motivo?: string): Promise<CancelarResult> {
    await this.api("POST", `${BOLETO_PATH}/${bancoBoletoId}/cancel`, {});
    return { bancoBoletoId, status: "cancelado" };
  }

  async registrarWebhook(callbackUrl: string): Promise<void> {
    // BTG registra a URL de notificação via subscriptions.
    await this.api("POST", "/billing/v1/webhooks", {
      url: callbackUrl,
      events: ["bankslip.paid", "bankslip.canceled", "bankslip.expired"],
    });
  }

  parseWebhook(req: Request): Promise<WebhookEvento[]> {
    return BtgProvider.parseWebhook(req);
  }

  static async parseWebhook(req: Request): Promise<WebhookEvento[]> {
    const body = await req.json();
    const itens: BtgEvent[] = Array.isArray(body) ? body : [body];
    return itens.map((c) => {
      const slip = c.data ?? c;
      return {
        banco: "btg" as const,
        bancoBoletoId: String(slip.id ?? slip.bankSlipId ?? ""),
        nossoNumero: slip.ourNumber,
        seuNumero: slip.externalId,
        status: mapEventBtg(c.event ?? slip.status),
        valorPago: slip.paidAmount ? Number(slip.paidAmount) : undefined,
        pagoEm: slip.paidAt ?? null,
        raw: c,
      };
    });
  }
}

// --- helpers ----------------------------------------------------------------
interface BtgBoleto {
  id?: string; bankSlipId?: string; ourNumber?: string; status?: string;
  digitableLine?: string; barcode?: string; paidAt?: string;
  pix?: { emv?: string; copyPaste?: string; txid?: string };
}
interface BtgEvent { event?: string; data?: any; [k: string]: any; }

function mapStatusBtg(s: string | undefined, temLinha: boolean): ConsultaResult["status"] {
  switch ((s ?? "").toUpperCase()) {
    case "PAID": case "SETTLED": return "pago";
    case "CANCELED": case "CANCELLED": return "cancelado";
    case "EXPIRED": case "OVERDUE": return "vencido";
    case "REGISTERED": case "ISSUED": return "registrado";
    default: return temLinha ? "registrado" : "emitido";
  }
}
function mapEventBtg(ev: string | undefined): WebhookEvento["status"] {
  const e = (ev ?? "").toLowerCase();
  if (e.includes("paid") || e.includes("settled")) return "pago";
  if (e.includes("cancel")) return "cancelado";
  if (e.includes("expired") || e.includes("overdue")) return "vencido";
  return "registrado";
}
async function safeText(res: Response): Promise<string> { try { return await res.text(); } catch { return ""; } }
const onlyDigits = (s: string) => (s ?? "").replace(/\D/g, "");
const round2 = (n: number) => Math.round(n * 100) / 100;
