// ============================================================================
// Leitura do certificado/segredos fiscais do Supabase Vault.
// Usa a função SQL public.get_fiscal_credentials(ref), que só responde ao
// service_role. O certificado A1 (e-CNPJ) NUNCA trafega para o front-end.
// ============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { FiscalCredentials } from "./nfse/types.ts";

export async function getFiscalCredentials(
  admin: SupabaseClient,
  certificadoRef: string,
): Promise<FiscalCredentials> {
  const { data, error } = await admin.rpc("get_fiscal_credentials", { p_ref: certificadoRef });
  if (error) {
    // Sem certificado cadastrado → modo simulado (o provider trata a ausência).
    if (/não encontrad/i.test(error.message)) return {};
    throw new Error(`Vault: não foi possível ler '${certificadoRef}': ${error.message}`);
  }
  if (!data || typeof data !== "object") return {};
  return data as FiscalCredentials;
}
