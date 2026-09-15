import { assertEquals } from "jsr:@std/assert@1";
import { faturaDeBoleto, faturaDeCobranca, faturaDePedido, ordenarFaturas, resumoFaturas } from "./faturas.ts";

const HOJE = "2026-09-15";

Deno.test("cobrança pendente vencida vira 'vencida' e mantém o link real de pagamento", () => {
  const f = faturaDeCobranca({ id: "1", status: "pendente", vencimento: "2026-09-10", valor: "119.00", invoice_url: "https://asaas/i/1" }, HOJE)!;
  assertEquals(f.situacao, "vencida");
  assertEquals(f.pagar_url, "https://asaas/i/1");
  assertEquals(f.valor, 119);
});

Deno.test("cobrança cancelada some; paga não expõe PIX", () => {
  assertEquals(faturaDeCobranca({ id: "1", status: "cancelado", valor: 1 }, HOJE), null);
  const paga = faturaDeCobranca({ id: "2", status: "pago", valor: 10, pix_payload: "000201" }, HOJE)!;
  assertEquals(paga.situacao, "paga");
  assertEquals(paga.pix_copia_cola, null);
});

Deno.test("boleto com erro some; em aberto traz linha digitável e PDF", () => {
  assertEquals(faturaDeBoleto({ id: "b", status: "erro", valor: 5 }, HOJE), null);
  const b = faturaDeBoleto({ id: "b", status: "registrado", valor: 5, vencimento: "2026-09-20", linha_digitavel: "123", pdf_url: "https://x/pdf" }, HOJE)!;
  assertEquals([b.situacao, b.linha_digitavel, b.boleto_url], ["aberta", "123", "https://x/pdf"]);
});

Deno.test("pedido sem link de pagamento não aparece", () => {
  assertEquals(faturaDePedido({ plano_nome: "Fiscal", valor: 119 }), null);
  assertEquals(faturaDePedido({ plano_nome: "Fiscal", valor: 119, invoice_url: "https://asaas/i/9", created_at: "2026-09-14T10:00:00Z" })!.situacao, "aberta");
});

Deno.test("ordem e resumo: vencida, aberta, depois pagas recentes", () => {
  const lista = [
    faturaDeCobranca({ id: "p", status: "pago", valor: 10, vencimento: "2026-08-10" }, HOJE)!,
    faturaDeCobranca({ id: "a", status: "pendente", valor: 20, vencimento: "2026-10-10" }, HOJE)!,
    faturaDeCobranca({ id: "v", status: "vencido", valor: 30, vencimento: "2026-09-01" }, HOJE)!,
  ];
  assertEquals(ordenarFaturas(lista).map((f) => f.id), ["cob_v", "cob_a", "cob_p"]);
  const r = resumoFaturas(lista);
  assertEquals([r.em_aberto, r.vencidas, r.valor_em_aberto, r.proxima?.id], [2, 1, 50, "cob_v"]);
});
