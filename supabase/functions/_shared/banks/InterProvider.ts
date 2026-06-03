// ============================================================================
// InterProvider — Banco Inter · API "Cobrança v3"  (IMPLEMENTAÇÃO DE REFERÊNCIA)
//
// Autenticação: OAuth2 client_credentials + certificado mTLS (.crt/.key em PEM).
// Particularidade: o Inter retorna o PIX integrado ao boleto (boleto híbrido).
//
// Docs: https://developers.bancointer.com.br/  (Cobrança v3)
// Endpoints relativos à base por ambiente:
//   POST   /oauth/v2/token
//   POST   /cobranca/v3/cobrancas
//   GET    /cobranca/v3/cobrancas/{codigoSolicitacao}
//   GET    /cobranca/v3/cobrancas/{codigoSolicitacao}/pdf
//   POST   /cobranca/v3/cobrancas/{codigoSolicitacao}/cancelamento
//   PUT    /cobranca/v3/cobrancas/webhook
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
  prod: "https://cdpj.partners.bancointer.com.br",
  // Ambiente de homologação do Inter (ajuste conforme seu cadastro no portal).
  sandbox: "https://cdpj-sandbox.partners.uatinter.co",
};

const SCOPES = [
  "boleto-cobranca.read",
  "boleto-cobranca.write",
  "webhook-banking.read",
  "webhook-banking.write",
].join(" ");

interface TokenCache {
  accessToken: string;
  expiresAt: number; // epoch ms
}

export class InterProvider implements BankProvider {
  readonly banco = "inter" as const;

  private readonly base: string;
  private readonly contaCorrente?: string;
  private httpClient: Deno.HttpClient | null = null;
  private token: TokenCache | null = null;

  constructor(
    private readonly account: BankAccount,
    private readonly creds: BankCredentials,
  ) {
    this.base = BASE_URL[account.ambiente] ?? BASE_URL.sandbox;
    this.contaCorrente = (creds.conta_corrente as string) || account.conta || undefined;
    if (!creds.cert_pem || !creds.key_pem) {
      throw new BankError("Inter exige certificado mTLS (cert_pem/key_pem)", "inter");
    }
  }

  // --- infra mTLS ---------------------------------------------------------
  private client(): Deno.HttpClient {
    // Cliente HTTP com certificado de cliente (mTLS). Deno o reaproveita.
    if (!this.httpClient) {
      this.httpClient = Deno.createHttpClient({
        cert: this.creds.cert_pem,
        key: this.creds.key_pem,
      });
    }
    return this.httpClient;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 30_000) {
      return this.token.accessToken;
    }
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.creds.client_id,
      client_secret: this.creds.client_secret,
      scope: SCOPES,
    });
    const res = await fetch(`${this.base}/oauth/v2/token`, {
      method: "POST",
      client: this.client(),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      throw new BankError("Falha no OAuth do Inter", "inter", res.status, await safeText(res));
    }
    const json = await res.json();
    this.token = {
      accessToken: json.access_token,
      expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    };
    return this.token.accessToken;
  }

  private async api<T>(
    method: string,
    path: string,
    payload?: unknown,
    accept = "application/json",
  ): Promise<T> {
    const token = await this.accessToken();
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
      accept,
    };
    if (payload !== undefined) headers["content-type"] = "application/json";
    if (this.contaCorrente) headers["x-conta-corrente"] = this.contaCorrente;

    const res = await fetch(`${this.base}${path}`, {
      method,
      client: this.client(),
      headers,
      body: payload !== undefined ? JSON.stringify(payload) : undefined,
    });
    if (!res.ok) {
      throw new BankError(
        `Inter ${method} ${path} → ${res.status}`,
        "inter",
        res.status,
        await safeText(res),
      );
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  // --- emissão ------------------------------------------------------------
  async emitirBoleto(input: EmitirBoletoInput): Promise<EmitirBoletoResult> {
    const doc = onlyDigits(input.pagador.documento);
    const payload = {
      seuNumero: input.seuNumero,
      valorNominal: round2(input.valor),
      dataVencimento: input.vencimento, // YYYY-MM-DD
      numDiasAgenda: 30,
      pagador: {
        cpfCnpj: doc,
        tipoPessoa: doc.length > 11 ? "JURIDICA" : "FISICA",
        nome: input.pagador.nome,
        email: input.pagador.email,
        endereco: input.pagador.logradouro ?? "Não informado",
        numero: input.pagador.numero ?? "S/N",
        bairro: input.pagador.bairro ?? "Centro",
        cidade: input.pagador.cidade ?? "Belo Horizonte",
        uf: input.pagador.uf ?? "MG",
        cep: onlyDigits(input.pagador.cep ?? "30000000"),
      },
      ...(input.instrucoes ? { mensagem: { linha1: input.instrucoes.slice(0, 78) } } : {}),
      ...(input.multaPercent
        ? { multa: { codigo: "PERCENTUAL", taxa: input.multaPercent } }
        : {}),
      ...(input.moraPercent
        ? { mora: { codigo: "TAXAMENSAL", taxa: input.moraPercent } }
        : {}),
      ...(input.descontoValor
        ? { desconto: { codigo: "VALORFIXODATAINFORMADA", quantidadeDias: 0, valor: input.descontoValor } }
        : {}),
    };

    // 1) registra a cobrança → recebe o codigoSolicitacao
    const criada = await this.api<{ codigoSolicitacao: string }>(
      "POST",
      "/cobranca/v3/cobrancas",
      payload,
    );
    const id = criada.codigoSolicitacao;

    // 2) busca os dados completos (linha digitável, PIX, etc.)
    const det = await this.detalhar(id);

    // 3) busca o PDF (base64) — a Edge Function sobe pro Storage
    let pdfBase64: string | undefined;
    try {
      const pdf = await this.api<{ pdf: string }>("GET", `/cobranca/v3/cobrancas/${id}/pdf`);
      pdfBase64 = pdf?.pdf;
    } catch (_) {
      // PDF pode levar alguns segundos após o registro; não falha a emissão.
    }

    return { ...det, pdfBase64, raw: criada };
  }

  private async detalhar(id: string): Promise<EmitirBoletoResult & ConsultaResult> {
    const d = await this.api<InterCobranca>("GET", `/cobranca/v3/cobrancas/${id}`);
    const boleto = d.boleto ?? {};
    const pix = d.pix ?? {};
    const cob = d.cobranca ?? {};
    const temLinha = !!boleto.linhaDigitavel;
    return {
      bancoBoletoId: id,
      nossoNumero: boleto.nossoNumero,
      linhaDigitavel: boleto.linhaDigitavel,
      codigoBarras: boleto.codigoBarras,
      pixCopiaCola: pix.pixCopiaECola,
      pixTxid: pix.txid,
      pagoEm: null,
      status: mapSituacao(cob.situacao, temLinha),
      raw: d,
    } as EmitirBoletoResult & ConsultaResult;
  }

  // --- consulta -----------------------------------------------------------
  async consultarBoleto(bancoBoletoId: string): Promise<ConsultaResult> {
    const d = await this.api<InterCobranca>("GET", `/cobranca/v3/cobrancas/${bancoBoletoId}`);
    const boleto = d.boleto ?? {};
    const pix = d.pix ?? {};
    const cob = d.cobranca ?? {};
    return {
      bancoBoletoId,
      status: mapSituacao(cob.situacao, !!boleto.linhaDigitavel),
      nossoNumero: boleto.nossoNumero,
      linhaDigitavel: boleto.linhaDigitavel,
      codigoBarras: boleto.codigoBarras,
      pixCopiaCola: pix.pixCopiaECola,
      pagoEm: cob.dataSituacao ?? null,
      raw: d,
    };
  }

  // --- cancelamento -------------------------------------------------------
  async cancelarBoleto(bancoBoletoId: string, motivo = "A pedido do beneficiário"): Promise<CancelarResult> {
    await this.api(
      "POST",
      `/cobranca/v3/cobrancas/${bancoBoletoId}/cancelamento`,
      { motivoCancelamento: motivo },
    );
    return { bancoBoletoId, status: "cancelado" };
  }

  // --- webhook ------------------------------------------------------------
  async registrarWebhook(callbackUrl: string): Promise<void> {
    await this.api("PUT", "/cobranca/v3/cobrancas/webhook", { webhookUrl: callbackUrl });
  }

  parseWebhook(req: Request): Promise<WebhookEvento[]> {
    return InterProvider.parseWebhook(req);
  }

  /** Parser estático — webhook não precisa de credenciais/instância. */
  static async parseWebhook(req: Request): Promise<WebhookEvento[]> {
    const body = await req.json();
    // O Inter envia um array de callbacks (ou um objeto único).
    const itens: InterCallback[] = Array.isArray(body) ? body : [body];
    return itens.map((c) => ({
      banco: "inter" as const,
      bancoBoletoId: c.codigoSolicitacao,
      nossoNumero: c.nossoNumero,
      seuNumero: c.seuNumero,
      status: mapSituacao(c.situacao, true) === "pago" ? "pago" : mapSituacaoWebhook(c.situacao),
      valorPago: c.valorTotalRecebido ? Number(c.valorTotalRecebido) : undefined,
      pagoEm: c.dataHora ?? null,
      raw: c,
    }));
  }
}

// --- helpers ----------------------------------------------------------------
interface InterCobranca {
  cobranca?: { situacao?: string; dataSituacao?: string };
  boleto?: { nossoNumero?: string; linhaDigitavel?: string; codigoBarras?: string };
  pix?: { pixCopiaECola?: string; txid?: string };
}
interface InterCallback {
  codigoSolicitacao?: string;
  nossoNumero?: string;
  seuNumero?: string;
  situacao?: string;
  valorTotalRecebido?: string | number;
  dataHora?: string;
}

function mapSituacao(situacao: string | undefined, temLinha: boolean): EmitirBoletoResult["status"] | "pago" | "cancelado" | "vencido" {
  switch ((situacao ?? "").toUpperCase()) {
    case "RECEBIDO":
    case "MARCADO_RECEBIDO":
    case "PAGO":
      return "pago";
    case "CANCELADO":
      return "cancelado";
    case "EXPIRADO":
    case "VENCIDO":
      return "vencido";
    case "A_RECEBER":
    case "EM_PROCESSAMENTO":
      return temLinha ? "registrado" : "emitido";
    default:
      return temLinha ? "registrado" : "emitido";
  }
}

function mapSituacaoWebhook(situacao: string | undefined): WebhookEvento["status"] {
  const s = mapSituacao(situacao, true);
  if (s === "pago" || s === "cancelado" || s === "vencido" || s === "registrado") return s;
  return "registrado";
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
const onlyDigits = (s: string) => (s ?? "").replace(/\D/g, "");
const round2 = (n: number) => Math.round(n * 100) / 100;
