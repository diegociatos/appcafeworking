// ============================================================================
// Tipos compartilhados do módulo de Nota Fiscal de Serviço (NFS-e).
// Independentes do emissor — cada provider traduz de/para o formato do seu
// padrão (NFS-e Nacional / SERPRO, ou sistema municipal como o BHISS Digital).
// ============================================================================

export type Emissor = "nacional" | "bhiss";
export type NfseAmbiente = "homologacao" | "producao";

/** Credenciais/segredos vindos do Vault (certificado A1 e-CNPJ etc.). */
export interface FiscalCredentials {
  /** Certificado digital A1 (e-CNPJ) em PFX base64. */
  cert_pfx_base64?: string;
  /** Senha do certificado A1. */
  cert_senha?: string;
  /** Alternativa PEM (quando o certificado já foi convertido). */
  cert_pem?: string;
  key_pem?: string;
  /** Credenciais de API para gateways (quando aplicável). */
  client_id?: string;
  client_secret?: string;
  [k: string]: unknown;
}

/** Configuração fiscal da unidade (linha de config_fiscal, sem o segredo). */
export interface ConfigFiscal {
  id: string;
  unidade_id: string;
  municipio: string;
  uf: string;
  inscricao_municipal: string | null;
  regime: string;                 // "Simples Nacional" | "Lucro Presumido" | ...
  codigo_servico: string;         // item da LC 116 (ex.: "08.01")
  descricao_servico: string;
  aliquota_iss: number;           // % (ex.: 2.0)
  emissor: Emissor;               // "nacional" | "bhiss"
  ambiente: NfseAmbiente;
  cnpj: string;                   // CNPJ do prestador (unidade)
  razao_social?: string | null;
  certificado_ref: string;        // nome do segredo no Vault
  emissao_ativa: boolean;
}

export interface Tomador {
  nome: string;
  /** CPF ou CNPJ, só dígitos. */
  documento: string;
  email?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
}

export interface EmitirNfseInput {
  /** Identificador nosso (RPS) — único por unidade. */
  rpsNumero: string;
  tomador: Tomador;
  /** Valor bruto do serviço. */
  valor: number;
  descricao: string;
  /** Sobrescreve o código de serviço da config, se preciso. */
  codigoServico?: string;
  /** Alíquota ISS (%) — default vem da config. */
  aliquotaISS?: number;
  /** Boleto/cobrança que originou a nota (rastreabilidade). */
  boletoId?: string | null;
}

export interface EmitirNfseResult {
  /** Número/identificador da nota no emissor. */
  nfseId: string;
  numero?: string;
  codigoVerificacao?: string;
  iss?: number;
  /** "autorizada" quando já processada; "processando" quando assíncrona. */
  status: "autorizada" | "processando" | "erro";
  pdfUrl?: string;
  /** XML assinado/autorizado (texto) — a Edge Function guarda no Storage. */
  xml?: string;
  raw?: unknown;
}

export interface ConsultaNfseResult {
  nfseId: string;
  numero?: string;
  status: "autorizada" | "processando" | "cancelada" | "erro";
  pdfUrl?: string;
  xml?: string;
  raw?: unknown;
}

export interface CancelarNfseResult {
  nfseId: string;
  status: "cancelada" | "erro";
  raw?: unknown;
}

export class FiscalError extends Error {
  constructor(
    message: string,
    public readonly emissor: Emissor,
    public readonly httpStatus?: number,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = "FiscalError";
  }
}
