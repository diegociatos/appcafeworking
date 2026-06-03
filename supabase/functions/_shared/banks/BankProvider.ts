// ============================================================================
// BankProvider — interface comum (adapter pattern).
//
// Cada banco (Inter, Itaú, BTG, Bradesco) implementa esta interface. As Edge
// Functions falam SOMENTE com esta abstração; trocar/adicionar banco não muda
// as functions nem o front-end.
// ============================================================================

import type {
  Banco,
  BankAccount,
  BankCredentials,
  EmitirBoletoInput,
  EmitirBoletoResult,
  ConsultaResult,
  CancelarResult,
  WebhookEvento,
} from "./types.ts";

export interface BankProvider {
  readonly banco: Banco;

  /** Emite (registra) um boleto e retorna linha digitável / PIX / PDF. */
  emitirBoleto(input: EmitirBoletoInput): Promise<EmitirBoletoResult>;

  /** Consulta a situação atual de um boleto pelo id do banco. */
  consultarBoleto(bancoBoletoId: string): Promise<ConsultaResult>;

  /** Cancela/baixa um boleto ainda não pago. */
  cancelarBoleto(bancoBoletoId: string, motivo?: string): Promise<CancelarResult>;

  /**
   * Registra (configura) no banco a URL que receberá as notificações de baixa.
   * Chamado uma vez por conta após o cadastro. Bancos sem auto-registro
   * (config feita no portal) podem deixar como no-op.
   */
  registrarWebhook(callbackUrl: string): Promise<void>;

  /**
   * Interpreta uma requisição de webhook recebida do banco e devolve um
   * evento normalizado de baixa. Usado pela function `webhook-boletos`.
   */
  parseWebhook(req: Request): Promise<WebhookEvento[]>;
}

/**
 * Contrato do construtor de cada provider: recebe a conta bancária (metadados)
 * e as credenciais já resolvidas do Vault.
 */
export type ProviderFactory = (
  account: BankAccount,
  credentials: BankCredentials,
) => BankProvider;
