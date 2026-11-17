import { test } from "node:test";
import assert from "node:assert/strict";
import { clientesDuplicados, canonicoDoGrupo, chavesDuplicidade, docDoCliente } from "../src/lib/clientesDuplicados.js";

test("docDoCliente lê documento/cnpj/cpf e tira a máscara", () => {
  assert.equal(docDoCliente({ documento: "12.345.678/0001-90" }), "12345678000190");
  assert.equal(docDoCliente({ cpf: "111.222.333-44" }), "11122233344");
  assert.equal(docDoCliente({ nome: "Sem doc" }), "");
});

test("detecta duplicidade por mesmo CPF/CNPJ (mesmo com nome diferente e máscara diferente)", () => {
  const clientes = [
    { id: "a", nome: "João Silva", documento: "111.222.333-44", unidadeId: "u1" },
    { id: "b", nome: "Joao S.", documento: "11122233344", unidadeId: "u1" },
    { id: "c", nome: "Outro", documento: "999.888.777-66", unidadeId: "u1" },
  ];
  const dups = clientesDuplicados(clientes);
  assert.equal(dups.length, 1);
  assert.deepEqual(dups[0].membros.map((c) => c.id).sort(), ["a", "b"]);
  assert.ok(dups[0].motivos.includes("documento"));
});

test("detecta duplicidade por mesmo nome na mesma unidade (acento/caixa ignorados)", () => {
  const clientes = [
    { id: "a", nome: "Maria José", unidadeId: "u1" },
    { id: "b", nome: "MARIA JOSE", unidadeId: "u1" },
    { id: "c", nome: "Maria José", unidadeId: "u2" }, // outra unidade: não agrupa com u1
  ];
  const dups = clientesDuplicados(clientes);
  assert.equal(dups.length, 1);
  assert.deepEqual(dups[0].membros.map((c) => c.id).sort(), ["a", "b"]);
  assert.ok(dups[0].motivos.includes("nome"));
});

test("funde grupos que se tocam (A≡B por doc, B≡C por nome)", () => {
  const clientes = [
    { id: "a", nome: "Empresa X", documento: "11122233344", unidadeId: "u1" },
    { id: "b", nome: "Empresa X LTDA", documento: "11122233344", unidadeId: "u1" }, // doc = a
    { id: "c", nome: "Empresa X LTDA", unidadeId: "u1" },                           // nome = b
  ];
  const dups = clientesDuplicados(clientes);
  assert.equal(dups.length, 1);
  assert.deepEqual(dups[0].membros.map((c) => c.id).sort(), ["a", "b", "c"]);
});

test("não acusa duplicidade entre clientes distintos", () => {
  const clientes = [
    { id: "a", nome: "Ana", documento: "11122233344", unidadeId: "u1" },
    { id: "b", nome: "Bruno", documento: "55566677788", unidadeId: "u1" },
  ];
  assert.deepEqual(clientesDuplicados(clientes), []);
});

test("nome curto demais ou documento incompleto não gera falso positivo", () => {
  const clientes = [
    { id: "a", nome: "Jo", documento: "123", unidadeId: "u1" },
    { id: "b", nome: "Jo", documento: "456", unidadeId: "u1" },
  ];
  assert.deepEqual(clientesDuplicados(clientes), []); // nome < 3 e doc < 11
  assert.deepEqual(chavesDuplicidade(clientes[0]), []);
});

test("canonicoDoGrupo prefere o mais completo e, no empate, o mais antigo", () => {
  const membros = [
    { id: "a", nome: "X", unidadeId: "u1", criadoEm: "2026-03-01" }, // sem doc/email
    { id: "b", nome: "X", unidadeId: "u1", documento: "11122233344", email: "x@x.com", telefone: "319", criadoEm: "2026-05-01" }, // completo
  ];
  assert.equal(canonicoDoGrupo(membros).id, "b");
  const empate = [
    { id: "a", nome: "X", criadoEm: "2026-05-01" },
    { id: "c", nome: "X", criadoEm: "2026-01-01" }, // mais antigo
  ];
  assert.equal(canonicoDoGrupo(empate).id, "c");
});
