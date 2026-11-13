import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ehNaoComercial, chaveDia, hojeSP, dataValidaCompleta, vencimentoReal,
  classificarRecebivel, saldoResidual, montarParcela, resumoRecebiveis,
} from "../src/lib/financeiro.js";

// Hoje fixo para os testes: 15/11/2026 (SP).
const HOJE = { ano: 2026, mes: 10, dia: 15, chave: chaveDia(2026, 10, 15) };

test("dataValidaCompleta aceita só DD/MM/AAAA real", () => {
  assert.equal(dataValidaCompleta("15/11/2026"), true);
  assert.equal(dataValidaCompleta("01/10/2026"), true);
  assert.equal(dataValidaCompleta("1"), false);        // dia solto
  assert.equal(dataValidaCompleta("20"), false);
  assert.equal(dataValidaCompleta("—"), false);
  assert.equal(dataValidaCompleta("14/07"), false);    // sem ano
  assert.equal(dataValidaCompleta("31/02/2026"), false); // 31 de fev não existe
  assert.equal(dataValidaCompleta(""), false);
});

test("ehNaoComercial separa transferências e investimentos", () => {
  assert.equal(ehNaoComercial({ categoria: "Conta Movimentação" }), true);
  assert.equal(ehNaoComercial({ categoria: "Investimentos/Dividendos" }), true);
  assert.equal(ehNaoComercial({ categoria: "Receita Operacional Bruta" }), false);
});

test("vencimentoReal usa a data completa quando existe", () => {
  const v = vencimentoReal({ data: "01/10/2026", mes: 9, ano: 2026 });
  assert.deepEqual([v.ano, v.mes, v.dia, v.composto], [2026, 9, 1, false]);
});

test("vencimentoReal COMPÕE a data a partir do dia solto + competência (bug data=1)", () => {
  // O caso Ciatos: data="1", mes=10 (nov), ano=2026, sem dataVencimento.
  const v = vencimentoReal({ data: "1", mes: 10, ano: 2026, dataVencimento: null });
  assert.ok(v, "deveria compor um vencimento");
  assert.deepEqual([v.ano, v.mes, v.dia, v.composto], [2026, 10, 1, true]);
  assert.equal(v.chave, chaveDia(2026, 10, 1));
});

test("vencimentoReal compõe dia 20 na competência correta", () => {
  const v = vencimentoReal({ data: "20", mes: 8, ano: 2026 });
  assert.deepEqual([v.ano, v.mes, v.dia], [2026, 8, 20]);
});

test("vencimentoReal clampa dia 31 ao último dia do mês", () => {
  const v = vencimentoReal({ data: "31", mes: 1, ano: 2026 }); // fev/2026
  assert.equal(v.dia, 28);
});

test("vencimentoReal devolve null quando não há dia (— ou vazio)", () => {
  assert.equal(vencimentoReal({ data: "—", mes: 3, ano: 2026 }), null);
  assert.equal(vencimentoReal({ data: "", mes: 3, ano: 2026 }), null);
  assert.equal(vencimentoReal({ data: "20" }), null); // sem competência (mes)
});

test("classificar: NÃO vence no próprio dia (vence hoje => a_vencer)", () => {
  const c = classificarRecebivel({ tipo: "entrada", status: "previsto", data: "15", mes: 10, ano: 2026 }, HOJE);
  assert.equal(c.classe, "a_vencer");
  assert.equal(c.diasAtraso, 0);
});

test("classificar: vencido ontem => vencido com 1 dia", () => {
  const c = classificarRecebivel({ tipo: "entrada", status: "previsto", data: "14", mes: 10, ano: 2026 }, HOJE);
  assert.equal(c.classe, "vencido");
  assert.equal(c.diasAtraso, 1);
});

test("classificar: parcela de 2027 => futuro (não vencido, não a_vencer)", () => {
  const c = classificarRecebivel({ tipo: "entrada", status: "previsto", data: "10", mes: 0, ano: 2027 }, HOJE);
  assert.equal(c.classe, "futuro");
});

test("classificar: sem data derivável => inconsistente (não some)", () => {
  const c = classificarRecebivel({ tipo: "entrada", status: "previsto", data: "—", mes: 3, ano: 2026 }, HOJE);
  assert.equal(c.classe, "inconsistente");
});

test("hojeSP respeita o fuso America/Sao_Paulo na virada do dia", () => {
  // 01/03/2026 00:30 UTC ainda é 28/02/2026 21:30 em SP (UTC-3).
  const h = hojeSP(new Date("2026-03-01T00:30:00Z"));
  assert.deepEqual([h.ano, h.mes, h.dia], [2026, 1, 28]);
  // 01/03/2026 12:00 UTC já é 01/03 em SP.
  const h2 = hojeSP(new Date("2026-03-01T12:00:00Z"));
  assert.deepEqual([h2.ano, h2.mes, h2.dia], [2026, 2, 1]);
});

test("saldoResidual: previsto = valor, pago = 0", () => {
  assert.equal(saldoResidual({ status: "previsto", valor: 100 }), 100);
  assert.equal(saldoResidual({ status: "pago", valor: 100 }), 0);
  assert.equal(saldoResidual({ status: "previsto", valor: 100, valorRecebido: 40 }), 60);
});

test("montarParcela gera datas completas e consistentes (corrige o gerador)", () => {
  const p = montarParcela({ descricao: "Sala", valor: 1570.74 }, 10 /*nov*/, 2026, 0, "1");
  assert.equal(p.mes, 10);
  assert.equal(p.ano, 2026);
  assert.equal(p.data, "01/11/2026");
  assert.equal(p.dataVencimento, "01/11/2026");
  assert.equal(dataValidaCompleta(p.data), true);
  assert.equal(p.status, "previsto");
});

test("montarParcela rola o ano e clampa o dia (dez+1 => jan; 31 em fev)", () => {
  const dez = montarParcela({}, 11, 2026, 1, "10"); // dez/2026 + 1 => jan/2027
  assert.deepEqual([dez.ano, dez.mes, dez.data], [2027, 0, "10/01/2027"]);
  const fev = montarParcela({}, 1, 2026, 0, "31"); // fev/2026 dia 31 => 28
  assert.equal(fev.data, "28/02/2026");
});

test("resumoRecebiveis separa vencido / a_vencer / futuro / inconsistente por saldo", () => {
  const lanc = [
    { tipo: "entrada", status: "previsto", valor: 100, data: "14", mes: 10, ano: 2026 }, // vencido
    { tipo: "entrada", status: "previsto", valor: 200, data: "20", mes: 10, ano: 2026 }, // a_vencer
    { tipo: "entrada", status: "previsto", valor: 300, data: "10", mes: 0, ano: 2027 },  // futuro
    { tipo: "entrada", status: "previsto", valor: 400, data: "—", mes: 3, ano: 2026 },   // inconsistente
    { tipo: "entrada", status: "pago", valor: 999, data: "01/10/2026", mes: 9, ano: 2026 }, // ignora (pago)
    { tipo: "saida", status: "previsto", valor: 50, data: "10", mes: 10, ano: 2026 },    // ignora (saida)
  ];
  const r = resumoRecebiveis(lanc, HOJE);
  assert.deepEqual([r.vencido.n, r.vencido.total], [1, 100]);
  assert.deepEqual([r.a_vencer.n, r.a_vencer.total], [1, 200]);
  assert.deepEqual([r.futuro.n, r.futuro.total], [1, 300]);
  assert.deepEqual([r.inconsistente.n, r.inconsistente.total], [1, 400]);
});

test("conciliado sai dos recebíveis (não é previsto) — sem dupla contagem", () => {
  const lanc = [
    { tipo: "entrada", status: "previsto", valor: 500, data: "14", mes: 10, ano: 2026 },  // conta
    { tipo: "entrada", status: "conciliado", valor: 600, data: "14", mes: 10, ano: 2026, conciliadoCom: "lcX" }, // ignora
  ];
  const r = resumoRecebiveis(lanc, HOJE);
  assert.deepEqual([r.vencido.n, r.vencido.total], [1, 500]);
  assert.equal(r.itens.length, 1);
});
