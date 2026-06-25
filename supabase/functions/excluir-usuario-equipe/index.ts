// ============================================================================
// Edge Function: excluir-usuario-equipe (remove um membro da equipe)
//
// POST /functions/v1/excluir-usuario-equipe   body: { usuario_id }
//
// Apaga, com service_role: os vínculos (unidade_members), o login no Auth e o
// registro em `usuarios`. Como `usuarios` guarda o e-mail (não o auth user_id),
// localizamos o login pelo e-mail. Pode ser chamada pelo admin da plataforma OU
// por um membro (master) da unidade do usuário.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { userClient, adminClient } from "../_shared/supabaseAdmin.ts";

async function acharAuthUserIdPorEmail(admin: any, email: string): Promise<string | null> {
  const alvo = email.toLowerCase().trim();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) break;
    const achado = data.users.find((u: any) => (u.email || "").toLowerCase() === alvo);
    if (achado) return achado.id;
    if (data.users.length < 1000) break;
  }
  return null;
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const body = await req.json();
    if (!body?.usuario_id) return json({ error: "usuario_id é obrigatório." }, 400);

    const user = userClient(req);
    const { data: auth } = await user.auth.getUser();
    if (!auth?.user) return json({ error: "Não autenticado" }, 401);
    const admin = adminClient();

    const { data: usuario } = await admin.from("usuarios").select("*").eq("id", body.usuario_id).maybeSingle();
    if (!usuario) return json({ error: "Usuário não encontrado." }, 404);

    // Autorização: admin da plataforma OU membro da unidade do usuário.
    const { data: pa } = await admin.from("platform_admins").select("user_id").eq("user_id", auth.user.id).maybeSingle();
    if (!pa) {
      const { data: mem } = await admin.from("unidade_members").select("unidade_id").eq("user_id", auth.user.id).eq("unidade_id", usuario.unidade_id).maybeSingle();
      if (!mem) return json({ error: "Você não pode excluir usuários desta unidade." }, 403);
    }

    // Localiza o login pelo e-mail e remove vínculos + login.
    const alvoId = usuario.email ? await acharAuthUserIdPorEmail(admin, usuario.email) : null;
    if (alvoId) {
      if (alvoId === auth.user.id) return json({ error: "Você não pode excluir o seu próprio usuário." }, 400);
      await admin.from("unidade_members").delete().eq("user_id", alvoId);
      try { await admin.auth.admin.deleteUser(alvoId); } catch (_) { /* segue */ }
    }
    await admin.from("usuarios").delete().eq("id", body.usuario_id);

    return json({ ok: true, removidoLogin: Boolean(alvoId) }, 200);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500);
  }
});
