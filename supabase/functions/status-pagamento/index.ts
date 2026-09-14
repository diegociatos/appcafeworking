// ============================================================================
// Edge Function: status-pagamento  (a página de pagamento acompanha a compra)
//
// GET /functions/v1/status-pagamento?t=<status_token>   (deploy --no-verify-jwt)
// → { status: "aguardando" | "confirmado" | "cancelado", fatura: string | null }
//
// O token é um uuid aleatório devolvido só para quem fez a compra. Além do
// status, só sai o link da fatura do Asaas enquanto ela está pendente (para
// quem reabriu a página de pagamento em outro aparelho). Nenhum dado pessoal.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { statusPublicoDoCadastro } from "../_shared/venda.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const token = new URL(req.url).searchParams.get("t") || "";
    if (!UUID.test(token)) return json({ error: "Token inválido." }, 400, req);

    const { data, error } = await adminClient()
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
