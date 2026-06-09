// ============================================================================
// Edge Function: criar-usuario-equipe (cria login de um membro da equipe)
//
// POST /functions/v1/criar-usuario-equipe
// body: { nome, email, perfil (master|recepcao|financeiro), unidade_ids[], senha? }
//
// Cria, com service_role:
//   1. o login no Supabase Auth,
//   2. o cadastro em usuarios (unidade primária),
//   3. os vínculos de acesso (unidade_members) — UMA linha por unidade marcada,
//      com o papel escolhido (gerente=master).
// Devolve o login + a senha temporária. Pode ser chamada pelo admin da
// plataforma OU pelo master das unidades em questão.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { userClient, adminClient } from "../_shared/supabaseAdmin.ts";

const ROLES = ["master", "recepcao", "financeiro"];

function gerarSenha(): string {
  const cs = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const a = new Uint8Array(10); crypto.getRandomValues(a);
  let s = ""; for (const x of a) s += cs[x % cs.length];
  return s + "!9";
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const body = await req.json();
    for (const k of ["nome", "email", "perfil", "unidade_ids"]) {
      if (!body?.[k]) return json({ error: `Campo obrigatório ausente: ${k}` }, 400);
    }
    if (!Array.isArray(body.unidade_ids) || !body.unidade_ids.length) {
      return json({ error: "Selecione ao menos uma unidade." }, 400);
    }
    if (!ROLES.includes(body.perfil)) return json({ error: "Perfil inválido." }, 400);

    const user = userClient(req);
    const { data: auth } = await user.auth.getUser();
    if (!auth?.user) return json({ error: "Não autenticado" }, 401);
    const admin = adminClient();

    // Autorização: admin da plataforma OU membro de TODAS as unidades-alvo.
    const { data: pa } = await admin.from("platform_admins").select("user_id").eq("user_id", auth.user.id).maybeSingle();
    if (!pa) {
      const { data: mine } = await admin.from("unidade_members").select("unidade_id").eq("user_id", auth.user.id);
      const meus = new Set((mine || []).map((m) => m.unidade_id));
      if (!body.unidade_ids.every((id: string) => meus.has(id))) {
        return json({ error: "Você só pode dar acesso a unidades que gerencia." }, 403);
      }
    }

    const { data: unids } = await admin.from("unidades").select("id, franqueado_id").in("id", body.unidade_ids);
    if (!unids?.length) return json({ error: "Unidades não encontradas." }, 404);

    const email = String(body.email).toLowerCase().trim();
    const senha = (body.senha && String(body.senha).length >= 6) ? String(body.senha) : gerarSenha();

    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email, password: senha, email_confirm: true, user_metadata: { nome: body.nome },
    });
    if (cErr || !created?.user) {
      const dup = /already|registered|exists/i.test(cErr?.message || "");
      return json({ error: dup ? "Já existe um login com este e-mail." : `Falha ao criar o login: ${cErr?.message}` }, dup ? 409 : 422);
    }
    const userId = created.user.id;
    const rollback = async () => { try { await admin.auth.admin.deleteUser(userId); } catch (_) { /* noop */ } };

    const usuarioId = "us_" + crypto.randomUUID().slice(0, 8);
    const { error: uErr } = await admin.from("usuarios").insert({
      id: usuarioId, unidade_id: body.unidade_ids[0], nome: body.nome, email, perfil: body.perfil, ativo: true,
    });
    if (uErr) { await rollback(); return json({ error: `Falha ao gravar o usuário: ${uErr.message}` }, 500); }

    const rows = body.unidade_ids.map((uid: string) => ({
      user_id: userId, unidade_id: uid,
      franqueado_id: unids.find((u) => u.id === uid)?.franqueado_id || null,
      role: body.perfil,
    }));
    const { error: mErr } = await admin.from("unidade_members").insert(rows);
    if (mErr) {
      await rollback(); await admin.from("usuarios").delete().eq("id", usuarioId);
      return json({ error: `Falha ao vincular o acesso: ${mErr.message}` }, 500);
    }

    return json({
      ok: true,
      usuario: { id: usuarioId, nome: body.nome, email, perfil: body.perfil, unidadeIds: body.unidade_ids, unidadeId: body.unidade_ids[0], ativo: true },
      login: { email, senha_temporaria: senha },
    }, 201);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500);
  }
});
