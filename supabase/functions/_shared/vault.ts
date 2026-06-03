// ============================================================================
// Leitura de credenciais bancárias do Supabase Vault.
// Usa a função SQL public.get_bank_credentials(ref), que só responde ao
// service_role. As credenciais NUNCA trafegam para o front-end.
// ============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { BankCredentials } from "./banks/types.ts";

export async function getBankCredentials(
  admin: SupabaseClient,
  credenciaisRef: string,
): Promise<BankCredentials> {
  const { data, error } = await admin.rpc("get_bank_credentials", { p_ref: credenciaisRef });
  if (error) {
    throw new Error(`Vault: não foi possível ler '${credenciaisRef}': ${error.message}`);
  }
  if (!data || typeof data !== "object") {
    throw new Error(`Vault: credencial '${credenciaisRef}' vazia ou inválida`);
  }
  return data as BankCredentials;
}
