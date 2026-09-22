import forge from "https://esm.sh/node-forge@1.3.1";
import type { FiscalCredentials } from "./types.ts";

type CertForge = {
  subject: { hash?: string };
  issuer: { hash?: string };
  publicKey?: { n?: { compareTo(v: unknown): number }; e?: { compareTo(v: unknown): number } };
};

const mesmaChave = (cert: CertForge, key: CertForge["publicKey"]) => {
  const pub = cert.publicKey;
  return Boolean(pub?.n && pub?.e && key?.n && key?.e &&
    pub.n.compareTo(key.n) === 0 && pub.e.compareTo(key.e) === 0);
};

/** Folha primeiro e, em seguida, cada emissor intermediário disponível. */
export function ordenarCadeia<T extends CertForge>(certs: T[], indiceFolha: number): T[] {
  if (!certs.length) return [];
  const folha = certs[indiceFolha] ?? certs[0];
  const restantes = certs.filter((c) => c !== folha);
  const ordem = [folha];
  while (restantes.length) {
    const atual = ordem[ordem.length - 1];
    const proximo = restantes.findIndex((c) => Boolean(atual.issuer.hash) && c.subject.hash === atual.issuer.hash);
    ordem.push(...restantes.splice(proximo >= 0 ? proximo : 0, 1));
  }
  return ordem;
}

/**
 * Reconstitui chave e cadeia diretamente do PFX já armazenado no Vault.
 * Credenciais antigas continham apenas a folha em cert_pem; usar o PFX evita
 * exigir que o usuário envie novamente o certificado para corrigir a cadeia.
 */
export function credenciaisPemComCadeia(creds: FiscalCredentials): { cert?: string; key?: string } {
  if (!(creds.cert_pfx_base64 && creds.cert_senha)) return { cert: creds.cert_pem, key: creds.key_pem };
  try {
    const der = forge.util.decode64(creds.cert_pfx_base64.replace(/^data:.*;base64,/, ""));
    const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), creds.cert_senha);
    const shrouded = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const plain = p12.getBags({ bagType: forge.pki.oids.keyBag });
    const keyBag = shrouded[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0] ?? plain[forge.pki.oids.keyBag]?.[0];
    if (!keyBag?.key) throw new Error("chave privada ausente");
    const bags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
    const certs = bags.map((b: { cert?: CertForge }) => b.cert).filter(Boolean) as CertForge[];
    if (!certs.length) throw new Error("certificado ausente");
    const indiceFolha = Math.max(0, certs.findIndex((c) => mesmaChave(c, keyBag.key)));
    return {
      cert: ordenarCadeia(certs, indiceFolha).map((c) => forge.pki.certificateToPem(c)).join(""),
      key: forge.pki.privateKeyToPem(keyBag.key),
    };
  } catch {
    return { cert: creds.cert_pem, key: creds.key_pem };
  }
}
