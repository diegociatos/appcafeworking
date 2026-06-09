// ============================================================================
// Edge Function: excluir-coworking  (remove uma conta de coworking por completo)
//
// POST /functions/v1/excluir-coworking
// body: { conta_id }
//
// Só o ADMIN DA PLATAFORMA pode chamar. Remove, com service_role e em ordem
// de dependência, TODOS os dados da conta:
//   app_state, notas_fiscais, boletos, config_fiscal, bank_accounts, clientes,
//   usuarios, unidade_members → unidades → conta. Depois apaga os logins (Auth)
//   dos usuários que ficaram sem nenhum outro vínculo.
//
// ⚠️ Destrutivo e irreversível.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { userClient, adminClient } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const body = await req.json();
    if (!body?.conta_id) return json({ error: "Campo obrigatório ausente: conta_id" }, 400);

    const user = userClient(req);
    const { data: auth } = await user.auth.getUser();
    if (!auth?.user) return json({ error: "Não autenticado" }, 401);
    const admin = adminClient();

    const { data: pa } = await admin.from("platform_admins").select("user_id").eq("user_id", auth.user.id).maybeSingle();
    if (!pa) return json({ error: "Apenas o administrador da plataforma pode excluir contas." }, 403);

    // Unidades da conta
    const { data: unids } = await admin.from("unidades").select("id").eq("franqueado_id", body.conta_id);
    const unidadeIds = (unids || []).map((u) => u.id);

    // Logins vinculados (para limpar os órfãos no fim)
    let userIds: string[] = [];
    if (unidadeIds.length) {
      const { data: mem } = await admin.from("unidade_members").select("user_id").in("unidade_id", unidadeIds);
      userIds = Array.from(new Set((mem || []).map((m) => m.user_id)));
    }

    const del = async (table: string, col: string, vals: string[]) => {
      if (!vals.length) return;
      try { await admin.from(table).delete().in(col, vals); } catch (_) { /* best-effort */ }
    };

    // Dados das unidades (ordem importa por causa das FKs)
    if (unidadeIds.length) {
      await del("app_state", "unidade_id", unidadeIds);
      await del("notas_fiscais", "unidade_id", unidadeIds);
      await del("boletos", "unidade_id", unidadeIds);
      await del("config_fiscal", "unidade_id", unidadeIds);
      await del("bank_accounts", "unidade_id", unidadeIds);
      await del("clientes", "unidade_id", unidadeIds);
      await del("usuarios", "unidade_id", unidadeIds);
      await del("unidade_members", "unidade_id", unidadeIds);
    }
    await del("unidades", "id", unidadeIds);
    try { await admin.from("contas").delete().eq("id", body.conta_id); } catch (_) { /* noop */ }

    // Remove os logins que não têm mais nenhum vínculo (e não são admin).
    let removidos = 0;
    for (const uid of userIds) {
      try {
        const { data: rest } = await admin.from("unidade_members").select("unidade_id").eq("user_id", uid).limit(1);
        const { data: isAdmin } = await admin.from("platform_admins").select("user_id").eq("user_id", uid).maybeSingle();
        if ((!rest || !rest.length) && !isAdmin) {
          await admin.auth.admin.deleteUser(uid);
          removidos++;
        }
      } catch (_) { /* ignora um usuário que falhe */ }
    }

    return json({ ok: true, unidades_removidas: unidadeIds.length, logins_removidos: removidos }, 200);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500);
  }
});
