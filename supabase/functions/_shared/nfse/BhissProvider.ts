// ============================================================================
// BhissProvider — emissor municipal de Belo Horizonte (BHISS Digital, padrão
// ABRASF 2.x via SOAP). Alternativa ao padrão nacional para unidades de BH
// que ainda emitam pelo sistema da prefeitura.
//
// Mantido como provider separado para preservar o adapter pattern: a unidade
// escolhe `emissor: "bhiss"` na config fiscal e nada mais muda no app.
//
// Observação: BH aderiu ao padrão NFS-e Nacional; na prática a maioria das
// unidades usará `NfseNacionalProvider`. Este provider existe para casos em
// que a emissão municipal direta ainda é exigida. Sem certificado A1
// configurado, responde em modo simulado.
// ============================================================================

import type { NfseProvider } from "./NfseProvider.ts";
import {
  type ConfigFiscal,
  type FiscalCredentials,
  type EmitirNfseInput,
  type EmitirNfseResult,
  type ConsultaNfseResult,
  type CancelarNfseResult,
  FiscalError,
} from "./types.ts";

const ENDPOINT = {
  homologacao: "https://bhisshomologa.pbh.gov.br/bhiss-ws/nfse",
  producao: "https://bhissdigital.pbh.gov.br/bhiss-ws/nfse",
} as const;

export class BhissProvider implements NfseProvider {
  readonly emissor = "bhiss" as const;

  constructor(
    private readonly config: ConfigFiscal,
    private readonly creds: FiscalCredentials,
  ) {}

  private get podeAssinar(): boolean {
    return Boolean(this.creds.cert_pfx_base64 || (this.creds.cert_pem && this.creds.key_pem));
  }

  async emitirNfse(input: EmitirNfseInput): Promise<EmitirNfseResult> {
    const aliquota = input.aliquotaISS ?? this.config.aliquota_iss ?? 0;
    const iss = Math.round(input.valor * aliquota) / 100;

    if (!this.podeAssinar) {
      return {
        nfseId: `SIM-BH-${input.rpsNumero}`,
        numero: input.rpsNumero,
        codigoVerificacao: "SIMULADO",
        iss,
        status: "autorizada",
        raw: { simulado: true, motivo: "certificado A1 não configurado no Vault" },
      };
    }

    // ABRASF 2.x: EnviarLoteRpsSincrono assinado (xmldsig) via SOAP.
    const envelope = await this.assinar(this.montarLoteRps(input, iss));
    const res = await fetch(ENDPOINT[this.config.ambiente] ?? ENDPOINT.homologacao, {
      method: "POST",
      headers: { "Content-Type": "application/soap+xml; charset=utf-8" },
      body: envelope,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new FiscalError(`BHISS: emissão falhou (${res.status})`, this.emissor, res.status, text.slice(0, 800));
    }
    const numero = matchTag(text, "Numero");
    const codigo = matchTag(text, "CodigoVerificacao");
    return {
      nfseId: numero ?? input.rpsNumero,
      numero: numero ?? undefined,
      codigoVerificacao: codigo ?? undefined,
      iss,
      status: numero ? "autorizada" : "processando",
      xml: text,
      raw: { ok: true },
    };
  }

  async consultarNfse(nfseId: string): Promise<ConsultaNfseResult> {
    if (nfseId.startsWith("SIM-")) return { nfseId, status: "autorizada", raw: { simulado: true } };
    // ConsultarNfsePorRps / ConsultarNfseServicoPrestado — omitido por brevidade.
    return { nfseId, status: "autorizada", raw: { stub: true } };
  }

  async cancelarNfse(nfseId: string, motivo = "Cancelamento"): Promise<CancelarNfseResult> {
    if (nfseId.startsWith("SIM-")) return { nfseId, status: "cancelada", raw: { simulado: true } };
    const envelope = await this.assinar(this.montarCancelamento(nfseId));
    const res = await fetch(ENDPOINT[this.config.ambiente] ?? ENDPOINT.homologacao, {
      method: "POST",
      headers: { "Content-Type": "application/soap+xml; charset=utf-8" },
      body: envelope,
    });
    if (!res.ok) {
      throw new FiscalError(`BHISS: cancelamento falhou (${res.status})`, this.emissor, res.status);
    }
    return { nfseId, status: "cancelada", raw: { motivo } };
  }

  // --- montagem ABRASF (subconjunto) ---------------------------------------
  private montarLoteRps(input: EmitirNfseInput, iss: number): string {
    const c = this.config;
    const t = input.tomador;
    const docTag = (t.documento || "").replace(/\D/g, "").length > 11 ? "Cnpj" : "Cpf";
    return `<Rps>
  <InfDeclaracaoPrestacaoServico>
    <Rps><IdentificacaoRps><Numero>${input.rpsNumero}</Numero><Serie>1</Serie><Tipo>1</Tipo></IdentificacaoRps></Rps>
    <Servico>
      <Valores><ValorServicos>${input.valor.toFixed(2)}</ValorServicos><Aliquota>${(input.aliquotaISS ?? c.aliquota_iss).toFixed(2)}</Aliquota><ValorIss>${iss.toFixed(2)}</ValorIss></Valores>
      <ItemListaServico>${esc(input.codigoServico ?? c.codigo_servico)}</ItemListaServico>
      <Discriminacao>${esc(input.descricao || c.descricao_servico)}</Discriminacao>
      <CodigoMunicipio>3106200</CodigoMunicipio>
    </Servico>
    <Prestador><CpfCnpj><Cnpj>${(c.cnpj || "").replace(/\D/g, "")}</Cnpj></CpfCnpj><InscricaoMunicipal>${c.inscricao_municipal ?? ""}</InscricaoMunicipal></Prestador>
    <Tomador><IdentificacaoTomador><CpfCnpj><${docTag}>${(t.documento || "").replace(/\D/g, "")}</${docTag}></CpfCnpj></IdentificacaoTomador><RazaoSocial>${esc(t.nome)}</RazaoSocial></Tomador>
  </InfDeclaracaoPrestacaoServico>
</Rps>`;
  }

  private montarCancelamento(nfseId: string): string {
    return `<Pedido><InfPedidoCancelamento><IdentificacaoNfse><Numero>${nfseId}</Numero></IdentificacaoNfse></InfPedidoCancelamento></Pedido>`;
  }

  /** Ponto de extensão: assinatura xmldsig + envelope SOAP com o A1. */
  private async assinar(xml: string): Promise<string> {
    // TODO: assinar (xmldsig) e envelopar em SOAP 1.2 com o certificado A1.
    return xml;
  }
}

function esc(s: string): string {
  return (s ?? "").replace(/[<>&'"]/g, (ch) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[ch] as string));
}

function matchTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<[\\w:]*${tag}>([^<]+)</`));
  return m ? m[1] : null;
}
