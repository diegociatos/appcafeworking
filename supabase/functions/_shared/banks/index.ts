// ============================================================================
// Registry / factory dos providers de banco.
// getProvider(account, credentials) devolve a implementação certa do
// BankProvider conforme account.banco. Adicionar um banco = registrar aqui.
// ============================================================================

import type { BankProvider } from "./BankProvider.ts";
import { type BankAccount, type BankCredentials, BankError } from "./types.ts";
import { InterProvider } from "./InterProvider.ts";
import { ItauProvider } from "./ItauProvider.ts";
import { BtgProvider } from "./BtgProvider.ts";
import { BradescoProvider } from "./BradescoProvider.ts";

const REGISTRY = {
  inter: InterProvider,
  itau: ItauProvider,
  btg: BtgProvider,
  bradesco: BradescoProvider,
} as const;

export function getProvider(
  account: BankAccount,
  credentials: BankCredentials,
): BankProvider {
  const Impl = REGISTRY[account.banco];
  if (!Impl) {
    throw new BankError(`Banco não suportado: ${account.banco}`, account.banco);
  }
  return new Impl(account, credentials);
}

/**
 * Parser de webhook por banco — não exige credenciais/conta (o payload já
 * traz os identificadores para casar com o boleto na nossa base).
 */
export function parseWebhook(banco: BankAccount["banco"], req: Request) {
  switch (banco) {
    case "inter":
      return InterProvider.parseWebhook(req);
    case "itau":
      return ItauProvider.parseWebhook(req);
    case "btg":
      return BtgProvider.parseWebhook(req);
    case "bradesco":
      return BradescoProvider.parseWebhook(req);
    default:
      throw new BankError(`parseWebhook não implementado para ${banco}`, banco, 501);
  }
}

export { BankError } from "./types.ts";
export type { BankProvider } from "./BankProvider.ts";
export * from "./types.ts";
