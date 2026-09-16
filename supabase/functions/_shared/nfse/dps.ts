// ============================================================================
// Campos da DPS (leiaute NFS-e Nacional v1.01) que dependem de tradução da
// config da unidade, e a regra de quando a emissão é real, simulada ou recusada.
// Inclui a montagem do XML da DPS (montarDpsXml). Funções puras, sem rede:
// testadas em dps_test.ts.
// ============================================================================

import { cMunDe } from "./municipios.ts";
import { FiscalError, type ConfigFiscal, type EmitirNfseInput, type FiscalCredentials } from "./types.ts";

// ----------------------------------------------------------------------------
// regEspTrib — Regime Especial de Tributação (TSRegEspTrib)
//   0 Nenhum · 1 Ato Cooperado (cooperativa) · 2 Estimativa ·
//   3 Microempresa Municipal · 4 Notário ou Registrador ·
//   5 Profissional Autônomo · 6 Sociedade de Profissionais
// Fonte: tabela do leiaute DPS v1.01 — a confirmar no manual/XSD oficial (os
// arquivos ficam fora do repositório). O 6 está confirmado por NFS-e autorizada
// no portal nacional (Sociedade de Profissionais, set/2026).
//
// "MEI" e "ME/EPP Simples Nacional" apareciam na tela antiga como regime
// especial, mas são a opção pelo Simples (opSimpNac, derivado do regime): não
// são regime especial, então viram 0.
// ----------------------------------------------------------------------------
export const REGIMES_ESPECIAIS: ReadonlyArray<{ codigo: string; rotulo: string }> = [
  { codigo: "0", rotulo: "Nenhum" },
  { codigo: "1", rotulo: "Ato Cooperado (cooperativa)" },
  { codigo: "2", rotulo: "Estimativa" },
  { codigo: "3", rotulo: "Microempresa Municipal" },
  { codigo: "4", rotulo: "Notário ou Registrador" },
  { codigo: "5", rotulo: "Profissional Autônomo" },
  { codigo: "6", rotulo: "Sociedade de Profissionais" },
];

const REGIME_POR_TEXTO: Record<string, string> = {
  "nenhum": "0",
  "ato cooperado": "1",
  "ato cooperado (cooperativa)": "1",
  "cooperativa": "1",
  "estimativa": "2",
  "microempresa municipal": "3",
  "notario ou registrador": "4",
  "profissional autonomo": "5",
  "sociedade de profissionais": "6",
  // valores antigos da tela (opção do Simples, não regime especial)
  "mei": "0",
  "me/epp simples nacional": "0",
};

function normalizar(s: unknown): string {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

/** Texto (ou código) do regime especial da config → código numérico da DPS. */
export function regEspTribDe(valor: unknown): string {
  const n = normalizar(valor);
  if (!n) return "0";
  if (/^[0-6]$/.test(n)) return n;
  const codigo = REGIME_POR_TEXTO[n];
  if (codigo === undefined) {
    throw new FiscalError(
      `Regime especial de tributação desconhecido na config fiscal: "${valor}". Escolha uma opção da lista.`,
      "nacional", 400,
    );
  }
  return codigo;
}

// ----------------------------------------------------------------------------
// tpRetISSQN — 1 Não retido · 2 Retido pelo tomador (3 = pelo intermediário,
// não usado aqui). A config guarda iss_retido boolean.
// ----------------------------------------------------------------------------
export function tpRetISSQNDe(issRetido: unknown): "1" | "2" {
  if (issRetido === true || issRetido === "true" || issRetido === "2" || issRetido === 2) return "2";
  return "1";
}

// ----------------------------------------------------------------------------
// dhEmi / dCompet no fuso de Brasília. O leiaute exige data/hora com offset
// (AAAA-MM-DDThh:mm:ss-03:00), sem "Z". Brasília não tem horário de verão
// desde 2019, então o offset é fixo.
// ----------------------------------------------------------------------------
const OFFSET_BRASILIA_MS = 3 * 60 * 60 * 1000;

export function dhEmiBrasilia(agora: Date = new Date()): string {
  return new Date(agora.getTime() - OFFSET_BRASILIA_MS).toISOString().slice(0, 19) + "-03:00";
}

/** Data de competência (AAAA-MM-DD) no dia de Brasília, não no de Greenwich. */
export function dataBrasilia(agora: Date = new Date()): string {
  return new Date(agora.getTime() - OFFSET_BRASILIA_MS).toISOString().slice(0, 10);
}

// ----------------------------------------------------------------------------
// Série e número da DPS
// ----------------------------------------------------------------------------
/** Série da DPS com 5 dígitos (config.serie_dps quando existir; padrão 00001). */
export function serieDps(config: Record<string, unknown>): string {
  const digitos = String(config?.serie_dps ?? "").replace(/\D/g, "");
  return (digitos || "1").padStart(5, "0").slice(-5);
}

/** nDPS no formato do leiaute: 1 a 15 dígitos, sem zero à esquerda. */
export function nDpsDe(numero: unknown): string {
  const s = String(numero ?? "").trim();
  if (!/^\d{1,15}$/.test(s) || /^0+$/.test(s)) {
    throw new FiscalError(`Número da DPS inválido: "${s}"`, "nacional", 500);
  }
  return s.replace(/^0+/, "");
}

// ----------------------------------------------------------------------------
// Emissão real, simulada ou recusada
// ----------------------------------------------------------------------------
export const MSG_SEM_CERTIFICADO = "Configure o certificado digital da unidade antes de emitir.";

export function temCertificado(creds: FiscalCredentials | null | undefined): boolean {
  return Boolean(creds?.cert_pfx_base64 || (creds?.cert_pem && creds?.key_pem));
}

/** Ambientes em que a nota pode ser simulada (sem valor fiscal). */
export function ambienteDeTeste(ambiente: unknown): boolean {
  return ambiente === "homologacao" || ambiente === "teste";
}

export type ModoEmissao =
  | { tipo: "real" }
  | { tipo: "simulada" }
  | { tipo: "recusada"; motivo: string };

/**
 * Com certificado: emite de verdade. Sem certificado: simula SÓ em ambiente de
 * teste; em produção (ou ambiente desconhecido) recusa.
 */
export function modoEmissao(ambiente: unknown, creds: FiscalCredentials | null | undefined): ModoEmissao {
  if (temCertificado(creds)) return { tipo: "real" };
  if (ambienteDeTeste(ambiente)) return { tipo: "simulada" };
  return { tipo: "recusada", motivo: MSG_SEM_CERTIFICADO };
}

// ----------------------------------------------------------------------------
// Montagem da DPS no layout NACIONAL v1.01 (schema oficial DPS_v1.01.xsd).
// Ordem dos elementos de infDPS é obrigatória (xs:sequence):
//   tpAmb, dhEmi, verAplic, serie, nDPS, dCompet, tpEmit, cLocEmi,
//   prest(CNPJ, IM, regTrib{opSimpNac, regEspTrib}),
//   toma(CNPJ|CPF, xNome),
//   serv(locPrest{cLocPrestacao}, cServ{cTribNac, xDescServ}),
//   valores(vServPrest{vServ}, trib{tribMun{tribISSQN, tpRetISSQN, pAliq}, totTrib{indTotTrib}})
//
// Códigos traduzidos da config (funções acima): regEspTrib numérico (0 a 6),
// tpRetISSQN 1 = não retido / 2 = retido, dhEmi com offset -03:00 e nDPS
// reservado no banco (proximo_numero_dps) pela Edge Function.
//
// O Id de infDPS é a CHAVE DE ACESSO da DPS (53 dígitos): "DPS" +
//   cLocEmi(7) + tpInsc(1) + inscFederal(14, CPF completado com 000) +
//   serie(5) + nDPS(15). Os parâmetros municipais (cTribNac, alíquota,
//   opSimpNac) vêm da config_fiscal da unidade (preenchida a partir do
//   GET /parametros_municipais do município conveniado).
// ----------------------------------------------------------------------------
export function montarDpsXml(config: ConfigFiscal, input: EmitirNfseInput, agora: Date = new Date()): string {
  const c = config as ConfigFiscal & Record<string, unknown>;
  const t = input.tomador;
  const cnpjPrest = (c.cnpj || "").replace(/\D/g, "");
  const cLocEmi = codMunicipio(c);
  const serie = serieDps(c);
  const nDPS = nDpsDe(input.rpsNumero);
  const idDps = chaveDps(cLocEmi, cnpjPrest, serie, nDPS);

  const docToma = (t.documento || "").replace(/\D/g, "");
  const tagToma = docToma.length > 11 ? "CNPJ" : "CPF";

  const opSimpNac = opSimpNacDe(c);
  const regEspTrib = regEspTribDe(c.regime_especial);
  const cTribNac = cTribNacDe(c);
  const aliq = (input.aliquotaISS ?? c.aliquota_iss ?? 0);
  const tpRet = tpRetISSQNDe(c.iss_retido);
  const descServ = (input.descricao || c.descricao_servico || "Serviço").slice(0, 2000);

  return `<?xml version="1.0" encoding="UTF-8"?>` +
`<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01">` +
`<infDPS Id="${idDps}">` +
`<tpAmb>${c.ambiente === "producao" ? 1 : 2}</tpAmb>` +
`<dhEmi>${dhEmiBrasilia(agora)}</dhEmi>` +
`<verAplic>CafeWorking-1.0</verAplic>` +
`<serie>${serie}</serie>` +
`<nDPS>${nDPS}</nDPS>` +
`<dCompet>${dataBrasilia(agora)}</dCompet>` +
`<tpEmit>1</tpEmit>` +
`<cLocEmi>${cLocEmi}</cLocEmi>` +
`<prest>` +
`<CNPJ>${cnpjPrest}</CNPJ>` +
(c.inscricao_municipal ? `<IM>${escXml(String(c.inscricao_municipal))}</IM>` : ``) +
`<regTrib><opSimpNac>${opSimpNac}</opSimpNac><regEspTrib>${regEspTrib}</regEspTrib></regTrib>` +
`</prest>` +
`<toma><${tagToma}>${docToma}</${tagToma}><xNome>${escXml(t.nome)}</xNome>${montarEndToma(t)}</toma>` +
`<serv>` +
`<locPrest><cLocPrestacao>${cLocEmi}</cLocPrestacao></locPrest>` +
`<cServ><cTribNac>${cTribNac}</cTribNac><xDescServ>${escXml(descServ)}</xDescServ></cServ>` +
`</serv>` +
`<valores>` +
`<vServPrest><vServ>${input.valor.toFixed(2)}</vServ></vServPrest>` +
`<trib>` +
`<tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>${tpRet}</tpRetISSQN><pAliq>${Number(aliq).toFixed(2)}</pAliq></tribMun>` +
`<totTrib><indTotTrib>0</indTotTrib></totTrib>` +
`</trib>` +
`</valores>` +
`</infDPS>` +
`</DPS>`;
}

/** Código IBGE do município emissor (cLocEmi). Vem da config; BH = 3106200. */
function codMunicipio(c: Record<string, unknown>): string {
  const direto = String((c.codigo_municipio as string) || "").replace(/\D/g, "");
  if (direto.length === 7) return direto;
  const mapa: Record<string, string> = {
    "belo horizonte": "3106200", "sao paulo": "3550308", "rio de janeiro": "3304557",
  };
  const norm = String(c.municipio || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  if (mapa[norm]) return mapa[norm];
  throw new FiscalError(
    `Código IBGE do município (cLocEmi) não definido na config fiscal (${c.municipio}). Informe "codigo_municipio".`,
    "nacional", 400,
  );
}

/** cTribNac (6 dígitos: item+subitem+desdobro). Usa o campo nacional ou deriva do codigo_servico. */
function cTribNacDe(c: Record<string, unknown>): string {
  const nac = String((c.codigo_tributacao_nacional as string) || "").replace(/\D/g, "");
  if (nac.length === 6) return nac;
  const item = String(c.codigo_servico || "").replace(/\D/g, ""); // "08.01" -> "0801"
  return (item + "000000").slice(0, 6).padStart(6, "0");
}

/** opSimpNac: 1 Não optante, 2 MEI, 3 ME/EPP — a partir do regime configurado. */
function opSimpNacDe(c: Record<string, unknown>): string {
  const reg = String(c.regime || "").toLowerCase();
  if (reg.includes("mei")) return "2";
  if (reg.includes("simples")) return "3";
  return "1";
}

/** Chave/Id da DPS (53 dígitos): DPS + cLocEmi(7)+tpInsc(1)+inscFed(14)+serie(5)+nDPS(15). */
function chaveDps(cLocEmi: string, cnpj: string, serie: string, nDPS: string): string {
  const tpInsc = cnpj.length > 11 ? "2" : "1";
  const inscFed = cnpj.padStart(14, "0").slice(-14);
  const nSerie = serie.padStart(5, "0").slice(-5);
  const nNum = nDPS.padStart(15, "0").slice(-15);
  return `DPS${cLocEmi}${tpInsc}${inscFed}${nSerie}${nNum}`;
}

// ----------------------------------------------------------------------------
// Helpers de XML
// ----------------------------------------------------------------------------
export function escXml(s: string): string {
  return (s ?? "").replace(/[<>&'"]/g, (ch) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[ch] as string));
}

// Endereço do tomador (<end>) no layout nacional. Só é incluído quando dá para
// resolver o código IBGE (cMun) da cidade/UF E há logradouro + CEP válido —
// senão é OMITIDO (a nota segue válida, sem endereço do tomador).
function montarEndToma(t: { cep?: string; logradouro?: string; numero?: string; bairro?: string; municipio?: string; uf?: string }): string {
  const cMun = cMunDe(t.municipio, t.uf);
  const cep = (t.cep ?? "").replace(/\D/g, "");
  if (!cMun || !t.logradouro || cep.length !== 8) return "";
  return `<end>` +
    `<endNac><cMun>${cMun}</cMun><CEP>${cep}</CEP></endNac>` +
    `<xLgr>${escXml(t.logradouro.slice(0, 255))}</xLgr>` +
    `<nro>${escXml((t.numero || "S/N").slice(0, 60))}</nro>` +
    `<xBairro>${escXml((t.bairro || "Centro").slice(0, 60))}</xBairro>` +
    `</end>`;
}
