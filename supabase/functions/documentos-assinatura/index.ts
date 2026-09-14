// ============================================================================
// Edge Function: documentos-assinatura  (envio de documentos pelo cliente)
//
// POST /functions/v1/documentos-assinatura   (JWT do usuário)
// body: { assinatura_id, tipo, nome, mime, base64 }
//
// Contrato de endereço fiscal, cláusula 3.2: o cliente envia os documentos pela
// plataforma. Arquivo em bucket privado; só o dono e a equipe veem, por link
// temporário.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { caminhoDocumento, TIPOS_DOCUMENTO, validarArquivo } from "../_shared/ciclo.ts";
import { APP_URL, avisarEquipe, BUCKET_DOCUMENTOS, carregarAssinatura, ehEquipe, usuarioDoReq } from "../_shared/assinaturas.ts";

function decodificar(base64: string): Uint8Array | null {
  try {
    const limpo = base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
    const bin = atob(limpo);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch (_) {
    return null;
  }
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405, req);

  try {
    const usuario = await usuarioDoReq(req);
    if (!usuario) return json({ error: "Entre na sua conta para enviar documentos." }, 401, req);

    const body = await req.json().catch(() => ({}));
    const admin = adminClient();
    const a = await carregarAssinatura(admin, body?.assinatura_id);
    if (!a) return json({ error: "Assinatura não encontrada." }, 404, req);

    const dono = String(a.cliente_email).toLowerCase() === usuario.email;
    if (!dono && !(await ehEquipe(req, a.unidade_id))) return json({ error: "Sem acesso a esta assinatura." }, 403, req);
    if (a.status === "cancelada") return json({ error: "Este plano está cancelado." }, 409, req);
    if (!a.docs_status) return json({ error: "Este plano não pede envio de documentos." }, 400, req);
    if (a.docs_status === "aprovado" && dono) {
      return json({ error: "Seus documentos já foram aprovados. Para trocar algum, fale com a equipe." }, 409, req);
    }

    const bytes = typeof body?.base64 === "string" ? decodificar(body.base64) : null;
    if (!bytes) return json({ error: "Arquivo inválido." }, 400, req);
    const arquivo = { tipo: String(body?.tipo || ""), nome: String(body?.nome || ""), mime: String(body?.mime || ""), bytes: bytes.length };
    const v = validarArquivo(arquivo);
    if (!v.ok) return json({ error: v.erro }, 400, req);

    const id = crypto.randomUUID();
    const caminho = caminhoDocumento(a.unidade_id, a.id, arquivo.nome, id);
    const { error: upErr } = await admin.storage.from(BUCKET_DOCUMENTOS).upload(caminho, bytes, { contentType: arquivo.mime, upsert: false });
    if (upErr) return json({ error: `Não foi possível guardar o arquivo: ${upErr.message}` }, 500, req);

    const { data: doc, error: insErr } = await admin.from("assinatura_documentos").insert({
      id, assinatura_id: a.id, unidade_id: a.unidade_id, cliente_email: a.cliente_email,
      tipo: arquivo.tipo, nome_arquivo: arquivo.nome.slice(0, 200), mime: arquivo.mime, bytes: arquivo.bytes,
      storage_path: caminho, enviado_por: usuario.id,
    }).select("id, tipo, nome_arquivo, mime, bytes, created_at").single();
    if (insErr) {
      await admin.storage.from(BUCKET_DOCUMENTOS).remove([caminho]);
      return json({ error: `Não foi possível registrar o arquivo: ${insErr.message}` }, 500, req);
    }

    const { data: mudou } = await admin.from("assinaturas").update({ docs_status: "enviado" })
      .eq("id", a.id).eq("docs_status", "pendente").select("id");
    if (mudou?.length) {
      await avisarEquipe(`Documentos para conferir: ${a.plano_nome}`, [
        `Cliente: ${a.cliente_nome} (${a.cliente_email})`,
        `Primeiro documento: ${TIPOS_DOCUMENTO[arquivo.tipo]}`,
        "Confira em Assinaturas no app. Prazo do contrato: 5 dias úteis.",
      ], APP_URL);
    }

    return json({ ok: true, documento: doc, docs_status: mudou?.length ? "enviado" : a.docs_status }, 201, req);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500, req);
  }
});
