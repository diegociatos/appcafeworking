// ============================================================================
// Edge Function: impressoes-admin  (equipe · painel de Impressões)
//
// GET /functions/v1/impressoes-admin?unidade_id=...&competencia=AAAA-MM
//   (JWT de staff/admin da unidade) →
//   { competencia, preco_folha, impressoras, jobs, resumo }
//   - jobs: trabalhos recentes da unidade (fila + histórico)
//   - resumo: folhas por cliente na competência (base do relatório/Excel)
//
// Só leitura. Deploy --no-verify-jwt (valida staff no código via is_unidade_staff).
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { ehEquipe, usuarioDoReq } from "../_shared/assinaturas.ts";
import { erroInterno } from "../_shared/clienteArea.ts";
import { competenciaBRT, PRECO_FOLHA_EXCEDENTE } from "../_shared/impressao.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    if (req.method !== "GET") return json({ error: "Método não permitido" }, 405, req);
    const usuario = await usuarioDoReq(req);
    if (!usuario) return json({ error: "Faça login." }, 401, req);

    const url = new URL(req.url);
    const unidadeId = String(url.searchParams.get("unidade_id") || "").trim();
    if (!unidadeId) return json({ error: "Informe a unidade." }, 400, req);
    if (!await ehEquipe(req, unidadeId)) return json({ error: "Acesso restrito à equipe." }, 403, req);

    const competencia = /^\d{4}-\d{2}$/.test(url.searchParams.get("competencia") || "")
      ? url.searchParams.get("competencia")! : competenciaBRT();
    const admin = adminClient();

    const [impsR, jobsR, consumosR] = await Promise.all([
      admin.from("impressoras").select("id, nome, modelo, ativo").eq("unidade_id", unidadeId).order("nome"),
      admin.from("impressao_jobs")
        .select("id, cliente_email, cliente_nome, documento_nome, paginas, copias, duplex, folhas, folhas_impressas, status, origem, criado_em, impresso_em")
        .eq("unidade_id", unidadeId).order("criado_em", { ascending: false }).limit(300),
      admin.from("consumos_impressao").select("cliente_email, folhas").eq("unidade_id", unidadeId).eq("competencia", competencia),
    ]);
    for (const r of [impsR, jobsR, consumosR]) if (r.error) throw new Error(r.error.message);

    const porCliente = new Map<string, number>();
    for (const c of consumosR.data || []) porCliente.set(c.cliente_email, (porCliente.get(c.cliente_email) || 0) + Number(c.folhas || 0));
    const resumo = [...porCliente.entries()]
      .map(([cliente_email, folhas]) => ({ cliente_email, folhas, valor_excedente_ref: 0 }))
      .sort((a, b) => b.folhas - a.folhas);

    return json({
      competencia, preco_folha: PRECO_FOLHA_EXCEDENTE,
      impressoras: impsR.data || [], jobs: jobsR.data || [], resumo,
    }, 200, req);
  } catch (e) {
    return erroInterno(req, "impressoes-admin", e);
  }
});
