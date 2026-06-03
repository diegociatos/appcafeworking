// ============================================================================
// Edge Function: enviar-email  (genérica, agnóstica de evento)
//
// Dois modos:
//  A) { notificacao_id }            → processa uma linha já enfileirada (outbox)
//  B) { unidade_id, evento, email,  → envia na hora e registra
//       cliente, dados, canal? }
//
// Renderiza o template, chama o provedor (Resend) e grava o status em
// `notificacoes`. A API key fica nos secrets — nunca no front-end.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { getNotifProvider, renderTemplate, NotifyError, type Canal, type Evento } from "../_shared/notify/index.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const admin = adminClient();
  try {
    const body = await req.json();
    let row: any;

    if (body.notificacao_id) {
      const { data } = await admin.from("notificacoes").select("*").eq("id", body.notificacao_id).single();
      if (!data) return json({ error: "Notificação não encontrada" }, 404);
      row = data;
    } else {
      if (!body.unidade_id || !body.evento || !body.email) {
        return json({ error: "Campos obrigatórios: unidade_id, evento, email" }, 400);
      }
      const canal: Canal = body.canal ?? "email";
      const ins = {
        unidade_id: body.unidade_id, cliente_nome: body.cliente ?? null, destinatario: body.email,
        canal, evento: body.evento, template: body.evento, dados: body.dados ?? {}, status: "fila",
      };
      const { data, error } = await admin.from("notificacoes").insert(ins).select().single();
      if (error) return json({ error: `Falha ao enfileirar: ${error.message}` }, 500);
      row = data;
    }

    // Renderiza + envia
    const dados = { ...(row.dados ?? {}), cliente: row.cliente_nome, email: row.destinatario };
    const msg = renderTemplate(row.evento as Evento, dados);
    const provider = getNotifProvider(row.canal as Canal);
    const result = await provider.enviar({ ...msg, para: row.destinatario });

    const patch = result.ok
      ? { status: "enviado", assunto: msg.assunto, provider_id: result.providerId, sent_at: new Date().toISOString(), erro: null }
      : { status: "erro", assunto: msg.assunto, erro: result.erro };
    const { data: updated } = await admin.from("notificacoes").update(patch).eq("id", row.id).select().single();

    return json({ notificacao: updated, enviado: result.ok }, result.ok ? 200 : 502);
  } catch (e) {
    if (e instanceof NotifyError) return json({ error: e.message, canal: e.canal }, e.status ?? 502);
    console.error("enviar-email:", e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500);
  }
});
