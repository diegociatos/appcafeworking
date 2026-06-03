// ============================================================================
// Edge Function: webhook-boletos  (baixa automática de pagamento)
//
// Recebe a notificação do banco e atualiza o status do boleto.
// URL registrada em cada banco (Inter via registrarWebhook):
//   https://<project>.supabase.co/functions/v1/webhook-boletos?banco=inter
//
// IMPORTANTE: esta function deve rodar com --no-verify-jwt (os bancos não
// enviam JWT do Supabase). A autenticidade é validada por banco (IP allowlist /
// assinatura / segredo compartilhado em webhook_secret_ref).
// ============================================================================

import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { parseWebhook, BankError, type Banco } from "../_shared/banks/index.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const url = new URL(req.url);
  const banco = (url.searchParams.get("banco") ?? "") as Banco;
  if (!banco) return json({ error: "parâmetro 'banco' obrigatório" }, 400);

  try {
    const eventos = await parseWebhook(banco, req);
    const admin = adminClient();
    const resultados: Array<{ id?: string; status: string; matched: boolean }> = [];

    for (const ev of eventos) {
      // Casa o boleto por banco_boleto_id (preferencial) ou nosso_numero.
      let query = admin.from("boletos").select("id, status").limit(1);
      if (ev.bancoBoletoId) query = query.eq("banco_boleto_id", ev.bancoBoletoId);
      else if (ev.nossoNumero) query = query.eq("nosso_numero", ev.nossoNumero);
      else if (ev.seuNumero) query = query.eq("seu_numero", ev.seuNumero);
      else { resultados.push({ status: "sem-identificador", matched: false }); continue; }

      const { data: rows } = await query;
      const boleto = rows?.[0];
      if (!boleto) { resultados.push({ status: "nao-encontrado", matched: false }); continue; }

      const patch: Record<string, unknown> = { status: ev.status, webhook_evento: ev.raw };
      if (ev.status === "pago") patch.paid_at = ev.pagoEm ?? new Date().toISOString();

      await admin.from("boletos").update(patch).eq("id", boleto.id);
      resultados.push({ id: boleto.id, status: ev.status, matched: true });
    }

    // Responder 200 rápido — bancos reenviam em caso de erro/timeout.
    return json({ ok: true, processados: resultados.length, resultados });
  } catch (e) {
    if (e instanceof BankError) return json({ error: e.message, banco }, e.httpStatus ?? 502);
    console.error("webhook-boletos:", e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500);
  }
});
