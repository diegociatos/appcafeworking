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

/** Baixa somente PDFs financeiros de hosts conhecidos, com limite de tamanho. */
export async function anexosFinanceiros(
  evento: Evento, dados: Record<string, unknown>, fetchFn: typeof fetch = fetch,
): Promise<AnexoEmail[]> {
  if (!EVENTOS.has(evento) || typeof dados.pdfUrl !== "string") return [];
  try {
    const url = new URL(dados.pdfUrl);
    if (!hostPermitido(url)) return [];
    const res = await fetchFn(url, { headers: { accept: "application/pdf" } });
    if (!res.ok || (res.url && !hostPermitido(new URL(res.url)))) return [];
    const tamanho = Number(res.headers.get("content-length") || 0);
    if (tamanho > MAX_BYTES) return [];
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_BYTES) return [];
    const assinaturaPdf = new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";
    if (!assinaturaPdf && !String(res.headers.get("content-type") || "").toLowerCase().includes("application/pdf")) return [];
    const numero = String(dados.numero || "").replace(/[^0-9A-Za-z_-]/g, "");
    const nome = evento === "nfse_emitida" ? `nota-fiscal${numero ? `-${numero}` : ""}.pdf` : "boleto.pdf";
    return [{ nome, contentType: "application/pdf", contentBase64: b64(bytes) }];
  } catch {
    return [];
  }
}
