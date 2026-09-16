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
// certificado no Vault: nota "simulada" (sem valor fiscal) só em homologação;
// em produção a emissão é recusada (ver dps.ts → modoEmissao).
// ============================================================================

import type { NfseProvider } from "./NfseProvider.ts";
import { assinarDpsXmlDsig } from "./xmlsign.ts";
import { escXml, modoEmissao, montarDpsXml } from "./dps.ts";
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

  /**
   * fetch com mTLS: o ADN/SEFIN exige certificado de cliente na conexão.
   * No Deno (Supabase Edge) isso é feito com Deno.createHttpClient. O runtime
   * ATUAL espera `{ cert, key }` — os nomes antigos `{ certChain, privateKey }`
   * são IGNORADOS SILENCIOSAMENTE (client sem certificado → mTLS falha). Por
   * isso passamos os DOIS pares de nomes por compatibilidade (mesma pegadinha
   * do Inter no ContaOne). Requer o certificado em PEM (cert_pem + key_pem).
   */
  private async mtlsFetch(url: string, init?: RequestInit): Promise<Response> {
    const anyDeno = (globalThis as any).Deno;
    if (this.creds.cert_pem && this.creds.key_pem && anyDeno?.createHttpClient) {
      const client = anyDeno.createHttpClient({
        cert: this.creds.cert_pem,
        key: this.creds.key_pem,
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

    // Sem certificado: simula só em homologação; em produção recusa.
    const modo = modoEmissao(this.config.ambiente, this.creds);
    if (modo.tipo === "recusada") throw new FiscalError(modo.motivo, this.emissor, 412);
    if (modo.tipo === "simulada") {
      return {
        nfseId: `SIM-${input.rpsNumero}`,
        numero: input.rpsNumero,
        codigoVerificacao: "SIMULADO",
        iss,
        status: "simulada",
        raw: { simulado: true, motivo: "certificado A1 não configurado no Vault (homologação)" },
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
      return { nfseId, status: "simulada", raw: { simulado: true } };
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

  /** DPS no leiaute nacional v1.01 (montagem pura em dps.ts → montarDpsXml). */
  montarDps(input: EmitirNfseInput, agora: Date = new Date()): string {
    return montarDpsXml(this.config, input, agora);
  }

  private montarCancelamento(nfseId: string, motivo: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<pedRegEvento xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01">
  <infPedReg><chNFSe>${nfseId}</chNFSe><xMotivo>${escXml(motivo)}</xMotivo></infPedReg>
</pedRegEvento>`;
  }

  /**
   * Assina o XML (xmldsig enveloped, RSA-SHA256) com o A1 (cert_pem/key_pem).
   * Sem PEM disponível, devolve o XML sem assinatura (o SEFIN recusa).
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
