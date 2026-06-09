// ============================================================================
// Edge Function: cadastrar-cliente  (autocadastro do cliente do coworking)
//
// POST /functions/v1/cadastrar-cliente   (deploy com --no-verify-jwt)
// body: { nome, email, senha, telefone?, documento?, unidade_id }
//
// Cria, com service_role:
//   1. o login no Supabase Auth (email_confirm = true → já pode entrar),
//   2. o registro em clientes (vinculado à unidade escolhida),
//   3. o vínculo de acesso unidade_members (role 'cliente').
// Depois o front faz login com email/senha → cai no Portal do Cliente.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const body = await req.json();
    for (const k of ["nome", "email", "senha", "unidade_id"]) {
      if (!body?.[k]) return json({ error: `Campo obrigatório ausente: ${k}` }, 400);
    }
    const email = String(body.email).toLowerCase().trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "E-mail inválido." }, 400);
    if (String(body.senha).length < 6) return json({ error: "A senha precisa de pelo menos 6 caracteres." }, 400);

    const admin = adminClient();

    // unidade válida + franqueado
    const { data: unidade } = await admin.from("unidades").select("id, franqueado_id, nome").eq("id", body.unidade_id).maybeSingle();
    if (!unidade) return json({ error: "Unidade inválida." }, 404);

    // 1) login no Auth
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email, password: String(body.senha), email_confirm: true,
      user_metadata: { nome: body.nome, tipo: "cliente" },
    });
    if (cErr || !created?.user) {
      const dup = /already|registered|exists/i.test(cErr?.message || "");
      return json({ error: dup ? "Já existe uma conta com este e-mail. Tente entrar." : `Não foi possível criar a conta: ${cErr?.message}` }, dup ? 409 : 422);
    }
    const userId = created.user.id;
    const rollback = async () => { try { await admin.auth.admin.deleteUser(userId); } catch (_) { /* noop */ } };

    // 2) registro em clientes
    const clienteId = "c_" + crypto.randomUUID().slice(0, 10);
    const ano = new Date().getFullYear();
    const { error: clErr } = await admin.from("clientes").insert({
      id: clienteId, unidade_id: unidade.id, nome: body.nome, documento: body.documento || null,
      plano: "Visitante", fiscal: false, status: "ativo", desde: String(ano),
      contato: body.nome, email, telefone: body.telefone || null,
    });
    if (clErr) { await rollback(); return json({ error: `Falha ao criar o cadastro: ${clErr.message}` }, 500); }

    // 3) vínculo de acesso (role cliente)
    const { error: mErr } = await admin.from("unidade_members").insert({
      user_id: userId, unidade_id: unidade.id, franqueado_id: unidade.franqueado_id, role: "cliente",
    });
    if (mErr) { await rollback(); await admin.from("clientes").delete().eq("id", clienteId); return json({ error: `Falha ao liberar o acesso: ${mErr.message}` }, 500); }

    return json({ ok: true, email, unidade: { id: unidade.id, nome: unidade.nome } }, 201);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500);
  }
});
