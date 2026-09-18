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
    emitir_ao_receber: patch.emitirAoReceber,
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
/** Lê TODO o estado operacional das unidades do usuário (RLS filtra).
 *  PAGINADO: o PostgREST corta a resposta (padrão ~1000 linhas). Sem paginar,
 *  uma unidade com muitos lançamentos (ex.: extrato importado) carregava
 *  incompleta no refresh — saldos vinham errados. Aqui percorremos em páginas
 *  de 1000, em ordem estável (unidade_id, entity, item_id) para não pular nem
 *  repetir linha entre páginas, até esgotar. */
export async function fetchAppState() {
  if (!URL || !ANON) return [];
  const token = await getAccessToken();
  if (!token) return [];
  const PAGE = 1000;
  const all = [];
  let offset = 0;
  try {
    for (;;) {
      const res = await fetch(
        `${URL}/rest/v1/app_state?select=unidade_id,entity,item_id,doc&order=unidade_id,entity,item_id&limit=${PAGE}&offset=${offset}`,
        { headers: { apikey: ANON, authorization: `Bearer ${token}` } },
      );
      if (!res.ok) break;
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) break;
      all.push(...rows);
      if (rows.length < PAGE) break; // última página
      offset += PAGE;
    }
  } catch { /* devolve o que já veio */ }
  return all;
}

// Escrita que LANÇA em falha (para o sync engine fazer retry/backoff e sinalizar
// erro). Sem backend/sessão é no-op silencioso (modo demo trata antes).
async function writeOrThrow(pathQuery, method, body, prefer = "return=minimal", opts = {}) {
  if (!URL || !ANON) return;
  const token = await getAccessToken();
  if (!token) throw new Error("Sessão indisponível");
  const res = await fetch(`${URL}/rest/v1/${pathQuery}`, {
    method,
    headers: { apikey: ANON, authorization: `Bearer ${token}`, "content-type": "application/json", Prefer: prefer },
    body: body ? JSON.stringify(body) : undefined,
    // keepalive: mantém a requisição viva quando a página está sendo descarregada
    // (flush do debounce no unload). Só para writes pequenos como app_state.
    keepalive: opts.keepalive === true,
  });
  if (!res.ok) throw new Error(`${method} ${res.status}: ${(await res.text().catch(() => "")).slice(0, 140)}`);
}

/** Upsert de um item (doc JSON) por (unidade_id, entity, item_id). Lança em falha. */
export async function putAppState(entity, unidadeId, itemId, doc, opts) {
  return writeOrThrow(
    "app_state?on_conflict=unidade_id,entity,item_id",
    "POST",
    { unidade_id: unidadeId, entity, item_id: String(itemId), doc },
    "resolution=merge-duplicates,return=minimal",
    opts,
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
// ---- Contas bancárias (public.bank_accounts) ------------------------------
// RLS: só admin da plataforma e master/financeiro da unidade leem e gravam; a
// recepção recebe lista vazia. O segredo (client_id/secret, certificado) fica no
// Vault pela Edge Function salvar-integracao; aqui vai só a referência.
export const mapBankAccountDb = (r) => ({
  id: r.id, unidadeId: r.unidade_id, franqueadoId: r.franqueado_id ?? null,
  banco: r.banco, tipo: r.tipo, apelido: r.apelido || "", ambiente: r.ambiente,
  beneficiarioNome: r.beneficiario_nome || "", beneficiarioDocumento: r.beneficiario_documento || "",
  agencia: r.agencia || "", conta: r.conta || "", carteira: r.carteira || "", pixChave: r.pix_chave || "",
  credenciaisRef: r.credenciais_ref, ativo: r.ativo !== false,
  conexao: r.conexao || { status: r.conexao_status || "desconectado", boleto: false, pix: false },
  autoRegistrar: r.opcoes?.autoRegistrar, gerarPix: r.opcoes?.gerarPix,
  createdAt: r.created_at,
});
// Só os campos editáveis presentes no patch (camelCase → coluna).
const bankAccountToRow = (b) => {
  const row = {
    unidade_id: b.unidadeId, franqueado_id: b.franqueadoId,
    banco: b.banco, tipo: b.tipo, apelido: b.apelido, ambiente: b.ambiente,
    beneficiario_nome: b.beneficiarioNome, beneficiario_documento: b.beneficiarioDocumento,
    agencia: b.agencia, conta: b.conta, carteira: b.carteira, pix_chave: b.pixChave,
    credenciais_ref: b.credenciaisRef, ativo: b.ativo,
  };
  if (b.conexao !== undefined) {
    row.conexao = b.conexao;
    row.conexao_status = b.conexao?.status || null;
  }
  if (b.opcoes !== undefined) row.opcoes = b.opcoes;
  Object.keys(row).forEach((k) => row[k] === undefined && delete row[k]);
  return row;
};
// Escrita com retorno da linha que LANÇA em falha (a tela mostra o erro).
async function writeRowsOrThrow(pathQuery, method, body, prefer, textos = {}) {
  const semPermissao = textos.semPermissao
    || "Sem permissão: só o master ou o financeiro da unidade cadastra contas bancárias.";
  const falha = textos.falha || "Falha ao gravar a conta bancária";
  if (!URL || !ANON) throw new Error("Backend não configurado.");
  const token = await getAccessToken();
  if (!token) throw new Error("Sessão expirada. Entre de novo.");
  const res = await fetch(`${URL}/rest/v1/${pathQuery}`, {
    method,
    headers: { apikey: ANON, authorization: `Bearer ${token}`, "content-type": "application/json", Prefer: prefer },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    let msg = txt;
    try { msg = JSON.parse(txt)?.message || txt; } catch { /* texto cru */ }
    throw new Error(res.status === 401 || res.status === 403
      ? semPermissao
      : `${falha} (${res.status}): ${String(msg).slice(0, 160)}`);
  }
  return res.json().catch(() => []);
}
export async function fetchBankAccountsDb() {
  return ((await getJson("bank_accounts?select=*&order=created_at.asc")) || []).map(mapBankAccountDb);
}
/** Grava a conta. Se a unidade já tem conta desse banco (mesma credenciais_ref),
 *  regrava a existente: o segredo do Vault é um só por banco/unidade. */
export async function upsertBankAccountDb(conta) {
  const rows = await writeRowsOrThrow(
    "bank_accounts?on_conflict=credenciais_ref", "POST", bankAccountToRow(conta),
    "resolution=merge-duplicates,return=representation",
  );
  const r = Array.isArray(rows) ? rows[0] : null;
  if (!r) throw new Error("A conta bancária não foi gravada (sem permissão na unidade?).");
  return mapBankAccountDb(r);
}
export async function patchBankAccountDb(id, patch) {
  const rows = await writeRowsOrThrow(
    `bank_accounts?id=eq.${encodeURIComponent(id)}`, "PATCH", bankAccountToRow(patch), "return=representation",
  );
  const r = Array.isArray(rows) ? rows[0] : null;
  if (!r) throw new Error("A conta bancária não foi atualizada (sem permissão na unidade?).");
  return mapBankAccountDb(r);
}

/** Documentos que o cliente enviou na assinatura pelo site (só metadados, sem
 *  link: o arquivo abre na tela Assinaturas). RLS: equipe da unidade e admin.
 *  Retorna null se não deu para consultar. */
export async function fetchDocumentosAssinaturaDoCliente(unidadeId, email) {
  const e = String(email || "").trim().toLowerCase();
  if (!unidadeId || !e) return [];
  return await getJson(
    `assinatura_documentos?select=id,assinatura_id,tipo,nome_arquivo,created_at&unidade_id=eq.${encodeURIComponent(unidadeId)}` +
    `&cliente_email=eq.${encodeURIComponent(e)}&order=created_at.desc&limit=50`,
  );
}

export async function fetchNotasDb() {
  return (await getJson("notas_fiscais?select=*&order=created_at.desc")) || [];
}
export async function fetchCobrancasDb() {
  return (await getJson("cobrancas?select=*&order=created_at.desc")) || [];
}
export async function fetchReservasDb() {
  return (await getJson("reservas?select=*&order=start_at.asc")) || [];
}
export async function fetchSalasDb() {
  return (await getJson("salas?select=*")) || [];
}
// Trilha de auditoria. RLS: admin vê tudo, staff vê a própria unidade, cliente
// não vê nada. Limita às últimas 500 linhas para não pesar.
export async function fetchAuditLogsDb() {
  return (await getJson("audit_logs?select=*&order=created_at.desc&limit=500")) || [];
}

// Créditos do plano (ledger relacional, Fase 2). RLS: cliente vê só os próprios.
const mapCredito = (r) => ({
  id: r.id, unidadeId: r.unidade_id, clienteId: r.cliente_id, clienteEmail: r.cliente_email,
  tipo: r.tipo, quantidade: Number(r.quantidade), saldoApos: r.saldo_apos != null ? Number(r.saldo_apos) : null,
  origem: r.origem, motivo: r.motivo, referenciaId: r.referencia_id, createdAt: r.created_at,
});
const creditoToRow = (e) => ({
  id: e.id, unidade_id: e.unidadeId, cliente_id: e.clienteId ?? null, cliente_email: e.clienteEmail ?? null,
  tipo: e.tipo, quantidade: e.quantidade, saldo_apos: e.saldoApos ?? null,
  origem: e.origem ?? null, motivo: e.motivo ?? null, referencia_id: e.referenciaId ?? null,
});
export async function fetchCreditosDb() {
  return ((await getJson("creditos_ledger?select=*&order=created_at.desc")) || []).map(mapCredito);
}
/** Grava uma movimentação de crédito (concessão/ajuste). Cliente não tem insert
 *  por RLS — só staff/admin. Consumos de reserva são gravados pela Edge Function. */
export async function insertCreditoDb(entry) {
  if (!entry?.id || !entry?.unidadeId) return null;
  return await writeJson("creditos_ledger", "POST", creditoToRow(entry), "return=minimal");
}
/** Igual a insertCreditoDb, mas LANÇA em falha: para a tela confirmar que gravou
 *  (lançamento de horas do mês). O gatilho do banco registra a auditoria. */
export async function inserirCreditoOuFalhar(entry) {
  if (!entry?.id || !entry?.unidadeId) throw new Error("Lançamento sem cliente ou unidade.");
  return writeOrThrow("creditos_ledger", "POST", creditoToRow(entry), "return=minimal");
}

// Sala (camelCase do store) → linha da tabela relacional salas.
function salaToRow(s) {
  const row = {
    id: s.id, unidade_id: s.unidadeId, nome: s.nome, tipo: s.tipo, capacidade: s.cap,
    bases: s.bases ?? 0, descricao: s.descricao, comodidades: s.comodidades || [], fotos: s.fotos || [],
    valor_hora: s.valorHora ?? null, valor_mensal: s.valorMensal ?? null,
    contratada: !!s.contratada, active: s.active !== false,
    reserva_online: s.reservaOnline === true,
  };
  Object.keys(row).forEach((k) => row[k] === undefined && delete row[k]);
  return row;
}
export async function upsertSalaDb(s) {
  if (!s?.id || !s?.unidadeId) return null;
  return await writeJson("salas?on_conflict=id", "POST", salaToRow(s), "resolution=merge-duplicates,return=minimal");
}
export async function deleteSalaDb(id) {
  return await writeJson(`salas?id=eq.${encodeURIComponent(id)}`, "DELETE", null, "return=minimal");
}

// Cliente: front (camelCase) → linha do banco (snake_case). cnpj→documento,
// tel→telefone, unidade(nome) resolvido para unidade_id pelo chamador.
function clienteToRow(c) {
  const row = {
    id: c.id, unidade_id: c.unidadeId, nome: c.nome, documento: c.cnpj,
    plano: c.plano, fiscal: c.fiscal, status: c.status, desde: c.desde,
    contato: c.contato, email: c.email, emails_adicionais: c.emailsAdicionais, telefone: c.tel,
    endereco: c.endereco, numero: c.numero, cep: c.cep,
    bairro: c.bairro, cidade: c.cidade, uf: c.uf,
  };
  Object.keys(row).forEach((k) => row[k] === undefined && delete row[k]);
  return row;
}

export async function insertCliente(c) {
  return (await writeJson("clientes", "POST", clienteToRow(c)))?.[0] || null;
}
/** Igual a insertCliente, mas LANÇA em falha: para a tela só dizer "criado"
 *  quando o banco confirmar (conversão de lead no CRM). */
export async function insertClienteOuFalhar(c) {
  const rows = await writeRowsOrThrow("clientes", "POST", clienteToRow(c), "return=representation", {
    semPermissao: "Sem permissão para cadastrar cliente nesta unidade.",
    falha: "Falha ao cadastrar o cliente",
  });
  const r = Array.isArray(rows) ? rows[0] : null;
  if (!r) throw new Error("O cliente não foi gravado (sem permissão nesta unidade?).");
  return r;
}
export async function patchCliente(id, patch) {
  return (await writeJson(`clientes?id=eq.${encodeURIComponent(id)}`, "PATCH", clienteToRow({ ...patch, id: undefined })))?.[0] || null;
}
export async function deleteClienteDb(id) {
  return await writeJson(`clientes?id=eq.${encodeURIComponent(id)}`, "DELETE");
}
export async function patchClienteOuFalhar(id, patch) {
  const rows = await writeRowsOrThrow(`clientes?id=eq.${encodeURIComponent(id)}`, "PATCH", clienteToRow({ ...patch, id: undefined }), "return=representation", {
    semPermissao: "Sem permissão para editar este cliente.", falha: "Não foi possível salvar o cliente",
  });
  if (!rows?.[0]) throw new Error("Cliente não encontrado ou sem permissão de edição.");
  return rows[0];
}

// Mapeiam as colunas do banco (snake_case) para o formato do store (camelCase).
// Conta (coworking assinante). O contrato fica no bucket privado contratos-contas:
// aqui só vem o nome/tipo; o download pede link assinado (onboardApi.linkContrato).
export const mapConta = (r) => ({
  id: r.id, nome: r.nome, master: r.master, email: r.email, documento: r.documento, telefone: r.telefone,
  plano: r.plano, mensalidade: Number(r.mensalidade || 0), criadoEm: r.criado_em,
  tipoPessoa: r.tipo_pessoa || undefined, nomeFantasia: r.nome_fantasia || "", responsavel: r.responsavel || "",
  endereco: r.endereco || "", cidade: r.cidade || "", observacoes: r.observacoes || "",
  contrato: r.contrato_path ? { nome: r.contrato_nome || "contrato", mime: r.contrato_mime, bytes: r.contrato_bytes, enviadoEm: r.contrato_enviado_em, noServidor: true } : null,
  // rede de parceiros (docs/PARCEIROS.md)
  tipo: r.tipo === "parceiro" ? "parceiro" : "propria",
  parceiroPercentual: r.parceiro_percentual != null ? Number(r.parceiro_percentual) : 75,
  garantiaPercentual: r.garantia_percentual != null ? Number(r.garantia_percentual) : 10,
  asaasWalletId: r.asaas_wallet_id || "",
  parceiroStatus: r.parceiro_status || "",
  emailsAviso: Array.isArray(r.emails_aviso) ? r.emails_aviso : [],
});

// ---- Rede de parceiros ------------------------------------------------------
// Razão de garantia (parceiro_garantias). RLS: admin vê tudo; master/financeiro
// da conta parceira só as próprias. Retorna [] sem backend/sessão.
export async function fetchGarantiasDb() {
  const rows = (await getJson("parceiro_garantias?select=*&order=created_at.asc")) || [];
  return rows.map((g) => ({
    id: g.id, contaId: g.conta_id, unidadeId: g.unidade_id, cobrancaId: g.cobranca_id, tipo: g.tipo,
    valor: Number(g.valor || 0), observacao: g.observacao || "", criadoEm: g.created_at,
  }));
}
const mapUnidade = (r) => ({ id: r.id, franqueadoId: r.franqueado_id, nome: r.nome, endereco: r.endereco, cor: r.cor, salas: r.salas, ocupacao: r.ocupacao, membros: r.membros, receita: Number(r.receita || 0) });
const mapUsuario = (r) => ({ id: r.id, unidadeId: r.unidade_id, nome: r.nome, email: r.email, perfil: r.perfil, ativo: r.ativo });
// Cliente no formato das telas (cnpj + nome da unidade + docs). nomeDaUnidade
// resolve o unidade_id para o nome usado no front.
const mapCliente = (r, nomeDaUnidade) => ({
  id: r.id, nome: r.nome, cnpj: r.documento, plano: r.plano, fiscal: r.fiscal,
  status: r.status, desde: r.desde, contato: r.contato, email: r.email, emailsAdicionais: r.emails_adicionais || [], tel: r.telefone,
  endereco: r.endereco, numero: r.numero, cep: r.cep, bairro: r.bairro, cidade: r.cidade, uf: r.uf,
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
