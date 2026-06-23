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

// Ativa um cadastro pendente após o pagamento: desbane o login e cria o cliente
// + vínculo de acesso. Best-effort por etapa (idempotente o suficiente).
async function ativarAssinatura(admin: any, ps: any, pay: any) {
  try {
    if (ps.user_id) await admin.auth.admin.updateUserById(ps.user_id, { ban_duration: "none" });

    const ano = new Date().getFullYear();
    const clienteId = "c_" + crypto.randomUUID().slice(0, 10);
    await admin.from("clientes").insert({
      id: clienteId, unidade_id: ps.unidade_id, nome: ps.nome, documento: ps.documento || null,
      plano: ps.plano_nome || "Assinante", fiscal: false, status: "ativo", desde: String(ano),
      contato: ps.nome, email: ps.email, telefone: ps.telefone || null,
    });

    if (ps.user_id) {
      await admin.from("unidade_members").insert({
        user_id: ps.user_id, unidade_id: ps.unidade_id, franqueado_id: ps.franqueado_id, role: "cliente",
      });
    }

    // Registra a 1ª fatura como paga (aparece em Cobranças / faturas do cliente).
    await admin.from("cobrancas").insert({
      unidade_id: ps.unidade_id, cliente: ps.nome, cliente_documento: ps.documento, cliente_email: ps.email,
      valor: ps.valor, descricao: `${ps.plano_nome} · assinatura`, tipo: "UNDEFINED", gateway: "asaas",
      asaas_customer_id: ps.asaas_customer_id, asaas_payment_id: pay.id, status: "pago",
      valor_pago: pay.value ?? ps.valor, pago_em: new Date().toISOString(), invoice_url: ps.invoice_url || null,
    });

    await admin.from("pending_signups").update({ status: "ativo", ativado_em: new Date().toISOString() }).eq("id", ps.id);
  } catch (e) {
    console.error("ativarAssinatura:", (e as Error).message);
  }
}

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

    // Autocheckout: pagamento confirmado ATIVA o cadastro pendente (desbanir o
    // login + criar cliente e vínculo de acesso).
    if (novo === "pago") {
      const { data: ps } = await admin
        .from("pending_signups").select("*").eq("asaas_payment_id", pay.id).eq("status", "aguardando").maybeSingle();
      if (ps) {
        await ativarAssinatura(admin, ps, pay);
      }
    }

    return json({ ok: true, status: novo }, 200);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500);
  }
});
