import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import { caminhoContrato, camposDaConta, idDeContaValido, validarContrato } from "./contasPlataforma.ts";

Deno.test("camposDaConta: só o que veio, limpo e sem e-mail", () => {
  const r = camposDaConta({
    nome: "  Coworking Alfa LTDA ", tipoPessoa: "pj", nomeFantasia: "Alfa", documento: "11.222.333/0001-81",
    mensalidade: "597.5", plano: "Pro", email: "outro@login.com", observacoes: "", cidade: "BH/MG",
  });
  assert(r.ok);
  if (!r.ok) return;
  assertEquals(r.campos.nome, "Coworking Alfa LTDA");
  assertEquals(r.campos.tipo_pessoa, "PJ");
  assertEquals(r.campos.nome_fantasia, "Alfa");
  assertEquals(r.campos.mensalidade, 597.5);
  assertEquals(r.campos.observacoes, null);
  assertEquals("email" in r.campos, false);
  assertEquals("responsavel" in r.campos, false);
});

Deno.test("camposDaConta: recusa nome vazio e mensalidade inválida", () => {
  assertFalse(camposDaConta({ nome: "   " }).ok);
  assertFalse(camposDaConta({ mensalidade: -1 }).ok);
  assertFalse(camposDaConta({ mensalidade: "abc" }).ok);
  assertFalse(camposDaConta(null).ok);
  const r = camposDaConta({ tipoPessoa: "xx" });
  assert(r.ok && r.campos.tipo_pessoa === null);
});

Deno.test("contrato: PDF/JPG/PNG até 10 MB", () => {
  assert(validarContrato({ nome: "contrato.pdf", mime: "application/pdf", bytes: 1000 }).ok);
  assertFalse(validarContrato({ nome: "contrato.docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: 1000 }).ok);
  assertFalse(validarContrato({ nome: "c.pdf", mime: "application/pdf", bytes: 0 }).ok);
  assertFalse(validarContrato({ nome: "c.pdf", mime: "application/pdf", bytes: 10 * 1024 * 1024 + 1 }).ok);
  assertFalse(validarContrato({ nome: " ", mime: "application/pdf", bytes: 10 }).ok);
});

Deno.test("caminho do contrato fica na pasta da conta, sem barra nem ..", () => {
  const c = caminhoContrato("fr_alfa_ab12cd", "7d0c", "../Contrato Assinatura São João.pdf");
  assertEquals(c, "fr_alfa_ab12cd/7d0c-Contrato-Assinatura-Sao-Joao.pdf");
  assertEquals(caminhoContrato("fr_x", "id", "///"), "fr_x/id-contrato");
  assert(idDeContaValido("fr_ciatos"));
  assertFalse(idDeContaValido("fr/../x"));
  assertFalse(idDeContaValido(""));
});
