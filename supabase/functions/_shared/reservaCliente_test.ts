import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  calcularReserva, datasDaAgenda, mensagemReserva, padraoEmail, podeCancelar, salaReservavelPeloCliente, tipoCredito,
  validarReservaCliente,
} from "./reservaCliente.ts";
import { nomeExibicaoUnidade } from "./unidadeNome.ts";
import { categoriaOpcional, deveEnviar } from "./notify/preferencias.ts";

// terça-feira, 15/09/2026, 10h em Brasília (13h UTC)
const AGORA = new Date("2026-09-15T13:00:00Z");

Deno.test("tipoCredito: reunião e compartilhada consomem crédito, privativa não", () => {
  assertEquals(tipoCredito("Reunião"), "sala_reuniao");
  assertEquals(tipoCredito("Compartilhada"), "coworking");
  assertEquals(tipoCredito("Privativa"), null);
});

Deno.test("salaReservavelPeloCliente: fora de locação fixa, com preço por hora ou coberta pelo plano", () => {
  assert(salaReservavelPeloCliente({ active: true, contratada: false, valor_hora: 85, tipo: "Reunião" }));
  assert(salaReservavelPeloCliente({ active: true, contratada: false, valor_hora: 0, tipo: "Compartilhada" }));
  assertEquals(salaReservavelPeloCliente({ active: true, contratada: false, valor_hora: 0, tipo: "Privativa" }), false);
  assertEquals(salaReservavelPeloCliente({ active: true, contratada: true, valor_hora: 85, tipo: "Reunião" }), false);
  assertEquals(salaReservavelPeloCliente({ active: false, contratada: false, valor_hora: 85, tipo: "Reunião" }), false);
});

Deno.test("calcularReserva: crédito cobre o que dá e o resto é excedente", () => {
  assertEquals(calcularReserva(3, 2, 50), {
    horas: 3, cobertas: 2, excedente: 1, valorSemDesconto: 50, descontoPct: 0, descontoValor: 0, valorExcedente: 50,
  });
  assertEquals(calcularReserva(2, 0, 85), {
    horas: 2, cobertas: 0, excedente: 2, valorSemDesconto: 170, descontoPct: 0, descontoValor: 0, valorExcedente: 170,
  });
  assertEquals(calcularReserva(1, 5, 0), {
    horas: 1, cobertas: 1, excedente: 0, valorSemDesconto: 0, descontoPct: 0, descontoValor: 0, valorExcedente: 0,
  });
  assertEquals(calcularReserva(2, -3, 10).cobertas, 0);
  // desconto de sala do plano entra só sobre o excedente
  assertEquals(calcularReserva(2, 0, 85, 10).valorExcedente, 153);
});

Deno.test("validarReservaCliente recusa passado, fim de semana, fora do horário e longe demais", () => {
  assertEquals(validarReservaCliente("2026-09-15T12:00:00Z", "2026-09-15T13:00:00Z", AGORA), { ok: false, erro: "ANTECEDENCIA" });
  assertEquals(validarReservaCliente("2026-09-14T12:00:00Z", "2026-09-14T13:00:00Z", AGORA), { ok: false, erro: "ANTECEDENCIA" });
  assertEquals(validarReservaCliente("2026-09-15T14:00:00Z", "2026-09-15T16:00:00Z", AGORA), { ok: true, horas: 2 });
  assertEquals(validarReservaCliente("2026-09-19T14:00:00Z", "2026-09-19T15:00:00Z", AGORA), { ok: false, erro: "DIA_INDISPONIVEL" });
  assertEquals(validarReservaCliente("2026-09-16T21:00:00Z", "2026-09-16T22:00:00Z", AGORA), { ok: false, erro: "FORA_DO_HORARIO" });
  assertEquals(validarReservaCliente("2026-10-20T14:00:00Z", "2026-10-20T15:00:00Z", AGORA), { ok: false, erro: "LONGE_DEMAIS" });
});

Deno.test("podeCancelar: até 24h antes, só confirmada/solicitada e não paga", () => {
  const base = { status: "confirmada", start_at: "2026-09-16T14:00:00Z", payment_status: "pendente", valor: 50 };
  assert(podeCancelar(base, AGORA));
  assertEquals(podeCancelar({ ...base, start_at: "2026-09-16T12:00:00Z" }, AGORA), false);
  assertEquals(podeCancelar({ ...base, status: "cancelada" }, AGORA), false);
  assertEquals(podeCancelar({ ...base, payment_status: "pago" }, AGORA), false);
  assert(podeCancelar({ ...base, payment_status: "pago", valor: 0 }, AGORA));
});

Deno.test("datasDaAgenda: só dias úteis, a partir de hoje", () => {
  const d = datasDaAgenda(AGORA);
  assertEquals(d[0], "2026-09-15");
  assertEquals(d.includes("2026-09-19"), false);
  assert(d.length >= 20 && d.length <= 23);
});

Deno.test("mensagemReserva traduz o código do banco e esconde detalhe técnico", () => {
  assertEquals(mensagemReserva("CONFLITO"), "Esse horário acabou de ser reservado. Escolha outro.");
  assertEquals(mensagemReserva('duplicate key value violates unique constraint "x"'), "Não foi possível concluir. Tente de novo.");
});

Deno.test("padraoEmail escapa curingas do ILIKE", () => {
  assertEquals(padraoEmail("joao_silva%@x.com"), "joao\\_silva\\%@x.com");
});

Deno.test("nomeExibicaoUnidade tira a marca do nome da unidade", () => {
  assertEquals(nomeExibicaoUnidade("CafeWorkingLuxemburgo"), "Luxemburgo");
  assertEquals(nomeExibicaoUnidade("Cafe Working Estoril"), "Estoril");
  assertEquals(nomeExibicaoUnidade("CafeWorking"), "CafeWorking");
  assertEquals(nomeExibicaoUnidade(null), "");
});

Deno.test("preferências: só lembrete e reserva são opcionais", () => {
  assertEquals(categoriaOpcional("boleto_lembrete"), "lembretes");
  assertEquals(categoriaOpcional("correspondencia"), null);
  assertEquals(deveEnviar("reserva", { reservas: false }), false);
  assertEquals(deveEnviar("reserva", null), true);
  assertEquals(deveEnviar("cobranca_nova", { lembretes: false, reservas: false }), true);
});
