// ============================================================================
// asaasApi — cobranças por boleto/PIX/cartão via Asaas (Edge Function).
// A chave da API fica no backend/Vault, nunca aqui.
// ============================================================================

import { supabaseConfigured, getAccessToken } from "./supabaseAuth.js";

const URL = import.meta.env?.VITE_SUPABASE_URL || "";
const ANON = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";

export const asaasApi = {
  configured: supabaseConfigured,
  async criarCobranca(dados) {
    if (!supabaseConfigured) throw new Error("Backend não configurado.");
    const token = await getAccessToken();
    const res = await fetch(`${URL}/functions/v1/asaas-cobranca`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: ANON, authorization: `Bearer ${token || ANON}` },
      body: JSON.stringify(dados),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Falha ao criar cobrança (${res.status})`);
    return data;
  },
};
