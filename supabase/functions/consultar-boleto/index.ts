// ============================================================================
// Edge Function: consultar-boleto
// POST { boleto_id } → consulta no banco e atualiza a situação na base.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { userClient, adminClient } from "../_shared/supabaseAdmin.ts";
import { getBankCredentials } from "../_shared/vault.ts";
import { getProvider, BankError, type BankAccount } from "../_shared/banks/index.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const { boleto_id } = await req.json();
    if (!boleto_id) return json({ error: "boleto_id obrigatório" }, 400);

    const user = userClient(req);
    const { data: auth } = await user.auth.getUser();
    if (!auth?.user) return json({ error: "Não autenticado" }, 401);

    // RLS garante que o usuário só lê boletos da sua unidade.
    const { data: boleto, error } = await user
      .from("boletos")
      .select("*")
      .eq("id", boleto_id)
      .single();
    if (error || !boleto) return json({ error: "Boleto não encontrado" }, 404);

    const admin = adminClient();
    const { data: account } = await admin
      .from("bank_accounts")
      .select("*")
      .eq("id", boleto.bank_account_id)
      .single<BankAccount & { credenciais_ref: string }>();
    if (!account) return json({ error: "Conta bancária não encontrada" }, 404);

    const creds = await getBankCredentials(admin, account.credenciais_ref);
    const provider = getProvider(account as BankAccount, creds);
    const r = await provider.consultarBoleto(boleto.banco_boleto_id);

    const patch: Record<string, unknown> = {
      status: r.status,
      linha_digitavel: r.linhaDigitavel ?? boleto.linha_digitavel,
      pix_copia_cola: r.pixCopiaCola ?? boleto.pix_copia_cola,
      nosso_numero: r.nossoNumero ?? boleto.nosso_numero,
    };
    if (r.status === "pago") patch.paid_at = r.pagoEm ?? new Date().toISOString();

    const { data: updated } = await admin
      .from("boletos")
      .update(patch)
      .eq("id", boleto_id)
      .select()
      .single();

    return json({ boleto: updated ?? { ...boleto, ...patch } });
  } catch (e) {
    if (e instanceof BankError) {
      return json({ error: e.message, banco: e.banco }, e.httpStatus ?? 502);
    }
    return json({ error: (e as Error).message ?? "Erro interno" }, 500);
  }
});
