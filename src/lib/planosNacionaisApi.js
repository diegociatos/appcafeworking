// ============================================================================
// planosNacionaisApi — tabela nacional de preços da rede de parceiros.
//
// Tabela planos_modelo (RLS: só o admin da plataforma lê e grava). O doc tem o
// mesmo formato do plano da tela Planos. "Aplicar" chama a função do banco
// aplicar_planos_modelo, que copia a tabela para as unidades das contas
// parceiras (ids pl_nac_<slug>, doc.modelo = true) respeitando a pausa de cada
// unidade. Unidade nova de conta parceira recebe a tabela sozinha (gatilho).
// ============================================================================

import { supabaseConfigured, getAccessToken } from "./supabaseAuth.js";
import { erroDaResposta, erroDeRede, MSG } from "./erros.js";

const URL = import.meta.env?.VITE_SUPABASE_URL || "";
const ANON = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";

async function rest(caminho, { method = "GET", body, prefer } = {}) {
  if (!supabaseConfigured) throw new Error(MSG.demo);
  const token = await getAccessToken();
  if (!token) throw new Error(MSG.sessao);
  let res;
  try {
    res = await fetch(`${URL}/rest/v1/${caminho}`, {
      method,
      headers: {
        apikey: ANON, authorization: `Bearer ${token}`, "content-type": "application/json",
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    throw erroDeRede(e, "planos-nacionais");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw erroDaResposta(res.status, data, "planos-nacionais");
  return data;
}

/** "Endereço Fiscal Pro" → "pl_nac_endereco_fiscal_pro" (o banco aceita [a-z0-9_]). */
export function idDoPlanoNacional(nome, existentes = []) {
  const slug = String(nome || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50) || "plano";
  const usados = new Set(existentes);
  let id = `pl_nac_${slug}`;
  for (let n = 2; usados.has(id); n++) id = `pl_nac_${slug}_${n}`;
  return id;
}

/** Campos que não fazem parte do doc nacional (são da unidade). */
const limparDoc = ({ id, unidadeId, modelo, ativo, pausadoNaUnidade, descontinuado, ...doc }) => doc; // eslint-disable-line no-unused-vars

export const planosNacionaisApi = {
  configured: supabaseConfigured,

  /** Lista no formato do plano da tela (id, ativo e os campos do doc). */
  async listar() {
    const rows = (await rest("planos_modelo?select=id,doc,ativo,updated_at&order=id.asc")) || [];
    return rows.map((r) => ({ ...r.doc, id: r.id, ativo: r.ativo !== false, atualizadoEm: r.updated_at }));
  },

  /** Cria ou atualiza. `plano` no formato da tela; devolve o plano gravado. */
  async salvar(plano) {
    const { ativo = true } = plano;
    const linha = { id: plano.id, doc: { ...limparDoc(plano), preco: Number(plano.preco || 0) }, ativo: ativo !== false };
    const rows = await rest("planos_modelo?on_conflict=id", {
      method: "POST", body: linha, prefer: "resolution=merge-duplicates,return=representation",
    });
    const r = Array.isArray(rows) ? rows[0] : null;
    if (!r) throw new Error("O plano não foi gravado. Confira se você entrou como administrador da plataforma.");
    return { ...r.doc, id: r.id, ativo: r.ativo !== false, atualizadoEm: r.updated_at };
  },

  async remover(id) {
    await rest(`planos_modelo?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", prefer: "return=minimal" });
  },

  /** Copia a tabela para as unidades parceiras. Devolve quantos planos foram gravados. */
  async aplicarEmTodas() {
    const n = await rest("rpc/aplicar_planos_modelo", { method: "POST", body: {} });
    return Number(n || 0);
  },
};
