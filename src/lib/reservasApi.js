// ============================================================================
// reservasApi — criação de reserva pela Edge Function transacional (modo real).
// No modo demo (sem Supabase) o store usa o caminho local.
// ============================================================================

import { supabaseConfigured, getAccessToken } from "./supabaseAuth.js";

const URL = import.meta.env?.VITE_SUPABASE_URL || "";
const ANON = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";

export const reservasApi = {
  configured: supabaseConfigured,
  // Retorna { ok:true, reserva } ou { ok:false, error }.
  criar: async (dados) => {
    try {
      const token = await getAccessToken();
      const res = await fetch(`${URL}/functions/v1/criar-reserva`, {
        method: "POST",
        headers: { "content-type": "application/json", apikey: ANON, authorization: `Bearer ${token || ANON}` },
        body: JSON.stringify(dados),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data?.error || `Falha ao reservar (${res.status})` };
      return { ok: true, reserva: data.reserva };
    } catch (e) {
      return { ok: false, error: e?.message || "Falha de rede ao reservar." };
    }
  },
};
