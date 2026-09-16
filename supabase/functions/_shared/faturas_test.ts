import { assertEquals } from "jsr:@std/assert@1";
import {
  faturaDeBoleto, faturaDeCobranca, faturaDePedido, notaDoCliente, ordenarFaturas, ordenarNotas, resumoFaturas, variantesDocumento,
} from "./faturas.ts";

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

Deno.test("notas do cliente: só autorizada, nunca simulada", () => {
  assertEquals(notaDoCliente({ id: "s", status: "simulada", valor: 10 }), null);
  assertEquals(notaDoCliente({ id: "c", status: "cancelada", valor: 10 }), null);
  assertEquals(notaDoCliente({ id: "e", status: "erro", valor: 10 }), null);
  assertEquals(notaDoCliente({ id: "p", status: "processando", valor: 10 }), null);
  const n = notaDoCliente({ id: "a", status: "autorizada", numero: "123", valor: "119.00", created_at: "2026-09-16T12:00:00Z", pdf_url: "https://nfse.gov.br/danfse/1", xml_url: "https://x/assinada" })!;
  assertEquals([n.numero, n.valor, n.emitida_em, n.pdf_url, n.tem_xml], ["123", 119, "2026-09-16", "https://nfse.gov.br/danfse/1", true]);
  assertEquals(notaDoCliente({ id: "b", status: "autorizada", valor: 1, pdf_url: "javascript:alert(1)" })!.pdf_url, null);
  const ord = ordenarNotas([
    notaDoCliente({ id: "1", status: "autorizada", valor: 1, created_at: "2026-08-01" })!,
    notaDoCliente({ id: "2", status: "autorizada", valor: 1, created_at: "2026-09-01" })!,
  ]);
  assertEquals(ord.map((x) => x.id), ["2", "1"]);
});

Deno.test("documento do cliente: bruto, só dígitos e com máscara", () => {
  assertEquals(variantesDocumento("11122233344"), ["11122233344", "111.222.333-44"]);
  assertEquals(variantesDocumento("12.345.678/0001-90"), ["12.345.678/0001-90", "12345678000190"]);
  assertEquals(variantesDocumento(""), []);
});
