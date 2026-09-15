// ============================================================================
// Edge Function: documentos-assinatura  (envio de documentos pelo cliente)
//
// POST /functions/v1/documentos-assinatura   (JWT do usuário)
//
// Envio direto ao Storage (preferido, sem base64 de vários MB no JSON):
//   1) { acao: "preparar", assinatura_id, tipo, nome, mime, bytes }
//      → { id, upload_url }   link de envio de uso único para o caminho certo
//   2) navegador envia o arquivo (PUT) para upload_url, com barra de progresso
//   3) { acao: "confirmar", assinatura_id, id, tipo, nome }
//      → confere no Storage tamanho e tipo reais e registra o documento
//
// Compatível com a versão anterior: { assinatura_id, tipo, nome, mime, base64 }.
//
// Contrato de endereço fiscal, cláusula 3.2: o cliente envia os documentos pela
// plataforma. Arquivo em bucket privado; só o dono e a equipe veem, por link
// temporário.
// ============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { caminhoDocumento, TIPOS_DOCUMENTO, validarArquivo } from "../_shared/ciclo.ts";
import {
  APP_URL, avisarEquipe, BUCKET_DOCUMENTOS, carregarAssinatura, ehEquipe, type Linha, usuarioDoReq,
} from "../_shared/assinaturas.ts";

const FALHA_ARQUIVO = "Não foi possível guardar o arquivo. Tente de novo.";

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Grava a linha do documento, marca "enviado" e avisa a equipe no primeiro envio. */
async function registrar(
  admin: SupabaseClient, a: Linha, usuarioId: string, id: string, caminho: string,
  arquivo: { tipo: string; nome: string; mime: string; bytes: number },
) {
  const { data: doc, error: insErr } = await admin.from("assinatura_documentos").insert({
    id, assinatura_id: a.id, unidade_id: a.unidade_id, cliente_email: a.cliente_email,
    tipo: arquivo.tipo, nome_arquivo: arquivo.nome.slice(0, 200), mime: arquivo.mime, bytes: arquivo.bytes,
    storage_path: caminho, enviado_por: usuarioId,
  }).select("id, tipo, nome_arquivo, mime, bytes, created_at").single();
  if (insErr) {
    await admin.storage.from(BUCKET_DOCUMENTOS).remove([caminho]);
    throw new Error(`assinatura_documentos: ${insErr.message}`);
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
  return { documento: doc, docs_status: mudou?.length ? "enviado" : a.docs_status };
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
    if (!a) return json({ error: "Plano não encontrado." }, 404, req);

    const dono = String(a.cliente_email).toLowerCase() === usuario.email;
    if (!dono && !(await ehEquipe(req, a.unidade_id))) return json({ error: "Plano não encontrado." }, 404, req);
    if (a.status === "cancelada") return json({ error: "Este plano está cancelado." }, 409, req);
    if (!a.docs_status) return json({ error: "Este plano não pede envio de documentos." }, 400, req);
    if (a.docs_status === "aprovado" && dono) {
      return json({ error: "Seus documentos já foram aprovados. Para trocar algum, fale com a recepção." }, 409, req);
    }

    const acao = body?.acao;

    // ---- 1) preparar o envio direto ------------------------------------------
    if (acao === "preparar") {
      const arquivo = { tipo: String(body?.tipo || ""), nome: String(body?.nome || ""), mime: String(body?.mime || ""), bytes: Number(body?.bytes || 0) };
      const v = validarArquivo(arquivo);
      if (!v.ok) return json({ error: v.erro }, 400, req);
      const id = crypto.randomUUID();
      const caminho = caminhoDocumento(a.unidade_id, a.id, arquivo.nome, id);
      const { data, error } = await admin.storage.from(BUCKET_DOCUMENTOS).createSignedUploadUrl(caminho);
      if (error || !data?.signedUrl) {
        console.error("[documentos-assinatura] link de envio", error?.message);
        return json({ error: FALHA_ARQUIVO }, 500, req);
      }
      return json({ ok: true, id, upload_url: data.signedUrl }, 200, req);
    }

    // ---- 3) confirmar depois do envio ------------------------------------------
    if (acao === "confirmar") {
      const id = String(body?.id || "");
      if (!UUID.test(id)) return json({ error: "Envio inválido. Tente de novo." }, 400, req);
      const nome = String(body?.nome || "");
      const tipo = String(body?.tipo || "");
      // O caminho é recalculado aqui: o navegador não escolhe onde o arquivo fica.
      const caminho = caminhoDocumento(a.unidade_id, a.id, nome, id);
      const pasta = caminho.slice(0, caminho.lastIndexOf("/"));
      const arquivoNome = caminho.slice(caminho.lastIndexOf("/") + 1);
      const { data: itens, error: lErr } = await admin.storage.from(BUCKET_DOCUMENTOS).list(pasta, { search: id, limit: 5 });
      if (lErr) {
        console.error("[documentos-assinatura] conferir envio", lErr.message);
        return json({ error: FALHA_ARQUIVO }, 500, req);
      }
      const obj = (itens || []).find((i) => i.name === arquivoNome);
      if (!obj) return json({ error: "O arquivo não chegou. Envie de novo." }, 400, req);
      const { data: jaTem } = await admin.from("assinatura_documentos").select("id").eq("id", id).maybeSingle();
      if (jaTem) return json({ ok: true, repetido: true }, 200, req);

      // deno-lint-ignore no-explicit-any
      const meta = (obj.metadata || {}) as any;
      const arquivo = { tipo, nome, mime: String(meta.mimetype || ""), bytes: Number(meta.size || 0) };
      const v = validarArquivo(arquivo);
      if (!v.ok) {
        await admin.storage.from(BUCKET_DOCUMENTOS).remove([caminho]);
        return json({ error: v.erro }, 400, req);
      }
      const r = await registrar(admin, a, usuario.id, id, caminho, arquivo);
      return json({ ok: true, ...r }, 201, req);
    }

    // ---- envio antigo (base64 no JSON) -------------------------------------------
    const bytes = typeof body?.base64 === "string" ? decodificar(body.base64) : null;
    if (!bytes) return json({ error: "Arquivo inválido." }, 400, req);
    const arquivo = { tipo: String(body?.tipo || ""), nome: String(body?.nome || ""), mime: String(body?.mime || ""), bytes: bytes.length };
    const v = validarArquivo(arquivo);
    if (!v.ok) return json({ error: v.erro }, 400, req);

    const id = crypto.randomUUID();
    const caminho = caminhoDocumento(a.unidade_id, a.id, arquivo.nome, id);
    const { error: upErr } = await admin.storage.from(BUCKET_DOCUMENTOS).upload(caminho, bytes, { contentType: arquivo.mime, upsert: false });
    if (upErr) {
      console.error("[documentos-assinatura] upload", upErr.message);
      return json({ error: FALHA_ARQUIVO }, 500, req);
    }
    const r = await registrar(admin, a, usuario.id, id, caminho, arquivo);
    return json({ ok: true, ...r }, 201, req);
  } catch (e) {
    console.error("[documentos-assinatura]", e);
    return json({ error: FALHA_ARQUIVO }, 500, req);
  }
});
