// ============================================================================
// Edge Function: criar-coworking  (onboarding de um novo coworking cliente)
//
// POST /functions/v1/criar-coworking
// body: { empresa, master_nome, master_email, documento?, telefone?, plano?,
//         mensalidade?, unidade_nome, endereco?, senha? }
//
// Só o ADMIN DA PLATAFORMA pode chamar. Cria, com service_role:
//   1. o usuário master no Supabase Auth (login),
//   2. a conta (contas),
//   3. a primeira unidade (unidades),
//   4. o vínculo de acesso (unidade_members, role=master).
// Devolve o login + a senha temporária para o admin repassar ao cliente.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { userClient, adminClient } from "../_shared/supabaseAdmin.ts";

// NFD decompõe acentos em base+marca; o filtro [^a-z0-9] remove as marcas.
const slug = (s: string) =>
  (s || "").toLowerCase().normalize("NFD")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 18) || "x";

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
    for (const k of ["empresa", "master_nome", "master_email", "unidade_nome"]) {
      if (!body?.[k]) return json({ error: `Campo obrigatório ausente: ${k}` }, 400);
    }

    // 1) o chamador precisa ser admin da plataforma
    const user = userClient(req);
    const { data: auth } = await user.auth.getUser();
    if (!auth?.user) return json({ error: "Não autenticado" }, 401);
    const admin = adminClient();
    const { data: pa } = await admin
      .from("platform_admins").select("user_id").eq("user_id", auth.user.id).maybeSingle();
    if (!pa) return json({ error: "Apenas o administrador da plataforma pode cadastrar coworkings." }, 403);

    const email = String(body.master_email).toLowerCase().trim();
    const senha = (body.senha && String(body.senha).length >= 6) ? String(body.senha) : gerarSenha();

    // 2) cria o login do master no Auth
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email, password: senha, email_confirm: true,
      user_metadata: { nome: body.master_nome },
    });
    if (cErr || !created?.user) {
      const dup = /already|registered|exists/i.test(cErr?.message || "");
      return json({ error: dup ? "Já existe um login com este e-mail." : `Falha ao criar o login: ${cErr?.message}` }, dup ? 409 : 422);
    }
    const userId = created.user.id;

    // 3) ids legíveis e únicos
    const suf = crypto.randomUUID().slice(0, 6);
    const contaId = `fr_${slug(body.empresa)}_${suf}`.slice(0, 40);
    const unidadeId = `un_${slug(body.unidade_nome)}_${suf}`.slice(0, 40);

    // limpa em caso de falha parcial (best-effort)
    const rollback = async () => { try { await admin.auth.admin.deleteUser(userId); } catch (_) { /* noop */ } };

    const { error: e1 } = await admin.from("contas").insert({
      id: contaId, nome: body.empresa, master: body.master_nome, email,
      documento: body.documento || null, telefone: body.telefone || null,
      plano: body.plano || "Essencial", mensalidade: Number(body.mensalidade) || 0,
    });
    if (e1) { await rollback(); return json({ error: `Falha ao criar a conta: ${e1.message}` }, 500); }

    const { error: e2 } = await admin.from("unidades").insert({
      id: unidadeId, franqueado_id: contaId, nome: body.unidade_nome,
      endereco: body.endereco || "", cidade: body.cidade || null,
      cor: "#6E4E3B", salas: 0, ocupacao: 0, membros: 0, receita: 0,
    });
    if (e2) { await rollback(); return json({ error: `Falha ao criar a unidade: ${e2.message}` }, 500); }

    const { error: e3 } = await admin.from("unidade_members").insert({
      user_id: userId, unidade_id: unidadeId, franqueado_id: contaId, role: "master",
    });
    if (e3) { await rollback(); return json({ error: `Falha ao vincular o master: ${e3.message}` }, 500); }

    return json({
      ok: true,
      conta: { id: contaId, nome: body.empresa, master: body.master_nome, email, documento: body.documento || null, telefone: body.telefone || null, plano: body.plano || "Essencial", mensalidade: Number(body.mensalidade) || 0 },
      unidade: { id: unidadeId, franqueadoId: contaId, nome: body.unidade_nome, endereco: body.endereco || "" },
      login: { email, senha_temporaria: senha },
    }, 201);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500);
  }
});
