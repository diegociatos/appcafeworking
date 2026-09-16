// ============================================================================
// acessoClienteApi — acesso ao app para clientes cadastrados pela equipe.
//
//   acessos(unidadeId)  → RPC acessos_clientes: por e-mail do cadastro, se já
//                         tem login, vínculo com a unidade, último login e
//                         último convite enviado (só equipe/admin).
//   convidar(clienteId) → Edge Function convidar-cliente: cria o login sem
//                         senha e o vínculo, e manda o e-mail para criar senha.
// ============================================================================

import { supabaseConfigured, getAccessToken } from "./supabaseAuth.js";
import { erroDaResposta, erroDeRede, MSG } from "./erros.js";

const URL_SUPA = import.meta.env?.VITE_SUPABASE_URL || "";
const ANON = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";

async function post(caminho, corpo, contexto) {
  if (!supabaseConfigured) throw new Error(MSG.demo);
  const t = await getAccessToken();
  if (!t) throw new Error(MSG.sessao);
  let res;
  try {
    res = await fetch(`${URL_SUPA}${caminho}`, {
      method: "POST",
      headers: { apikey: ANON, authorization: `Bearer ${t}`, "content-type": "application/json" },
      body: JSON.stringify(corpo),
    });
  } catch (e) {
    throw erroDeRede(e, contexto);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw erroDaResposta(res.status, data || {}, contexto);
  return data;
}

export const acessoClienteApi = {
  configured: supabaseConfigured,

  /** Map "unidade|e-mail" → { temLogin, temAcesso, ultimoLogin, convidadoEm }. */
  acessos: async (unidadeId) => {
    const linhas = await post("/rest/v1/rpc/acessos_clientes", { p_unidade_id: unidadeId }, "acessos-clientes");
    const mapa = new Map();
    for (const l of linhas || []) {
      mapa.set(chaveAcesso(unidadeId, l.email), {
        temLogin: !!l.tem_login, temAcesso: !!l.tem_acesso, ultimoLogin: l.ultimo_login || null, convidadoEm: l.convidado_em || null,
      });
    }
    return mapa;
  },

  convidar: (clienteId) => post("/functions/v1/convidar-cliente", { cliente_id: clienteId }, "convidar-cliente"),
};

const chaveAcesso = (unidadeId, email) => `${unidadeId}|${String(email || "").trim().toLowerCase()}`;

/**
 * Situação do acesso ao app de um cliente, para a tela:
 * sem_email | sem_acesso (sem login ou sem vínculo com a unidade) |
 * convidado (tem acesso, nunca entrou) | ativo (já entrou) | desconhecido.
 */
export function situacaoAcesso(cliente, mapa) {
  const email = String(cliente?.email || "").trim().toLowerCase();
  if (!email) return { tipo: "sem_email" };
  const a = mapa?.get(chaveAcesso(cliente.unidadeId, email));
  if (!a) return { tipo: mapa ? "sem_acesso" : "desconhecido" };
  if (a.temLogin && a.temAcesso && a.ultimoLogin) return { tipo: "ativo", ...a };
  if (a.temLogin && a.temAcesso) return { tipo: "convidado", ...a };
  return { tipo: "sem_acesso", ...a };
}
