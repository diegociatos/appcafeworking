// ============================================================================
// NfseNacionalProvider — emissor padrão NFS-e Nacional (Sistema Nacional
// NFS-e). A EMISSÃO pelo contribuinte é feita no módulo SEFIN NACIONAL
// (sefin.nfse.gov.br/SefinNacional); o ADN (adn.nfse.gov.br) é o ambiente de
// DISTRIBUIÇÃO (DFe por NSU / DANFSe). Bases oficiais (gov.br/nfse):
//   - Produção restrita: https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional
//   - Produção:          https://sefin.nfse.gov.br/SefinNacional
//
// Requisitos do padrão nacional (confirmados na doc oficial):
//   1. mTLS com certificado ICP-Brasil A1/A3 (e-CNPJ) NA CONEXÃO — o endpoint
//      responde HTTP 496 (SSL cert required) sem o certificado de cliente.
//   2. XML assinado (XMLDSIG enveloped) — assinatura da DPS com o A1.
//   3. JSON nas rotas; o XML vai como GZip + Base64 no corpo.
//
// Fluxo:
//   POST /nfse                      body { dpsXmlGZipB64 }            → emite
//   GET  /nfse/{chaveAcesso}                                         → consulta
//   GET  /danfse/{chaveAcesso}                                       → PDF
//   POST /nfse/{chaveAcesso}/eventos body { pedidoRegistroEventoXmlGZipB64 } → cancela
//
// A assinatura XML (xmldsig) fica no ponto de extensão `assinarDps()`. Sem
// certificado no Vault, o provider responde em modo simulado (homologação).
// ============================================================================

import type { NfseProvider } from "./NfseProvider.ts";
import { assinarDpsXmlDsig } from "./xmlsign.ts";
import {
  type ConfigFiscal,
  type FiscalCredentials,
  type EmitirNfseInput,
  type EmitirNfseResult,
  type ConsultaNfseResult,
  type CancelarNfseResult,
  FiscalError,
} from "./types.ts";

const BASE = {
  homologacao: "https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional",
  producao: "https://sefin.nfse.gov.br/SefinNacional",
} as const;

export class NfseNacionalProvider implements NfseProvider {
  readonly emissor = "nacional" as const;

  constructor(
    private readonly config: ConfigFiscal,
    private readonly creds: FiscalCredentials,
  ) {}

  private get base() {
    return BASE[this.config.ambiente] ?? BASE.homologacao;
  }

  /** Tem certificado A1 disponível para assinar/conectar? Sem ele, modo simulado. */
  private get podeAssinar(): boolean {
    return Boolean(this.creds.cert_pfx_base64 || (this.creds.cert_pem && this.creds.key_pem));
  }

  /**
   * fetch com mTLS: o ADN/SEFIN exige certificado de cliente na conexão.
   * No Deno (Supabase Edge) isso é feito com Deno.createHttpClient({certChain,
   * privateKey}). Requer o certificado em PEM (cert_pem + key_pem). Quando só
   * houver o .pfx, é preciso convertê-lo para PEM antes (etapa de assinatura).
   */
  private async mtlsFetch(url: string, init?: RequestInit): Promise<Response> {
    const anyDeno = (globalThis as any).Deno;
    if (this.creds.cert_pem && this.creds.key_pem && anyDeno?.createHttpClient) {
      const client = anyDeno.createHttpClient({
        certChain: this.creds.cert_pem,
        privateKey: this.creds.key_pem,
      });
      return await fetch(url, { ...init, client } as RequestInit);
    }
    // Sem PEM disponível: tenta sem mTLS (provavelmente 496) — o erro é tratado.
    return await fetch(url, init);
  }

  async emitirNfse(input: EmitirNfseInput): Promise<EmitirNfseResult> {
    const aliquota = input.aliquotaISS ?? this.config.aliquota_iss ?? 0;
    const iss = Math.round(input.valor * aliquota) / 100;

    // Sem certificado configurado: devolve simulação coerente (homologação).
    if (!this.podeAssinar) {
      return {
        nfseId: `SIM-${input.rpsNumero}`,
        numero: input.rpsNumero,
        codigoVerificacao: "SIMULADO",
        iss,
        status: "autorizada",
        raw: { simulado: true, motivo: "certificado A1 não configurado no Vault" },
      };
    }

    const dpsXml = this.montarDps(input);
    const dpsAssinada = await this.assinarDps(dpsXml);
    const payload = await gzipBase64(dpsAssinada);

    const res = await this.mtlsFetch(`${this.base}/nfse`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ dpsXmlGZipB64: payload }),
    });

    const body = await safeJson(res);
    if (!res.ok) {
      throw new FiscalError(
        `NFS-e Nacional: falha na emissão (${res.status})`,
        this.emissor,
        res.status === 401 || res.status === 403 ? 502 : res.status,
        body,
      );
    }

    const chave = body.chaveAcesso ?? body.idNfse ?? input.rpsNumero;
    const xml = body.nfseXmlGZipB64 ? await gunzipBase64(body.nfseXmlGZipB64) : (body.nfseXml ?? undefined);
    return {
      nfseId: chave,
      numero: body.numeroNfse ?? body.numero,
      codigoVerificacao: body.codigoVerificacao,
      iss,
      status: body.situacao === "processando" ? "processando" : "autorizada",
      pdfUrl: body.chaveAcesso ? `${this.base}/danfse/${body.chaveAcesso}` : undefined,
      xml,
      raw: body,
    };
  }

  async consultarNfse(nfseId: string): Promise<ConsultaNfseResult> {
    if (nfseId.startsWith("SIM-")) {
      return { nfseId, status: "autorizada", raw: { simulado: true } };
    }
    const res = await this.mtlsFetch(`${this.base}/nfse/${nfseId}`, {
      headers: { Accept: "application/json" },
    });
    const body = await safeJson(res);
    if (!res.ok) {
      throw new FiscalError(`NFS-e Nacional: consulta falhou (${res.status})`, this.emissor, res.status, body);
    }
    const mapa: Record<string, ConsultaNfseResult["status"]> = {
      autorizada: "autorizada", processando: "processando", cancelada: "cancelada",
    };
    return {
      nfseId,
      numero: body.numeroNfse,
      status: mapa[body.situacao] ?? "autorizada",
      pdfUrl: `${this.base}/danfse/${nfseId}`,
      xml: body.nfseXml,
      raw: body,
    };
  }

  async cancelarNfse(nfseId: string, motivo = "Cancelamento solicitado pelo emissor"): Promise<CancelarNfseResult> {
    if (nfseId.startsWith("SIM-")) {
      return { nfseId, status: "cancelada", raw: { simulado: true } };
    }
    const pedido = await this.assinarDps(this.montarCancelamento(nfseId, motivo));
    const res = await this.mtlsFetch(`${this.base}/nfse/${nfseId}/eventos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pedidoRegistroEventoXmlGZipB64: await gzipBase64(pedido) }),
    });
    const body = await safeJson(res);
    if (!res.ok) {
      throw new FiscalError(`NFS-e Nacional: cancelamento falhou (${res.status})`, this.emissor, res.status, body);
    }
    return { nfseId, status: "cancelada", raw: body };
  }

  // --------------------------------------------------------------------------
  // Montagem da DPS no layout NACIONAL v1.01 (schema oficial DPS_v1.01.xsd).
  // Ordem dos elementos de infDPS é obrigatória (xs:sequence):
  //   tpAmb, dhEmi, verAplic, serie, nDPS, dCompet, tpEmit, cLocEmi,
  //   prest(CNPJ, IM, regTrib{opSimpNac, regEspTrib}),
  //   toma(CNPJ|CPF, xNome),
  //   serv(locPrest{cLocPrestacao}, cServ{cTribNac, xDescServ}),
  //   valores(vServPrest{vServ}, trib{tribMun{tribISSQN, tpRetISSQN, pAliq}, totTrib{indTotTrib}})
  //
  // O Id de infDPS é a CHAVE DE ACESSO da DPS (53 dígitos): "DPS" +
  //   cLocEmi(7) + tpInsc(1) + inscFederal(14, CPF completado com 000) +
  //   serie(5) + nDPS(15). Os parâmetros municipais (cTribNac, alíquota,
  //   opSimpNac) vêm da config_fiscal da unidade (preenchida a partir do
  //   GET /parametros_municipais do município conveniado).
  // --------------------------------------------------------------------------
  private montarDps(input: EmitirNfseInput): string {
    const c = this.config as ConfigFiscal & Record<string, unknown>;
    const t = input.tomador;
    const cnpjPrest = (c.cnpj || "").replace(/\D/g, "");
    const cLocEmi = this.codMunicipio();
    const serie = String((c.serie_dps as string) || "00001").padStart(5, "0").slice(-5);
    const nDPS = String(parseInt(input.rpsNumero, 10) || 1);
    const idDps = this.chaveDps(cLocEmi, cnpjPrest, serie, nDPS);

    const docToma = (t.documento || "").replace(/\D/g, "");
    const tagToma = docToma.length > 11 ? "CNPJ" : "CPF";

    const opSimpNac = this.opSimpNac();
    const regEspTrib = String((c.regime_especial as string) ?? "0") || "0";
    const cTribNac = this.cTribNac();
    const aliq = (input.aliquotaISS ?? c.aliquota_iss ?? 0);
    const tpRet = String((c.iss_retido as string) || "1") || "1"; // 1 = não retido
    const descServ = (input.descricao || c.descricao_servico || "Serviço").slice(0, 2000);

    return `<?xml version="1.0" encoding="UTF-8"?>` +
`<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">` +
`<infDPS Id="${idDps}">` +
`<tpAmb>${c.ambiente === "producao" ? 1 : 2}</tpAmb>` +
`<dhEmi>${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}</dhEmi>` +
`<verAplic>CafeWorking-1.0</verAplic>` +
`<serie>${serie}</serie>` +
`<nDPS>${nDPS}</nDPS>` +
`<dCompet>${new Date().toISOString().slice(0, 10)}</dCompet>` +
`<tpEmit>1</tpEmit>` +
`<cLocEmi>${cLocEmi}</cLocEmi>` +
`<prest>` +
`<CNPJ>${cnpjPrest}</CNPJ>` +
(c.inscricao_municipal ? `<IM>${esc(String(c.inscricao_municipal))}</IM>` : ``) +
`<regTrib><opSimpNac>${opSimpNac}</opSimpNac><regEspTrib>${regEspTrib}</regEspTrib></regTrib>` +
`</prest>` +
`<toma><${tagToma}>${docToma}</${tagToma}><xNome>${esc(t.nome)}</xNome></toma>` +
`<serv>` +
`<locPrest><cLocPrestacao>${cLocEmi}</cLocPrestacao></locPrest>` +
`<cServ><cTribNac>${cTribNac}</cTribNac><xDescServ>${esc(descServ)}</xDescServ></cServ>` +
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
  private codMunicipio(): string {
    const c = this.config as Record<string, unknown>;
    const direto = String((c.codigo_municipio as string) || "").replace(/\D/g, "");
    if (direto.length === 7) return direto;
    const mapa: Record<string, string> = {
      "belo horizonte": "3106200", "sao paulo": "3550308", "rio de janeiro": "3304557",
    };
    const norm = String(c.municipio || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
    if (mapa[norm]) return mapa[norm];
    throw new FiscalError(
      `Código IBGE do município (cLocEmi) não definido na config fiscal (${c.municipio}). Informe "codigo_municipio".`,
      this.emissor, 400,
    );
  }

  /** cTribNac (6 dígitos: item+subitem+desdobro). Usa o campo nacional ou deriva do codigo_servico. */
  private cTribNac(): string {
    const c = this.config as Record<string, unknown>;
    const nac = String((c.codigo_tributacao_nacional as string) || "").replace(/\D/g, "");
    if (nac.length === 6) return nac;
    const item = String(c.codigo_servico || "").replace(/\D/g, ""); // "08.01" -> "0801"
    return (item + "000000").slice(0, 6).padStart(6, "0");
  }

  /** opSimpNac: 1 Não optante, 2 MEI, 3 ME/EPP — a partir do regime configurado. */
  private opSimpNac(): string {
    const c = this.config as Record<string, unknown>;
    const reg = String(c.regime || "").toLowerCase();
    if (reg.includes("mei")) return "2";
    if (reg.includes("simples")) return "3";
    return "1";
  }

  /** Chave/Id da DPS (53 dígitos): DPS + cLocEmi(7)+tpInsc(1)+inscFed(14)+serie(5)+nDPS(15). */
  private chaveDps(cLocEmi: string, cnpj: string, serie: string, nDPS: string): string {
    const tpInsc = cnpj.length > 11 ? "2" : "1";
    const inscFed = cnpj.padStart(14, "0").slice(-14);
    const nSerie = serie.padStart(5, "0").slice(-5);
    const nNum = nDPS.padStart(15, "0").slice(-15);
    return `DPS${cLocEmi}${tpInsc}${inscFed}${nSerie}${nNum}`;
  }

  private montarCancelamento(nfseId: string, motivo: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<pedRegEvento xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">
  <infPedReg><chNFSe>${nfseId}</chNFSe><xMotivo>${esc(motivo)}</xMotivo></infPedReg>
</pedRegEvento>`;
  }

  /**
   * Assina o XML (xmldsig enveloped, RSA-SHA256) com o A1 (cert_pem/key_pem).
   * Sem PEM disponível, devolve o XML sem assinatura (modo simulado).
   */
  private async assinarDps(xml: string): Promise<string> {
    if (!(this.creds.cert_pem && this.creds.key_pem)) return xml;
    const refId = xml.match(/Id="([^"]+)"/)?.[1] ?? "";
    return assinarDpsXmlDsig(xml, this.creds.cert_pem, this.creds.key_pem, refId);
  }
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
function esc(s: string): string {
  return (s ?? "").replace(/[<>&'"]/g, (ch) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[ch] as string));
}

async function gzipBase64(text: string): Promise<string> {
  const enc = new TextEncoder().encode(text);
  const stream = new Response(enc).body!.pipeThrough(new CompressionStream("gzip"));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = "";
  for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function gunzipBase64(b64: string): Promise<string> {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const stream = new Response(bytes).body!.pipeThrough(new DecompressionStream("gzip"));
    return await new Response(stream).text();
  } catch {
    return "";
  }
}

async function safeJson(res: Response): Promise<any> {
  try { return await res.json(); } catch { return { _text: await res.text().catch(() => "") }; }
}
