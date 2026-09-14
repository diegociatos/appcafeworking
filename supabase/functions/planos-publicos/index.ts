// ============================================================================
// Edge Function: planos-publicos  (catálogo público: autocadastro e site)
//
// GET/POST /functions/v1/planos-publicos   (deploy --no-verify-jwt)
//
//   ?unidade_id=...        planos ativos de uma unidade (autocadastro do app)
//   (sem unidade_id)       todas as unidades — vitrine do site
//   &site=1                só o que está marcado "vender no site", com categoria e preço
//   &categoria=...         filtra por categoria (endereco_fiscal, coworking, sala_privativa)
//
// Resposta: { planos: [...], unidades?: [...] }. Os planos vêm do app_state
// (entity='planos'), cadastrados na tela Planos do app.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { categoriaValida } from "../_shared/venda.ts";

// deno-lint-ignore no-explicit-any
function planoPublico(p: any, unidadeId: string) {
  return {
    id: p.id,
    unidade_id: unidadeId,
    nome: p.nome,
    preco: Number(p.preco || 0),
    recorrencia: p.recorrencia || "mensal",
    emiteNF: !!p.emiteNF,
    descricao: p.descricao || "",
    categoria: categoriaValida(p.categoria) ? p.categoria : null,
    prazoMinimoMeses: Math.max(0, Math.floor(Number(p.prazoMinimoMeses || 0))),
    capacidade: Number(p.capacidade) > 0 ? Number(p.capacidade) : null,
    direitos: p.direitos || {},
    venderNoSite: p.venderNoSite === true,
  };
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const url = new URL(req.url);
    let unidadeId = url.searchParams.get("unidade_id") || "";
    let soSite = url.searchParams.get("site") === "1";
    let categoria = url.searchParams.get("categoria") || "";
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      unidadeId = unidadeId || body?.unidade_id || "";
      soSite = soSite || body?.site === true || body?.site === "1";
      categoria = categoria || body?.categoria || "";
    }
    if (categoria && !categoriaValida(categoria)) return json({ error: "Categoria inválida." }, 400, req);

    // Sem unidade só faz sentido para a vitrine do site.
    if (!unidadeId && !soSite) return json({ error: "unidade_id é obrigatório." }, 400, req);

    const admin = adminClient();
    let consulta = admin.from("app_state").select("unidade_id, doc").eq("entity", "planos");
    if (unidadeId) consulta = consulta.eq("unidade_id", unidadeId);
    const { data, error } = await consulta;
    if (error) return json({ error: error.message }, 500, req);

    const planos = (data || [])
      .filter((r) => r.doc && r.doc.ativo !== false)
      .map((r) => planoPublico(r.doc, r.unidade_id))
      .filter((p) => !soSite || (p.venderNoSite && p.categoria && p.preco > 0))
      .filter((p) => !categoria || p.categoria === categoria)
      .sort((a, b) => a.preco - b.preco);

    if (unidadeId) return json({ planos }, 200, req);

    const idsComPlano = new Set(planos.map((p) => p.unidade_id));
    const { data: unidades, error: uErr } = await admin
      .from("unidades")
      .select("id, nome, cidade")
      .order("nome", { ascending: true });
    if (uErr) return json({ error: uErr.message }, 500, req);

    return json({
      unidades: (unidades || []).filter((u) => idsComPlano.has(u.id)),
      planos,
    }, 200, req);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500, req);
  }
});
