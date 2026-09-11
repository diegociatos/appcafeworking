// ============================================================================
// Edge Function: testar-banco
//
// POST /functions/v1/testar-banco  body: { bank_account_id }
//
// Valida as credenciais da conta bancária (autentica no banco via OAuth + mTLS)
// SEM emitir boleto. Responde SEMPRE 200 com { ok, detalhe, ambiente } para o
// front mostrar a mensagem (válida ou o erro exato), como o "Testar" do ContaOne.
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
    const body = await req.json();
    if (!body?.bank_account_id) return json({ error: "Campo obrigatório ausente: bank_account_id" }, 400);

    // 1) usuário autenticado
    const user = userClient(req);
    const { data: auth } = await user.auth.getUser();
    if (!auth?.user) return json({ error: "Não autenticado" }, 401);

    // 2) conta bancária (RLS garante ownership da unidade)
    const { data: account, error: accErr } = await user
      .from("bank_accounts")
      .select("*")
      .eq("id", body.bank_account_id)
      .single<BankAccount & { credenciais_ref: string }>();
    if (accErr || !account) return json({ error: "Conta bancária não encontrada ou sem acesso" }, 403);

    // 3) credenciais do Vault — se não houver, é o que falta cadastrar
    const admin = adminClient();
    let creds;
    try {
      creds = await getBankCredentials(admin, account.credenciais_ref);
    } catch (_) {
      return json({ ok: false, ambiente: account.ambiente, detalhe: "Nenhuma credencial cadastrada para esta conta. Edite a conta e informe Client ID/Secret + certificado (.crt) e chave (.key)." }, 200);
    }

    // 4) provider + teste de conexão
    const provider = getProvider(account as BankAccount, creds);
    if (typeof provider.testarConexao !== "function") {
      return json({ ok: false, ambiente: account.ambiente, detalhe: `Teste de conexão ainda não disponível para ${account.banco}.` }, 200);
    }
    const r = await provider.testarConexao();
    return json({ ok: !!r.ok, ambiente: account.ambiente, detalhe: r.detalhe ?? null }, 200);
  } catch (e) {
    if (e instanceof BankError) {
      return json({ ok: false, detalhe: e.message, banco: e.banco, http: e.httpStatus ?? null }, 200);
    }
    console.error(e);
    return json({ ok: false, detalhe: (e as Error).message ?? "Erro interno" }, 200);
  }
});
