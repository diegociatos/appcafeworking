// ============================================================================
// Edge Function: salvar-integracao  (cadastro de credenciais PELO APP)
//
// POST /functions/v1/salvar-integracao
// body: { unidade_id, tipo: "asaas" | "banco", banco?, secret: {...} }
//
// O CLIENTE digita a credencial na tela; o app envia para cá e guardamos no
// Vault (criptografado). O cliente NUNCA toca no Supabase. A referência do
// segredo é montada AQUI a partir da unidade (o cliente não escolhe o nome),
// evitando que alguém grave segredo de outra unidade.
//
// Tipos suportados:
//   asaas → ref "asaas_<unidade>"     secret { api_key, ambiente }
//   banco → ref "<banco>_<unidade>"   secret { client_id, client_secret,
//                                               cert_pem?, key_pem?, conta_corrente? }
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { userClient, adminClient } from "../_shared/supabaseAdmin.ts";

const BANCOS = ["inter", "itau", "btg", "bradesco"];

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const body = await req.json();
    if (!body?.unidade_id || !body?.tipo || !body?.secret) {
      return json({ error: "Campos obrigatórios: unidade_id, tipo, secret" }, 400);
    }

    const user = userClient(req);
    const { data: auth } = await user.auth.getUser();
    if (!auth?.user) return json({ error: "Não autenticado" }, 401);
    const admin = adminClient();

    // acesso à unidade (membro ou admin da plataforma)
    const { data: pa } = await admin.from("platform_admins").select("user_id").eq("user_id", auth.user.id).maybeSingle();
    if (!pa) {
      const { data: mem } = await admin.from("unidade_members").select("unidade_id").eq("user_id", auth.user.id).eq("unidade_id", body.unidade_id).maybeSingle();
      if (!mem) return json({ error: "Sem acesso a esta unidade." }, 403);
    }

    // a referência é montada no backend (cliente não escolhe)
    let ref = "";
    if (body.tipo === "asaas") {
      if (!body.secret.api_key) return json({ error: "Informe a chave da API Asaas." }, 400);
      ref = `asaas_${body.unidade_id}`;
    } else if (body.tipo === "banco") {
      if (!BANCOS.includes(body.banco)) return json({ error: "Banco inválido." }, 400);
      if (!body.secret.client_id || !body.secret.client_secret) return json({ error: "Informe client_id e client_secret." }, 400);
      ref = `${body.banco}_${body.unidade_id}`;
    } else {
      return json({ error: "Tipo de integração não suportado." }, 400);
    }

    const { error: vErr } = await admin.rpc("upsert_bank_secret", { p_ref: ref, p_secret: JSON.stringify(body.secret) });
    if (vErr) return json({ error: `Falha ao guardar no cofre: ${vErr.message}` }, 500);

    return json({ ok: true, ref }, 200);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500);
  }
});
