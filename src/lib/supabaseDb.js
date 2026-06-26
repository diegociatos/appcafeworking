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

/** O usuário logado é admin da plataforma? (RLS retorna só a própria linha.) */
export async function fetchIsPlatformAdmin() {
  const rows = await getJson("platform_admins?select=user_id");
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * Grava (upsert) a configuração fiscal de uma unidade via PostgREST. O RLS
 * (is_unidade_member) garante que só membros da unidade conseguem. Campos
 * sensíveis (certificado) NÃO entram aqui — são gravados pela Edge Function.
 * Retorna a linha salva, ou null se não houver backend/sessão.
 */
export async function upsertConfigFiscal(patch) {
  if (!URL || !ANON) return null;
  const token = await getAccessToken();
  if (!token) return null;
  const row = {
    unidade_id: patch.unidadeId,
    municipio: patch.municipio, codigo_municipio: patch.codigoMunicipio, uf: patch.uf, cnpj: patch.cnpj,
    inscricao_municipal: patch.inscricaoMunicipal, regime: patch.regime,
    codigo_servico: patch.codigoServico, descricao_servico: patch.descricaoServico,
    aliquota_iss: patch.aliquotaISS, emissor: patch.emissor, ambiente: patch.ambiente,
    emissao_ativa: patch.emissaoAtiva,
    codigo_tributacao_nacional: patch.codigoTributacaoNacional,
    codigo_servico_municipal: patch.codigoServicoMunicipal,
    nbs: patch.nbs, regime_especial: patch.regimeEspecial,
    aliquota_simples: patch.aliquotaSimples, iss_retido: patch.issRetido,
    exigibilidade_iss: patch.exigibilidadeIss,
  };
  Object.keys(row).forEach((k) => row[k] === undefined && delete row[k]);
  try {
    const res = await fetch(`${URL}/rest/v1/config_fiscal?on_conflict=unidade_id`, {
      method: "POST",
      headers: {
        apikey: ANON, authorization: `Bearer ${token}`,
        "content-type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(row),
    });
    if (!res.ok) return null;
    return (await res.json())?.[0] || null;
  } catch {
    return null;
  }
}

// Escrita genérica no PostgREST com o JWT do usuário (RLS aplica).
async function writeJson(pathQuery, method, body, prefer = "return=representation") {
  if (!URL || !ANON) return null;
  const token = await getAccessToken();
  if (!token) return null;
  try {
    const res = await fetch(`${URL}/rest/v1/${pathQuery}`, {
      method,
      headers: {
        apikey: ANON, authorization: `Bearer ${token}`,
        "content-type": "application/json",
        Prefer: prefer,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) return null;
    return (await res.json().catch(() => null));
  } catch {
    return null;
  }
}

// ---- app_state: persistência genérica das entidades operacionais ----------
/** Lê todo o estado operacional das unidades do usuário (RLS filtra). */
export async function fetchAppState() {
  return (await getJson("app_state?select=unidade_id,entity,item_id,doc")) || [];
}

// Escrita que LANÇA em falha (para o sync engine fazer retry/backoff e sinalizar
// erro). Sem backend/sessão é no-op silencioso (modo demo trata antes).
async function writeOrThrow(pathQuery, method, body, prefer = "return=minimal") {
  if (!URL || !ANON) return;
  const token = await getAccessToken();
  if (!token) throw new Error("Sessão indisponível");
  const res = await fetch(`${URL}/rest/v1/${pathQuery}`, {
    method,
    headers: { apikey: ANON, authorization: `Bearer ${token}`, "content-type": "application/json", Prefer: prefer },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${res.status}: ${(await res.text().catch(() => "")).slice(0, 140)}`);
}

/** Upsert de um item (doc JSON) por (unidade_id, entity, item_id). Lança em falha. */
export async function putAppState(entity, unidadeId, itemId, doc) {
  return writeOrThrow(
    "app_state?on_conflict=unidade_id,entity,item_id",
    "POST",
    { unidade_id: unidadeId, entity, item_id: String(itemId), doc },
    "resolution=merge-duplicates,return=minimal",
  );
}
/** Remove um item. Lança em falha. */
export async function delAppState(entity, unidadeId, itemId) {
  return writeOrThrow(
    `app_state?unidade_id=eq.${encodeURIComponent(unidadeId)}&entity=eq.${encodeURIComponent(entity)}&item_id=eq.${encodeURIComponent(itemId)}`,
    "DELETE", null, "return=minimal",
  );
}

// ---- Leituras das entidades com tabela própria ----------------------------
export async function fetchConfigFiscalDb() {
  return (await getJson("config_fiscal?select=*")) || [];
}
export async function fetchBoletosDb() {
  return (await getJson("boletos?select=*")) || [];
}
export async function fetchNotasDb() {
  return (await getJson("notas_fiscais?select=*&order=created_at.desc")) || [];
}
export async function fetchCobrancasDb() {
  return (await getJson("cobrancas?select=*&order=created_at.desc")) || [];
}

// Cliente: front (camelCase) → linha do banco (snake_case). cnpj→documento,
// tel→telefone, unidade(nome) resolvido para unidade_id pelo chamador.
function clienteToRow(c) {
  const row = {
    id: c.id, unidade_id: c.unidadeId, nome: c.nome, documento: c.cnpj,
    plano: c.plano, fiscal: c.fiscal, status: c.status, desde: c.desde,
    contato: c.contato, email: c.email, telefone: c.tel,
    endereco: c.endereco, cep: c.cep,
  };
  Object.keys(row).forEach((k) => row[k] === undefined && delete row[k]);
  return row;
}

export async function insertCliente(c) {
  return (await writeJson("clientes", "POST", clienteToRow(c)))?.[0] || null;
}
export async function patchCliente(id, patch) {
  return (await writeJson(`clientes?id=eq.${encodeURIComponent(id)}`, "PATCH", clienteToRow({ ...patch, id: undefined })))?.[0] || null;
}
export async function deleteClienteDb(id) {
  return await writeJson(`clientes?id=eq.${encodeURIComponent(id)}`, "DELETE");
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
  endereco: r.endereco, cep: r.cep,
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
