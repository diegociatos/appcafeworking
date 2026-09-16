// ============================================================================
// correspondenciasArquivo — foto ou PDF da correspondência no Storage PRIVADO
// (bucket correspondencias, caminho <unidade_id>/<id>.webp|.pdf).
//
// Antes o arquivo ia em base64 dentro do doc do app_state, que toda a equipe
// baixa ao abrir o app. Agora o doc guarda só { nome, tipo, caminho, bytes }.
// A equipe abre por link assinado de 10 minutos (RLS da equipe da unidade); o
// cliente recebe o link pela Edge Function minhas-correspondencias.
//
// Compatibilidade: registros antigos com anexo.url (base64) continuam abrindo.
// Sem Supabase (modo demonstração), o anexo segue embutido como antes.
// ============================================================================

import { supabaseConfigured, getAccessToken } from "./supabaseAuth.js";
import { reduzir } from "./fotosSalas.js";
import { erroDaResposta, erroDeRede, MSG } from "./erros.js";

const URL_SUPA = import.meta.env?.VITE_SUPABASE_URL || "";
const ANON = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";
const BUCKET = "correspondencias";
export const TAMANHO_MAX_CORRESP = 10 * 1024 * 1024;

const caminhoUrl = (caminho) => String(caminho).split("/").map(encodeURIComponent).join("/");

async function token() {
  const t = await getAccessToken();
  if (!t) throw new Error(MSG.sessao);
  return t;
}

async function pedir(caminho, opcoes, contexto) {
  let res;
  try {
    res = await fetch(`${URL_SUPA}${caminho}`, opcoes);
  } catch (e) {
    throw erroDeRede(e, contexto);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = erroDaResposta(res.status, data || {}, contexto);
    if (res.status === 403 || (res.status === 400 && /row-level|policy|unauthorized/i.test(JSON.stringify(data || "")))) {
      e.message = "Sem permissão para mexer nas correspondências desta unidade.";
    }
    throw e;
  }
  return data;
}

function dataUrlParaBlob(dataUrl) {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(String(dataUrl || ""));
  if (!m) throw new Error("Não foi possível ler o arquivo. Anexe de novo.");
  const bruto = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
  const bytes = new Uint8Array(bruto.length);
  for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
  return new Blob([bytes], { type: m[1] || "application/octet-stream" });
}

/** O anexo está no Storage (e não embutido no registro)? */
export const anexoNoStorage = (anexo) => Boolean(anexo?.caminho);

/**
 * Sobe o anexo escolhido no formulário ({ nome, tipo, url: dataURL }) e devolve
 * o que vai no registro: { nome, tipo, caminho, bytes }. Foto vira WebP reduzido.
 */
export async function enviarAnexoCorrespondencia(unidadeId, correspondenciaId, anexo) {
  if (!anexo) return null;
  if (!supabaseConfigured) return anexo; // demonstração: segue embutido
  if (!unidadeId || !correspondenciaId) throw new Error("Unidade não identificada.");
  const original = dataUrlParaBlob(anexo.url);
  const ehImagem = (anexo.tipo || original.type || "").startsWith("image");
  const ehPdf = (anexo.tipo || original.type) === "application/pdf";
  if (!ehImagem && !ehPdf) throw new Error("Envie uma foto ou um PDF.");
  const corpo = ehImagem ? await reduzir(original) : original;
  if (corpo.size > TAMANHO_MAX_CORRESP) throw new Error("Arquivo acima de 10 MB.");
  const tipo = ehImagem ? "image/webp" : "application/pdf";
  const caminho = `${unidadeId}/${correspondenciaId}.${ehImagem ? "webp" : "pdf"}`;
  const t = await token();
  await pedir(`/storage/v1/object/${BUCKET}/${caminhoUrl(caminho)}`, {
    method: "POST",
    headers: { apikey: ANON, authorization: `Bearer ${t}`, "content-type": tipo, "x-upsert": "true" },
    body: corpo,
  }, "correspondencia-upload");
  return { nome: anexo.nome || `correspondencia.${ehImagem ? "webp" : "pdf"}`, tipo, caminho, bytes: corpo.size };
}

/** Endereço para abrir o anexo: link assinado de 10 min, ou o base64 antigo. */
export async function linkAnexoCorrespondencia(anexo, { baixar = false } = {}) {
  if (!anexo) return "";
  if (!anexoNoStorage(anexo)) return anexo.url || "";
  const t = await token();
  const r = await pedir(`/storage/v1/object/sign/${BUCKET}/${caminhoUrl(anexo.caminho)}`, {
    method: "POST", headers: { apikey: ANON, authorization: `Bearer ${t}`, "content-type": "application/json" },
    body: JSON.stringify({ expiresIn: 600 }),
  }, "correspondencia-link");
  const rel = r?.signedURL || r?.signedUrl || "";
  const url = rel.startsWith("http") ? rel : `${URL_SUPA}/storage/v1${rel}`;
  return baixar ? `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(anexo.nome || "correspondencia")}` : url;
}

/** Apaga o arquivo do Storage (anexo antigo embutido não tem o que apagar). Nunca lança. */
export async function removerAnexoCorrespondencia(anexo) {
  if (!supabaseConfigured || !anexoNoStorage(anexo)) return;
  try {
    const t = await token();
    await fetch(`${URL_SUPA}/storage/v1/object/${BUCKET}/${caminhoUrl(anexo.caminho)}`, {
      method: "DELETE", headers: { apikey: ANON, authorization: `Bearer ${t}` },
    });
  } catch (e) {
    console.warn("[correspondencia-remover]", e);
  }
}
