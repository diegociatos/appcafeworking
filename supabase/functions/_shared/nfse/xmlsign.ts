// ============================================================================
// Assinatura XMLDSIG enveloped (RSA-SHA256) para a DPS da NFS-e Nacional.
//
// Usa node-forge (via esm.sh) para o digest SHA-256, a assinatura RSA com a
// chave privada do A1 e o X509Certificate do KeyInfo. A referência aponta para
// o elemento `infDPS` pelo atributo Id.
//
// ⚠️ CANONICALIZAÇÃO (C14N): o XML que geramos é controlado e simples (sem
// prefixos de namespace além do default, sem comentários/atributos fora de
// ordem), então a serialização direta se aproxima da C14N. Para casos gerais
// recomenda-se uma C14N dedicada. VALIDAR SEMPRE em PRODUÇÃO RESTRITA antes do
// go-live — é exatamente para isso que o ambiente de homologação existe.
// ============================================================================

import forge from "https://esm.sh/node-forge@1.3.1";

const NS_DSIG = "http://www.w3.org/2000/09/xmldsig#";
const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";
const SIG_SHA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
const DIG_SHA256 = "http://www.w3.org/2001/04/xmlenc#sha256";

function sha256B64(text: string): string {
  const md = forge.md.sha256.create();
  md.update(text, "utf8");
  return forge.util.encode64(md.digest().bytes());
}

function certDerB64(certPem: string): string {
  const cert = forge.pki.certificateFromPem(certPem);
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  return forge.util.encode64(der);
}

/** Extrai o conteúdo do elemento <tag ...>...</tag> (com seus atributos). */
function extrairElemento(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[\\s>][\\s\\S]*?</${tag}>`));
  if (!m) throw new Error(`elemento <${tag}> não encontrado para assinar`);
  return m[0];
}

/**
 * Assina o XML da DPS (enveloped). `refId` é o valor do atributo Id em
 * `infDPS`. Retorna o XML com o bloco <Signature> inserido antes de </DPS>.
 */
export function assinarDpsXmlDsig(xml: string, certPem: string, keyPem: string, refId: string): string {
  const infDps = extrairElemento(xml, "infDPS");
  const digestValue = sha256B64(infDps);

  const signedInfo =
    `<SignedInfo xmlns="${NS_DSIG}">` +
    `<CanonicalizationMethod Algorithm="${C14N}"/>` +
    `<SignatureMethod Algorithm="${SIG_SHA256}"/>` +
    `<Reference URI="#${refId}">` +
    `<Transforms><Transform Algorithm="${ENVELOPED}"/><Transform Algorithm="${C14N}"/></Transforms>` +
    `<DigestMethod Algorithm="${DIG_SHA256}"/>` +
    `<DigestValue>${digestValue}</DigestValue>` +
    `</Reference></SignedInfo>`;

  const key = forge.pki.privateKeyFromPem(keyPem);
  const md = forge.md.sha256.create();
  md.update(signedInfo, "utf8");
  const signatureValue = forge.util.encode64(key.sign(md));

  const signature =
    `<Signature xmlns="${NS_DSIG}">` +
    signedInfo +
    `<SignatureValue>${signatureValue}</SignatureValue>` +
    `<KeyInfo><X509Data><X509Certificate>${certDerB64(certPem)}</X509Certificate></X509Data></KeyInfo>` +
    `</Signature>`;

  return xml.replace("</DPS>", `${signature}</DPS>`);
}
