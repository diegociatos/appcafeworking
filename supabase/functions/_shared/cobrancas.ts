// ============================================================================
// Cobranças do Asaas — uma linha por pagamento, sem duplicar.
//
// O Asaas pode avisar o mesmo pagamento mais de uma vez (PAYMENT_CONFIRMED e
// PAYMENT_RECEIVED chegam quase juntos) e as faturas mensais de uma assinatura
// nascem no Asaas, sem linha prévia no banco. Por isso: tenta atualizar; se não
// existir, insere; se outra requisição inseriu no meio (índice único
// cobrancas_asaas_payment_uk), atualiza de novo.
// ============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface DadosCobranca {
  unidade_id: string;
  cliente: string;
  cliente_email?: string | null;
  cliente_documento?: string | null;
  descricao?: string | null;
  assinatura_id?: string | null;
  reserva_id?: string | null;
  origem?: string | null;
}

// deno-lint-ignore no-explicit-any
type PagamentoAsaas = Record<string, any>;

export async function garantirCobranca(
  admin: SupabaseClient, pay: PagamentoAsaas, status: string, dados: DadosCobranca,
): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (status === "pago") {
    patch.valor_pago = pay.value ?? null;
    patch.pago_em = new Date().toISOString();
  }

  const atualizar = async () => {
    const { data, error } = await admin.from("cobrancas").update(patch).eq("asaas_payment_id", pay.id).select("id");
    if (error) throw new Error(`cobrancas update: ${error.message}`);
    return (data || []).length;
  };

  if (await atualizar()) return;

  const valor = Number(pay.value);
  if (!(valor > 0)) return; // cobrança sem valor não entra (check da tabela)

  const { error } = await admin.from("cobrancas").insert({
    unidade_id: dados.unidade_id,
    cliente: dados.cliente,
    cliente_email: dados.cliente_email ?? null,
    cliente_documento: dados.cliente_documento ?? null,
    valor,
    vencimento: pay.dueDate ?? null,
    descricao: dados.descricao ?? pay.description ?? null,
    tipo: pay.billingType || "UNDEFINED",
    gateway: "asaas",
    asaas_customer_id: pay.customer ?? null,
    asaas_payment_id: pay.id,
    asaas_subscription_id: pay.subscription ?? null,
    assinatura_id: dados.assinatura_id ?? null,
    reserva_id: dados.reserva_id ?? null,
    origem: dados.origem ?? null,
    invoice_url: pay.invoiceUrl ?? null,
    boleto_url: pay.bankSlipUrl ?? null,
    ...patch,
  });
  if (!error) return;
  if (error.code === "23505") {
    await atualizar(); // outra entrega do webhook inseriu primeiro
    return;
  }
  throw new Error(`cobrancas insert: ${error.message}`);
}
