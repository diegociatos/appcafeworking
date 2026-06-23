// ============================================================================
// Edge Function: planos-publicos  (planos de uma unidade p/ o autocadastro)
//
// GET/POST /functions/v1/planos-publicos?unidade_id=...   (deploy --no-verify-jwt)
// body/query: { unidade_id }
// Devolve os planos ATIVOS da unidade (lidos do app_state, entity='planos'):
//   [{ id, nome, preco, recorrencia, emiteNF, descricao }]
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    let unidadeId = new URL(req.url).searchParams.get("unidade_id") || "";
    if (!unidadeId && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      unidadeId = body?.unidade_id || "";
    }
    if (!unidadeId) return json({ error: "unidade_id é obrigatório." }, 400);

    const admin = adminClient();
    const { data, error } = await admin
      .from("app_state")
      .select("doc")
      .eq("entity", "planos")
      .eq("unidade_id", unidadeId);
    if (error) return json({ error: error.message }, 500);

    const planos = (data || [])
      .map((r) => r.doc)
      .filter((p) => p && p.ativo !== false)
      .map((p) => ({ id: p.id, nome: p.nome, preco: Number(p.preco || 0), recorrencia: p.recorrencia || "mensal", emiteNF: !!p.emiteNF, descricao: p.descricao || "" }))
      .sort((a, b) => a.preco - b.preco);

    return json({ planos }, 200);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500);
  }
});
