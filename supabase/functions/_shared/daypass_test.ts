// Testes das regras puras do day pass. Nada chama Supabase nem Asaas.
//   deno test supabase/functions/_shared/daypass_test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import { blocoDayPass, ehDayPass, menorBaseLivre, validarDataUso } from "./daypass.ts";

// Uma quarta-feira às 12:00 BRT (15:00Z) serve de "agora" estável nos testes.
const AGORA = new Date("2026-11-11T15:00:00.000Z"); // quarta, 11/11/2026

Deno.test("ehDayPass: só coworking com direito dayPass > 0", () => {
  assert(ehDayPass({ categoria: "coworking", direitos: { dayPass: 1 } }));
  assert(!ehDayPass({ categoria: "coworking", direitos: { dayPass: 0 } }));
  assert(!ehDayPass({ categoria: "coworking", direitos: {} }));
  assert(!ehDayPass({ categoria: "sala_privativa", direitos: { dayPass: 1 } }));
  assert(!ehDayPass(null));
});

Deno.test("validarDataUso: aceita dia útil futuro", () => {
  const r = validarDataUso("2026-11-12", AGORA); // quinta
  assertEquals(r, { ok: true, data: "2026-11-12" });
});

Deno.test("validarDataUso: recusa fim de semana", () => {
  const sab = validarDataUso("2026-11-14", AGORA); // sábado
  assert(!sab.ok);
  const dom = validarDataUso("2026-11-15", AGORA); // domingo
  assert(!dom.ok);
});

Deno.test("validarDataUso: recusa data no passado", () => {
  const r = validarDataUso("2026-11-10", AGORA); // terça anterior
  assert(!r.ok);
});

Deno.test("validarDataUso: aceita o próprio dia (hoje, se útil)", () => {
  const r = validarDataUso("2026-11-11", AGORA); // a própria quarta
  assertEquals(r, { ok: true, data: "2026-11-11" });
});

Deno.test("validarDataUso: recusa além do limite de dias", () => {
  const r = validarDataUso("2027-06-01", AGORA); // bem além de 90 dias
  assert(!r.ok);
});

Deno.test("validarDataUso: recusa formato/dia inexistente", () => {
  assert(!validarDataUso("", AGORA).ok);
  assert(!validarDataUso("11/11/2026", AGORA).ok);
  assert(!validarDataUso("2026-02-30", AGORA).ok);
});

Deno.test("blocoDayPass: 08h–18h BRT em UTC", () => {
  assertEquals(blocoDayPass("2026-11-12"), {
    startISO: "2026-11-12T11:00:00.000Z",
    endISO: "2026-11-12T21:00:00.000Z",
  });
});

Deno.test("menorBaseLivre: acha a menor base livre", () => {
  assertEquals(menorBaseLivre([], 8), 1);
  assertEquals(menorBaseLivre([1, 2, 3], 8), 4);
  assertEquals(menorBaseLivre([2, 3], 8), 1);
  assertEquals(menorBaseLivre([1, 2, 3, 5, 6, 7, 8], 8), 4); // fura o buraco
});

Deno.test("menorBaseLivre: null quando lotado", () => {
  assertEquals(menorBaseLivre([1, 2, 3, 4, 5, 6, 7, 8], 8), null);
});

Deno.test("menorBaseLivre: ignora bases nulas de reservas antigas", () => {
  assertEquals(menorBaseLivre([null, undefined, 1], 8), 2);
});
