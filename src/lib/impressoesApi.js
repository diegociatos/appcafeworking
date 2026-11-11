// ============================================================================
// impressoesApi — módulo de Impressões (Fase 1), sempre pelo servidor com o JWT
// do usuário. Cliente envia/consulta os próprios trabalhos; equipe vê o painel
// da unidade e (na Fase 1, sem agente) pode marcar um trabalho como impresso
// para testar a contabilização.
//
//   cliente:  minhas()            → GET  impressoes-cliente
//             enviar(dados)       → POST impressoes-cliente
//   equipe:   painel(unidade_id)  → GET  impressoes-admin
//             concluir(job_id,..) → POST impressao-concluida
// ============================================================================

import { supabaseConfigured, getAccessToken } from "./supabaseAuth.js";
import { erroDaResposta, erroDeRede, MSG } from "./erros.js";

const URL_SUPA = import.meta.env?.VITE_SUPABASE_URL || "";
const ANON = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";

async function chamar(caminho, { method = "GET", body, contexto } = {}) {
  if (!supabaseConfigured) throw new Error(MSG.demo);
  const token = await getAccessToken();
  if (!token) throw new Error(MSG.sessao);
  const headers = {
    apikey: ANON, authorization: `Bearer ${token}`,
    ...(body !== undefined ? { "content-type": "application/json" } : {}),
  };
  let res;
  try {
    res = await fetch(`${URL_SUPA}${caminho}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch (e) {
    throw erroDeRede(e, contexto || caminho);
  }
  const data = res.status === 204 ? null : await res.json().catch(() => ({}));
  if (!res.ok) throw erroDaResposta(res.status, data, contexto || caminho);
  return data;
}

export const impressoesApi = {
  configured: supabaseConfigured,

  // ---- cliente ----
  minhas: () => chamar("/functions/v1/impressoes-cliente", { contexto: "impressoes" }),
  enviar: (dados) => chamar("/functions/v1/impressoes-cliente", { method: "POST", body: dados, contexto: "envio de impressão" }),

  // ---- equipe ----
  painel: (unidade_id, competencia) => chamar(
    `/functions/v1/impressoes-admin?unidade_id=${encodeURIComponent(unidade_id)}${competencia ? `&competencia=${encodeURIComponent(competencia)}` : ""}`,
    { contexto: "painel de impressões" },
  ),
  concluir: (job_id, { status = "impresso", folhas_impressas, erro } = {}) => chamar(
    "/functions/v1/impressao-concluida",
    { method: "POST", body: { job_id, status, folhas_impressas, erro }, contexto: "conclusão da impressão" },
  ),
};

/** Lê um File como base64 (data URL) para enviar ao servidor. */
export function lerArquivoBase64(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ""));
    fr.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    fr.readAsDataURL(file);
  });
}

/** Folhas = ceil(páginas / (duplex ? 2 : 1)) × cópias. Espelha o servidor. */
export function folhasPrevia(paginas, copias, duplex) {
  const p = Math.max(1, Math.floor(Number(paginas) || 1));
  const c = Math.max(1, Math.floor(Number(copias) || 1));
  return Math.ceil(p / (duplex ? 2 : 1)) * c;
}
