// ============================================================================
// Edge Function: impressao-concluida  (agente local OU recepção)
//
// POST /functions/v1/impressao-concluida
//   { job_id, status: "impresso"|"falha", folhas_impressas?, erro? }
//   Autentica por x-device-token (agente) OU por JWT de staff da unidade do
//   trabalho (recepção/admin — usado também para TESTAR na Fase 1 sem agente).
//   → { ok, folhas? , ja? }
//
// Em 'impresso': grava o consumo (consumos_impressao, 1 por job via UNIQUE) e o
// lançamento no creditos_ledger (tipo 'impressao', folhas negativas), APAGA o
// arquivo do bucket (LGPD) e audita. Idempotente: reprocessar um job já impresso
// não duplica. Nunca bloqueia nada. Vai na lista verify_jwt=false do config.toml.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { ehEquipe, usuarioDoReq } from "../_shared/assinaturas.ts";
import { registrarAuditoria, ipDaReq } from "../_shared/audit.ts";
import { BUCKET_IMPRESSOES, competenciaBRT } from "../_shared/impressao.ts";

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    if (req.method !== "POST") return json({ error: "Método não permitido" }, 405, req);
    const body = await req.json().catch(() => ({}));
    const jobId = String(body?.job_id || "");
    const status = body?.status === "falha" ? "falha" : "impresso";
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) return json({ error: "Pedido inválido." }, 400, req);

    const admin = adminClient();
    const { data: job } = await admin.from("impressao_jobs")
      .select("id, unidade_id, impressora_id, cliente_id, cliente_email, folhas, storage_path, status")
      .eq("id", jobId).maybeSingle();
    if (!job) return json({ error: "Trabalho não encontrado." }, 404, req);

    // ---- autenticação: agente (device token) ou staff da unidade -----------
    let ator: { tipo: "agente" | "staff"; id: string | null; email: string | null } | null = null;
    const token = req.headers.get("x-device-token") || "";
    if (token) {
      const { data: imp } = await admin.from("impressoras")
        .select("id, unidade_id").eq("device_token_hash", await sha256Hex(token)).eq("ativo", true).maybeSingle();
      if (imp && imp.unidade_id === job.unidade_id) ator = { tipo: "agente", id: imp.id, email: null };
    }
    if (!ator) {
      const usuario = await usuarioDoReq(req);
      if (usuario && await ehEquipe(req, job.unidade_id)) ator = { tipo: "staff", id: usuario.id, email: usuario.email };
    }
    if (!ator) return json({ error: "Não autorizado." }, 401, req);

    // Idempotência: já concluído não reprocessa.
    if (job.status === "impresso") return json({ ok: true, ja: true }, 200, req);

    if (status === "falha") {
      await admin.from("impressao_jobs").update({ status: "falha", erro: String(body?.erro || "").slice(0, 500) || null }).eq("id", jobId);
      await registrarAuditoria(admin, {
        unidade_id: job.unidade_id, ator_id: ator.id, ator_email: ator.email,
        acao: "impressao.falha", entidade: "impressao_job", entidade_id: jobId,
        detalhe: { por: ator.tipo, erro: body?.erro ?? null }, ip: ipDaReq(req),
      });
      return json({ ok: true }, 200, req);
    }

    // ---- impresso: contabiliza ---------------------------------------------
    const nF = Math.floor(Number(body?.folhas_impressas));
    const folhas = Number.isFinite(nF) && nF > 0 ? nF : Number(job.folhas || 0);
    const competencia = competenciaBRT();

    await admin.from("impressao_jobs").update({
      status: "impresso", folhas_impressas: folhas, impresso_em: new Date().toISOString(), storage_path: null,
    }).eq("id", jobId);

    // Consumo do mês (1 por job) e lançamento no ledger (ambos idempotentes).
    await admin.from("consumos_impressao").upsert({
      unidade_id: job.unidade_id, cliente_id: job.cliente_id, cliente_email: job.cliente_email,
      competencia, job_id: jobId, folhas,
    }, { onConflict: "job_id", ignoreDuplicates: true });

    await admin.from("creditos_ledger").upsert({
      id: `imp:${jobId}`, unidade_id: job.unidade_id, cliente_id: job.cliente_id, cliente_email: job.cliente_email,
      tipo: "impressao", quantidade: -folhas, origem: "consumo", motivo: "Impressão", referencia_id: jobId,
    }, { onConflict: "id", ignoreDuplicates: true });

    // LGPD: apaga o arquivo depois de impresso.
    if (job.storage_path) await admin.storage.from(BUCKET_IMPRESSOES).remove([job.storage_path]).catch(() => {});

    await registrarAuditoria(admin, {
      unidade_id: job.unidade_id, ator_id: ator.id, ator_email: ator.email,
      acao: "impressao.concluida", entidade: "impressao_job", entidade_id: jobId,
      detalhe: { por: ator.tipo, folhas, competencia }, ip: ipDaReq(req),
    });
    return json({ ok: true, folhas }, 200, req);
  } catch (e) {
    console.error("[impressao-concluida]", (e as Error)?.message ?? e);
    return json({ error: "Erro ao registrar a conclusão." }, 500, req);
  }
});
