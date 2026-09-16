// ============================================================================
// Edge Function: cancelar-boleto
// POST { boleto_id, motivo? } → cancela/baixa no banco e marca como cancelado.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { userClient, adminClient } from "../_shared/supabaseAdmin.ts";
import { podeMexerNoDinheiro, recusaSemFinanceiro } from "../_shared/permissoes.ts";
import { getBankCredentials } from "../_shared/vault.ts";
import { getProvider, BankError, type BankAccount } from "../_shared/banks/index.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const { boleto_id, motivo } = await req.json();
    if (!boleto_id) return json({ error: "boleto_id obrigatório" }, 400);

    const user = userClient(req);
    const { data: auth } = await user.auth.getUser();
    if (!auth?.user) return json({ error: "Não autenticado" }, 401);

    // papel do financeiro na unidade da boleto (recepção e contabilidade não)
    const admin = adminClient();
    const { data: alvo } = await admin.from("boletos").select("unidade_id").eq("id", boleto_id).maybeSingle();
    if (alvo && !(await podeMexerNoDinheiro(admin, auth.user.id, alvo.unidade_id))) {
      return recusaSemFinanceiro("Cancelar boleto");
    }

    const { data: boleto, error } = await user
      .from("boletos")
      .select("*")
      .eq("id", boleto_id)
      .single();
    if (error || !boleto) return json({ error: "Boleto não encontrado" }, 404);
    if (boleto.status === "pago") return json({ error: "Boleto já pago não pode ser cancelado" }, 409);

    const { data: account } = await admin
      .from("bank_accounts")
      .select("*")
      .eq("id", boleto.bank_account_id)
      .single<BankAccount & { credenciais_ref: string }>();
    if (!account) return json({ error: "Conta bancária não encontrada" }, 404);

    const creds = await getBankCredentials(admin, account.credenciais_ref);
    const provider = getProvider(account as BankAccount, creds);
    await provider.cancelarBoleto(boleto.banco_boleto_id, motivo);

    const { data: updated } = await admin
      .from("boletos")
      .update({ status: "cancelado" })
      .eq("id", boleto_id)
      .select()
      .single();

    return json({ boleto: updated });
  } catch (e) {
    if (e instanceof BankError) {
      return json({ error: e.message, banco: e.banco }, e.httpStatus ?? 502);
    }
    return json({ error: (e as Error).message ?? "Erro interno" }, 500);
  }
});
