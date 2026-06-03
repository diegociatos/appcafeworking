// ============================================================================
// Tipos compartilhados do módulo de boletos.
// Independentes de banco — cada provider traduz de/para o formato do seu banco.
// ============================================================================

export type Banco = "inter" | "itau" | "btg" | "bradesco";
export type Ambiente = "sandbox" | "prod";

/** Credenciais cruas vindas do Vault (formato livre por banco). */
export interface BankCredentials {
  client_id: string;
  client_secret: string;
  /** Certificado mTLS (PEM). Inter/Itaú/Bradesco exigem. */
  cert_pem?: string;
  /** Chave privada mTLS (PEM). */
  key_pem?: string;
  /** Conta-corrente / contaCorrente (Inter usa header x-conta-corrente). */
  conta_corrente?: string;
  /** Bradesco: token/registrationId adicional, etc. */
  [k: string]: unknown;
}

/** Dados da conta bancária (linha de bank_accounts, sem o segredo). */
export interface BankAccount {
  id: string;
  unidade_id: string;
  franqueado_id: string | null;
  banco: Banco;
  tipo: "franqueado" | "franqueador";
  ambiente: Ambiente;
  apelido: string;
  beneficiario_nome?: string | null;
  beneficiario_documento?: string | null;
  agencia?: string | null;
  conta?: string | null;
  carteira?: string | null;
  pix_chave?: string | null;
  credenciais_ref: string;
}

export interface Pagador {
  nome: string;
  /** CPF ou CNPJ, só dígitos. */
  documento: string;
  email?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
}

export interface EmitirBoletoInput {
  /** Identificador nosso (seuNumero). Único por conta. */
  seuNumero: string;
  valor: number;
  /** ISO date "YYYY-MM-DD". */
  vencimento: string;
  pagador: Pagador;
  instrucoes?: string;
  /** Multa (%) após o vencimento. */
  multaPercent?: number;
  /** Juros de mora (% ao mês). */
  moraPercent?: number;
  /** Desconto (valor fixo) se pago até o vencimento. */
  descontoValor?: number;
}

export interface EmitirBoletoResult {
  /** id/codigoSolicitacao no banco. */
  bancoBoletoId: string;
  nossoNumero?: string;
  linhaDigitavel?: string;
  codigoBarras?: string;
  pixCopiaCola?: string;
  pixTxid?: string;
  pdfUrl?: string;
  /** PDF cru (base64) quando o banco entrega inline — a Edge Function sobe pro Storage. */
  pdfBase64?: string;
  /** "registrado" quando já há linha digitável; "emitido" quando ainda processando. */
  status: "emitido" | "registrado" | "erro";
  raw?: unknown;
}

export interface ConsultaResult {
  bancoBoletoId: string;
  status: "emitido" | "registrado" | "pago" | "vencido" | "cancelado" | "erro";
  nossoNumero?: string;
  linhaDigitavel?: string;
  codigoBarras?: string;
  pixCopiaCola?: string;
  pdfUrl?: string;
  pagoEm?: string | null;
  raw?: unknown;
}

export interface CancelarResult {
  bancoBoletoId: string;
  status: "cancelado" | "erro";
  raw?: unknown;
}

/** Evento normalizado de baixa, produzido por provider.parseWebhook(). */
export interface WebhookEvento {
  banco: Banco;
  /** Como casar com o boleto na nossa base. */
  bancoBoletoId?: string;
  nossoNumero?: string;
  seuNumero?: string;
  status: "pago" | "cancelado" | "vencido" | "registrado";
  valorPago?: number;
  pagoEm?: string | null;
  raw: unknown;
}

export class BankError extends Error {
  constructor(
    message: string,
    public readonly banco: Banco,
    public readonly httpStatus?: number,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = "BankError";
  }
}
