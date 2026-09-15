// ============================================================================
// clienteApi — dados da área do cliente, sempre pelo servidor com o JWT do
// próprio cliente (o cliente não lê app_state nem tabelas internas).
//
//   minhasFaturas()           → minhas-faturas
//   minhaAssinatura()         → minha-assinatura (cache compartilhado com MeuPlano)
//   kitEndereco()             → kit-endereco
//   correspondencias()        → minhas-correspondencias
//   anexoCorrespondencia(id)  → minhas-correspondencias?id=
//   agendaReservas(data)      → reservas-cliente
//   criarReserva(dados)       → criar-reserva
//   cancelarReserva(id)       → reservas-cliente (POST cancelar)
//   preferencias() / salvarPreferencias(patch) → tabela preferencias_notificacao (RLS do dono)
//
// Leituras ficam 30 s em memória para trocar de aba sem esperar de novo;
// escrita limpa o que ficou velho.
// ============================================================================

import { supabaseConfigured, getAccessToken, emailDaSessao } from "./supabaseAuth.js";
import { erroDaResposta, erroDeRede, MSG } from "./erros.js";

const URL_SUPA = import.meta.env?.VITE_SUPABASE_URL || "";
const ANON = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";
const TTL = 30_000;
const cache = new Map(); // chave → { em, promessa }

async function cabecalhos(extra = {}) {
  if (!supabaseConfigured) throw new Error(MSG.demo);
  const token = await getAccessToken();
  if (!token) throw new Error(MSG.sessao);
  return { apikey: ANON, authorization: `Bearer ${token}`, ...extra };
}

async function chamar(caminho, { method = "GET", body, contexto, prefer } = {}) {
  const headers = await cabecalhos(body !== undefined ? { "content-type": "application/json", ...(prefer ? { Prefer: prefer } : {}) } : {});
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

function lerComCache(chave, fn, forcar = false) {
  const atual = cache.get(chave);
  if (!forcar && atual && Date.now() - atual.em < TTL) return atual.promessa;
  const promessa = fn().catch((e) => { cache.delete(chave); throw e; });
  cache.set(chave, { em: Date.now(), promessa });
  return promessa;
}

/** Limpa leituras em cache (todas ou as que começam com o prefixo). */
export function limparCacheCliente(prefixo = "") {
  for (const k of [...cache.keys()]) if (!prefixo || k.startsWith(prefixo)) cache.delete(k);
}

export const clienteApi = {
  configured: supabaseConfigured,

  minhasFaturas: (forcar) => lerComCache("faturas", () => chamar("/functions/v1/minhas-faturas", { contexto: "faturas" }), forcar),
  minhaAssinatura: (forcar) => lerComCache("assinatura", () => chamar("/functions/v1/minha-assinatura", { contexto: "plano" }), forcar),
  kitEndereco: (forcar) => lerComCache("kit", () => chamar("/functions/v1/kit-endereco", { contexto: "kit" }), forcar),
  correspondencias: (forcar) => lerComCache("corresp", () => chamar("/functions/v1/minhas-correspondencias", { contexto: "correspondencias" }), forcar),
  anexoCorrespondencia: (id) => chamar(`/functions/v1/minhas-correspondencias?id=${encodeURIComponent(id)}`, { contexto: "anexo" }),

  agendaReservas: (data, forcar) => lerComCache(`agenda:${data || ""}`, () =>
    chamar(`/functions/v1/reservas-cliente${data ? `?data=${encodeURIComponent(data)}` : ""}`, { contexto: "reservas" }), forcar),

  criarReserva: async (dados) => {
    const r = await chamar("/functions/v1/criar-reserva", { method: "POST", body: dados, contexto: "criar-reserva" });
    limparCacheCliente("agenda:");
    limparCacheCliente("faturas");
    return r;
  },
  cancelarReserva: async (reserva_id) => {
    const r = await chamar("/functions/v1/reservas-cliente", { method: "POST", body: { acao: "cancelar", reserva_id }, contexto: "cancelar-reserva" });
    limparCacheCliente("agenda:");
    return r;
  },

  preferencias: async () => {
    const email = emailDaSessao();
    const linhas = await chamar(`/rest/v1/preferencias_notificacao?select=lembretes,reservas,novidades&email=eq.${encodeURIComponent(email)}`, { contexto: "preferencias" });
    return (Array.isArray(linhas) && linhas[0]) || null;
  },
  salvarPreferencias: async (prefs) => {
    const email = emailDaSessao();
    const linhas = await chamar("/rest/v1/preferencias_notificacao?on_conflict=email", {
      method: "POST", body: { email, ...prefs }, prefer: "resolution=merge-duplicates,return=representation", contexto: "preferencias",
    });
    return (Array.isArray(linhas) && linhas[0]) || prefs;
  },
};

/** Abre um arquivo em data URL (anexo antigo) sem navegar para data: (bloqueado nos navegadores). */
export function abrirDataUrl(dataUrl, nome = "arquivo") {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl || "");
  if (!m) { window.open(dataUrl, "_blank", "noopener"); return; }
  const binario = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: m[1] || "application/octet-stream" }));
  const a = document.createElement("a");
  a.href = url; a.download = nome; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
