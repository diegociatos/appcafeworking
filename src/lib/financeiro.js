// ============================================================================
// financeiro.js — núcleo puro e testável de datas, vencimentos, classificação
// de recebíveis e geração de parcelas. Centraliza as regras que antes estavam
// espalhadas (e divergentes) entre Dashboard, Financeiro e os geradores de
// recorrência. Sem React, sem estado: tudo recebe entrada e devolve saída, para
// permitir testes determinísticos (tests/financeiro.test.js).
//
// Princípios (auditoria financeira 2026-11):
//  - NUNCA inventar data/cliente/competência. Quando a data real não pode ser
//    derivada dos campos existentes, o recebível é marcado "inconsistente" e
//    aparece numa fila de revisão — não some silenciosamente.
//  - O dia de vencimento das recorrências é guardado (hoje no campo `data`, às
//    vezes como dia solto "1"/"20"). Compor a data real a partir de
//    (ano, mês, dia) que JÁ existem é interpretação, não invenção.
//  - Datas locais no fuso America/Sao_Paulo. Não vence no próprio dia.
// ============================================================================
import { anoDoLancamento } from "./dateUtils.js";

export const CATEGORIAS_NAO_COMERCIAIS = ["Investimentos/Dividendos", "Conta Movimentação"];

/** Categoria que NÃO é recebimento comercial (transferência, aporte, aplicação,
 *  resgate, dividendo). Fica fora da fila "vincular a cliente" e da receita. */
export function ehNaoComercial(l) {
  return CATEGORIAS_NAO_COMERCIAIS.includes(String(l?.categoria || ""));
}

/** Chave inteira ordenável de uma data só-dia (ano*10000 + mes1a12*100 + dia). */
export function chaveDia(ano, mes0, dia) {
  return ano * 10000 + (mes0 + 1) * 100 + dia;
}

/** Hoje no fuso America/Sao_Paulo como { ano, mes (0..11), dia, chave }. */
export function hojeSP(agora = new Date()) {
  // en-CA => YYYY-MM-DD, estável para fatiar.
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(agora);
  const [a, m, d] = iso.split("-").map(Number);
  return { ano: a, mes: m - 1, dia: d, chave: chaveDia(a, m - 1, d) };
}

/** É uma data completa e real no formato DD/MM/AAAA? */
export function dataValidaCompleta(s) {
  const m = String(s || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return false;
  const dia = +m[1], mes = +m[2] - 1, ano = +m[3];
  if (mes < 0 || mes > 11 || dia < 1 || dia > 31) return false;
  const dt = new Date(ano, mes, dia);
  return dt.getFullYear() === ano && dt.getMonth() === mes && dt.getDate() === dia;
}

/** Extrai só o dia do campo `data` quando ele é um dia solto ("1", "20") ou
 *  um "dd/mm[/aaaa]". Devolve o número do dia ou null. */
function diaDoCampoData(s) {
  const t = String(s || "").trim();
  if (/^\d{1,2}$/.test(t)) { const d = +t; return d >= 1 && d <= 31 ? d : null; }
  const m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?$/);
  if (m) { const d = +m[1]; return d >= 1 && d <= 31 ? d : null; }
  return null;
}

/**
 * Data de vencimento REAL do lançamento, derivada sem inventar nada:
 *   1) `dataVencimento` se for DD/MM/AAAA completa;
 *   2) `data` se for DD/MM/AAAA completa;
 *   3) dia (de `dataVencimento` ou `data`, mesmo que solto "1") + competência
 *      (mes + ano do próprio lançamento) → compõe a data.
 * Devolve { ano, mes, dia, chave } ou null quando não há dia reconhecível
 * (ex.: data "—" ou vazia) — nesse caso o recebível é inconsistente.
 */
export function vencimentoReal(l) {
  // Um vencimento explícito inválido não pode virar outra data por fallback.
  const explicito = String(l?.dataVencimento || '').trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(explicito) && !dataValidaCompleta(explicito)) return null;
  const mesExplicito = explicito.match(/^\d{1,2}\/(\d{1,2})$/);
  if (mesExplicito && (+mesExplicito[1] < 1 || +mesExplicito[1] > 12 || l?.mes == null || +mesExplicito[1] !== +l.mes + 1)) return null;
  if (explicito && !/^\d{1,2}$/.test(explicito) && !/^\d{1,2}\/\d{1,2}$/.test(explicito) && !dataValidaCompleta(explicito) && !/^\d{4}-\d{2}-\d{2}$/.test(explicito)) return null;
  for (const campo of [explicito || l?.data]) {
    const iso = String(campo || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) {
      if (!dataValidaCompleta(`${iso[3]}/${iso[2]}/${iso[1]}`)) return null;
      const ano = +iso[1], mes = +iso[2] - 1, dia = +iso[3];
      return { ano, mes, dia, chave: chaveDia(ano, mes, dia), composto: false };
    }
    if (dataValidaCompleta(campo)) {
      const [dia, mes, ano] = String(campo).split("/").map(Number);
      return { ano, mes: mes - 1, dia, chave: chaveDia(ano, mes - 1, dia), composto: false };
    }
  }
  if (explicito && /^\d{2}\/\d{2}\/\d{4}$/.test(explicito)) return null;
  if (!explicito && /^\d{2}\/\d{2}\/\d{4}$/.test(String(l?.data || ''))) return null;
  const dia = diaDoCampoData(l?.dataVencimento) ?? diaDoCampoData(l?.data);
  if (dia == null) return null;
  const mes0 = l?.mes != null && l.mes !== '' && Number.isInteger(+l.mes) && +l.mes >= 0 && +l.mes <= 11 ? +l.mes : null;
  if (mes0 == null) return null;
  const ano = anoDoLancamento(l);
  const parcial = String(l?.dataVencimento || l?.data || '').match(/^\d{1,2}\/(\d{1,2})$/);
  if (parcial && +parcial[1] !== mes0 + 1) return null;
  // Limita o dia ao último dia do mês (ex.: dia 31 em mês de 30).
  const ultimo = new Date(ano, mes0 + 1, 0).getDate();
  const diaOk = Math.min(dia, ultimo);
  return { ano, mes: mes0, dia: diaOk, chave: chaveDia(ano, mes0, diaOk), composto: true };
}

/**
 * Classifica um recebível (lançamento tipo entrada) na data de referência.
 * Só faz sentido para status "previsto" (obrigação em aberto).
 *   - "inconsistente": sem vencimento derivável → fila de revisão.
 *   - "vencido": vencimento < hoje (não vence no próprio dia).
 *   - "futuro": vencimento em ano posterior ao de hoje (projeção contratual).
 *   - "a_vencer": vence hoje ou adiante, dentro do ano corrente.
 * Devolve { classe, venc, diasAtraso }.
 */
export function classificarRecebivel(l, hoje = hojeSP()) {
  const venc = vencimentoReal(l);
  if (!venc) return { classe: "inconsistente", venc: null, diasAtraso: 0 };
  if (venc.ano > hoje.ano) return { classe: "futuro", venc, diasAtraso: 0 };
  if (venc.chave < hoje.chave) {
    const a = new Date(venc.ano, venc.mes, venc.dia);
    const b = new Date(hoje.ano, hoje.mes, hoje.dia);
    const dias = Math.round((b - a) / 86400000);
    return { classe: "vencido", venc, diasAtraso: dias };
  }
  return { classe: "a_vencer", venc, diasAtraso: 0 };
}

/** Saldo residual da obrigação (base para inadimplência). Sem modelo de
 *  pagamento parcial ainda: previsto → valor, pago → 0. Estruturado para
 *  evoluir (descontos/juros/parciais) sem mudar os chamadores. */
export function saldoResidual(l) {
  if (l?.status === "pago") return 0;
  const bruto = Number(l?.valor) || 0;
  const abatido = Number(l?.valorRecebido) || 0; // reservado para parciais futuros
  return Math.max(0, bruto - abatido);
}

/**
 * Monta uma parcela de recorrência/contrato com datas CONSISTENTES:
 * competência (mes 0..11 + ano) e `data`/`dataVencimento` completas DD/MM/AAAA
 * derivadas do dia de vencimento. Corrige a raiz do bug "data=1".
 *   base: campos comuns (descricao, valor, categoria, subcategoria, clienteId…)
 *   compMes0, compAno: competência-base (mês 0..11 e ano) da 1ª parcela
 *   offset: deslocamento em meses (0,1,2…)
 *   diaVencimento: dia do mês (1..31); ajustado ao último dia do mês
 */
export function montarParcela(base, compMes0, compAno, offset, diaVencimento) {
  const total = (compAno * 12 + compMes0) + offset;
  const ano = Math.floor(total / 12);
  const mes = ((total % 12) + 12) % 12;
  const diaBruto = Math.max(1, Math.min(31, parseInt(diaVencimento, 10) || 1));
  const ultimo = new Date(ano, mes + 1, 0).getDate();
  const dia = Math.min(diaBruto, ultimo);
  const dd = String(dia).padStart(2, "0");
  const mm = String(mes + 1).padStart(2, "0");
  const dataBR = `${dd}/${mm}/${ano}`;
  return {
    ...base,
    mes, ano,
    data: dataBR,
    dataVencimento: dataBR,
    status: "previsto",
  };
}

/** Agrega recebíveis previstos por classe, com soma e contagem. Fonte única
 *  para Dashboard, Contas a Receber, Inadimplência e relatórios. */
export function resumoRecebiveis(lancamentos = [], hoje = hojeSP()) {
  const base = { vencido: 0, a_vencer: 0, futuro: 0, inconsistente: 0 };
  const r = {
    vencido: { n: 0, total: 0 }, a_vencer: { n: 0, total: 0 },
    futuro: { n: 0, total: 0 }, inconsistente: { n: 0, total: 0 },
    itens: [],
  };
  void base;
  for (const l of lancamentos) {
    if (l?.tipo !== "entrada" || l?.status !== "previsto") continue;
    const saldo = saldoResidual(l);
    if (saldo <= 0) continue;
    const c = classificarRecebivel(l, hoje);
    r[c.classe].n += 1;
    r[c.classe].total += saldo;
    r.itens.push({ l, saldo, ...c });
  }
  return r;
}
