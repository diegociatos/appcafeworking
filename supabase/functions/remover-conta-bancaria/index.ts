// ============================================================================
// Edge Function: remover-conta-bancaria
//
// POST /functions/v1/remover-conta-bancaria
// body: { bank_account_id }
//
// Remove a conta bancária (public.bank_accounts) e apaga do Vault o segredo
// que ela usava (client_id/secret + certificado), para não deixar credencial
// órfã. Mesma permissão de salvar-integracao: admin da plataforma ou
// master/financeiro da unidade da conta.
//
// Conta com boleto emitido não é removida (boletos.bank_account_id é
// "on delete restrict" e consultar/cancelar precisam da conta): responde 409.
// O segredo só é apagado se nenhuma outra conta usar a mesma referência
// (checado de novo dentro de delete_bank_secret).
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { userClient, adminClient } from "../_shared/supabaseAdmin.ts";
import { podeMexerNoDinheiro, recusaSemFinanceiro } from "../_shared/permissoes.ts";
import { registrarAuditoria, ipDaReq } from "../_shared/audit.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405, req);

  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body?.bank_account_id ?? "");
    if (!UUID.test(id)) return json({ error: "Informe o bank_account_id da conta." }, 400, req);

    const user = userClient(req);
    const { data: auth } = await user.auth.getUser();
    if (!auth?.user) return json({ error: "Não autenticado" }, 401, req);
    const admin = adminClient();

    const { data: conta } = await admin.from("bank_accounts")
      .select("id, unidade_id, banco, apelido, credenciais_ref").eq("id", id).maybeSingle();
    if (!conta) return json({ error: "Conta bancária não encontrada." }, 404, req);

    if (!(await podeMexerNoDinheiro(admin, auth.user.id, conta.unidade_id))) {
      return recusaSemFinanceiro("Remover conta bancária", req);
    }

    const { count } = await admin.from("boletos")
      .select("id", { count: "exact", head: true }).eq("bank_account_id", id);
    if ((count ?? 0) > 0) {
      return json({
        error: `Esta conta já emitiu ${count} boleto(s) e não pode ser removida: os boletos precisam dela para consulta e cancelamento.`,
        codigo: "CONTA_COM_BOLETOS",
      }, 409, req);
    }

    const { error: delErr } = await admin.from("bank_accounts").delete().eq("id", id);
    if (delErr) return json({ error: `Falha ao remover a conta: ${delErr.message}` }, 500, req);

    // Apaga o segredo do Vault. A conta já saiu: se o cofre falhar, avisa sem desfazer.
    let segredoApagado = false;
    let avisoCofre: string | null = null;
    const { data: apagou, error: vErr } = await admin.rpc("delete_bank_secret", { p_ref: conta.credenciais_ref });
    if (vErr) {
      console.error("delete_bank_secret:", vErr.message);
      avisoCofre = "A conta foi removida, mas não foi possível apagar a credencial do cofre. Avise o suporte.";
    } else {
      segredoApagado = apagou === true;
    }

    await registrarAuditoria(admin, {
      unidade_id: conta.unidade_id,
      ator_id: auth.user.id,
      ator_email: auth.user.email ?? null,
      acao: "conta_bancaria.removida",
      entidade: "bank_account",
      entidade_id: id,
      detalhe: { banco: conta.banco, apelido: conta.apelido, segredo_apagado: segredoApagado },
      ip: ipDaReq(req),
    });

    return json({ ok: true, segredoApagado, aviso: avisoCofre }, 200, req);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500, req);
  }
});
