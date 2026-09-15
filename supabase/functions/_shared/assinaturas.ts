// ============================================================================
// Operações da assinatura usadas por cancelar-assinatura, rotina-diaria,
// documentos-assinatura, minha-assinatura e gestao-assinaturas.
// ============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { userClient } from "./supabaseAdmin.ts";
import { asaas, type CredAsaas, credenciaisAsaas, ErroAsaas } from "./asaas.ts";
import { getNotifProvider, renderTemplate } from "./notify/index.ts";
import type { Evento } from "./notify/types.ts";
import { reembolsoAutomatico } from "./ciclo.ts";
import { liberarSala } from "./disponibilidade.ts";

// deno-lint-ignore no-explicit-any
export type Linha = Record<string, any>;

export const BUCKET_DOCUMENTOS = "documentos-clientes";
export const APP_URL = Deno.env.get("APP_URL") ?? "https://app.cafeworking.com.br";

/** Usuário logado a partir do JWT da requisição; null se não autenticado. */
export async function usuarioDoReq(req: Request): Promise<{ id: string; email: string } | null> {
  const { data } = await userClient(req).auth.getUser();
  const u = data?.user;
  return u?.email ? { id: u.id, email: u.email.toLowerCase() } : null;
}

/** Admin da plataforma ou equipe (não cliente) da unidade, avaliado com o JWT do usuário. */
export async function ehEquipe(req: Request, unidadeId: string): Promise<boolean> {
  const cli = userClient(req);
  const [{ data: admin }, { data: staff }] = await Promise.all([
    cli.rpc("is_platform_admin"),
    cli.rpc("is_unidade_staff", { p_unidade_id: unidadeId }),
  ]);
  return admin === true || staff === true;
}

export async function carregarAssinatura(admin: SupabaseClient, id: unknown): Promise<Linha | null> {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await admin.from("assinaturas").select("*").eq("id", id).maybeSingle();
  return data;
}

export async function nomeDaUnidade(admin: SupabaseClient, unidadeId: string): Promise<string> {
  const { data } = await admin.from("unidades").select("nome").eq("id", unidadeId).maybeSingle();
  return data?.nome || "";
}

/** E-mail ao cliente + registro em notificacoes. Nunca lança: o e-mail não desfaz a operação. */
export async function avisarCliente(admin: SupabaseClient, a: Linha, evento: Evento, dados: Record<string, unknown>) {
  try {
    const msg = renderTemplate(evento, { cliente: a.cliente_nome, email: a.cliente_email, plano: a.plano_nome, ...dados });
    const envio = await getNotifProvider("email").enviar({ ...msg, para: a.cliente_email });
    await admin.from("notificacoes").insert({
      unidade_id: a.unidade_id, cliente_nome: a.cliente_nome, destinatario: a.cliente_email, canal: "email",
      evento, template: evento, dados: { plano: a.plano_nome, assinatura_id: a.id },
      status: envio.ok ? "enviado" : "erro", assunto: msg.assunto, provider_id: envio.providerId ?? null,
      sent_at: envio.ok ? new Date().toISOString() : null, erro: envio.ok ? null : envio.erro,
    });
  } catch (e) {
    console.error(`avisarCliente ${evento} ${a.id}:`, (e as Error).message);
  }
}

/** E-mail para a equipe (secret EMAIL_EQUIPE, vários separados por vírgula). Sem o secret, só registra no log. */
export async function avisarEquipe(assunto: string, linhas: string[], link = APP_URL) {
  const destinos = (Deno.env.get("EMAIL_EQUIPE") || "").split(",").map((s) => s.trim()).filter(Boolean);
  console.log(`[equipe] ${assunto} | ${linhas.join(" | ")}`);
  for (const para of destinos) {
    try {
      const msg = renderTemplate("aviso_equipe", { email: para, assunto, linhas, link });
      await getNotifProvider("email").enviar({ ...msg, para });
    } catch (e) {
      console.error("avisarEquipe:", (e as Error).message);
    }
  }
}

/** Encerra a assinatura no Asaas. Já removida (404) conta como sucesso. */
export async function encerrarAssinaturaAsaas(cred: CredAsaas | null, subscriptionId: string | null) {
  if (!cred || !subscriptionId) return;
  try {
    await asaas(cred, `/subscriptions/${subscriptionId}`, "DELETE");
  } catch (e) {
    if (e instanceof ErroAsaas && e.status === 404) return;
    throw e;
  }
}

/**
 * Devolve integralmente os pagamentos confirmados da assinatura. Cartão e PIX
 * são estornados pela API do Asaas; boleto (ou estorno recusado) vira
 * devolução manual da equipe.
 */
export async function reembolsarPagamentos(
  admin: SupabaseClient, cred: CredAsaas | null, a: Linha,
): Promise<{ estornados: number; manual: boolean; valorManual: number }> {
  const { data: cobrancas } = await admin
    .from("cobrancas").select("asaas_payment_id, valor, valor_pago, status")
    .eq("assinatura_id", a.id).eq("status", "pago");
  let estornados = 0;
  let manual = false;
  let valorManual = 0;
  for (const c of cobrancas || []) {
    const valor = Number(c.valor_pago ?? c.valor ?? 0);
    if (!cred || !c.asaas_payment_id) { manual = true; valorManual += valor; continue; }
    try {
      const pay = await asaas(cred, `/payments/${c.asaas_payment_id}`);
      if (!reembolsoAutomatico(pay?.billingType)) { manual = true; valorManual += valor; continue; }
      await asaas(cred, `/payments/${c.asaas_payment_id}/refund`, "POST", { description: "Cancelamento do plano CafeWorking" });
      await admin.from("cobrancas").update({ status: "estornado" }).eq("asaas_payment_id", c.asaas_payment_id);
      estornados++;
    } catch (e) {
      console.error(`estorno ${c.asaas_payment_id}:`, (e as Error).message);
      manual = true;
      valorManual += valor;
    }
  }
  return { estornados, manual, valorManual: Math.round(valorManual * 100) / 100 };
}

/**
 * Cancela na hora (arrependimento ou documentos reprovados): reivindica a linha,
 * encerra no Asaas, devolve os pagamentos e grava o resultado.
 */
export async function cancelarAgora(
  admin: SupabaseClient, a: Linha, tipo: "arrependimento" | "documentos_reprovados", motivo: string | null,
  extra: Record<string, unknown> = {},
): Promise<{ ok: boolean; jaCancelada?: boolean; reembolso: "automatico" | "manual" | "nenhum"; valorManual: number }> {
  const { data: claim } = await admin.from("assinaturas")
    .update({ status: "cancelando", cancelamento_solicitado_em: new Date().toISOString() })
    .eq("id", a.id).in("status", ["ativa", "inadimplente", "cancelando"]).select("id");
  if (!claim?.length) return { ok: false, jaCancelada: true, reembolso: "nenhum", valorManual: 0 };

  const cred = await credenciaisAsaas(admin, a.unidade_id);
  await encerrarAssinaturaAsaas(cred, a.asaas_subscription_id);
  const r = await reembolsarPagamentos(admin, cred, a);
  const reembolso = r.manual ? "manual" : r.estornados > 0 ? "automatico" : "nenhum";

  await admin.from("assinaturas").update({
    status: "cancelada", cancelada_em: new Date().toISOString(), cancela_em: null,
    cancelamento_tipo: tipo, cancelamento_motivo: motivo,
    requer_acerto: r.manual, motivo_acerto: r.manual ? "reembolso_manual" : null,
    ...extra,
  }).eq("id", a.id);
  await liberarSala(admin, a);

  return { ok: true, reembolso, valorManual: r.valorManual };
}

/** Links temporários (10 min) para os documentos da assinatura. */
export async function documentosComLink(admin: SupabaseClient, assinaturaId: string): Promise<Linha[]> {
  const { data } = await admin.from("assinatura_documentos")
    .select("id, tipo, nome_arquivo, mime, bytes, storage_path, created_at")
    .eq("assinatura_id", assinaturaId).order("created_at", { ascending: false });
  const docs = data || [];
  if (!docs.length) return [];
  const { data: links } = await admin.storage.from(BUCKET_DOCUMENTOS).createSignedUrls(docs.map((d) => d.storage_path), 600);
  const porCaminho = new Map((links || []).map((l) => [l.path, l.signedUrl]));
  return docs.map(({ storage_path, ...d }) => ({ ...d, url: porCaminho.get(storage_path) || null }));
}
