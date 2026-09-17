// ============================================================================
// Edge Function: cancelar-reserva  (equipe · Agenda de Salas)
//
// POST /functions/v1/cancelar-reserva   (JWT da equipe; deploy --no-verify-jwt)
// body: { reserva_id, motivo?, confirmar_paga?, estornar? }
// → { ok, horas_devolvidas, devolucoes, paga, estorno, payment_status, email }
//
// Cancelamento de verdade: status 'cancelada' na tabela (o horário fica livre),
// devolve as horas do plano consumidas pela reserva (creditos_ledger), registra
// na auditoria e avisa o cliente por e-mail quando houver e-mail.
//
// Quem pode: admin da plataforma ou equipe da unidade (master, recepção,
// financeiro). Contabilidade parceira e cliente não (o cliente cancela pela
// área dele, em reservas-cliente, com prazo de 24h).
//
// Reserva paga online: o banco recusa sem confirmar_paga (PAGA_CONFIRMAR). Com a
// confirmação, cancela e a devolução fica manual (aviso à equipe). Com
// estornar=true (só master/financeiro/admin), tenta estornar no Asaas quando o
// pagamento foi por cartão ou PIX; boleto ou falha viram devolução manual.
// Reserva aguardando pagamento: cancela a cobrança pendente no Asaas.
// ============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { APP_URL, avisarEquipe, usuarioDoReq } from "../_shared/assinaturas.ts";
import { registrarAuditoria, ipDaReq } from "../_shared/audit.ts";
import { dispatchNotificacao } from "../_shared/notify/index.ts";
import { asaas, cancelarNoAsaas, credenciaisAsaas } from "../_shared/asaas.ts";
import { podeMexerNoDinheiro, recusaSemFinanceiro } from "../_shared/permissoes.ts";
import {
  type Estorno, MSG_SEM_PAPEL_CANCELAR, mensagemCancelamentoEquipe, papelCancelaReserva, planoDeEstorno, quandoReservaBR,
  statusDoErroCancelamento,
} from "../_shared/cancelamentoReserva.ts";

const brl = (n: unknown) => "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

/** Tenta devolver o pagamento no Asaas. Nunca lança: falha vira devolução manual. */
async function estornarNoAsaas(
  admin: SupabaseClient, unidadeId: string, paymentId: string | null, pedido: boolean,
): Promise<{ estorno: Estorno; erro?: string }> {
  if (!pedido || !paymentId) return { estorno: "manual" };
  try {
    const cred = await credenciaisAsaas(admin, unidadeId);
    if (!cred) return { estorno: "manual", erro: "unidade sem integração com o Asaas" };
    const pay = await asaas(cred, `/payments/${paymentId}`);
    const plano = planoDeEstorno({ paga: true, estornar: true, asaasPaymentId: paymentId, billingType: pay?.billingType });
    if (plano !== "automatico") return { estorno: "manual", erro: `forma de pagamento ${pay?.billingType || "desconhecida"} sem estorno automático` };
    await asaas(cred, `/payments/${paymentId}/refund`, "POST", { description: "Reserva de sala cancelada pelo CafeWorking" });
    return { estorno: "automatico" };
  } catch (e) {
    console.error(`[cancelar-reserva] estorno ${paymentId}:`, (e as Error).message);
    return { estorno: "manual", erro: (e as Error).message };
  }
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405, req);

  try {
    const usuario = await usuarioDoReq(req);
    if (!usuario) return json({ error: "Sua sessão expirou. Entre de novo." }, 401, req);

    const body = await req.json().catch(() => ({}));
    const reservaId = typeof body?.reserva_id === "string" ? body.reserva_id.trim() : "";
    if (!reservaId || reservaId.length > 80) return json({ error: "Reserva não encontrada. Recarregue a agenda." }, 400, req);
    const motivo = typeof body?.motivo === "string" ? body.motivo.trim().slice(0, 500) : "";
    const estornar = body?.estornar === true;
    const confirmarPaga = body?.confirmar_paga === true || estornar;

    const admin = adminClient();
    const { data: reserva } = await admin.from("reservas").select("id, unidade_id").eq("id", reservaId).maybeSingle();
    if (!reserva) return json({ error: mensagemCancelamentoEquipe("RESERVA_INEXISTENTE") }, 404, req);

    // Papel: admin da plataforma ou equipe da unidade da reserva.
    const [{ data: pa }, { data: vinculos }] = await Promise.all([
      admin.from("platform_admins").select("user_id").eq("user_id", usuario.id).maybeSingle(),
      admin.from("unidade_members").select("role").eq("user_id", usuario.id).eq("unidade_id", reserva.unidade_id),
    ]);
    if (!pa && !papelCancelaReserva((vinculos || []).map((v: { role: unknown }) => v.role))) {
      return json({ error: MSG_SEM_PAPEL_CANCELAR, codigo: "SEM_PAPEL" }, 403, req);
    }
    // Estornar é mexer em dinheiro.
    if (estornar && !(await podeMexerNoDinheiro(admin, usuario.id, reserva.unidade_id))) {
      return recusaSemFinanceiro("Estornar o pagamento da reserva", req);
    }

    const { data: r, error } = await admin.rpc("cancelar_reserva_equipe", {
      p_id: reservaId, p_ator: usuario.id, p_motivo: motivo || null, p_confirmar_paga: confirmarPaga,
    });
    if (error) {
      const status = statusDoErroCancelamento(error.message);
      if (!status) console.error("[cancelar-reserva] cancelar_reserva_equipe", error.message);
      const codigo = /PAGA_CONFIRMAR|JA_CANCELADA|NAO_CANCELAVEL|RESERVA_INEXISTENTE/.exec(error.message || "")?.[0];
      return json({ error: mensagemCancelamentoEquipe(error.message), ...(codigo ? { codigo } : {}) }, status ?? 500, req);
    }

    const unidadeId = String(r.unidade_id);
    const paymentId = r.asaas_payment_id ? String(r.asaas_payment_id) : null;
    let paymentStatus = String(r.payment_status || "");
    let estorno: Estorno = "nao_se_aplica";
    let erroEstorno: string | undefined;

    if (r.paga) {
      const res = await estornarNoAsaas(admin, unidadeId, paymentId, estornar);
      estorno = res.estorno;
      erroEstorno = res.erro;
      if (estorno === "automatico" && paymentId) {
        paymentStatus = "estornado";
        await admin.from("reservas").update({ payment_status: "estornado" }).eq("id", reservaId);
        await admin.from("cobrancas").update({ status: "estornado" }).eq("asaas_payment_id", paymentId);
      }
    } else if (r.status_anterior === "aguardando_pagamento" && paymentId) {
      // Cobrança ainda em aberto: cancela no Asaas para o cliente não pagar um horário que não existe mais.
      const cred = await credenciaisAsaas(admin, unidadeId).catch(() => null);
      if (cred) await cancelarNoAsaas(cred, { paymentId });
    }

    const { data: sala } = await admin.from("salas").select("nome").eq("id", r.sala_id).maybeSingle();
    const quando = quandoReservaBR(r.start_at, r.end_at);
    const horas = Number(r.horas_devolvidas || 0);

    await registrarAuditoria(admin, {
      unidade_id: unidadeId, ator_id: usuario.id, ator_email: usuario.email,
      acao: "reserva.cancelada_equipe", entidade: "reserva", entidade_id: reservaId,
      detalhe: {
        status_anterior: r.status_anterior, sala_id: r.sala_id, start_at: r.start_at, end_at: r.end_at,
        cliente_nome: r.cliente_nome, cliente_email: r.cliente_email, origem: r.origem, valor: r.valor,
        motivo: motivo || null, horas_devolvidas: horas, devolucoes: r.devolucoes ?? [],
        paga: r.paga === true, estorno, estorno_pedido: estornar, ...(erroEstorno ? { erro_estorno: erroEstorno } : {}),
        asaas_payment_id: paymentId,
      },
      ip: ipDaReq(req),
    });

    if (estorno === "manual") {
      await avisarEquipe(`DEVOLVER: reserva paga cancelada (${r.cliente_nome || "cliente"})`, [
        `Reserva ${reservaId}, ${sala?.nome || "sala"}, ${quando}.`,
        `Valor pago: ${brl(r.valor)}. Pagamento no Asaas: ${paymentId || "não informado"}.`,
        `Cancelada por: ${usuario.email}.`,
        estornar ? `O estorno automático não foi possível (${erroEstorno || "motivo desconhecido"}): devolver manualmente.` : "Devolver o valor ao cliente manualmente.",
        ...(motivo ? [`Motivo: ${motivo}`] : []),
      ], `${APP_URL}/?p=reservas`);
    }

    let email: "enviado" | "sem_email" | "erro" = "sem_email";
    if (r.cliente_email) {
      const envio = await dispatchNotificacao(admin, {
        unidade_id: unidadeId, evento: "reserva_cancelada", email: String(r.cliente_email), cliente: r.cliente_nome || "cliente",
        dados: { sala: sala?.nome || "sala", quando, horasDevolvidas: horas, estorno, reserva_id: reservaId },
      });
      email = envio.ok ? "enviado" : "erro";
    }

    return json({
      ok: true, horas_devolvidas: horas, devolucoes: r.devolucoes ?? [], paga: r.paga === true,
      estorno, payment_status: paymentStatus, email,
    }, 200, req);
  } catch (e) {
    console.error("[cancelar-reserva]", e);
    return json({ error: "Não foi possível cancelar agora. Tente de novo." }, 500, req);
  }
});
