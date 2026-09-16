// ============================================================================
// Abre um certificado .pfx/.p12 (base64 + senha) e devolve certificado e chave
// privada em PEM, com titular e validade. Usado no cadastro de banco (mTLS).
// ============================================================================

import forge from "https://esm.sh/node-forge@1.3.1";

export interface CertificadoAberto {
  certPem: string;
  keyPem: string;
  titular: string;
  validade: string | null;
}

export function abrirPfx(pfxBase64: string, senha: string): CertificadoAberto {
  const der = forge.util.decode64(String(pfxBase64).replace(/^data:.*;base64,/, ""));
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), senha ?? "");

  const shrouded = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const plainKey = p12.getBags({ bagType: forge.pki.oids.keyBag });
  const keyBag = shrouded[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0] ?? plainKey[forge.pki.oids.keyBag]?.[0];
  if (!keyBag?.key) throw new Error("chave privada não encontrada no arquivo");

  const cert = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0]?.cert;
  if (!cert) throw new Error("certificado não encontrado no arquivo");

  return {
    certPem: forge.pki.certificateToPem(cert),
    keyPem: forge.pki.privateKeyToPem(keyBag.key),
    titular: cert.subject.getField("CN")?.value ?? "",
    validade: cert.validity?.notAfter ? new Date(cert.validity.notAfter).toISOString().slice(0, 10) : null,
  };
}
