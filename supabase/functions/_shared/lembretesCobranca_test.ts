import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  chaveLembrete, cobrancasParaLembrar, diasParaVencer, DIAS_LEMBRETE, janelaDeBusca, lembravel, somarDiasISO,
} from "./lembretesCobranca.ts";

const HOJE = "2026-09-17";

const cob = (extra: Record<string, unknown> = {}) => ({
  id: "cob1", unidade_id: "lux", cliente: "Ana", cliente_email: "ana@x.com",
  valor: 120, vencimento: "2026-09-20", status: "pendente", ...extra,
});

Deno.test("somarDiasISO atravessa mês e ano sem escorregar de fuso", () => {
  assertEquals(somarDiasISO("2026-09-17", 3), "2026-09-20");
  assertEquals(somarDiasISO("2026-09-30", 1), "2026-10-01");
  assertEquals(somarDiasISO("2026-12-31", 1), "2027-01-01");
  assertEquals(somarDiasISO("2026-03-01", -1), "2026-02-28");
});

Deno.test("diasParaVencer conta em dias, vencida fica negativa", () => {
  assertEquals(diasParaVencer("2026-09-20", HOJE), 3);
  assertEquals(diasParaVencer("2026-09-17", HOJE), 0);
  assertEquals(diasParaVencer("2026-09-15", HOJE), -2);
});

Deno.test("lembravel: só cobrança em aberto, com e-mail, valor e vencimento", () => {
  assert(lembravel(cob()));
  assertEquals(lembravel(cob({ status: "pago" })), false);
  assertEquals(lembravel(cob({ cliente_email: "" })), false);
  assertEquals(lembravel(cob({ valor: 0 })), false);
  assertEquals(lembravel(cob({ vencimento: null })), false);
});

Deno.test("cobrancasParaLembrar pega só quem vence no dia do lembrete", () => {
  const lista = cobrancasParaLembrar([
    cob(),                                                   // vence em 3 dias → entra
    cob({ id: "cob2", vencimento: "2026-09-19" }),            // 2 dias → não
    cob({ id: "cob3", vencimento: "2026-09-25" }),            // 8 dias → não
    cob({ id: "cob4", vencimento: "2026-09-10" }),            // vencida → não
    cob({ id: "cob5", status: "pago" }),                      // paga → não
  ], HOJE);
  assertEquals(lista.map((l) => l.cobrancaId), ["cob1"]);
  assertEquals(lista[0].diasParaVencer, DIAS_LEMBRETE);
  assertEquals(lista[0].email, "ana@x.com");
  assertEquals(lista[0].valor, 120);
});

Deno.test("cobrancasParaLembrar não repete o que já foi enviado", () => {
  const jaEnviados = [chaveLembrete("cob1", "2026-09-20")];
  assertEquals(cobrancasParaLembrar([cob()], HOJE, jaEnviados).length, 0);
  // vencimento diferente é outro lembrete
  assertEquals(cobrancasParaLembrar([cob({ vencimento: "2026-09-20" })], HOJE, [chaveLembrete("cob1", "2026-10-20")]).length, 1);
});

Deno.test("cobrancasParaLembrar normaliza e-mail e aceita outra antecedência", () => {
  const lista = cobrancasParaLembrar([cob({ cliente_email: "  ANA@X.com ", vencimento: "2026-09-24" })], HOJE, [], 7);
  assertEquals(lista.length, 1);
  assertEquals(lista[0].email, "ana@x.com");
});

Deno.test("janelaDeBusca devolve o dia exato a consultar no banco", () => {
  assertEquals(janelaDeBusca(HOJE), { de: "2026-09-20", ate: "2026-09-20" });
});
