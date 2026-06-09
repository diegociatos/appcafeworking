// ============================================================================
// Edge Function: excluir-unidade  (remove uma unidade por completo)
//
// POST /functions/v1/excluir-unidade
// body: { unidade_id }
//
// Remove TUDO da unidade (app_state, notas, boletos, cobranças, config fiscal,
// clientes, vínculos) e a própria unidade. Autorizado ao master da conta da
// unidade OU ao admin da plataforma. NÃO apaga a conta nem outras unidades.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { userClient, adminClient } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const body = await req.json();
    if (!body?.unidade_id) return json({ error: "Campo obrigatório ausente: unidade_id" }, 400);

    const user = userClient(req);
    const { data: auth } = await user.auth.getUser();
    if (!auth?.user) return json({ error: "Não autenticado" }, 401);
    const admin = adminClient();

    const { data: unidade } = await admin.from("unidades").select("id, franqueado_id").eq("id", body.unidade_id).maybeSingle();
    if (!unidade) return json({ error: "Unidade não encontrada." }, 404);

    // autorização: admin OU master da conta da unidade
    const { data: pa } = await admin.from("platform_admins").select("user_id").eq("user_id", auth.user.id).maybeSingle();
    if (!pa) {
      const { data: mem } = await admin.from("unidade_members")
        .select("role").eq("user_id", auth.user.id).eq("franqueado_id", unidade.franqueado_id).limit(1);
      if (!(mem || []).some((m) => m.role === "master")) {
        return json({ error: "Apenas o master da conta pode excluir unidades." }, 403);
      }
    }

    const id = [body.unidade_id];
    const del = async (table: string) => { try { await admin.from(table).delete().in("unidade_id", id); } catch (_) { /* best-effort */ } };
    await del("app_state");
    await del("notas_fiscais");
    await del("boletos");
    await del("cobrancas");
    await del("config_fiscal");
    await del("bank_accounts");
    await del("clientes");
    await del("usuarios");
    await del("unidade_members");
    try { await admin.from("unidades").delete().eq("id", body.unidade_id); } catch (_) { /* noop */ }

    return json({ ok: true }, 200);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500);
  }
});
