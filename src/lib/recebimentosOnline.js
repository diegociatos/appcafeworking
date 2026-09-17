// ============================================================================
// Recebimentos online (Asaas) na visão financeira.
//
// As cobranças do Asaas moram na tabela `cobrancas` (não no app_state). Aqui
// ficam as regras puras para mostrá-las no Financeiro e somá-las no Dashboard
// SEM duplicar o que já está nos lançamentos:
//   • cobrança criada pela tela Cobranças gera um lançamento com `cobrancaId`;
//     se esse lançamento já está pago, a receita já entrou pelos lançamentos e
//     a cobrança não é somada de novo;
//   • o resto (assinatura, venda e reserva pelo site, ou cobrança cujo
//     lançamento segue "previsto") entra como receita online.
// Mês do recebimento = data do pagamento (pago_em) no fuso de Brasília.
// ============================================================================

const FUSO = "America/Sao_Paulo";

/** Linha da tabela cobrancas (snake) → formato do store (camel). */
export const mapCobrancaDb = (c) => ({
  id: c.id, unidadeId: c.unidade_id, cliente: c.cliente, documento: c.cliente_documento, email: c.cliente_email,
  valor: Number(c.valor || 0), valorPago: c.valor_pago != null ? Number(c.valor_pago) : null,
  vencimento: c.vencimento || null, pagoEm: c.pago_em || null, criadaEm: c.created_at || null,
  status: c.status || "pendente", tipo: c.tipo, descricao: c.descricao || "", origem: c.origem || null,
  assinaturaId: c.assinatura_id || null, reservaId: c.reserva_id || null,
  notaId: c.nota_id || null, notaStatus: c.nota_status || null,
  // unidade parceira: divisão do split gravada na cobrança
  parceiroContaId: c.parceiro_conta_id || null,
  splitParceiroPct: c.split_parceiro_pct != null ? Number(c.split_parceiro_pct) : null,
  splitGarantiaPct: c.split_garantia_pct != null ? Number(c.split_garantia_pct) : null,
  valorBruto: c.valor_bruto != null ? Number(c.valor_bruto) : null,
  valorParceiro: c.valor_parceiro != null ? Number(c.valor_parceiro) : null,
  valorGarantia: c.valor_garantia != null ? Number(c.valor_garantia) : null,
  valorRepasse: c.valor_repasse != null ? Number(c.valor_repasse) : null,
  valorCafeworking: c.valor_cafeworking != null ? Number(c.valor_cafeworking) : null,
});

// ---- Meus repasses (unidade parceira) --------------------------------------

const arred2 = (n) => Math.round(n * 100) / 100;

/**
 * Repasses do ano, mês a mês, das cobranças PAGAS com split (mês do pagamento):
 * bruto recebido, parte do parceiro, garantia retida, repasse líquido e parte da
 * CafeWorking. Estornadas/canceladas não entram (o estorno da garantia aparece
 * no extrato da garantia).
 */
export function repassesDoAno(cobrancas = [], ano) {
  const porMes = Array.from({ length: 12 }, () => ({ bruto: 0, parceiro: 0, garantia: 0, repasse: 0, cafeworking: 0, qtd: 0 }));
  for (const c of cobrancas) {
    if (c.status !== "pago" || !c.parceiroContaId) continue;
    const comp = competenciaDaCobranca(c, "recebido");
    if (!comp || comp.ano !== ano) continue;
    const m = porMes[comp.mes];
    m.bruto += c.valorBruto ?? valorRecebido(c);
    m.parceiro += c.valorParceiro || 0;
    m.garantia += c.valorGarantia || 0;
    m.repasse += c.valorRepasse || 0;
    m.cafeworking += c.valorCafeworking || 0;
    m.qtd += 1;
  }
  const meses = porMes.map((m) => ({ ...m, bruto: arred2(m.bruto), parceiro: arred2(m.parceiro), garantia: arred2(m.garantia), repasse: arred2(m.repasse), cafeworking: arred2(m.cafeworking) }));
  const total = meses.reduce((t, m) => ({
    bruto: arred2(t.bruto + m.bruto), parceiro: arred2(t.parceiro + m.parceiro), garantia: arred2(t.garantia + m.garantia),
    repasse: arred2(t.repasse + m.repasse), cafeworking: arred2(t.cafeworking + m.cafeworking), qtd: t.qtd + m.qtd,
  }), { bruto: 0, parceiro: 0, garantia: 0, repasse: 0, cafeworking: 0, qtd: 0 });
  return { porMes: meses, total };
}

/** Sinal de cada lançamento do razão de garantia no saldo. */
export const SINAL_GARANTIA = { retencao: 1, estorno: -1, devolucao: -1, uso: -1 };
export const ROTULO_GARANTIA = { retencao: "Retenção", estorno: "Estorno de cobrança", devolucao: "Devolução ao parceiro", uso: "Uso da garantia" };

/** Extrato da garantia em ordem de data, com saldo acumulado. */
export function extratoGarantia(movimentos = []) {
  let saldo = 0;
  return [...movimentos]
    .sort((a, b) => String(a.criadoEm).localeCompare(String(b.criadoEm)))
    .map((g) => {
      const sinal = SINAL_GARANTIA[g.tipo] ?? 0;
      saldo = arred2(saldo + sinal * Number(g.valor || 0));
      return { ...g, sinal, saldo };
    });
}

/** { mes 0..11, ano } de uma data/hora ISO no fuso de Brasília; data pura (aaaa-mm-dd) é lida como está. */
export function competenciaBRT(iso) {
  if (!iso) return null;
  const s = String(iso);
  const pura = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (pura) return { ano: +pura[1], mes: +pura[2] - 1 };
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit" }).formatToParts(d);
  const ano = +partes.find((p) => p.type === "year").value;
  const mes = +partes.find((p) => p.type === "month").value - 1;
  return { ano, mes };
}

/** Hoje (aaaa-mm-dd) em Brasília. */
export function hojeBRT(agora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

/** recebido | aberto | vencido | fora (cancelada/estornada não contam). */
export function situacaoCobranca(c, hoje = hojeBRT()) {
  if (c.status === "pago") return "recebido";
  if (c.status === "vencido") return "vencido";
  if (c.status === "pendente") return c.vencimento && String(c.vencimento).slice(0, 10) < hoje ? "vencido" : "aberto";
  return "fora";
}

export const valorRecebido = (c) => (c.valorPago != null && c.valorPago > 0 ? c.valorPago : c.valor);

/** Mês em que a cobrança conta: pagamento (recebida) ou vencimento (em aberto/vencida). */
export function competenciaDaCobranca(c, situacao) {
  if (situacao === "recebido") return competenciaBRT(c.pagoEm) || competenciaBRT(c.vencimento) || competenciaBRT(c.criadaEm);
  return competenciaBRT(c.vencimento) || competenciaBRT(c.criadaEm);
}

/** "Endereço Fiscal · assinatura" → "Endereço Fiscal". */
export function planoDaCobranca(c) {
  const nome = String(c.descricao || "").split(" · ")[0].trim();
  return nome || "Cobrança avulsa";
}

/** Resumo do ano: totais, mês a mês e por plano. */
export function resumoOnline(cobrancas = [], ano, hoje = hojeBRT()) {
  const porMes = Array.from({ length: 12 }, () => ({ recebido: 0, aberto: 0, vencido: 0, qtd: 0 }));
  const planos = new Map();
  const tot = { recebido: 0, aberto: 0, vencido: 0, qtdRecebidas: 0 };
  for (const c of cobrancas) {
    const sit = situacaoCobranca(c, hoje);
    if (sit === "fora") continue;
    const comp = competenciaDaCobranca(c, sit);
    if (!comp || comp.ano !== ano) continue;
    const v = sit === "recebido" ? valorRecebido(c) : c.valor;
    porMes[comp.mes][sit] += v;
    porMes[comp.mes].qtd += 1;
    tot[sit] += v;
    if (sit === "recebido") tot.qtdRecebidas += 1;
    const nome = planoDaCobranca(c);
    const p = planos.get(nome) || { plano: nome, recebido: 0, aberto: 0, vencido: 0, qtd: 0 };
    p[sit] += v; p.qtd += 1;
    planos.set(nome, p);
  }
  const arred = (n) => Math.round(n * 100) / 100;
  return {
    recebido: arred(tot.recebido), aberto: arred(tot.aberto), vencido: arred(tot.vencido), qtdRecebidas: tot.qtdRecebidas,
    porMes: porMes.map((m) => ({ recebido: arred(m.recebido), aberto: arred(m.aberto), vencido: arred(m.vencido), qtd: m.qtd })),
    porPlano: [...planos.values()].map((p) => ({ ...p, recebido: arred(p.recebido), aberto: arred(p.aberto), vencido: arred(p.vencido) }))
      .sort((a, b) => (b.recebido + b.aberto + b.vencido) - (a.recebido + a.aberto + a.vencido)),
  };
}

/** Ids das cobranças cuja receita já entrou por um lançamento PAGO (não somar de novo). */
export function cobrancasJaLancadas(lancamentos = []) {
  return new Set(lancamentos.filter((l) => l.cobrancaId && l.tipo === "entrada" && l.status === "pago").map((l) => String(l.cobrancaId)));
}

/** Receita online paga no mês (ano, mes) que ainda NÃO está nos lançamentos. */
export function receitaOnlineNoMes(cobrancas = [], lancamentos = [], ano, mes, jaLancadas = cobrancasJaLancadas(lancamentos)) {
  let valor = 0, qtd = 0;
  for (const c of cobrancas) {
    if (c.status !== "pago" || jaLancadas.has(String(c.id))) continue;
    const comp = competenciaDaCobranca(c, "recebido");
    if (!comp || comp.ano !== ano || comp.mes !== mes) continue;
    valor += valorRecebido(c); qtd += 1;
  }
  return { valor: Math.round(valor * 100) / 100, qtd };
}
