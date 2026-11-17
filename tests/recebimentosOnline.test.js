import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cobrancasJaLancadas, receitaOnlineNoMes, resumoOnline, competenciaDaCobranca, valorRecebido,
} from "../src/lib/recebimentosOnline.js";

// Cenário 2 da 1ª entrega: "venda recebida via Asaas aparecendo uma única vez
// na receita". A receita é a soma de (lançamentos pagos) + (cobranças online
// pagas que AINDA NÃO têm lançamento pago). O teste prova que, quando a mesma
// venda existe nos dois lugares, ela conta só uma vez.

const HOJE = "2026-11-30";

// Uma venda Asaas paga em 10/11/2026, R$ 500.
const vendaAsaas = {
  id: "cob_venda_1", status: "pago", valor: 500, valorPago: 500,
  pagoEm: "2026-11-10T13:00:00Z", vencimento: "2026-11-10", tipo: "venda", descricao: "Day-pass · venda",
};

test("venda Asaas já baixada num lançamento pago NÃO soma de novo na receita online", () => {
  // O webhook baixou a cobrança: existe um lançamento pago com o mesmo cobrancaId.
  const lancamentos = [
    { id: "lc1", tipo: "entrada", status: "pago", valor: 500, cobrancaId: "cob_venda_1", mes: 10, ano: 2026, dataPagamento: "10/11/2026" },
  ];
  const ja = cobrancasJaLancadas(lancamentos);
  assert.equal(ja.has("cob_venda_1"), true);

  const online = receitaOnlineNoMes([vendaAsaas], lancamentos, 2026, 10, ja);
  assert.deepEqual([online.valor, online.qtd], [0, 0], "a venda não pode somar como receita online: já está no lançamento pago");

  // Receita total do mês = lançamento (500) + online (0) = 500, não 1000.
  const receitaLancamentos = lancamentos.filter((l) => l.tipo === "entrada" && l.status === "pago" && l.mes === 10 && l.ano === 2026).reduce((s, l) => s + l.valor, 0);
  assert.equal(receitaLancamentos + online.valor, 500);
});

test("venda Asaas SEM lançamento correspondente soma uma vez (e só uma) na receita online", () => {
  const ja = cobrancasJaLancadas([]); // nenhum lançamento
  const online = receitaOnlineNoMes([vendaAsaas], [], 2026, 10, ja);
  assert.deepEqual([online.valor, online.qtd], [500, 1]);
});

test("a mesma cobrança não é contada em dois meses (conta no mês do pagamento)", () => {
  // Vencimento em outubro, pagamento em novembro: conta em novembro (regime de caixa).
  const out = receitaOnlineNoMes([vendaAsaas], [], 2026, 9); // outubro
  const nov = receitaOnlineNoMes([vendaAsaas], [], 2026, 10); // novembro
  assert.deepEqual([out.valor, out.qtd], [0, 0]);
  assert.deepEqual([nov.valor, nov.qtd], [500, 1]);
  assert.deepEqual(competenciaDaCobranca(vendaAsaas, "recebido"), { ano: 2026, mes: 10 });
});

test("resumoOnline conta cada cobrança paga uma única vez no total recebido", () => {
  const cobrancas = [
    vendaAsaas,
    { id: "cob_2", status: "pago", valor: 300, valorPago: 300, pagoEm: "2026-11-12T10:00:00Z", vencimento: "2026-11-12", tipo: "reserva", descricao: "Sala · reserva" },
    { id: "cob_3", status: "pendente", valor: 200, vencimento: "2026-11-20", tipo: "venda", descricao: "Day-pass" }, // aberto, não entra no recebido
  ];
  const r = resumoOnline(cobrancas, 2026, HOJE);
  assert.equal(r.recebido, 800); // 500 + 300, cada uma uma vez
  assert.equal(r.qtdRecebidas, 2);
});

test("valorRecebido usa valorPago quando houver, senão o valor nominal", () => {
  assert.equal(valorRecebido({ valor: 500, valorPago: 480 }), 480);
  assert.equal(valorRecebido({ valor: 500, valorPago: null }), 500);
  assert.equal(valorRecebido({ valor: 500, valorPago: 0 }), 500);
});
