// ============================================================================
// ItauProvider — Itaú · API de Boletos (Cash Management / Cobrança)
//
// Autenticação: OAuth2 client_credentials + certificado mTLS. Requer cadastro
// do app no developer portal do Itaú (client_id/secret + vínculo do certificado).
// O Itaú usa um STS próprio para o token e exige os headers x-itau-apikey e
// x-itau-correlationID em cada chamada.
//
// ⚠️ Os nomes de campos do payload/resposta seguem o padrão documentado do
// Itaú, mas confirme contra a versão da sua API no portal (há variações entre
// "cash_management/v2/boletos" e "boletos_pix").
//
// Docs: https://devportal.itau.com.br/
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
  prod: "https://api.itau.com.br",
  sandbox: "https://api.itau.com.br/sandbox",
};
const TOKEN_URL: Record<string, string> = {
  prod: "https://sts.itau.com.br/api/oauth/token",
  sandbox: "https://sts.itau.com.br/api/oauth/token",
};
const BOLETOS_PATH = "/cash_management/v2/boletos";

interface TokenCache { accessToken: string; expiresAt: number; }

export class ItauProvider implements BankProvider {
  readonly banco = "itau" as const;

  private readonly base: string;
  private readonly tokenUrl: string;
  private httpClient: Deno.HttpClient | null = null;
  private token: TokenCache | null = null;

  constructor(
    private readonly account: BankAccount,
    private readonly creds: BankCredentials,
  ) {
    this.base = BASE_URL[account.ambiente] ?? BASE_URL.sandbox;
    this.tokenUrl = TOKEN_URL[account.ambiente] ?? TOKEN_URL.sandbox;
    if (!creds.cert_pem || !creds.key_pem) {
      throw new BankError("Itaú exige certificado mTLS (cert_pem/key_pem)", "itau");
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
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.creds.client_id,
      client_secret: this.creds.client_secret,
    });
    const res = await fetch(this.tokenUrl, {
      method: "POST",
      client: this.client(),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new BankError("Falha no OAuth do Itaú", "itau", res.status, await safeText(res));
    const json = await res.json();
    this.token = { accessToken: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 300) * 1000 };
    return this.token.accessToken;
  }

  private async api<T>(method: string, path: string, payload?: unknown): Promise<T> {
    const token = await this.accessToken();
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      "x-itau-apikey": this.creds.client_id,
      "x-itau-correlationID": crypto.randomUUID(),
      "x-itau-flowID": crypto.randomUUID(),
    };
    if (payload !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(`${this.base}${path}`, {
      method,
      client: this.client(),
      headers,
      body: payload !== undefined ? JSON.stringify(payload) : undefined,
    });
    if (!res.ok) {
      throw new BankError(`Itaú ${method} ${path} → ${res.status}`, "itau", res.status, await safeText(res));
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  async emitirBoleto(input: EmitirBoletoInput): Promise<EmitirBoletoResult> {
    const doc = onlyDigits(input.pagador.documento);
    const pessoa = doc.length > 11 ? "J" : "F";
    // Envelope "efetivação" do registro de boleto.
    const payload = {
      etapa_processo_boleto: "efetivacao",
      beneficiario: {
        id_beneficiario: this.account.carteira || this.creds.id_beneficiario,
        nome_cobranca: this.account.beneficiario_nome,
        tipo_pessoa: { codigo_tipo_pessoa: onlyDigits(this.account.beneficiario_documento || "").length > 11 ? "J" : "F", numero_cadastro_nacional_pessoa_juridica: onlyDigits(this.account.beneficiario_documento || "") },
      },
      dado_boleto: {
        descricao_instrumento_cobranca: "boleto",
        tipo_boleto: "a vista",
        codigo_carteira: this.account.carteira ?? "109",
        valor_total_titulo: centavos(input.valor),
        codigo_especie: "01",
        data_emissao: hoje(),
        pagador: {
          pessoa: {
            nome_pessoa: input.pagador.nome,
            tipo_pessoa: {
              codigo_tipo_pessoa: pessoa,
              ...(pessoa === "F"
                ? { numero_cadastro_pessoa_fisica: doc }
                : { numero_cadastro_nacional_pessoa_juridica: doc }),
            },
          },
          endereco: {
            nome_logradouro: input.pagador.logradouro ?? "Não informado",
            nome_bairro: input.pagador.bairro ?? "Centro",
            nome_cidade: input.pagador.cidade ?? "Belo Horizonte",
            sigla_UF: input.pagador.uf ?? "MG",
            numero_CEP: onlyDigits(input.pagador.cep ?? "30000000"),
          },
        },
        dados_individuais_boleto: [{
          numero_nosso_numero: undefined, // o Itaú gera quando ausente
          data_vencimento: input.vencimento,
          valor_titulo: centavos(input.valor),
          texto_seu_numero: input.seuNumero,
          ...(input.instrucoes ? { texto_uso_beneficiario: input.instrucoes.slice(0, 60) } : {}),
        }],
        ...(input.multaPercent ? { multa: { codigo_tipo_multa: "02", percentual_multa: input.multaPercent } } : {}),
        ...(input.moraPercent ? { juros: { codigo_tipo_juros: "01", percentual_juros: input.moraPercent } } : {}),
      },
    };

    const r = await this.api<ItauBoletoResp>("POST", BOLETOS_PATH, { data: payload });
    return this.mapEmissao(r);
  }

  private mapEmissao(r: ItauBoletoResp): EmitirBoletoResult {
    const data = r?.data ?? r;
    const dib = data?.dado_boleto?.dados_individuais_boleto?.[0] ?? {};
    const id = String(data?.id_boleto ?? dib?.numero_nosso_numero ?? "");
    const linha = dib?.numero_linha_digitavel || data?.numero_linha_digitavel;
    return {
      bancoBoletoId: id,
      nossoNumero: dib?.numero_nosso_numero,
      linhaDigitavel: linha,
      codigoBarras: dib?.codigo_barras || data?.codigo_barras,
      status: linha ? "registrado" : "emitido",
      raw: r,
    };
  }

  async consultarBoleto(bancoBoletoId: string): Promise<ConsultaResult> {
    const r = await this.api<ItauBoletoResp>("GET", `${BOLETOS_PATH}/${bancoBoletoId}`);
    const data = r?.data ?? r;
    const dib = data?.dado_boleto?.dados_individuais_boleto?.[0] ?? {};
    const sit = dib?.codigo_situacao_geral_boleto || data?.situacao;
    return {
      bancoBoletoId,
      status: mapSituacaoItau(sit, !!dib?.numero_linha_digitavel),
      nossoNumero: dib?.numero_nosso_numero,
      linhaDigitavel: dib?.numero_linha_digitavel,
      codigoBarras: dib?.codigo_barras,
      pagoEm: dib?.data_movimento_pagamento ?? null,
      raw: r,
    };
  }

  async cancelarBoleto(bancoBoletoId: string, _motivo?: string): Promise<CancelarResult> {
    // Baixa/cancelamento do título.
    await this.api("POST", `${BOLETOS_PATH}/${bancoBoletoId}/baixas`, {
      data: { codigo_comando_instrucao: "02", descricao_comando_instrucao: "baixa por solicitacao do beneficiario" },
    });
    return { bancoBoletoId, status: "cancelado" };
  }

  // Itaú: notificações de liquidação são configuradas no portal (sem auto-registro via API).
  registrarWebhook(_callbackUrl: string): Promise<void> {
    return Promise.resolve();
  }

  parseWebhook(req: Request): Promise<WebhookEvento[]> {
    return ItauProvider.parseWebhook(req);
  }

  static async parseWebhook(req: Request): Promise<WebhookEvento[]> {
    const body = await req.json();
    const itens: ItauCallback[] = Array.isArray(body) ? body : (body?.data ? [body.data] : [body]);
    return itens.map((c) => ({
      banco: "itau" as const,
      bancoBoletoId: String(c?.id_boleto ?? c?.numero_nosso_numero ?? ""),
      nossoNumero: c?.numero_nosso_numero,
      seuNumero: c?.texto_seu_numero,
      status: mapWebhookItau(c?.codigo_situacao_geral_boleto ?? c?.situacao),
      valorPago: c?.valor_pago ? Number(c.valor_pago) / 100 : undefined,
      pagoEm: c?.data_movimento_pagamento ?? null,
      raw: c,
    }));
  }
}

// --- helpers ----------------------------------------------------------------
interface ItauBoletoResp {
  data?: any;
  [k: string]: any;
}
interface ItauCallback {
  id_boleto?: string;
  numero_nosso_numero?: string;
  texto_seu_numero?: string;
  codigo_situacao_geral_boleto?: string;
  situacao?: string;
  valor_pago?: string | number;
  data_movimento_pagamento?: string;
}

function mapSituacaoItau(sit: string | undefined, temLinha: boolean): ConsultaResult["status"] {
  switch ((sit ?? "").toUpperCase()) {
    case "PAGO": case "LIQUIDADO": case "08": return "pago";
    case "BAIXADO": case "CANCELADO": case "09": return "cancelado";
    case "VENCIDO": case "EXPIRADO": return "vencido";
    default: return temLinha ? "registrado" : "emitido";
  }
}
function mapWebhookItau(sit: string | undefined): WebhookEvento["status"] {
  const s = mapSituacaoItau(sit, true);
  return s === "pago" || s === "cancelado" || s === "vencido" ? s : "registrado";
}

async function safeText(res: Response): Promise<string> { try { return await res.text(); } catch { return ""; } }
const onlyDigits = (s: string) => (s ?? "").replace(/\D/g, "");
const centavos = (n: number) => Math.round(n * 100); // Itaú trabalha em centavos
const hoje = () => new Date().toISOString().slice(0, 10);
