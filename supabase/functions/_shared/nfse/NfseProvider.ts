// ============================================================================
// NfseProvider — interface comum (adapter pattern), espelhando BankProvider.
//
// Cada emissor (NFS-e Nacional / SERPRO, BHISS Digital) implementa esta
// interface. As Edge Functions falam SOMENTE com esta abstração; trocar ou
// adicionar uma cidade não muda as functions nem o front-end.
// ============================================================================

import type {
  Emissor,
  ConfigFiscal,
  FiscalCredentials,
  EmitirNfseInput,
  EmitirNfseResult,
  ConsultaNfseResult,
  CancelarNfseResult,
} from "./types.ts";

export interface NfseProvider {
  readonly emissor: Emissor;

  /** Emite (autoriza) uma NFS-e e retorna número / código de verificação / PDF. */
  emitirNfse(input: EmitirNfseInput): Promise<EmitirNfseResult>;

  /** Consulta a situação atual de uma NFS-e pelo id do emissor. */
  consultarNfse(nfseId: string): Promise<ConsultaNfseResult>;

  /** Cancela uma NFS-e já autorizada (dentro do prazo legal). */
  cancelarNfse(nfseId: string, motivo?: string): Promise<CancelarNfseResult>;
}

/**
 * Contrato do construtor de cada provider: recebe a config fiscal da unidade
 * e as credenciais (certificado A1) já resolvidas do Vault.
 */
export type NfseProviderFactory = (
  config: ConfigFiscal,
  credentials: FiscalCredentials,
) => NfseProvider;
