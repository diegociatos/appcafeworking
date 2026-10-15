import type { AnexoEmail, Evento } from "./types.ts";

const MAX_BYTES = 10 * 1024 * 1024;
const EVENTOS = new Set<Evento>(["boleto_nova", "cobranca_nova", "nfse_emitida"]);

const hostPermitido = (url: URL) => url.protocol === "https:" && (
  url.hostname.endsWith(".supabase.co") ||
  url.hostname === "asaas.com" || url.hostname.endsWith(".asaas.com")
);

const b64 = (bytes: Uint8Array) => {
  let texto = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    texto += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(texto);
};

async function lerPdfLimitado(res: Response): Promise<Uint8Array | null> {
  if (!res.body) return null;
  const partes: Uint8Array[] = [];
  let tamanho = 0;
  const leitor = res.body.getReader();
  try {
    while (true) {
      const { done, value } = await leitor.read();
      if (done) break;
      tamanho += value.byteLength;
      if (tamanho > MAX_BYTES) { await leitor.cancel(); return null; }
      partes.push(value);
    }
  } finally { leitor.releaseLock(); }
  const bytes = new Uint8Array(tamanho);
  let offset = 0;
  for (const parte of partes) { bytes.set(parte, offset); offset += parte.byteLength; }
  return bytes;
}

/** Baixa um PDF de host conhecido, com limite de tamanho; null se não der. */
async function baixarPdf(url: string, nome: string, fetchFn: typeof fetch): Promise<AnexoEmail | null> {
  try {
    const u = new URL(url);
    if (!hostPermitido(u)) return null;
    const res = await fetchFn(u, { headers: { accept: "application/pdf" }, redirect: "error" });
    if (!res.ok || (res.url && !hostPermitido(new URL(res.url)))) return null;
    const tamanho = Number(res.headers.get("content-length") || 0);
    if (tamanho > MAX_BYTES) return null;
    const bytes = await lerPdfLimitado(res);
    if (!bytes?.length) return null;
    const assinaturaPdf = new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";
    if (!assinaturaPdf && !String(res.headers.get("content-type") || "").toLowerCase().includes("application/pdf")) return null;
    return { nome, contentType: "application/pdf", contentBase64: b64(bytes) };
  } catch {
    return null;
  }
}

/**
 * PDFs financeiros anexados ao e-mail. Boletos/cobranças (boleto_nova,
 * cobranca_nova) podem levar DOIS anexos quando a nota fiscal sai junto:
 * o boleto (dados.pdfUrl) e a nota (dados.notaPdfUrl). A nota (nfse_emitida)
 * leva só o PDF dela. Só PDFs de hosts conhecidos (Supabase/Asaas).
 */
export async function anexosFinanceiros(
  evento: Evento, dados: Record<string, unknown>, fetchFn: typeof fetch = fetch,
): Promise<AnexoEmail[]> {
  if (!EVENTOS.has(evento)) return [];
  const numero = String(dados.numero || "").replace(/[^0-9A-Za-z_-]/g, "");
  const nomeNota = `nota-fiscal${numero ? `-${numero}` : ""}.pdf`;
  const pedidos: Array<{ url: unknown; nome: string }> = [];
  if (evento === "nfse_emitida") {
    pedidos.push({ url: dados.pdfUrl, nome: nomeNota });
  } else {
    // boleto/cobrança: o boleto e, quando emitida junto, a nota fiscal.
    pedidos.push({ url: dados.pdfUrl, nome: "boleto.pdf" });
    const numNota = String(dados.notaNumero || "").replace(/[^0-9A-Za-z_-]/g, "");
    pedidos.push({ url: dados.notaPdfUrl, nome: `nota-fiscal${numNota ? `-${numNota}` : ""}.pdf` });
  }
  const anexos: AnexoEmail[] = [];
  for (const p of pedidos) {
    if (typeof p.url !== "string" || !p.url) continue;
    const a = await baixarPdf(p.url, p.nome, fetchFn);
    if (a) anexos.push(a);
  }
  return anexos;
}
