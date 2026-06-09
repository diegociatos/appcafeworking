// ============================================================================
// Edge Function: salvar-certificado
//
// POST /functions/v1/salvar-certificado
// body: { unidade_id, pfx_base64, senha }
//
// Recebe o certificado A1 (.pfx/.p12) em base64 + senha, converte para PEM
// (cert + chave), e grava TUDO no Supabase Vault (upsert_fiscal_secret). O
// certificado NUNCA fica no front nem em coluna comum. Em config_fiscal só
// guardamos metadados não sensíveis (titular, validade, referência do Vault).
//
// Segurança:
//  1. JWT do usuário → RLS confirma que ele é membro da unidade.
//  2. Conversão/gravação com service_role (Vault só responde ao backend).
// ============================================================================

import forge from "https://esm.sh/node-forge@1.3.1";
import { handleOptions, json } from "../_shared/cors.ts";
import { userClient, adminClient } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const body = await req.json();
    for (const k of ["unidade_id", "pfx_base64", "senha"]) {
      if (!body?.[k]) return json({ error: `Campo obrigatório ausente: ${k}` }, 400);
    }

    // 1) usuário autenticado + acesso à unidade (membro OU admin da plataforma)
    const user = userClient(req);
    const { data: auth } = await user.auth.getUser();
    if (!auth?.user) return json({ error: "Não autenticado" }, 401);

    const admin = adminClient();
    const { data: pa } = await admin.from("platform_admins").select("user_id").eq("user_id", auth.user.id).maybeSingle();
    if (!pa) {
      const { data: mem } = await admin.from("unidade_members")
        .select("unidade_id").eq("user_id", auth.user.id).eq("unidade_id", body.unidade_id).maybeSingle();
      if (!mem) return json({ error: "Sem acesso à configuração fiscal desta unidade" }, 403);
    }

    // 2) abre o .pfx e extrai cert + chave em PEM
    let certPem = "", keyPem = "", titular = "", validade: string | null = null;
    try {
      const pfxB64 = String(body.pfx_base64).replace(/^data:.*;base64,/, "");
      const der = forge.util.decode64(pfxB64);
      const p12Asn1 = forge.asn1.fromDer(der);
      const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, body.senha);

      const shrouded = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
      const plainKey = p12.getBags({ bagType: forge.pki.oids.keyBag });
      const keyBag = shrouded[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]
        ?? plainKey[forge.pki.oids.keyBag]?.[0];
      if (!keyBag?.key) throw new Error("chave privada não encontrada no certificado");
      keyPem = forge.pki.privateKeyToPem(keyBag.key);

      const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
      const cert = certBags[forge.pki.oids.certBag]?.[0]?.cert;
      if (!cert) throw new Error("certificado não encontrado no arquivo");
      certPem = forge.pki.certificateToPem(cert);
      titular = cert.subject.getField("CN")?.value ?? "";
      validade = cert.validity?.notAfter ? new Date(cert.validity.notAfter).toISOString().slice(0, 10) : null;
    } catch (e) {
      return json({ error: `Não foi possível abrir o certificado (senha incorreta ou arquivo inválido): ${(e as Error).message}` }, 422);
    }

    // 3) grava o segredo no Vault (service_role)
    const ref = `cert_nfse_${body.unidade_id}`;
    const secret = JSON.stringify({
      cert_pfx_base64: String(body.pfx_base64).replace(/^data:.*;base64,/, ""),
      cert_senha: body.senha,
      cert_pem: certPem,
      key_pem: keyPem,
    });
    const { error: vErr } = await admin.rpc("upsert_fiscal_secret", { p_ref: ref, p_secret: secret });
    if (vErr) return json({ error: `Falha ao guardar no Vault: ${vErr.message}` }, 500);

    // 4) metadados em config_fiscal (sem o segredo) — cria a linha se não existir
    const { error: uErr } = await admin
      .from("config_fiscal")
      .upsert({
        unidade_id: body.unidade_id,
        certificado_ref: ref,
        certificado_titular: titular,
        certificado_validade: validade,
        certificado_enviado_em: new Date().toISOString(),
      }, { onConflict: "unidade_id" });
    if (uErr) return json({ error: `Certificado salvo, mas falhou ao atualizar config: ${uErr.message}` }, 500);

    return json({ ok: true, certificado_ref: ref, titular, validade }, 200);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500);
  }
});
