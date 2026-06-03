// ============================================================================
// Clientes Supabase para as Edge Functions.
//  - userClient(req): herda o JWT do usuário → respeita RLS (ownership).
//  - adminClient():    service_role → lê Vault, insere boletos, ignora RLS.
// ============================================================================

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Cliente com o contexto do usuário autenticado (aplica RLS). */
export function userClient(req: Request): SupabaseClient {
  const authorization = req.headers.get("Authorization") ?? "";
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
}

/** Cliente service_role — uso restrito ao backend (Vault, writes de baixa). */
export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}
