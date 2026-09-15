// ============================================================================
// authPublic — autocadastro do cliente do coworking (sem login prévio).
// Usa as Edge Functions públicas unidades-publicas e cadastrar-cliente.
// ============================================================================

import { supabaseConfigured } from "./supabaseAuth.js";
import { erroDaResposta, MSG } from "./erros.js";

// "Não foi possível criar a conta: <detalhe do servidor>" → só a primeira parte.
function erroPublico(res, data, contexto) {
  const limpo = typeof data?.error === "string" ? data.error.replace(/^(Não foi possível[^:]*):.*$/s, "$1.") : data?.error;
  // Tela pública não tem sessão: 401 aqui não é "sessão expirada".
  return erroDaResposta(res.status === 401 ? 400 : res.status, { ...data, error: limpo }, contexto);
}
async function postar(caminho, dados, contexto) {
  let res;
  try {
    res = await fetch(`${URL}${caminho}`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: ANON, authorization: `Bearer ${ANON}` },
      body: JSON.stringify(dados),
    });
  } catch {
    throw new Error(MSG.semConexao);
  }
  const data = await res.json().catch(() => ({}));
  return { res, data, contexto };
}

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
  if (!supabaseConfigured) throw new Error(MSG.demo);
  const { res, data } = await postar("/functions/v1/cadastrar-cliente", dados, "cadastrar-cliente");
  if (!res.ok) throw erroPublico(res, data, "cadastrar-cliente");
  return data;
}

// Planos vendáveis de uma unidade (para o cliente escolher no cadastro).
export async function fetchPlanosPublicos(unidadeId) {
  if (!supabaseConfigured || !unidadeId) return [];
  try {
    const res = await fetch(`${URL}/functions/v1/planos-publicos?unidade_id=${encodeURIComponent(unidadeId)}`, {
      headers: { apikey: ANON, authorization: `Bearer ${ANON}` },
    });
    const data = await res.json().catch(() => ({}));
    return data?.planos || [];
  } catch {
    return [];
  }
}

// Autocheckout: cria o login (bloqueado) + a cobrança do plano e devolve o link
// de pagamento. A conta só é liberada quando o pagamento confirma (webhook).
export async function iniciarAssinatura(dados) {
  if (!supabaseConfigured) throw new Error(MSG.demo);
  const { res, data } = await postar("/functions/v1/iniciar-assinatura", dados, "iniciar-assinatura");
  if (!res.ok) {
    const erro = erroPublico(res, data, "iniciar-assinatura");
    erro.contrato = data?.contrato;
    throw erro;
  }
  return data;
}
