import { test } from "node:test";
import assert from "node:assert/strict";
import { excedenteFolhas, valorExcedente, apurarExcedente, PRECO_FOLHA_EXCEDENTE } from "../src/lib/impressaoExcedente.js";

test("preço do excedente é R$ 1,50 por folha", () => {
  assert.equal(PRECO_FOLHA_EXCEDENTE, 1.5);
});

test("excedenteFolhas conta só o que passou da franquia", () => {
  assert.equal(excedenteFolhas(120, 100), 20);
  assert.equal(excedenteFolhas(80, 100), 0);  // dentro da franquia
  assert.equal(excedenteFolhas(100, 100), 0);  // exatamente na franquia
});

test("valorExcedente = excedente × 1,50", () => {
  assert.equal(valorExcedente(120, 100), 30);  // 20 folhas × 1,50
  assert.equal(valorExcedente(80, 100), 0);
});

test("apurarExcedente devolve folhas/franquia/excedente/valor", () => {
  assert.deepEqual(apurarExcedente(150, 100), { folhas: 150, franquia: 100, excedente: 50, valor: 75 });
  // sem plano (franquia 0): tudo é excedente
  assert.deepEqual(apurarExcedente(10, 0), { folhas: 10, franquia: 0, excedente: 10, valor: 15 });
});

test("apurarExcedente trata entradas inválidas", () => {
  assert.deepEqual(apurarExcedente(undefined, undefined), { folhas: 0, franquia: 0, excedente: 0, valor: 0 });
});
