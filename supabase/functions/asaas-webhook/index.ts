// ============================================================================
// Edge Function: asaas-webhook  (baixa automática das cobranças)
//
// POST /functions/v1/asaas-webhook   (deploy com --no-verify-jwt)
// O Asaas chama esta URL quando um pagamento muda de estado. Atualizamos a
// cobrança correspondente (status pago/vencido/estornado).
//
// Segurança: valide o cabeçalho `asaas-access-token` contra o segredo
// ASAAS_WEBHOOK_TOKEN configurado no painel do Asaas.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";

const STATUS: Record<string, string> = {
  PAYMENT_CONFIRMED: "pago",
  PAYMENT_RECEIVED: "pago",
  PAYMENT_OVERDUE: "vencido",
  PAYMENT_DELETED: "cancelado",
  PAYMENT_REFUNDED: "estornado",
  PAYMENT_CHARGEBACK_REQUESTED: "estornado",
};

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const expected = Deno.env.get("ASAAS_WEBHOOK_TOKEN");
    if (expected && req.headers.get("asaas-access-token") !== expected) {
      return json({ error: "token inválido" }, 401);
    }

    const body = await req.json();
    const ev = body?.event as string | undefined;
    const pay = body?.payment;
    if (!ev || !pay?.id) return json({ ok: true, ignored: true }, 200);

    const novo = STATUS[ev];
    if (!novo) return json({ ok: true, ignored: ev }, 200);

    const admin = adminClient();
    const patch: Record<string, unknown> = { status: novo };
    if (novo === "pago") {
      patch.valor_pago = pay.value ?? null;
      patch.pago_em = new Date().toISOString();
    }
    await admin.from("cobrancas").update(patch).eq("asaas_payment_id", pay.id);

    return json({ ok: true, status: novo }, 200);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500);
  }
});
