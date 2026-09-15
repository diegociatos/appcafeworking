// ============================================================================
// Edge Function: planos-publicos  (catálogo público: autocadastro e site)
//
// GET/POST /functions/v1/planos-publicos   (deploy --no-verify-jwt)
//
//   ?unidade_id=...        planos ativos de uma unidade (autocadastro do app;
//                          sem os "sob consulta", que não se compram sozinhos)
//   (sem unidade_id)       todas as unidades — só com site=1
//   &site=1                só o publicado no site, com categoria e preço (ou sob consulta)
//   &categoria=...         filtra por categoria (endereco_fiscal, coworking, sala_privativa, sala_hora)
//
// Resposta: { planos: PlanoPublico[], unidades?: {id,nome,cidade}[] }. Os planos
// vêm do app_state (entity 'planos'); o desconto do anual, do doc 'configVenda'
// de cada unidade.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { categoriaValida, DESCONTO_ANUAL_PADRAO, descontoAnualValido } from "../_shared/venda.ts";
import { ordenarPlanos, planoPublico, visivelNoSite } from "../_shared/catalogo.ts";
import { vagasSalaPrivativa } from "../_shared/disponibilidade.ts";

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
    let consulta = admin.from("app_state").select("unidade_id, entity, doc").in("entity", ["planos", "configVenda"]);
    if (unidadeId) consulta = consulta.eq("unidade_id", unidadeId);
    const { data, error } = await consulta;
    if (error) return json({ error: error.message }, 500, req);

    const descontoPorUnidade = new Map<string, number>();
    for (const r of data || []) {
      if (r.entity === "configVenda") descontoPorUnidade.set(r.unidade_id, descontoAnualValido(r.doc?.descontoAnualPct));
    }

    const planos = (data || [])
      .filter((r) => r.entity === "planos" && r.doc && r.doc.ativo !== false)
      .map((r) => planoPublico(r.doc, r.unidade_id, descontoPorUnidade.get(r.unidade_id) ?? DESCONTO_ANUAL_PADRAO))
      .filter((p) => (soSite ? visivelNoSite(p) : !p.sobConsulta))
      .filter((p) => !categoria || p.categoria === categoria)
      .sort(ordenarPlanos);

    // sala privativa: quantas ainda podem ser vendidas (o site mostra "Ocupada" com 0)
    await Promise.all(planos.filter((p) => p.categoria === "sala_privativa" && p.capacidade).map(async (p) => {
      p.disponiveis = await vagasSalaPrivativa(admin, p.unidade_id, p.capacidade!, p.id);
    }));

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
