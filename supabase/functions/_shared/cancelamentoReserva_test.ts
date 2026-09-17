import { assert, assertEquals, assertFalse, assertStringIncludes } from "jsr:@std/assert@1";
import {
  mensagemCancelamentoEquipe, papelCancelaReserva, planoDeEstorno, quandoReservaBR, reservaPaga, statusDoErroCancelamento,
} from "./cancelamentoReserva.ts";

Deno.test("cancelar reserva: equipe da unidade sim; contabilidade e cliente não", () => {
  assert(papelCancelaReserva(["master"]));
  assert(papelCancelaReserva(["recepcao"]));
  assert(papelCancelaReserva(["financeiro"]));
  assert(papelCancelaReserva(["cliente", "recepcao"]));
  assertFalse(papelCancelaReserva(["contabilidade"]));
  assertFalse(papelCancelaReserva(["cliente"]));
  assertFalse(papelCancelaReserva([]));
  assertFalse(papelCancelaReserva(undefined));
});

Deno.test("reserva paga: só com pagamento confirmado e valor", () => {
  assert(reservaPaga({ payment_status: "pago", valor: 90 }));
  assert(reservaPaga({ payment_status: "pago", valor: "45.50" }));
  assertFalse(reservaPaga({ payment_status: "pago", valor: 0 }));
  assertFalse(reservaPaga({ payment_status: "pendente", valor: 90 }));
  assertFalse(reservaPaga({ payment_status: null, valor: null }));
});

Deno.test("mensagens e status dos códigos do banco", () => {
  assertStringIncludes(mensagemCancelamentoEquipe("PAGA_CONFIRMAR"), "paga online");
  assertStringIncludes(mensagemCancelamentoEquipe('ERROR: JA_CANCELADA (22000)'), "já estava cancelada");
  assertEquals(mensagemCancelamentoEquipe("algo estranho", "padrão"), "padrão");
  assertEquals(statusDoErroCancelamento("RESERVA_INEXISTENTE"), 404);
  assertEquals(statusDoErroCancelamento("PAGA_CONFIRMAR"), 409);
  assertEquals(statusDoErroCancelamento("NAO_CANCELAVEL"), 409);
  assertEquals(statusDoErroCancelamento("connection reset"), null);
});

Deno.test("estorno: automático só pedido, com pagamento no Asaas por cartão ou PIX", () => {
  assertEquals(planoDeEstorno({ paga: false, estornar: true, asaasPaymentId: "pay_1", billingType: "PIX" }), "nao_se_aplica");
  assertEquals(planoDeEstorno({ paga: true, estornar: true, asaasPaymentId: "pay_1", billingType: "PIX" }), "automatico");
  assertEquals(planoDeEstorno({ paga: true, estornar: true, asaasPaymentId: "pay_1", billingType: "CREDIT_CARD" }), "automatico");
  assertEquals(planoDeEstorno({ paga: true, estornar: true, asaasPaymentId: "pay_1", billingType: "BOLETO" }), "manual");
  assertEquals(planoDeEstorno({ paga: true, estornar: false, asaasPaymentId: "pay_1", billingType: "PIX" }), "manual");
  assertEquals(planoDeEstorno({ paga: true, estornar: true, asaasPaymentId: null, billingType: "PIX" }), "manual");
});

Deno.test("quando da reserva no horário de Brasília", () => {
  const q = quandoReservaBR("2026-09-18T13:00:00Z", "2026-09-18T15:00:00Z");
  assertStringIncludes(q, "18/09/2026");
  assertStringIncludes(q, "das 10:00 às 12:00");
});
