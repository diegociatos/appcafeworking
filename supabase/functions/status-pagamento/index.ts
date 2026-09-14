// ============================================================================
// Edge Function: status-pagamento  (a página de pagamento acompanha a compra)
//
// GET /functions/v1/status-pagamento?t=<status_token>   compra de plano
// GET /functions/v1/status-pagamento?r=<reserva_id>     reserva de sala por hora
// (deploy --no-verify-jwt)
// → { status: "aguardando" | "confirmado" | "cancelado", fatura: string | null }
//
// O token e o id da reserva são aleatórios e só quem comprou os recebe. Além do
// status, só sai o link da fatura do Asaas enquanto ela está pendente (para
// quem reabriu a página de pagamento em outro aparelho). Nenhum dado pessoal.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { statusPublicoDoCadastro } from "../_shared/venda.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESERVA = /^r_[0-9a-f]{32}$/;

/** Reserva: aguardando_pagamento (ainda no prazo) → aguardando; confirmada/checkin → confirmado. */
function statusPublicoDaReserva(status: string, expiraEm: string | null): "aguardando" | "confirmado" | "cancelado" {
  if (["confirmada", "checkin", "concluida"].includes(status)) return "confirmado";
  if (status === "aguardando_pagamento" && (!expiraEm || new Date(expiraEm).getTime() > Date.now())) return "aguardando";
  return "cancelado";
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("t") || "";
    const reservaId = url.searchParams.get("r") || "";
    const admin = adminClient();

    if (reservaId) {
      if (!RESERVA.test(reservaId)) return json({ error: "Reserva inválida." }, 400, req);
      const { data, error } = await admin.from("reservas").select("status, expira_em").eq("id", reservaId).maybeSingle();
      if (error) return json({ error: error.message }, 500, req);
      if (!data) return json({ error: "Reserva não encontrada." }, 404, req);
      const status = statusPublicoDaReserva(data.status, data.expira_em);
      let fatura: string | null = null;
      if (status === "aguardando") {
        const { data: c } = await admin.from("cobrancas").select("invoice_url").eq("reserva_id", reservaId).maybeSingle();
        fatura = c?.invoice_url || null;
      }
      return json({ status, fatura }, 200, req);
    }

    if (!UUID.test(token)) return json({ error: "Token inválido." }, 400, req);

    const { data, error } = await admin
      .from("pending_signups").select("status, invoice_url").eq("status_token", token).maybeSingle();
    if (error) return json({ error: error.message }, 500, req);
    if (!data) return json({ error: "Compra não encontrada." }, 404, req);

    const status = statusPublicoDoCadastro(data.status);
    return json({ status, fatura: status === "aguardando" ? data.invoice_url || null : null }, 200, req);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500, req);
  }
});
