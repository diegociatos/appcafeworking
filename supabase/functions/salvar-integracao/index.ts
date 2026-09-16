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
import { podeMexerNoDinheiro, recusaSemFinanceiro } from "../_shared/permissoes.ts";
import { abrirPfx } from "../_shared/certificadoPfx.ts";

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

    // só admin da plataforma ou master/financeiro da unidade (recepção e contabilidade não)
    if (!(await podeMexerNoDinheiro(admin, auth.user.id, body.unidade_id))) {
      return recusaSemFinanceiro("Salvar integração bancária");
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
      // Certificado anexado como .pfx/.p12: converte para PEM aqui e não guarda o arquivo nem a senha.
      if (body.secret.pfx_base64) {
        try {
          const aberto = abrirPfx(body.secret.pfx_base64, body.secret.pfx_senha ?? "");
          body.secret.cert_pem = aberto.certPem;
          body.secret.key_pem = aberto.keyPem;
          body.secret.cert_titular = aberto.titular || undefined;
          body.secret.cert_validade = aberto.validade || undefined;
        } catch (e) {
          return json({ error: `Não foi possível abrir o certificado (senha incorreta ou arquivo inválido): ${(e as Error).message}` }, 422);
        } finally {
          delete body.secret.pfx_base64;
          delete body.secret.pfx_senha;
        }
      }
      if (body.secret.cert_pem && !String(body.secret.cert_pem).includes("BEGIN CERTIFICATE")) {
        return json({ error: "O arquivo do certificado não parece um certificado válido (.crt, .cer ou .pem)." }, 400);
      }
      if (body.secret.key_pem && !/BEGIN (RSA |EC |ENCRYPTED )?PRIVATE KEY/.test(String(body.secret.key_pem))) {
        return json({ error: "O arquivo da chave privada não parece válido (.key ou .pem)." }, 400);
      }
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
