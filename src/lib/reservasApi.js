// ============================================================================
// reservasApi — criação de reserva pela Edge Function transacional (modo real).
// No modo demo (sem Supabase) o store usa o caminho local.
// ============================================================================

import { supabaseConfigured, getAccessToken } from "./supabaseAuth.js";
import { erroDaResposta, MSG } from "./erros.js";

const URL = import.meta.env?.VITE_SUPABASE_URL || "";
const ANON = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";

export const reservasApi = {
  configured: supabaseConfigured,
  // Retorna { ok:true, reserva, credito } ou { ok:false, error } (mensagem para a tela).
  criar: async (dados) => {
    try {
      const token = await getAccessToken();
      if (!token) return { ok: false, error: MSG.sessao };
      const res = await fetch(`${URL}/functions/v1/criar-reserva`, {
        method: "POST",
        headers: { "content-type": "application/json", apikey: ANON, authorization: `Bearer ${token}` },
        body: JSON.stringify(dados),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: erroDaResposta(res.status, data, "criar-reserva").message };
      return { ok: true, reserva: data.reserva, credito: data.credito || null };
    } catch (e) {
      console.warn("[criar-reserva] rede", e);
      return { ok: false, error: MSG.semConexao };
    }
  },
};
