import { test } from "node:test";
import assert from "node:assert/strict";
import { agruparPorForma, rotuloForma } from "../src/lib/pdvFechamento.js";

test("rotuloForma normaliza caixa/acento e cobre valores do app", () => {
  assert.equal(rotuloForma("Dinheiro"), "Dinheiro");
  assert.equal(rotuloForma("dinheiro"), "Dinheiro");
  assert.equal(rotuloForma("Cartão"), "Cartão");
  assert.equal(rotuloForma("cartao"), "Cartão");
  assert.equal(rotuloForma("mensal"), "Faturado no plano (mensal)");
  assert.equal(rotuloForma(""), "Não informado");
  assert.equal(rotuloForma("Vale-refeição"), "Vale-refeição"); // desconhecido: mantém
});

test("agruparPorForma soma por forma e dá o total geral", () => {
  const pedidos = [
    { formaPagamento: "Dinheiro", total: 10 },
    { formaPagamento: "Dinheiro", total: 5.5 },
    { formaPagamento: "Pix", total: 20 },
    { formaPagamento: "Cartão", total: 30 },
  ];
  const r = agruparPorForma(pedidos);
  assert.equal(r.totalGeral, 65.5);
  assert.equal(r.qtd, 4);
  // ordenado por maior total: Cartão(30) > Pix(20) > Dinheiro(15.5)
  assert.deepEqual(r.linhas.map((l) => [l.rotulo, l.n, l.total]), [["Cartão", 1, 30], ["Pix", 1, 20], ["Dinheiro", 2, 15.5]]);
});

test("agruparPorForma trata pedido sem forma e total ausente", () => {
  const r = agruparPorForma([{ total: 10 }, { formaPagamento: "Pix" }]);
  assert.equal(r.totalGeral, 10);
  const semForma = r.linhas.find((l) => l.forma === "—");
  assert.ok(semForma && semForma.n === 1);
});

test("agruparPorForma vazio", () => {
  assert.deepEqual(agruparPorForma([]), { linhas: [], totalGeral: 0, qtd: 0 });
});
