// ============================================================================
// Edge Function: unidades-publicas  (lista pública p/ o autocadastro)
//
// GET/POST /functions/v1/unidades-publicas   (deploy com --no-verify-jwt)
// Devolve apenas o necessário para o cliente escolher cidade + unidade:
//   [{ id, nome, cidade }]
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const admin = adminClient();
    const { data, error } = await admin
      .from("unidades")
      .select("id, nome, cidade")
      .order("cidade", { ascending: true })
      .order("nome", { ascending: true });
    if (error) return json({ error: error.message }, 500);
    // Só unidades com cidade definida entram no seletor.
    const unidades = (data || []).map((u) => ({ id: u.id, nome: u.nome, cidade: u.cidade || "Outra" }));
    return json({ unidades }, 200);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500);
  }
});
