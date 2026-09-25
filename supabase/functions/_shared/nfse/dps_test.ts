import { assert, assertEquals, assertFalse, assertMatch, assertStringIncludes, assertThrows } from "jsr:@std/assert@1";
import {
  ambienteDeTeste, dataBrasilia, dhEmiBrasilia, modoEmissao, montarDpsXml, MSG_SEM_CERTIFICADO, nDpsDe, regEspTribDe,
  REGIMES_ESPECIAIS, serieDps, tpRetISSQNDe,
} from "./dps.ts";
import { FiscalError, type ConfigFiscal } from "./types.ts";

Deno.test("regEspTrib: texto da tela vira o código numérico do leiaute", () => {
  assertEquals(regEspTribDe("nenhum"), "0");
  assertEquals(regEspTribDe(undefined), "0");
  assertEquals(regEspTribDe(""), "0");
  assertEquals(regEspTribDe("Cooperativa"), "1");
  assertEquals(regEspTribDe("Ato Cooperado"), "1");
  assertEquals(regEspTribDe("Estimativa"), "2");
  assertEquals(regEspTribDe("Microempresa Municipal"), "3");
  assertEquals(regEspTribDe("Notário ou Registrador"), "4");
  assertEquals(regEspTribDe("notario  ou registrador"), "4");
  assertEquals(regEspTribDe("Profissional Autônomo"), "5");
  assertEquals(regEspTribDe("Sociedade de Profissionais"), "6");
  assertEquals(regEspTribDe("6"), "6");
});

Deno.test("regEspTrib: MEI e ME/EPP (opção do Simples) não são regime especial", () => {
  assertEquals(regEspTribDe("MEI"), "0");
  assertEquals(regEspTribDe("ME/EPP Simples Nacional"), "0");
});

Deno.test("regEspTrib: valor desconhecido é recusado, não vira 0 em silêncio", () => {
  assertThrows(() => regEspTribDe("Lucro Real"), FiscalError);
  assertThrows(() => regEspTribDe("7"), FiscalError);
});

Deno.test("regEspTrib: toda opção da lista da tela tem código", () => {
  for (const r of REGIMES_ESPECIAIS) assertEquals(regEspTribDe(r.rotulo), r.codigo);
  assertEquals(REGIMES_ESPECIAIS.map((r) => r.codigo), ["0", "1", "2", "3", "4", "5", "6"]);
});

Deno.test("tpRetISSQN: 1 = não retido, 2 = retido (nunca true/false)", () => {
  assertEquals(tpRetISSQNDe(false), "1");
  assertEquals(tpRetISSQNDe(null), "1");
  assertEquals(tpRetISSQNDe(undefined), "1");
  assertEquals(tpRetISSQNDe("false"), "1");
  assertEquals(tpRetISSQNDe(true), "2");
  assertEquals(tpRetISSQNDe("true"), "2");
});

Deno.test("dhEmi: horário de Brasília com offset -03:00 e sem Z", () => {
  const agora = new Date("2026-09-16T02:30:15.123Z"); // 23:30:15 do dia 15 em Brasília
  assertEquals(dhEmiBrasilia(agora), "2026-09-15T23:30:15-03:00");
  assertEquals(dataBrasilia(agora), "2026-09-15");
  assertMatch(dhEmiBrasilia(), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00$/);
  assertFalse(dhEmiBrasilia().includes("Z"));
});

Deno.test("série da DPS com 5 dígitos e nDPS sem zero à esquerda", () => {
  assertEquals(serieDps({}), "00001");
  assertEquals(serieDps({ serie_dps: "2" }), "00002");
  assertEquals(serieDps({ serie_dps: "00900" }), "00900");
  assertEquals(nDpsDe(1), "1");
  assertEquals(nDpsDe("000123"), "123");
  assertEquals(nDpsDe("123456789012345"), "123456789012345");
  assertThrows(() => nDpsDe("0"), FiscalError);
  assertThrows(() => nDpsDe(""), FiscalError);
  assertThrows(() => nDpsDe("1234567890123456"), FiscalError);
  assertThrows(() => nDpsDe("12a"), FiscalError);
});

Deno.test("emissão: com certificado é real; sem certificado simula só em teste e recusa em produção", () => {
  const pem = { cert_pem: "x", key_pem: "y" };
  assertEquals(modoEmissao("producao", pem), { tipo: "real" });
  assertEquals(modoEmissao("homologacao", { cert_pfx_base64: "z" }), { tipo: "real" });
  assertEquals(modoEmissao("homologacao", {}), { tipo: "simulada" });
  assertEquals(modoEmissao("teste", null), { tipo: "simulada" });
  assertEquals(modoEmissao("producao", {}), { tipo: "recusada", motivo: MSG_SEM_CERTIFICADO });
  assertEquals(modoEmissao(undefined, {}), { tipo: "recusada", motivo: MSG_SEM_CERTIFICADO });
  assertEquals(modoEmissao("producao", { cert_pem: "só o cert" }).tipo, "recusada");
  assert(ambienteDeTeste("homologacao"));
  assertFalse(ambienteDeTeste("producao"));
});

const config = (extra: Record<string, unknown> = {}) => ({
  id: "cfg", unidade_id: "un_teste", municipio: "Belo Horizonte", uf: "MG", inscricao_municipal: "123",
  regime: "Simples Nacional", codigo_servico: "08.01", descricao_servico: "Locação de espaço", aliquota_iss: 2,
  emissor: "nacional", ambiente: "homologacao", cnpj: "12.345.678/0001-90", certificado_ref: "", emissao_ativa: true,
  codigo_municipio: "3106200", regime_especial: "Sociedade de Profissionais", iss_retido: false,
  ...extra,
}) as unknown as ConfigFiscal;

const entrada = {
  rpsNumero: "42",
  tomador: { nome: "Cliente & Cia", documento: "98.765.432/0001-10" },
  valor: 150,
  descricao: "Mensalidade",
};

const tag = (xml: string, nome: string) => xml.match(new RegExp(`<${nome}>([^<]*)</${nome}>`))?.[1];

Deno.test("montagem da DPS: regEspTrib, tpRetISSQN, dhEmi, série e nDPS no XML", () => {
  const agora = new Date("2026-09-16T12:00:00Z");
  const xml = montarDpsXml(config(), entrada, agora);
  assertEquals(tag(xml, "regEspTrib"), "6");
  assertEquals(tag(xml, "opSimpNac"), "3");
  assertEquals(tag(xml, "tpRetISSQN"), "1");
  assertEquals(tag(xml, "dhEmi"), "2026-09-16T09:00:00-03:00");
  assertEquals(tag(xml, "dCompet"), "2026-09-16");
  assertEquals(tag(xml, "serie"), "00001");
  assertEquals(tag(xml, "nDPS"), "42");
  assertEquals(tag(xml, "tpAmb"), "2");
  assertMatch(xml, /<infDPS Id="DPS3106200212345678000190000010{13}42">/);
  assertMatch(xml, /<xNome>Cliente &amp; Cia<\/xNome>/);

  const retido = montarDpsXml(config({ iss_retido: true, regime_especial: "nenhum", ambiente: "producao" }), { ...entrada, rpsNumero: "7" }, agora);
  assertEquals(tag(retido, "tpRetISSQN"), "2");
  assertEquals(tag(retido, "regEspTrib"), "0");
  assertEquals(tag(retido, "tpAmb"), "1");
  assertFalse(retido.includes(">true<") || retido.includes(">false<"));
});

Deno.test("montagem da DPS: número zerado ou regime desconhecido não geram XML", () => {
  assertThrows(() => montarDpsXml(config(), { ...entrada, rpsNumero: "0" }), FiscalError);
  assertThrows(() => montarDpsXml(config({ regime_especial: "Lucro Real" }), entrada), FiscalError);
});

// --- Regras do Simples Nacional -------------------------------------------
// Copiadas do emissor que já emite para empresas em Belo Horizonte. Errar aqui
// devolve 400 do SEFIN sem dizer o motivo, então cada uma tem teste próprio.
const CFG_LUX = {
  municipio: "Belo Horizonte", codigo_municipio: "3106200", uf: "MG",
  cnpj: "20351761000103", inscricao_municipal: "123456",
  regime: "Simples Nacional", aliquota_iss: 2, aliquota_simples: 6,
  codigo_servico: " 170201", codigo_tributacao_nacional: "17.02.01/001",
  nbs: "1.1806.40.00", regime_especial: "nenhum", iss_retido: false,
  ambiente: "producao", descricao_servico: "Serviços de datilografia",
};
const TOMADOR = { nome: "Ciatos Soluções", documento: "14777996000156" };
const dpsLux = (extra = {}) =>
  montarDpsXml({ ...CFG_LUX, ...extra } as never, { valor: 1, descricao: "Teste", rpsNumero: "1", tomador: TOMADOR } as never);

Deno.test("Simples sem retenção não manda pAliq: o Portal usa a parametrização do município", () => {
  const xml = dpsLux();
  assertEquals(/<pAliq>/.test(xml), false);
  assertStringIncludes(xml, "<tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN>");
});

Deno.test("Simples declara a alíquota efetiva em pTotTribSN, não indTotTrib", () => {
  const xml = dpsLux();
  assertStringIncludes(xml, "<totTrib><pTotTribSN>6.00</pTotTribSN></totTrib>");
  assertEquals(/indTotTrib/.test(xml), false);
});

Deno.test("fora do Simples volta a indTotTrib e informa a alíquota", () => {
  const xml = dpsLux({ regime: "Lucro Presumido" });
  assertStringIncludes(xml, "<pAliq>2.00</pAliq>");
  assertStringIncludes(xml, "<totTrib><indTotTrib>0</indTotTrib></totTrib>");
});

Deno.test("com ISS retido a alíquota volta a ser informada, mesmo no Simples", () => {
  const xml = dpsLux({ iss_retido: true });
  assertStringIncludes(xml, "<pAliq>2.00</pAliq>");
  assertStringIncludes(xml, "<tpRetISSQN>2</tpRetISSQN>");
});

Deno.test("cTribMun sai do desdobro depois da barra e cNBS vai só com dígitos", () => {
  const xml = dpsLux();
  assertStringIncludes(xml, "<cTribNac>170201</cTribNac><cTribMun>001</cTribMun>");
  assertStringIncludes(xml, "<cNBS>118064000</cNBS>");
});

Deno.test("sem barra no código nacional, cTribMun fica de fora", () => {
  const xml = dpsLux({ codigo_tributacao_nacional: "170201" });
  assertEquals(/cTribMun/.test(xml), false);
});
