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

/** Baixa somente PDFs financeiros de hosts conhecidos, com limite de tamanho. */
export async function anexosFinanceiros(
  evento: Evento, dados: Record<string, unknown>, fetchFn: typeof fetch = fetch,
): Promise<AnexoEmail[]> {
  if (!EVENTOS.has(evento) || typeof dados.pdfUrl !== "string") return [];
  try {
    const url = new URL(dados.pdfUrl);
    if (!hostPermitido(url)) return [];
    const res = await fetchFn(url, { headers: { accept: "application/pdf" }, redirect: "error" });
    if (!res.ok || (res.url && !hostPermitido(new URL(res.url)))) return [];
    const tamanho = Number(res.headers.get("content-length") || 0);
    if (tamanho > MAX_BYTES) return [];
    const bytes = await lerPdfLimitado(res);
    if (!bytes?.length) return [];
    const assinaturaPdf = new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";
    if (!assinaturaPdf && !String(res.headers.get("content-type") || "").toLowerCase().includes("application/pdf")) return [];
    const numero = String(dados.numero || "").replace(/[^0-9A-Za-z_-]/g, "");
    const nome = evento === "nfse_emitida" ? `nota-fiscal${numero ? `-${numero}` : ""}.pdf` : "boleto.pdf";
    return [{ nome, contentType: "application/pdf", contentBase64: b64(bytes) }];
  } catch {
    return [];
  }
}
