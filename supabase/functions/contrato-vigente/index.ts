// ============================================================================
// Edge Function: contrato-vigente  (texto do contrato antes da compra)
//
// GET/POST /functions/v1/contrato-vigente?unidade_id=...&categoria=...
// (deploy com --no-verify-jwt)
//
// Devolve a versão vigente do contrato da categoria, com o hash que o site
// precisa mandar de volta no aceite. A versão da unidade tem preferência sobre
// a geral.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { contratoVigente } from "../_shared/contratos.ts";
import { categoriaValida } from "../_shared/venda.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const url = new URL(req.url);
    let unidadeId = url.searchParams.get("unidade_id") || "";
    let categoria = url.searchParams.get("categoria") || "";
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      unidadeId = unidadeId || body?.unidade_id || "";
      categoria = categoria || body?.categoria || "";
    }
    if (!unidadeId) return json({ error: "unidade_id é obrigatório." }, 400, req);
    if (!categoriaValida(categoria)) return json({ error: "Categoria inválida." }, 400, req);

    const contrato = await contratoVigente(adminClient(), unidadeId, categoria);
    if (!contrato) return json({ error: "Contrato ainda não publicado para esta categoria.", codigo: "SEM_CONTRATO" }, 404, req);

    return json({ contrato }, 200, req);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500, req);
  }
});
