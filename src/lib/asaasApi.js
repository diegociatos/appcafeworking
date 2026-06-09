// ============================================================================
// asaasApi — cobranças por boleto/PIX/cartão via Asaas (Edge Function).
// A chave da API fica no backend/Vault, nunca aqui.
// ============================================================================

import { supabaseConfigured, getAccessToken } from "./supabaseAuth.js";

const URL = import.meta.env?.VITE_SUPABASE_URL || "";
const ANON = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";

async function callFn(name, body) {
  if (!supabaseConfigured) throw new Error("Backend não configurado.");
  const token = await getAccessToken();
  const res = await fetch(`${URL}/functions/v1/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON, authorization: `Bearer ${token || ANON}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Falha em ${name} (${res.status})`);
  return data;
}

export const asaasApi = {
  configured: supabaseConfigured,
  criarCobranca: (dados) => callFn("asaas-cobranca", dados),
  // Cadastro da chave Asaas PELO APP — guardada no Vault pelo backend.
  salvarChave: (unidade_id, api_key, ambiente = "producao") =>
    callFn("salvar-integracao", { unidade_id, tipo: "asaas", secret: { api_key, ambiente } }),
};

// Reutilizável para credenciais de banco (boleto) — também via app → Vault.
export const integracaoApi = {
  configured: supabaseConfigured,
  salvarBanco: (unidade_id, banco, secret) =>
    callFn("salvar-integracao", { unidade_id, tipo: "banco", banco, secret }),
};
