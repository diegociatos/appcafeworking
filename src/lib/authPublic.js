// ============================================================================
// authPublic — autocadastro do cliente do coworking (sem login prévio).
// Usa as Edge Functions públicas unidades-publicas e cadastrar-cliente.
// ============================================================================

import { supabaseConfigured } from "./supabaseAuth.js";

const URL = import.meta.env?.VITE_SUPABASE_URL || "";
const ANON = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";

export { supabaseConfigured };

export async function fetchUnidadesPublicas() {
  if (!supabaseConfigured) return [];
  try {
    const res = await fetch(`${URL}/functions/v1/unidades-publicas`, {
      headers: { apikey: ANON, authorization: `Bearer ${ANON}` },
    });
    const data = await res.json().catch(() => ({}));
    return data?.unidades || [];
  } catch {
    return [];
  }
}

export async function cadastrarCliente(dados) {
  if (!supabaseConfigured) throw new Error("O cadastro funciona no ambiente real (com Supabase).");
  const res = await fetch(`${URL}/functions/v1/cadastrar-cliente`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON, authorization: `Bearer ${ANON}` },
    body: JSON.stringify(dados),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Não foi possível concluir o cadastro.");
  return data;
}
