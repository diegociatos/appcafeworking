// ============================================================================
// boletosApi — cliente de PRODUÇÃO do módulo de boletos.
//
// Chama as Edge Functions do Supabase (Deno). As credenciais e certificados
// mTLS ficam no backend/Vault — NUNCA neste cliente.
//
// O JWT do usuário logado é obtido automaticamente (getAccessToken), para que
// o RLS funcione (cada unidade só acessa seus próprios boletos). Sem sessão,
// cai no ANON (o backend recusa com 401).
//
// `boletosApi.configured` indica se dá para chamar o backend de verdade.
// ============================================================================

import { supabaseConfigured, getAccessToken } from "./supabaseAuth.js";

const URL = import.meta.env?.VITE_SUPABASE_URL || "";
const ANON = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";

export { supabaseConfigured };

async function callFn(name, body) {
  if (!supabaseConfigured) {
    throw new Error("Supabase não configurado (defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY).");
  }
  const token = await getAccessToken();
  const res = await fetch(`${URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: ANON,
      authorization: `Bearer ${token || ANON}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Falha em ${name} (${res.status})`);
  return data;
}

export const boletosApi = {
  configured: supabaseConfigured,
  emitir: (dados) => callFn("emitir-boleto", dados),
  consultar: (boleto_id) => callFn("consultar-boleto", { boleto_id }),
  cancelar: (boleto_id, motivo) => callFn("cancelar-boleto", { boleto_id, motivo }),
};
