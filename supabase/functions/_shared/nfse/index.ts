// ============================================================================
// Registry / factory dos providers de NFS-e.
// getNfseProvider(config, credentials) devolve a implementação certa conforme
// config.emissor. Adicionar uma cidade/emissor = registrar aqui.
// ============================================================================

import type { NfseProvider } from "./NfseProvider.ts";
import { type ConfigFiscal, type FiscalCredentials, FiscalError } from "./types.ts";
import { NfseNacionalProvider } from "./NfseNacionalProvider.ts";
import { BhissProvider } from "./BhissProvider.ts";

const REGISTRY = {
  nacional: NfseNacionalProvider,
  bhiss: BhissProvider,
} as const;

export function getNfseProvider(
  config: ConfigFiscal,
  credentials: FiscalCredentials,
): NfseProvider {
  const Impl = REGISTRY[config.emissor];
  if (!Impl) {
    throw new FiscalError(`Emissor de NFS-e não suportado: ${config.emissor}`, config.emissor);
  }
  return new Impl(config, credentials);
}

export { FiscalError } from "./types.ts";
export type { NfseProvider } from "./NfseProvider.ts";
export * from "./types.ts";
