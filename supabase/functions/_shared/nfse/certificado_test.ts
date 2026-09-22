import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ordenarCadeia } from "./certificado.ts";

Deno.test("cadeia do certificado começa na folha e segue os emissores", () => {
  const raiz = { nome: "raiz", subject: { hash: "R" }, issuer: { hash: "R" } };
  const folha = { nome: "folha", subject: { hash: "F" }, issuer: { hash: "I" } };
  const intermediaria = { nome: "intermediaria", subject: { hash: "I" }, issuer: { hash: "R" } };
  assertEquals(ordenarCadeia([raiz, folha, intermediaria], 1).map((c) => c.nome), ["folha", "intermediaria", "raiz"]);
});
