// ============================================================================
// notificacoesApi — avisos por e-mail ao cliente disparados pela equipe.
//   enviar(...)      → Edge Function enviar-email (confere papel, preferência e
//                      grava o status real em `notificacoes`). Nunca lança.
//   listar(unidade)  → histórico real da unidade (RLS: equipe da unidade).
// ============================================================================

import { supabaseConfigured, getAccessToken } from "./supabaseAuth.js";
import { erroDaResposta, MSG } from "./erros.js";

const URL_SUPA = import.meta.env?.VITE_SUPABASE_URL || "";
const ANON = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";

export const notificacoesApi = {
  configured: supabaseConfigured,

  /** → { enviado: boolean, ignorado?: boolean, erro?: string } */
  enviar: async ({ unidade_id, evento, email, cliente, dados }) => {
    try {
      const token = await getAccessToken();
      if (!token) return { enviado: false, erro: MSG.sessao };
      const res = await fetch(`${URL_SUPA}/functions/v1/enviar-email`, {
        method: "POST",
        headers: { "content-type": "application/json", apikey: ANON, authorization: `Bearer ${token}` },
        body: JSON.stringify({ unidade_id, evento, email, cliente, dados }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.ignorado) return { enviado: false, ignorado: true };
      if (!res.ok) return { enviado: false, erro: erroDaResposta(res.status, data, "enviar-email").message };
      return { enviado: !!data?.enviado };
    } catch (e) {
      console.warn("[enviar-email] rede", e);
      return { enviado: false, erro: MSG.semConexao };
    }
  },

  listar: async (unidadeId, limite = 50) => {
    if (!supabaseConfigured || !unidadeId) return [];
    const token = await getAccessToken();
    if (!token) return [];
    const res = await fetch(
      `${URL_SUPA}/rest/v1/notificacoes?select=id,cliente_nome,destinatario,evento,assunto,status,erro,created_at,sent_at&unidade_id=eq.${encodeURIComponent(unidadeId)}&order=created_at.desc&limit=${limite}`,
      { headers: { apikey: ANON, authorization: `Bearer ${token}` } },
    ).catch(() => null);
    if (!res?.ok) return [];
    return (await res.json().catch(() => [])) || [];
  },
};
