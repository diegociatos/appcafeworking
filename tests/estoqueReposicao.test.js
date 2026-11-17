import { test } from "node:test";
import assert from "node:assert/strict";
import { sugestaoReposicao, listaReposicao } from "../src/lib/estoqueReposicao.js";

test("sugestaoReposicao repõe até 2× o mínimo por padrão", () => {
  // mínimo 10, tem 3 → alvo 20, comprar 17
  const r = sugestaoReposicao({ estoqueMinimo: 10, quantidade: 3, custo: 2 });
  assert.equal(r.alvo, 20);
  assert.equal(r.sugestao, 17);
  assert.equal(r.custoEstimado, 34);
});

test("sugestaoReposicao nunca sugere menos que 1 e sobe acima do mínimo", () => {
  // tem exatamente o mínimo (ainda é baixo): alvo min+? => compra ao menos 1
  const r = sugestaoReposicao({ estoqueMinimo: 5, quantidade: 5, custo: 1 });
  assert.ok(r.sugestao >= 1);
  assert.ok(r.alvo > 5);
});

test("sugestaoReposicao com mínimo 0 sugere 1", () => {
  const r = sugestaoReposicao({ estoqueMinimo: 0, quantidade: 0, custo: 3 });
  assert.equal(r.sugestao, 1);
  assert.equal(r.custoEstimado, 3);
});

test("listaReposicao ordena por maior custo e soma o total", () => {
  const baixos = [
    { nome: "Guardanapo", estoqueMinimo: 10, quantidade: 2, custo: 1 }, // comprar 18 → 18
    { nome: "Café em grão", estoqueMinimo: 5, quantidade: 1, custo: 20 }, // comprar 9 → 180
  ];
  const r = listaReposicao(baixos);
  assert.equal(r.linhas[0].item.nome, "Café em grão"); // maior custo primeiro
  assert.equal(r.totalEstimado, 198);
});
