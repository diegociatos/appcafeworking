// ============================================================================
// Edge Function: fila-impressao  (agente local da recepção)
//
// GET /functions/v1/fila-impressao
//   Header: x-device-token: <token da impressora>
//   → { impressora_id, jobs: [{ id, documento_nome, paginas, copias, duplex,
//                               folhas, arquivo_url }] }
//
// Autentica por TOKEN DE DISPOSITIVO (sha256 casa com impressoras.device_token_hash),
// não por JWT. Por isso vai na lista verify_jwt=false do config.toml. Devolve os
// trabalhos 'fila' da impressora com URL assinada (10 min) e marca 'enviado'.
// (Fase 1: sem agente ainda; esta função é a interface que o agente usará.)
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { BUCKET_IMPRESSOES } from "../_shared/impressao.ts";

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    if (req.method !== "GET") return json({ error: "Método não permitido" }, 405, req);
    const token = req.headers.get("x-device-token") || "";
    if (!token) return json({ error: "dispositivo não identificado" }, 401, req);

    const admin = adminClient();
    const { data: imp } = await admin.from("impressoras")
      .select("id, unidade_id").eq("device_token_hash", await sha256Hex(token)).eq("ativo", true).maybeSingle();
    if (!imp) return json({ error: "dispositivo não reconhecido" }, 401, req);

    const { data: jobs, error } = await admin.from("impressao_jobs")
      .select("id, documento_nome, storage_path, paginas, copias, duplex, folhas")
      .eq("impressora_id", imp.id).eq("status", "fila")
      .order("criado_em", { ascending: true }).limit(10);
    if (error) throw new Error(error.message);

    const saida = [];
    const idsEnviados: string[] = [];
    for (const j of jobs || []) {
      let arquivo_url: string | null = null;
      if (j.storage_path) {
        const { data } = await admin.storage.from(BUCKET_IMPRESSOES).createSignedUrl(j.storage_path, 600);
        arquivo_url = data?.signedUrl ?? null;
      }
      saida.push({
        id: j.id, documento_nome: j.documento_nome, paginas: j.paginas, copias: j.copias,
        duplex: j.duplex, folhas: j.folhas, arquivo_url,
      });
      idsEnviados.push(j.id);
    }
    if (idsEnviados.length) {
      await admin.from("impressao_jobs").update({ status: "enviado" }).in("id", idsEnviados);
    }
    return json({ impressora_id: imp.id, jobs: saida }, 200, req);
  } catch (e) {
    console.error("[fila-impressao]", (e as Error)?.message ?? e);
    return json({ error: "Erro ao ler a fila." }, 500, req);
  }
});
