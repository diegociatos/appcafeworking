// ============================================================================
// supabaseDb — leituras pontuais no Postgres via PostgREST (REST), com o JWT
// do usuário logado. O RLS garante que cada um só lê o que é seu.
// ============================================================================

import { getAccessToken } from "./supabaseAuth.js";

const URL = import.meta.env?.VITE_SUPABASE_URL || "";
const ANON = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";

/**
 * Vínculos do usuário logado (unidade_members). Cada linha:
 * { unidade_id, franqueado_id, role }. RLS já filtra pelo auth.uid().
 * Retorna [] quando não há Supabase/sessão ou em caso de erro.
 */
async function getJson(pathQuery) {
  if (!URL || !ANON) return null;
  const token = await getAccessToken();
  if (!token) return null;
  try {
    const res = await fetch(`${URL}/rest/v1/${pathQuery}`, {
      headers: { apikey: ANON, authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await res.json()) || [];
  } catch {
    return null;
  }
}

export async function fetchMemberships() {
  return (await getJson("unidade_members?select=unidade_id,franqueado_id,role")) || [];
}

// Mapeiam as colunas do banco (snake_case) para o formato do store (camelCase).
const mapConta = (r) => ({ id: r.id, nome: r.nome, master: r.master, email: r.email, documento: r.documento, telefone: r.telefone, plano: r.plano, mensalidade: Number(r.mensalidade || 0), criadoEm: r.criado_em });
const mapUnidade = (r) => ({ id: r.id, franqueadoId: r.franqueado_id, nome: r.nome, endereco: r.endereco, cor: r.cor, salas: r.salas, ocupacao: r.ocupacao, membros: r.membros, receita: Number(r.receita || 0) });
const mapUsuario = (r) => ({ id: r.id, unidadeId: r.unidade_id, nome: r.nome, email: r.email, perfil: r.perfil, ativo: r.ativo });
// Cliente no formato das telas (cnpj + nome da unidade + docs). nomeDaUnidade
// resolve o unidade_id para o nome usado no front.
const mapCliente = (r, nomeDaUnidade) => ({
  id: r.id, nome: r.nome, cnpj: r.documento, plano: r.plano, fiscal: r.fiscal,
  status: r.status, desde: r.desde, contato: r.contato, email: r.email, tel: r.telefone,
  unidade: nomeDaUnidade(r.unidade_id), unidadeId: r.unidade_id, docs: [],
});

/**
 * Carrega a estrutura do tenant do banco (contas, unidades, equipe, clientes),
 * já no formato do store. Retorna null quando não há Supabase/sessão — aí o
 * store mantém o seed de demonstração.
 */
export async function fetchTenant() {
  const [contas, unidades, usuarios, clientes] = await Promise.all([
    getJson("contas?select=*"),
    getJson("unidades?select=*"),
    getJson("usuarios?select=*"),
    getJson("clientes?select=*"),
  ]);
  if (!contas && !unidades) return null; // backend indisponível → fica no seed
  const unidadesMap = (unidades || []).map(mapUnidade);
  const nomeDaUnidade = (id) => unidadesMap.find((u) => u.id === id)?.nome || "";
  return {
    contas: (contas || []).map(mapConta),
    unidades: unidadesMap,
    usuarios: (usuarios || []).map(mapUsuario),
    clientes: (clientes || []).map((c) => mapCliente(c, nomeDaUnidade)),
  };
}
