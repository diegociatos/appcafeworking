// ============================================================================
// Edge Function: criar-unidade  (master/admin cria uma nova unidade)
//
// POST /functions/v1/criar-unidade
// body: { nome, endereco?, cidade?, cor?, franqueado_id }
//
// Cria a unidade sob a CONTA (franqueado_id) do solicitante e o vincula como
// master da nova unidade — assim ele já opera por ela. Autorizado ao admin da
// plataforma OU ao master da conta.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { userClient, adminClient } from "../_shared/supabaseAdmin.ts";

const slug = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 18) || "un";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const body = await req.json();
    if (!body?.nome || !body?.franqueado_id) {
      return json({ error: "Campos obrigatórios: nome, franqueado_id" }, 400);
    }

    const user = userClient(req);
    const { data: auth } = await user.auth.getUser();
    if (!auth?.user) return json({ error: "Não autenticado" }, 401);
    const admin = adminClient();

    // autorização: admin da plataforma OU master da conta (franqueado_id)
    const { data: pa } = await admin.from("platform_admins").select("user_id").eq("user_id", auth.user.id).maybeSingle();
    if (!pa) {
      const { data: mem } = await admin.from("unidade_members")
        .select("role").eq("user_id", auth.user.id).eq("franqueado_id", body.franqueado_id).limit(1);
      const ehMaster = (mem || []).some((m) => m.role === "master");
      if (!ehMaster) return json({ error: "Apenas o master da conta pode criar unidades." }, 403);
    }

    const unidadeId = `un_${slug(body.nome)}_${crypto.randomUUID().slice(0, 6)}`.slice(0, 40);
    const { data: unidade, error: e1 } = await admin.from("unidades").insert({
      id: unidadeId, franqueado_id: body.franqueado_id, nome: body.nome,
      endereco: body.endereco || "", cidade: body.cidade || null,
      cor: body.cor || "#6E4E3B", salas: 0, ocupacao: 0, membros: 0, receita: 0,
    }).select().single();
    if (e1) return json({ error: `Falha ao criar a unidade: ${e1.message}` }, 500);

    // vincula o solicitante como master da nova unidade
    const { error: e2 } = await admin.from("unidade_members").insert({
      user_id: auth.user.id, unidade_id: unidadeId, franqueado_id: body.franqueado_id, role: "master",
    });
    if (e2) { /* unidade criada; vínculo pode já existir — não bloqueia */ console.warn(e2.message); }

    return json({
      unidade: { id: unidadeId, franqueadoId: body.franqueado_id, nome: body.nome, endereco: body.endereco || "", cidade: body.cidade || "", cor: body.cor || "#6E4E3B", salas: 0, ocupacao: 0, membros: 0, receita: 0 },
    }, 201);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500);
  }
});
