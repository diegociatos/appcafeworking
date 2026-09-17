// deno test supabase/functions/_shared/venda_test.ts
import { assert, assertEquals, assertFalse, assertThrows } from "jsr:@std/assert@1";
import {
  billingTypePara, categoriaValida, cnpjValido, cpfValido, creditosDoPlano, documentoValido, economiaAnual,
  emailValido, fidelidadeAte, precoAnual, statusPublicoDoCadastro,
  hojeBRT, idCreditoPagamento, normalizarDocumento, payloadAssinaturaAsaas, referenciaExterna, sha256Hex,
  somarMeses, validarPeriodoReserva, valorReserva, type JanelaReserva, JANELA_PADRAO,
} from "./venda.ts";

Deno.test("CPF: dígitos verificadores", () => {
  assert(cpfValido("529.982.247-25"));
  assertFalse(cpfValido("529.982.247-24"));
  assertFalse(cpfValido("111.111.111-11"));
  assertFalse(cpfValido("123"));
});

Deno.test("CNPJ numérico continua válido", () => {
  assert(cnpjValido("11.222.333/0001-81"));
  assertFalse(cnpjValido("11.222.333/0001-80"));
  assertFalse(cnpjValido("00.000.000/0000-00"));
});

Deno.test("CNPJ alfanumérico (exemplo oficial da Receita)", () => {
  assert(cnpjValido("12.ABC.345/01DE-35"));
  assert(cnpjValido("12abc34501de35"), "aceita minúsculas e sem pontuação");
  assertFalse(cnpjValido("12.ABC.345/01DE-36"));
  assertFalse(cnpjValido("12.ABC.345/01DE-3X"), "dígitos verificadores são sempre números");
});

Deno.test("documentoValido escolhe CPF ou CNPJ pelo tamanho", () => {
  assert(documentoValido("52998224725"));
  assert(documentoValido("11222333000181"));
  assert(documentoValido("12ABC34501DE35"));
  assertFalse(documentoValido("5299822472"));
  assertEquals(normalizarDocumento("12.abc.345/01de-35"), "12ABC34501DE35");
});

Deno.test("e-mail e categoria", () => {
  assert(emailValido(" cliente@empresa.com.br "));
  assertFalse(emailValido("cliente@empresa"));
  assert(categoriaValida("endereco_fiscal"));
  assert(categoriaValida("abertura_empresa"));
  assertFalse(categoriaValida("qualquer"));
});

Deno.test("sha256Hex bate com o vetor conhecido", async () => {
  assertEquals(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  // acento em UTF-8 muda o hash — prova de que o texto é o mesmo byte a byte
  assert((await sha256Hex("Contrato de adesão")) !== (await sha256Hex("Contrato de adesao")));
});

Deno.test("datas: hoje em Brasília e soma de meses", () => {
  // 02:00 UTC de 15/09 ainda é 23:00 de 14/09 em Brasília
  assertEquals(hojeBRT(new Date("2026-09-15T02:00:00Z")), "2026-09-14");
  assertEquals(somarMeses("2026-01-31", 1), "2026-02-28");
  assertEquals(somarMeses("2028-01-31", 1), "2028-02-29");
  assertEquals(somarMeses("2026-09-14", 12), "2027-09-14");
  assertEquals(fidelidadeAte("2026-09-14", 6), "2027-03-14");
  assertEquals(fidelidadeAte("2026-09-14", 0), null);
});

// 14/09/2026 é segunda-feira; 12:00 UTC = 09:00 em Brasília
const AGORA = new Date("2026-09-14T12:00:00Z");

Deno.test("reserva: período válido dentro do horário", () => {
  const r = validarPeriodoReserva("2026-09-14T17:00:00Z", "2026-09-14T19:00:00Z", AGORA); // 14h–16h
  assertEquals(r, { ok: true, horas: 2 });
  // 17h–18h termina exatamente no fechamento
  assertEquals(validarPeriodoReserva("2026-09-14T20:00:00Z", "2026-09-14T21:00:00Z", AGORA), { ok: true, horas: 1 });
});

Deno.test("reserva: recusas com código estável", () => {
  const erro = (s: string, e: string, j?: JanelaReserva) => {
    const r = validarPeriodoReserva(s, e, AGORA, j);
    return r.ok ? "ok" : r.erro;
  };
  assertEquals(erro("2026-09-14T19:00:00Z", "2026-09-14T17:00:00Z"), "PERIODO_INVALIDO");
  assertEquals(erro("2026-09-14T17:30:00Z", "2026-09-14T18:30:00Z"), "HORA_CHEIA");
  assertEquals(erro("2026-09-14T12:00:00Z", "2026-09-14T13:00:00Z"), "ANTECEDENCIA");
  assertEquals(erro("2026-09-19T13:00:00Z", "2026-09-19T14:00:00Z"), "DIA_INDISPONIVEL"); // sábado
  assertEquals(erro("2026-09-14T21:00:00Z", "2026-09-14T22:00:00Z"), "FORA_DO_HORARIO"); // 18h–19h
  assertEquals(erro("2026-09-15T10:00:00Z", "2026-09-15T12:00:00Z"), "FORA_DO_HORARIO"); // 07h–09h
  assertEquals(erro("2026-09-14T17:00:00Z", "2026-09-14T20:00:00Z", { ...JANELA_PADRAO, maxHoras: 2 }), "DURACAO_MAXIMA");
});

Deno.test("valor da reserva ao centavo e sem valor/hora zerado", () => {
  assertEquals(valorReserva(2, 85.5), 171);
  assertEquals(valorReserva(3, 33.333), 100);
  assertThrows(() => valorReserva(2, 0));
  assertThrows(() => valorReserva(0, 50));
});

Deno.test("créditos do plano ignoram direitos zerados", () => {
  assertEquals(creditosDoPlano({ horasReuniao: 4, horasCoworking: 0, dayPass: "2" }), [
    { tipo: "sala_reuniao", quantidade: 4 },
    { tipo: "daypass", quantidade: 2 },
  ]);
  assertEquals(creditosDoPlano(null), []);
  assertEquals(idCreditoPagamento("pay_123", "sala_reuniao"), "cr_asaas_pay_123_sala_reuniao");
});

Deno.test("referência externa do Asaas", () => {
  assertEquals(referenciaExterna("reserva:r_abc"), { tipo: "reserva", id: "r_abc" });
  assertEquals(referenciaExterna("assinatura:8f1c-uuid"), { tipo: "assinatura", id: "8f1c-uuid" });
  assertEquals(referenciaExterna("signup:u1"), { tipo: "signup", id: "u1" });
  assertEquals(referenciaExterna(null), { tipo: "outro", id: null });
  assertEquals(referenciaExterna("pedido:1"), { tipo: "outro", id: null });
});

Deno.test("payload de assinatura mensal", () => {
  const p = payloadAssinaturaAsaas({
    customer: "cus_1", valor: 149, descricao: "Fiscal Pro · Luxemburgo", nextDueDate: "2026-09-14",
    externalReference: "assinatura:abc", billingType: "QUALQUER",
  });
  assertEquals(p.cycle, "MONTHLY");
  assertEquals(p.billingType, "UNDEFINED");
  assertEquals(p.value, 149);
});

Deno.test("preço anual com desconto, ao centavo", () => {
  assertEquals(precoAnual(149, 10), 1609.2);
  assertEquals(precoAnual(119, 10), 1285.2);
  assertEquals(precoAnual(299, 10), 3229.2);
  assertEquals(economiaAnual(149, 10), 178.8);
  assertEquals(precoAnual(100, 0), 1200);
  assertEquals(precoAnual(100, 99), 1080, "desconto fora de 0–50 cai no padrão de 10%");
  assertThrows(() => precoAnual(0, 10));
});

Deno.test("forma de pagamento por periodicidade", () => {
  assertEquals(billingTypePara("mensal", "PIX"), "CREDIT_CARD");
  assertEquals(billingTypePara("mensal", undefined), "CREDIT_CARD");
  assertEquals(billingTypePara("anual", "PIX"), "PIX");
  assertEquals(billingTypePara("anual", "BOLETO"), "BOLETO");
  assertEquals(billingTypePara("anual", "CREDIT_CARD"), "CREDIT_CARD");
  assertEquals(billingTypePara("anual", "UNDEFINED"), null);
  assertEquals(billingTypePara("semanal", "PIX"), null);
});

Deno.test("status público do cadastro não vaza estado interno", () => {
  assertEquals(statusPublicoDoCadastro("aguardando"), "aguardando");
  assertEquals(statusPublicoDoCadastro("ativando"), "aguardando");
  assertEquals(statusPublicoDoCadastro("ativo"), "confirmado");
  assertEquals(statusPublicoDoCadastro("cancelado"), "cancelado");
  assertEquals(statusPublicoDoCadastro(undefined), "aguardando");
});

Deno.test("assinatura anual usa ciclo YEARLY", () => {
  const p = payloadAssinaturaAsaas({
    customer: "c", valor: 1609.2, descricao: "x", nextDueDate: "2026-09-14",
    externalReference: "assinatura:1", billingType: "PIX", ciclo: "YEARLY",
  });
  assertEquals(p.cycle, "YEARLY");
  assertEquals(p.billingType, "PIX");
  assertEquals("split" in p, false, "unidade própria: sem split");
});

Deno.test("unidade parceira: split no corpo da assinatura e da cobrança", async () => {
  const { comSplit } = await import("./venda.ts");
  const split = [{ walletId: "0f1e2d3c-aaaa-bbbb-cccc-1234567890ab", percentualValue: 67.5 }];
  const p = payloadAssinaturaAsaas({
    customer: "c", valor: 149, descricao: "x", nextDueDate: "2026-09-14", externalReference: "assinatura:1", split,
  });
  assertEquals(p.split, split);
  assertEquals(comSplit({ value: 10 }, split), { value: 10, split });
  assertEquals(comSplit({ value: 10 }, []), { value: 10 });
  assertEquals(comSplit({ value: 10 }, null), { value: 10 });
});

Deno.test("servicosDaVenda e avisoBonificados", async () => {
  const { servicosDaVenda, avisoBonificados } = await import("./venda.ts");
  assertEquals(servicosDaVenda("abertura_empresa", {}), { abertura: true, certificado: false });
  assertEquals(servicosDaVenda("endereco_fiscal", { aberturaEmpresa: true, certificadoDigital: true }), { abertura: true, certificado: true });
  assertEquals(servicosDaVenda("coworking", null), { abertura: false, certificado: false });
  assertEquals(avisoBonificados({ categoria: "endereco_fiscal", direitos: { aberturaEmpresa: true } }).length, 1);
  assertEquals(avisoBonificados({ categoria: "abertura_empresa", direitos: {} }).length, 0);
  assertEquals(avisoBonificados({ categoria: "endereco_fiscal", direitos: {} }).length, 0);
});