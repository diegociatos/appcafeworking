// ============================================================================
// clientesDuplicados — detecção pura e testável de clientes cadastrados em
// duplicidade (mesmo cliente duas vezes). Separa o PAGADOR informado numa
// transação do CLIENTE vinculado, e alerta quando o mesmo cliente tem mais de
// um cadastro — que, antes, dividia a receita em dois cartões e inflava a base.
//
// Sem React, sem estado: entra a lista de clientes, sai a lista de grupos
// suspeitos. A unificação em si (reatribuir lançamentos, remover o cadastro
// repetido) é decisão humana na tela — aqui só se identifica.
// ============================================================================

/** Só os dígitos de um documento (CPF/CNPJ), para comparar sem máscara. */
export function soDigitos(s) {
  return String(s || "").replace(/\D/g, "");
}

/** Nome normalizado: sem acento, minúsculo, espaços colapsados. */
export function normNome(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Documento do cliente (aceita `documento`, `cnpj` ou `cpf`), só dígitos. */
export function docDoCliente(c) {
  return soDigitos(c?.documento ?? c?.cnpj ?? c?.cpf ?? "");
}

/** Chaves de duplicidade de um cliente: documento (forte) e nome na unidade. */
export function chavesDuplicidade(c) {
  const chaves = [];
  const doc = docDoCliente(c);
  if (doc.length >= 11) chaves.push("doc:" + doc); // CPF(11)/CNPJ(14) completo
  const nome = normNome(c?.nome);
  if (nome.length >= 3) chaves.push("nome:" + String(c?.unidadeId || "") + "|" + nome);
  return chaves;
}

/** Motivos pelos quais um grupo é suspeito: "documento" e/ou "nome". */
function motivosDoGrupo(membros) {
  const motivos = [];
  const docs = membros.map(docDoCliente).filter((d) => d.length >= 11);
  if (new Set(docs).size < docs.length) motivos.push("documento");
  const nomes = membros.map((c) => normNome(c?.nome)).filter((n) => n.length >= 3);
  if (new Set(nomes).size < nomes.length) motivos.push("nome");
  return motivos;
}

/**
 * Grupos de clientes provavelmente duplicados. Dois cadastros entram no mesmo
 * grupo se compartilham o documento OU o nome (na mesma unidade); grupos que se
 * tocam (ex.: A≡B por documento, B≡C por nome) são fundidos por union-find.
 * Devolve [{ membros:[cliente…], motivos:["documento"|"nome"] }], só com 2+.
 */
export function clientesDuplicados(clientes = []) {
  const parent = new Map(clientes.map((c) => [c.id, c.id]));
  const find = (x) => { let r = x; while (parent.get(r) !== r) r = parent.get(r); while (parent.get(x) !== r) { const n = parent.get(x); parent.set(x, r); x = n; } return r; };
  const uni = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };

  const donoDaChave = new Map();
  for (const c of clientes) {
    for (const k of chavesDuplicidade(c)) {
      if (donoDaChave.has(k)) uni(donoDaChave.get(k), c.id);
      else donoDaChave.set(k, c.id);
    }
  }
  const grupos = new Map();
  for (const c of clientes) {
    const r = find(c.id);
    if (!grupos.has(r)) grupos.set(r, []);
    grupos.get(r).push(c);
  }
  return [...grupos.values()]
    .filter((membros) => membros.length > 1)
    .map((membros) => ({ membros, motivos: motivosDoGrupo(membros) }))
    .filter((g) => g.motivos.length > 0);
}

/**
 * Sugere qual cadastro manter num grupo (o "canônico"): o mais completo
 * (documento + email + telefone preenchidos) e, em empate, o mais antigo.
 * Os demais são candidatos a serem absorvidos.
 */
export function canonicoDoGrupo(membros = []) {
  const score = (c) => (docDoCliente(c).length >= 11 ? 4 : 0) + (c?.email ? 2 : 0) + (c?.telefone ? 1 : 0);
  const tempo = (c) => { const t = Date.parse(c?.criadoEm || c?.created_at || ""); return Number.isNaN(t) ? Infinity : t; };
  return [...membros].sort((a, b) => (score(b) - score(a)) || (tempo(a) - tempo(b)))[0] || null;
}
