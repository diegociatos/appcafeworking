import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizarCopias, permiteCopiasFinanceiras } from "./contatosFinanceiros.ts";
Deno.test("cópias financeiras nunca incluem convites, documentos ou acesso", () => {
  for (const evento of ["convite_acesso", "assinatura_ativa", "abertura_preencher", "aviso_equipe", "documentos_aprovados", "reserva"]) assertEquals(permiteCopiasFinanceiras(evento), false);
  assertEquals(permiteCopiasFinanceiras("nfse_emitida"), true);
  assertEquals(permiteCopiasFinanceiras("boleto_nova"), true);
});
Deno.test("cópias eliminam titular, duplicados e entradas inválidas", () => {
  assertEquals(normalizarCopias("titular@example.com", ["TITULAR@example.com", " Financeiro@example.com ", "financeiro@example.com", "invalido", null]), ["financeiro@example.com"]);
  assertEquals(normalizarCopias("a@example.com", null), []);
});
