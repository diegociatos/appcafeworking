// deno test supabase/functions/_shared/impressao_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  competenciaBRT, extDe, folhasDe, franquiaImpressao, validarEnvio, valorExcedente,
} from "./impressao.ts";

Deno.test("folhasDe: simplex conta 1 folha por página", () => {
  assertEquals(folhasDe(10, 1, false), 10);
  assertEquals(folhasDe(1, 1, false), 1);
});

Deno.test("folhasDe: duplex junta 2 páginas por folha (arredonda p/ cima)", () => {
  assertEquals(folhasDe(10, 1, true), 5);
  assertEquals(folhasDe(3, 1, true), 2);
  assertEquals(folhasDe(1, 1, true), 1);
});

Deno.test("folhasDe: multiplica pelas cópias", () => {
  assertEquals(folhasDe(10, 3, false), 30);
  assertEquals(folhasDe(10, 2, true), 10);
});

Deno.test("folhasDe: entrada inválida cai no mínimo 1/1", () => {
  assertEquals(folhasDe(0, 0, false), 1);
  assertEquals(folhasDe(-5, -2, false), 1);
  assertEquals(folhasDe(NaN, undefined, true), 1);
});

Deno.test("valorExcedente: só cobra o que passa da franquia, a R$ 1,50/folha", () => {
  assertEquals(valorExcedente(100, 100), 0);
  assertEquals(valorExcedente(80, 100), 0);
  assertEquals(valorExcedente(120, 100), 30); // 20 folhas × 1,50
  assertEquals(valorExcedente(101, 100), 1.5);
});

Deno.test("franquiaImpressao: maior impressaoMensal entre os direitos", () => {
  assertEquals(franquiaImpressao([{ impressaoMensal: 50 }]), 50);
  assertEquals(franquiaImpressao([{ impressaoMensal: 20 }, { impressaoMensal: 80 }]), 80);
  assertEquals(franquiaImpressao([{}, null, undefined]), 0);
  assertEquals(franquiaImpressao([]), 0);
});

Deno.test("competenciaBRT: AAAA-MM no fuso de Brasília", () => {
  // 1h UTC de 1/jan ainda é 31/dez 22h em Brasília (UTC-3).
  assertEquals(competenciaBRT(new Date("2026-01-01T01:00:00Z")), "2025-12");
  assertEquals(competenciaBRT(new Date("2026-11-11T15:00:00Z")), "2026-11");
});

Deno.test("extDe: extensão minúscula, pdf como padrão", () => {
  assertEquals(extDe("contrato.PDF"), "pdf");
  assertEquals(extDe("foto.JPG"), "jpg");
  assertEquals(extDe("semextensao"), "pdf");
});

Deno.test("validarEnvio: exige nome, páginas, cópias e arquivo", () => {
  const base = { documento_nome: "doc.pdf", paginas: 3, copias: 1, arquivo: "x".repeat(20) };
  assertEquals(validarEnvio(base).ok, true);
  assertEquals(validarEnvio({ ...base, documento_nome: "" }).ok, false);
  assertEquals(validarEnvio({ ...base, paginas: 0 }).ok, false);
  assertEquals(validarEnvio({ ...base, paginas: 999 }).ok, false);
  assertEquals(validarEnvio({ ...base, copias: 0 }).ok, false);
  assertEquals(validarEnvio({ ...base, copias: 100 }).ok, false);
  assertEquals(validarEnvio({ ...base, arquivo: "" }).ok, false);
});
