// ============================================================================
// documentosUnidadeApi — kit do endereço fiscal da unidade (equipe).
//
// Arquivo no bucket PRIVADO documentos-unidade (<unidade_id>/<uuid>-<nome>) e
// registro na tabela unidade_documentos, os dois com a RLS da equipe da
// unidade. O cliente nunca acessa direto: recebe link de 10 minutos pela Edge
// Function kit-endereco, e só com endereço fiscal ativo e documentos aprovados.
// ============================================================================

import { supabaseConfigured, getAccessToken } from "./supabaseAuth.js";
import { erroDaResposta, erroDeRede, MSG } from "./erros.js";

const URL_SUPA = import.meta.env?.VITE_SUPABASE_URL || "";
const ANON = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";
const BUCKET = "documentos-unidade";
export const TAMANHO_MAX_KIT = 10 * 1024 * 1024;
export const MIMES_KIT = ["application/pdf", "image/jpeg", "image/png"];

export const TIPOS_KIT = {
  iptu: "IPTU do imóvel",
  alvara: "Alvará ou dispensa de alvará",
  anuencia_modelo: "Modelo da declaração de anuência",
  comprovante_imovel: "Comprovante do imóvel",
  avcb: "AVCB (Corpo de Bombeiros)",
  habite_se: "Habite-se",
  autorizacao_proprietario: "Autorização do proprietário",
  outro: "Outro documento",
};

/** Tipos em que o número importa (a abertura de empresa usa o índice cadastral do IPTU). */
export const ROTULO_NUMERO_KIT = {
  iptu: "Índice cadastral do IPTU",
  avcb: "Número do AVCB",
  habite_se: "Número do habite-se",
  alvara: "Número do alvará",
};

async function token() {
  if (!supabaseConfigured) throw new Error(MSG.demo);
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
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const e = erroDaResposta(res.status, data || {}, contexto);
    if (res.status === 403 || (res.status === 400 && /row-level|policy|unauthorized/i.test(JSON.stringify(data || "")))) {
      e.message = "Sem permissão para mexer nos documentos desta unidade.";
    }
    throw e;
  }
  return data;
}

const limparNome = (nome) => String(nome || "arquivo")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^A-Za-z0-9.]+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(-80) || "arquivo";

export const documentosUnidadeApi = {
  listar: async (unidadeId) => {
    const t = await token();
    return pedir(
      `/rest/v1/unidade_documentos?select=id,tipo,titulo,numero,nome_arquivo,mime,bytes,validade,storage_path,created_at,revisao_status,revisao_observacoes&unidade_id=eq.${encodeURIComponent(unidadeId)}&order=tipo.asc,created_at.desc`,
      { headers: { apikey: ANON, authorization: `Bearer ${t}` } }, "kit-listar",
    );
  },

  enviar: async (unidadeId, { tipo, titulo, numero, validade, arquivo }) => {
    if (!TIPOS_KIT[tipo]) throw new Error("Escolha o tipo do documento.");
    if (!String(titulo || "").trim()) throw new Error("Dê um nome ao documento.");
    if (!arquivo) throw new Error("Escolha o arquivo.");
    if (!MIMES_KIT.includes(arquivo.type)) throw new Error(MSG.tipoArquivo);
    if (arquivo.size > TAMANHO_MAX_KIT) throw new Error("Arquivo acima de 10 MB.");
    const t = await token();
    const caminho = `${unidadeId}/${crypto.randomUUID()}-${limparNome(arquivo.name)}`;
    const caminhoUrl = caminho.split("/").map(encodeURIComponent).join("/");
    await pedir(`/storage/v1/object/${BUCKET}/${caminhoUrl}`, {
      method: "POST",
      headers: { apikey: ANON, authorization: `Bearer ${t}`, "content-type": arquivo.type, "x-upsert": "false" },
      body: arquivo,
    }, "kit-upload");
    try {
      const linhas = await pedir("/rest/v1/unidade_documentos", {
        method: "POST",
        headers: { apikey: ANON, authorization: `Bearer ${t}`, "content-type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({
          unidade_id: unidadeId, tipo, titulo: String(titulo).trim().slice(0, 200), nome_arquivo: String(arquivo.name).slice(0, 200),
          mime: arquivo.type, bytes: arquivo.size, storage_path: caminho, validade: validade || null,
          numero: String(numero || "").trim().slice(0, 100) || null,
        }),
      }, "kit-registro");
      return linhas?.[0];
    } catch (e) {
      // não deixa arquivo órfão no bucket
      await fetch(`${URL_SUPA}/storage/v1/object/${BUCKET}/${caminhoUrl}`, { method: "DELETE", headers: { apikey: ANON, authorization: `Bearer ${t}` } }).catch(() => {});
      throw e;
    }
  },

  remover: async (doc) => {
    const t = await token();
    await pedir(`/rest/v1/unidade_documentos?id=eq.${encodeURIComponent(doc.id)}`, {
      method: "DELETE", headers: { apikey: ANON, authorization: `Bearer ${t}`, Prefer: "return=minimal" },
    }, "kit-remover");
    const caminhoUrl = doc.storage_path.split("/").map(encodeURIComponent).join("/");
    await fetch(`${URL_SUPA}/storage/v1/object/${BUCKET}/${caminhoUrl}`, { method: "DELETE", headers: { apikey: ANON, authorization: `Bearer ${t}` } }).catch(() => {});
  },

  /** Link temporário (10 min) para a equipe conferir o arquivo. */
  link: async (doc) => {
    const t = await token();
    const caminhoUrl = doc.storage_path.split("/").map(encodeURIComponent).join("/");
    const r = await pedir(`/storage/v1/object/sign/${BUCKET}/${caminhoUrl}`, {
      method: "POST", headers: { apikey: ANON, authorization: `Bearer ${t}`, "content-type": "application/json" },
      body: JSON.stringify({ expiresIn: 600 }),
    }, "kit-link");
    const rel = r?.signedURL || r?.signedUrl || "";
    return rel.startsWith("http") ? rel : `${URL_SUPA}/storage/v1${rel}`;
  },
};
