// ============================================================================
// emailMs365Api — e-mail pela Microsoft 365 (Configurações → Integrações).
// Chama a Edge Function email-ms365 (só admin da plataforma). Segredos nunca
// voltam para a tela: o status traz só temSecret/conectado.
// ============================================================================

import { supabaseConfigured, getAccessToken } from "./supabaseAuth.js";
import { MSG } from "./erros.js";

const URL_SUPA = import.meta.env?.VITE_SUPABASE_URL || "";
const ANON = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";

async function chamar(acao, extra = {}) {
  if (!supabaseConfigured) throw new Error("Backend não configurado.");
  const token = await getAccessToken();
  if (!token) throw new Error(MSG.sessao);
  let res;
  try {
    res = await fetch(`${URL_SUPA}/functions/v1/email-ms365`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: ANON, authorization: `Bearer ${token}` },
      body: JSON.stringify({ acao, ...extra }),
    });
  } catch (e) {
    console.warn("[email-ms365] rede", e);
    throw new Error(MSG.semConexao);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(res.status === 401 ? MSG.sessao : data?.error || `Falha em email-ms365 (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const emailMs365Api = {
  configured: supabaseConfigured,
  status: () => chamar("status"),
  salvar: ({ tenant_id, client_id, client_secret, envia_como }) => chamar("salvar", { tenant_id, client_id, client_secret, envia_como }),
  urlConexao: () => chamar("url_conexao"),
  testar: (para) => chamar("testar", { para }),
  desconectar: () => chamar("desconectar"),
  ativar: (ligar) => chamar(ligar ? "ativar" : "desativar"),
};
