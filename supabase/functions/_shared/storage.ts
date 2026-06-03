// ============================================================================
// Upload do PDF do boleto para o Storage e retorno de uma URL assinada.
// Bucket privado "boletos" (criar uma vez): supabase storage create boletos.
// ============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUCKET = "boletos";

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:application\/pdf;base64,/, "");
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function uploadBoletoPdf(
  admin: SupabaseClient,
  path: string,         // ex.: "lux/inter/<boletoId>.pdf"
  pdfBase64: string,
): Promise<string | null> {
  const bytes = base64ToBytes(pdfBase64);
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) {
    console.error("storage.upload falhou:", error.message);
    return null;
  }
  // URL assinada por 7 dias (bucket privado).
  const { data } = await admin.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 7);
  return data?.signedUrl ?? null;
}
