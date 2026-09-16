// ============================================================================
// Edge Function: cancelar-assinatura  (área do cliente e equipe)
//
// POST /functions/v1/cancelar-assinatura   (JWT do usuário)
// body: { assinatura_id, motivo? }
//
// Contrato v1 (cláusula 7):
//   até 7 dias do início → arrependimento: encerra na hora e devolve tudo
//   depois               → aviso prévio de 30 dias: fica "cancelando" e a
//                          rotina-diaria encerra no Asaas na data
//   fidelidade que passa do aviso ou plano anual → marca acerto para a equipe
//
// Pela equipe, o cancelamento com devolução (arrependimento) é só do master ou
// do financeiro; a recepção registra o aviso prévio.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { avisoBonificados, hojeBRT } from "../_shared/venda.ts";
import { planoDeCancelamento } from "../_shared/ciclo.ts";
import {
  APP_URL, avisarCliente, avisarEquipe, cancelarAgora, carregarAssinatura, ehEquipe, usuarioDoReq,
} from "../_shared/assinaturas.ts";
import { podeMexerNoDinheiro, recusaSemFinanceiro } from "../_shared/permissoes.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405, req);

  try {
    const usuario = await usuarioDoReq(req);
    if (!usuario) return json({ error: "Entre na sua conta para cancelar." }, 401, req);

    const body = await req.json().catch(() => ({}));
    const admin = adminClient();
    const a = await carregarAssinatura(admin, body?.assinatura_id);
    if (!a) return json({ error: "Assinatura não encontrada." }, 404, req);

    const dono = String(a.cliente_email).toLowerCase() === usuario.email;
    if (!dono && !(await ehEquipe(req, a.unidade_id))) return json({ error: "Sem acesso a esta assinatura." }, 403, req);

    if (a.status === "cancelada") return json({ error: "Este plano já está cancelado.", codigo: "JA_CANCELADA" }, 409, req);
    if (a.status === "cancelando") {
      return json({ ok: true, tipo: a.cancelamento_tipo, cancela_em: a.cancela_em, requer_acerto: a.requer_acerto, repetido: true }, 200, req);
    }

    const motivo = typeof body?.motivo === "string" ? body.motivo.trim().slice(0, 500) || null : null;
    const hoje = hojeBRT();
    const plano = planoDeCancelamento({ inicio: a.inicio, hoje, recorrencia: a.recorrencia, fidelidade_ate: a.fidelidade_ate });
    const quem = dono ? "cliente" : `equipe (${usuario.email})`;

    if (plano.tipo === "arrependimento") {
      // devolve dinheiro: pela equipe, só master/financeiro (o próprio cliente pode)
      if (!dono && !(await podeMexerNoDinheiro(admin, usuario.id, a.unidade_id))) {
        return recusaSemFinanceiro("Cancelamento com devolução do pagamento", req);
      }
      const r = await cancelarAgora(admin, a, "arrependimento", motivo);
      if (r.jaCancelada) return json({ error: "Este plano já está sendo cancelado.", codigo: "JA_CANCELADA" }, 409, req);
      await avisarCliente(admin, a, "cancelamento_confirmado", {
        tipo: "arrependimento", cancelaEm: hoje, reembolso: r.reembolso, requerAcerto: false, categoria: a.categoria,
      });
      await avisarEquipe(`Cancelamento por arrependimento: ${a.plano_nome}`, [
        `Cliente: ${a.cliente_nome} (${a.cliente_email})`, `Pedido por: ${quem}`,
        `Devolução: ${r.reembolso === "manual" ? `MANUAL, R$ ${r.valorManual.toFixed(2)}` : r.reembolso}`,
        ...(a.categoria === "endereco_fiscal" ? ["Endereço fiscal: conferir retirada do endereço em 30 dias."] : []),
        ...avisoBonificados(a),
        ...(motivo ? [`Motivo: ${motivo}`] : []),
      ], APP_URL);
      return json({ ok: true, tipo: "arrependimento", cancela_em: hoje, reembolso: r.reembolso }, 200, req);
    }

    const { data: atualizada, error } = await admin.from("assinaturas").update({
      status: "cancelando", cancela_em: plano.cancelaEm, cancelamento_solicitado_em: new Date().toISOString(),
      cancelamento_tipo: dono ? "aviso_previo" : "equipe", cancelamento_motivo: motivo,
      requer_acerto: plano.requerAcerto, motivo_acerto: plano.motivoAcerto,
    }).eq("id", a.id).in("status", ["ativa", "inadimplente"]).select("id");
    if (error) return json({ error: error.message }, 500, req);
    if (!atualizada?.length) return json({ error: "Este plano já está sendo cancelado.", codigo: "JA_CANCELADA" }, 409, req);

    await avisarCliente(admin, a, "cancelamento_confirmado", {
      tipo: "aviso_previo", cancelaEm: plano.cancelaEm, reembolso: "nenhum", requerAcerto: plano.requerAcerto, categoria: a.categoria,
    });
    await avisarEquipe(`Cancelamento agendado para ${plano.cancelaEm.split("-").reverse().join("/")}: ${a.plano_nome}`, [
      `Cliente: ${a.cliente_nome} (${a.cliente_email})`, `Pedido por: ${quem}`,
      `Acerto: ${plano.requerAcerto ? `SIM (${plano.motivoAcerto === "anual" ? "devolução proporcional do anual" : "multa de fidelidade"})` : "não"}`,
      ...avisoBonificados(a),
      ...(motivo ? [`Motivo: ${motivo}`] : []),
    ], APP_URL);

    return json({ ok: true, tipo: "aviso_previo", cancela_em: plano.cancelaEm, requer_acerto: plano.requerAcerto }, 200, req);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500, req);
  }
});
