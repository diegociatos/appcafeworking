import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { produtoPublico } from "../_shared/cardapio.ts";
import { unidadesPublicaveis } from "../_shared/parceirosDb.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  try {
    const admin = adminClient();
    const url = new URL(req.url);
    const unidadeId = url.searchParams.get("unidade_id") || "";
    const [{ data: unidades, error: erroUnidades }, { data: contas, error: erroContas }] = await Promise.all([
      admin.from("unidades").select("id,nome,cidade,franqueado_id").order("nome"),
      admin.from("contas").select("id").eq("tipo", "parceiro"),
    ]);
    if (erroUnidades || erroContas) return json({ error: (erroUnidades || erroContas)!.message }, 500, req);
    const idsParceiros = new Set((contas || []).map((c) => c.id));
    const publicaveis = await unidadesPublicaveis(admin, (unidades || []).map((u) => u.id), (id) => idsParceiros.has((unidades || []).find((u) => u.id === id)?.franqueado_id));
    const permitidas = new Set((unidades || []).filter((u) => publicaveis.has(u.id) && (!unidadeId || u.id === unidadeId)).map((u) => u.id));
    let consulta = admin.from("app_state").select("unidade_id,doc,updated_at").eq("entity", "catalogo");
    if (unidadeId) consulta = consulta.eq("unidade_id", unidadeId);
    const { data, error } = await consulta;
    if (error) return json({ error: error.message }, 500, req);
    const produtos = (data || []).filter((r) => permitidas.has(r.unidade_id)).map((r) => produtoPublico(r.doc || {}, r.unidade_id)).filter(Boolean)
      .sort((a, b) => a!.categoria.localeCompare(b!.categoria, "pt-BR") || a!.nome.localeCompare(b!.nome, "pt-BR"));
    const atualizados = (data || []).map((r) => r.updated_at).filter(Boolean).sort();
    return json({
      unidades: (unidades || []).filter((u) => permitidas.has(u.id)).map(({ id, nome, cidade }) => ({ id, nome, cidade })),
      produtos,
      atualizado_em: atualizados.at(-1) || null,
    }, 200, req);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message || "Erro interno" }, 500, req);
  }
});
