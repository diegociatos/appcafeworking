// ============================================================================
// Rede de parceiros — leituras no banco e avisos (usa service_role).
// As regras de dinheiro ficam em parceiros.ts (puro, testado).
//
//   contaDaUnidade      conta dona da unidade (com os campos do parceiro)
//   regraDaUnidade      pode vender? com qual split?
//   lancarGarantia      razão de garantia a partir da cobrança (webhook)
//   avisarParceiro      e-mail aos avisos da conta parceira (nunca lança)
//   unidadeFiscalPlataforma  unidade cuja config fiscal emite a nota da CafeWorking
// ============================================================================

import { EmailProvider } from "./notify/EmailProvider.ts";
import { renderTemplate } from "./notify/templates.ts";
import {
  type ContaVenda, destinatariosAvisoParceiro, ehContaParceira, type RegraVenda, regraDeVenda,
} from "./parceiros.ts";

/**
 * Só o pedaço do supabase-js usado aqui, sem importar o pacote: assim os testes
 * com banco imitado rodam sem baixar os tipos do SDK (o SupabaseClient encaixa).
 */
// deno-lint-ignore no-explicit-any
export type ClienteBanco = { from(tabela: string): any };
type ClienteAdmin = ClienteBanco;

export const APP_URL_PARCEIRO = (Deno.env.get("APP_URL") ?? "https://app.cafeworking.com.br").replace(/\/+$/, "");
export const linkParceiro = (tela: string) => `${APP_URL_PARCEIRO}/?p=${encodeURIComponent(tela)}`;

const CAMPOS_CONTA = "id, nome, email, tipo, parceiro_percentual, garantia_percentual, asaas_wallet_id, parceiro_status, emails_aviso";

/** Conta dona da unidade; null se a unidade não existe ou não tem conta. Lança em erro de banco. */
export async function contaDaUnidade(admin: ClienteAdmin, unidadeId: string | null | undefined): Promise<ContaVenda | null> {
  if (!unidadeId) return null;
  const { data: unidade, error: uErr } = await admin.from("unidades").select("franqueado_id").eq("id", unidadeId).maybeSingle();
  if (uErr) throw new Error(`unidades: ${uErr.message}`);
  if (!unidade?.franqueado_id) return null;
  const { data: conta, error: cErr } = await admin.from("contas").select(CAMPOS_CONTA).eq("id", unidade.franqueado_id).maybeSingle();
  if (cErr) throw new Error(`contas: ${cErr.message}`);
  return conta ?? null;
}

export async function unidadeEhParceira(admin: ClienteAdmin, unidadeId: string | null | undefined): Promise<boolean> {
  return ehContaParceira(await contaDaUnidade(admin, unidadeId));
}

export async function regraDaUnidade(admin: ClienteAdmin, unidadeId: string): Promise<RegraVenda> {
  return regraDeVenda(await contaDaUnidade(admin, unidadeId));
}

/**
 * Unidade da CafeWorking cuja configuração fiscal emite a nota da parte da
 * CafeWorking nas cobranças de unidades parceiras (secret UNIDADE_FISCAL_PLATAFORMA).
 * Sem o secret, a nota dessas cobranças não sai (nunca usa a config do parceiro).
 */
export function unidadeFiscalPlataforma(): string | null {
  return (Deno.env.get("UNIDADE_FISCAL_PLATAFORMA") || "").trim() || null;
}

export const MSG_SEM_UNIDADE_FISCAL =
  "Cobrança de unidade parceira: a nota da CafeWorking precisa do secret UNIDADE_FISCAL_PLATAFORMA (unidade da CafeWorking que emite).";

// ---------------------------------------------------------------------------
// Razão de garantia
// ---------------------------------------------------------------------------

/**
 * Cobrança paga → retenção; estornada → estorno da retenção. Idempotente pelo
 * índice único (cobranca_id, tipo). Lança em erro de banco (o webhook responde
 * 500 e o Asaas reenvia; o lançamento não duplica).
 */
export async function lancarGarantia(admin: ClienteAdmin, paymentId: string, status: string): Promise<string | null> {
  if (status !== "pago" && status !== "estornado") return null;
  const { data: cob, error } = await admin.from("cobrancas")
    .select("id, unidade_id, parceiro_conta_id, valor_garantia, split_garantia_pct")
    .eq("asaas_payment_id", paymentId).maybeSingle();
  if (error) throw new Error(`cobrancas (garantia): ${error.message}`);
  if (!cob?.parceiro_conta_id || !(Number(cob.valor_garantia) > 0)) return null;

  const inserir = async (linha: Record<string, unknown>) => {
    const { error: iErr } = await admin.from("parceiro_garantias").insert(linha);
    if (!iErr) return true;
    if (iErr.code === "23505") return false; // já lançado
    throw new Error(`parceiro_garantias: ${iErr.message}`);
  };

  if (status === "pago") {
    const novo = await inserir({
      conta_id: cob.parceiro_conta_id, unidade_id: cob.unidade_id, cobranca_id: cob.id, tipo: "retencao",
      valor: Number(cob.valor_garantia), observacao: `Retenção de ${Number(cob.split_garantia_pct)}% do repasse`,
    });
    return novo ? "garantia_retida" : "garantia_ja_lancada";
  }

  const { data: ret, error: rErr } = await admin.from("parceiro_garantias")
    .select("valor").eq("cobranca_id", cob.id).eq("tipo", "retencao").maybeSingle();
  if (rErr) throw new Error(`parceiro_garantias: ${rErr.message}`);
  if (!ret) return null;
  const novo = await inserir({
    conta_id: cob.parceiro_conta_id, unidade_id: cob.unidade_id, cobranca_id: cob.id, tipo: "estorno",
    valor: Number(ret.valor), observacao: "Cobrança estornada",
  });
  return novo ? "garantia_estornada" : "garantia_ja_lancada";
}

// ---------------------------------------------------------------------------
// Aviso ao parceiro
// ---------------------------------------------------------------------------

/**
 * E-mail aos avisos da conta parceira (ou ao master, sem lista). Unidade de conta
 * própria: não faz nada. Registra em notificacoes. Nunca lança.
 * `conta` pode vir pronta para evitar reler.
 */
export async function avisarParceiro(
  admin: ClienteAdmin, unidadeId: string, assunto: string, linhas: string[], link: string,
  conta?: ContaVenda | null,
): Promise<void> {
  try {
    const c = conta === undefined ? await contaDaUnidade(admin, unidadeId) : conta;
    if (!ehContaParceira(c)) return;
    const destinos = destinatariosAvisoParceiro(c);
    if (!destinos.length) {
      console.error(`[parceiro] conta ${c?.id} sem e-mail para aviso: ${assunto}`);
      return;
    }
    for (const para of destinos) {
      const msg = renderTemplate("aviso_parceiro", { email: para, assunto, linhas, link });
      const envio = await new EmailProvider().enviar({ ...msg, para });
      const { error } = await admin.from("notificacoes").insert({
        unidade_id: unidadeId, cliente_nome: c?.nome ?? null, destinatario: para, canal: "email",
        evento: "aviso_parceiro", template: "aviso_parceiro", dados: { assunto },
        status: envio.ok ? "enviado" : "erro", assunto: msg.assunto, provider_id: envio.providerId ?? null,
        sent_at: envio.ok ? new Date().toISOString() : null, erro: envio.ok ? null : envio.erro,
      });
      if (error) console.error("[parceiro] registrar aviso:", error.message);
    }
  } catch (e) {
    console.error(`[parceiro] aviso ${unidadeId} "${assunto}":`, (e as Error).message);
  }
}
