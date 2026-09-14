import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import {
  caminhoDocumento, diasEntre, emJanelaDeAvisoRenovacao, planoDeCancelamento, proximaCobranca,
  reembolsoAutomatico, somarDias, validarArquivo,
} from "./ciclo.ts";

Deno.test("datas: somar dias e contar dias entre datas", () => {
  assertEquals(somarDias("2026-09-14", 30), "2026-10-14");
  assertEquals(somarDias("2026-12-20", 15), "2027-01-04");
  assertEquals(diasEntre("2026-09-14", "2026-09-21"), 7);
  assertEquals(diasEntre("2026-09-21", "2026-09-14"), -7);
});

Deno.test("próxima cobrança: mensal soma 1 mês, anual soma 12", () => {
  assertEquals(proximaCobranca("2026-01-31", "mensal"), "2026-02-28");
  assertEquals(proximaCobranca("2026-09-14", "anual"), "2027-09-14");
});

Deno.test("aviso de renovação: 30 dias antes, uma vez por ciclo, só no anual", () => {
  const base = { recorrencia: "anual", status: "ativa", proxima_cobranca: "2027-09-14", aviso_renovacao_ciclo: null };
  assert(emJanelaDeAvisoRenovacao(base, "2027-08-15"));          // 30 dias antes
  assert(emJanelaDeAvisoRenovacao(base, "2027-09-01"));          // rotina atrasou: ainda avisa
  assertFalse(emJanelaDeAvisoRenovacao(base, "2027-08-14"));     // 31 dias antes: cedo
  assertFalse(emJanelaDeAvisoRenovacao(base, "2027-09-14"));     // no dia: tarde demais
  assertFalse(emJanelaDeAvisoRenovacao({ ...base, aviso_renovacao_ciclo: "2027-09-14" }, "2027-08-20"));
  assertFalse(emJanelaDeAvisoRenovacao({ ...base, recorrencia: "mensal" }, "2027-08-20"));
  assertFalse(emJanelaDeAvisoRenovacao({ ...base, status: "cancelando" }, "2027-08-20"));
  assertFalse(emJanelaDeAvisoRenovacao({ ...base, proxima_cobranca: null }, "2027-08-20"));
});

Deno.test("cancelamento em até 7 dias é arrependimento: imediato e com reembolso", () => {
  const p = planoDeCancelamento({ inicio: "2026-09-14", hoje: "2026-09-21", recorrencia: "mensal", fidelidade_ate: "2027-03-14" });
  assertEquals(p.tipo, "arrependimento");
  assertEquals(p.cancelaEm, "2026-09-21");
  assertFalse(p.requerAcerto);
});

Deno.test("depois de 7 dias: aviso prévio de 30 dias", () => {
  const p = planoDeCancelamento({ inicio: "2026-09-14", hoje: "2026-10-01", recorrencia: "mensal", fidelidade_ate: null });
  assertEquals(p.tipo, "aviso_previo");
  assertEquals(p.cancelaEm, "2026-10-31");
  assertFalse(p.requerAcerto);
});

Deno.test("acerto financeiro: fidelidade que passa do aviso e plano anual", () => {
  const fid = planoDeCancelamento({ inicio: "2026-09-14", hoje: "2026-10-01", recorrencia: "mensal", fidelidade_ate: "2027-03-14" });
  assert(fid.requerAcerto);
  assertEquals(fid.motivoAcerto, "fidelidade");
  const fidCumprida = planoDeCancelamento({ inicio: "2026-03-14", hoje: "2026-09-01", recorrencia: "mensal", fidelidade_ate: "2026-09-14" });
  assertFalse(fidCumprida.requerAcerto);
  const anual = planoDeCancelamento({ inicio: "2026-09-14", hoje: "2026-12-01", recorrencia: "anual", fidelidade_ate: null });
  assert(anual.requerAcerto);
  assertEquals(anual.motivoAcerto, "anual");
});

Deno.test("reembolso automático só onde o Asaas estorna sozinho", () => {
  assert(reembolsoAutomatico("CREDIT_CARD"));
  assert(reembolsoAutomatico("PIX"));
  assertFalse(reembolsoAutomatico("BOLETO"));
  assertFalse(reembolsoAutomatico(undefined));
});

Deno.test("arquivo de documento: tipo, tamanho e nome", () => {
  assertEquals(validarArquivo({ tipo: "cartao_cnpj", nome: "cartão CNPJ.pdf", mime: "application/pdf", bytes: 200_000 }).ok, true);
  assertEquals(validarArquivo({ tipo: "cartao_cnpj", nome: "x.exe", mime: "application/x-msdownload", bytes: 10 }).ok, false);
  assertEquals(validarArquivo({ tipo: "cartao_cnpj", nome: "grande.pdf", mime: "application/pdf", bytes: 9 * 1024 * 1024 }).ok, false);
  assertEquals(validarArquivo({ tipo: "qualquer", nome: "a.pdf", mime: "application/pdf", bytes: 10 }).ok, false);
  assertEquals(validarArquivo({ tipo: "documento_socio", nome: "rg.jpg", mime: "image/jpeg", bytes: 0 }).ok, false);
});

Deno.test("caminho do documento no storage não aceita nome malicioso", () => {
  const c = caminhoDocumento("un_lux", "a1b2", "../../etc/pass wd.pdf", "abc");
  assertEquals(c, "un_lux/a1b2/abc-etc-pass-wd.pdf");
});
