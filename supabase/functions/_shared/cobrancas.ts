// ============================================================================
// Cobranças do Asaas — uma linha por pagamento, sem duplicar.
//
// O Asaas pode avisar o mesmo pagamento mais de uma vez (PAYMENT_CONFIRMED e
// PAYMENT_RECEIVED chegam quase juntos) e as faturas mensais de uma assinatura
// nascem no Asaas, sem linha prévia no banco. Por isso: tenta atualizar; se não
// existir, insere; se outra requisição inseriu no meio (índice único
// cobrancas_asaas_payment_uk), atualiza de novo.
//
// Unidade parceira (docs/PARCEIROS.md): a linha guarda a divisão do split
// (bruto, parte do parceiro, garantia, repasse, parte da CafeWorking) com os
// percentuais do momento. Na criação usa o snapshot recebido, o de outra fatura
// da mesma assinatura (o split da assinatura não muda no Asaas) ou a conta
// atual. Quando paga, recalcula sobre o valor pago com o percentual gravado.
// ============================================================================

import { camposDaDivisao, type SnapshotSplit, snapshotDaCobranca, snapshotDaConta } from "./parceiros.ts";
import { type ClienteBanco, contaDaUnidade } from "./parceirosDb.ts";

export interface DadosCobranca {
  unidade_id: string;
  cliente: string;
  cliente_email?: string | null;
  cliente_documento?: string | null;
  descricao?: string | null;
  assinatura_id?: string | null;
  reserva_id?: string | null;
  origem?: string | null;
  /** Percentuais usados no split enviado ao Asaas (quem cria a cobrança sabe). */
  split?: SnapshotSplit | null;
}

// deno-lint-ignore no-explicit-any
type PagamentoAsaas = Record<string, any>;

const COLUNAS_SPLIT = "parceiro_conta_id, asaas_wallet_id, split_parceiro_pct, split_garantia_pct";

/** Snapshot para uma cobrança nova: explícito → outra fatura da assinatura → conta atual da unidade. */
export async function snapshotParaCobranca(
  admin: ClienteBanco, unidadeId: string, pay: PagamentoAsaas, explicito?: SnapshotSplit | null,
): Promise<SnapshotSplit | null> {
  if (explicito) return explicito;
  if (pay.subscription) {
    const { data, error } = await admin.from("cobrancas").select(COLUNAS_SPLIT)
      .eq("asaas_subscription_id", pay.subscription).not("parceiro_conta_id", "is", null).limit(1).maybeSingle();
    if (error) throw new Error(`cobrancas (split da assinatura): ${error.message}`);
    const s = snapshotDaCobranca(data);
    if (s) return s;
  }
  return snapshotDaConta(await contaDaUnidade(admin, unidadeId));
}

/**
 * Atualiza a cobrança existente pelo payment id. Paga: grava valor_pago/pago_em
 * e recalcula a divisão sobre o valor pago. Devolve quantas linhas mudou.
 */
export async function atualizarCobranca(admin: ClienteBanco, pay: PagamentoAsaas, status: string): Promise<number> {
  const patch: Record<string, unknown> = { status };
  if (status === "pago") {
    patch.valor_pago = pay.value ?? null;
    patch.pago_em = new Date().toISOString();
    const { data: atual, error } = await admin.from("cobrancas").select(`${COLUNAS_SPLIT}, valor`)
      .eq("asaas_payment_id", pay.id).maybeSingle();
    if (error) throw new Error(`cobrancas select: ${error.message}`);
    const s = snapshotDaCobranca(atual);
    if (s) Object.assign(patch, camposDaDivisao(s, Number(pay.value) > 0 ? Number(pay.value) : Number(atual?.valor)));
  }
  const { data, error } = await admin.from("cobrancas").update(patch).eq("asaas_payment_id", pay.id).select("id");
  if (error) throw new Error(`cobrancas update: ${error.message}`);
  return (data || []).length;
}

export async function garantirCobranca(
  admin: ClienteBanco, pay: PagamentoAsaas, status: string, dados: DadosCobranca,
): Promise<void> {
  if (await atualizarCobranca(admin, pay, status)) return;

  const valor = Number(pay.value);
  if (!(valor > 0)) return; // cobrança sem valor não entra (check da tabela)

  const patch: Record<string, unknown> = { status };
  if (status === "pago") {
    patch.valor_pago = pay.value ?? null;
    patch.pago_em = new Date().toISOString();
  }
  const split = await snapshotParaCobranca(admin, dados.unidade_id, pay, dados.split);

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
    ...camposDaDivisao(split, valor),
    ...patch,
  });
  if (!error) return;
  if (error.code === "23505") {
    await atualizarCobranca(admin, pay, status); // outra entrega do webhook inseriu primeiro
    return;
  }
  throw new Error(`cobrancas insert: ${error.message}`);
}
