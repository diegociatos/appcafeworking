// ============================================================================
// Edge Function: reservas-cliente  (área do cliente · Reservar sala)
//
// GET  /functions/v1/reservas-cliente?data=YYYY-MM-DD
//      → { datas, janela, antecedencia_cancelamento_horas, salas, ocupados,
//          saldos, reservas }
// POST /functions/v1/reservas-cliente  { acao: "cancelar", reserva_id }
//      → { ok, horas_devolvidas }
// (JWT do cliente; deploy --no-verify-jwt)
//
// A criação continua na criar-reserva (transacional, com as regras do cliente).
// Aqui: agenda por DATA das salas que o cliente pode reservar nas unidades onde
// tem acesso, horários ocupados (sem dados de quem reservou), saldo de horas do
// plano, "Minhas reservas" com status real e cancelamento até 24h antes.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { usuarioDoReq } from "../_shared/assinaturas.ts";
import { registrarAuditoria, ipDaReq } from "../_shared/audit.ts";
import { hojeBRT } from "../_shared/venda.ts";
import {
  ANTECEDENCIA_CANCELAMENTO_HORAS, datasDaAgenda, JANELA_CLIENTE, mensagemReserva, padraoEmail, podeCancelar,
  salaReservavelPeloCliente, STATUS_ATIVOS, tipoCredito,
} from "../_shared/reservaCliente.ts";
import { erroInterno, nomesDasUnidades, unidadesDoCliente } from "../_shared/clienteArea.ts";
import { fotosPublicas } from "../_shared/catalogo.ts";
import { descontoSalaDoCliente } from "../_shared/direitosPlano.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const usuario = await usuarioDoReq(req);
    if (!usuario) return json({ error: "Entre na sua conta para reservar." }, 401, req);
    const admin = adminClient();

    // ---- cancelar ----------------------------------------------------------
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body?.acao !== "cancelar" || typeof body?.reserva_id !== "string") {
        return json({ error: "Pedido inválido." }, 400, req);
      }
      const { data, error } = await admin.rpc("cancelar_reserva_cliente", {
        p_id: body.reserva_id, p_email: usuario.email, p_antecedencia_horas: ANTECEDENCIA_CANCELAMENTO_HORAS,
      });
      if (error) {
        const conhecido = /RESERVA_INEXISTENTE|SEM_ACESSO|NAO_CANCELAVEL|PRAZO_CANCELAMENTO|PAGA_FALE_CONOSCO/.test(error.message || "");
        if (!conhecido) console.error("[reservas-cliente] cancelar", error.message);
        return json({ error: mensagemReserva(error.message, "Não foi possível cancelar agora. Tente de novo ou fale com a recepção.") }, conhecido ? 409 : 500, req);
      }
      const { data: r } = await admin.from("reservas").select("unidade_id").eq("id", body.reserva_id).maybeSingle();
      await registrarAuditoria(admin, {
        unidade_id: r?.unidade_id ?? null, ator_id: usuario.id, ator_email: usuario.email,
        acao: "reserva.cancelada_cliente", entidade: "reserva", entidade_id: body.reserva_id,
        detalhe: data ?? {}, ip: ipDaReq(req),
      });
      return json({ ok: true, horas_devolvidas: Number(data?.horas_devolvidas || 0) }, 200, req);
    }
    if (req.method !== "GET") return json({ error: "Método não permitido" }, 405, req);

    // ---- agenda --------------------------------------------------------------
    const datas = datasDaAgenda();
    const url = new URL(req.url);
    const pedida = url.searchParams.get("data") || "";
    const data = datas.includes(pedida) ? pedida : datas[0];

    const unidades = await unidadesDoCliente(admin, usuario.id);
    const emailPadrao = padraoEmail(usuario.email);

    const [salasR, saldosR, reservasR, nomes] = await Promise.all([
      unidades.length
        ? admin.from("salas").select("id, unidade_id, nome, tipo, capacidade, bases, descricao, fotos, valor_hora, active, contratada")
          .in("unidade_id", unidades).eq("active", true).eq("contratada", false).order("nome")
        : Promise.resolve({ data: [], error: null }),
      admin.from("creditos_ledger").select("unidade_id, tipo, quantidade").ilike("cliente_email", emailPadrao),
      admin.from("reservas").select("id, unidade_id, sala_id, base, start_at, end_at, status, valor, payment_status")
        .ilike("cliente_email", emailPadrao)
        .gte("end_at", new Date(Date.now() - 30 * 86_400_000).toISOString())
        .order("start_at", { ascending: true }).limit(100),
      nomesDasUnidades(admin, unidades),
    ]);
    for (const r of [salasR, saldosR, reservasR]) if (r.error) throw new Error(r.error.message);

    const salas = (salasR.data || []).filter(salaReservavelPeloCliente).map((s) => ({
      id: s.id, unidade_id: s.unidade_id, unidade: nomes.get(s.unidade_id) || "", nome: s.nome, tipo: s.tipo,
      capacidade: s.capacidade, bases: Number(s.bases || 0), descricao: s.descricao || "",
      foto: fotosPublicas(s.fotos)[0] || null,
      valor_hora: Number(s.valor_hora || 0), tipo_credito: tipoCredito(s.tipo),
    }));

    // Horários ocupados do dia (qualquer cliente), só início/fim/sala/base.
    let ocupados: { sala_id: string; base: number | null; start_at: string; end_at: string }[] = [];
    if (salas.length) {
      const inicio = new Date(`${data}T00:00:00-03:00`);
      const fim = new Date(inicio.getTime() + 24 * 3600_000);
      const agora = new Date().toISOString();
      const { data: rs, error } = await admin.from("reservas").select("sala_id, base, start_at, end_at")
        .in("sala_id", salas.map((s) => s.id))
        .lt("start_at", fim.toISOString()).gt("end_at", inicio.toISOString())
        .or(`status.in.(${STATUS_ATIVOS.join(",")}),and(status.eq.aguardando_pagamento,expira_em.gt.${agora})`);
      if (error) throw new Error(`ocupados: ${error.message}`);
      ocupados = rs || [];
    }

    // Saldo por unidade e tipo de crédito.
    const saldos: Record<string, Record<string, number>> = {};
    for (const m of saldosR.data || []) {
      saldos[m.unidade_id] ||= {};
      saldos[m.unidade_id][m.tipo] = (saldos[m.unidade_id][m.tipo] || 0) + Number(m.quantidade || 0);
    }

    const nomeSala = new Map((salasR.data || []).map((s) => [s.id, s.nome]));
    const faltando = (reservasR.data || []).map((r) => r.sala_id).filter((id) => !nomeSala.has(id));
    if (faltando.length) {
      const { data: extras } = await admin.from("salas").select("id, nome").in("id", [...new Set(faltando)]);
      (extras || []).forEach((s) => nomeSala.set(s.id, s.nome));
    }
    const nomesReservas = await nomesDasUnidades(admin, (reservasR.data || []).map((r) => r.unidade_id));
    const reservas = (reservasR.data || [])
      .filter((r) => r.status !== "aguardando_pagamento")
      .map((r) => ({
        id: r.id, unidade: nomesReservas.get(r.unidade_id) || "", sala: nomeSala.get(r.sala_id) || "Sala", base: r.base,
        start_at: r.start_at, end_at: r.end_at, status: r.status, valor: Number(r.valor || 0),
        payment_status: r.payment_status, pode_cancelar: podeCancelar(r),
      }));

    // Desconto de sala do plano por unidade (direitos.descontoSala). A tela usa
    // só para mostrar o valor certo antes de confirmar; quem aplica é a
    // criar-reserva.
    const descontos: Record<string, { sala: number }> = {};
    for (const id of unidades) {
      descontos[id] = { sala: await descontoSalaDoCliente(admin, id, usuario.email) };
    }

    return json({
      hoje: hojeBRT(), data, datas, janela: JANELA_CLIENTE, antecedencia_cancelamento_horas: ANTECEDENCIA_CANCELAMENTO_HORAS,
      unidades: unidades.map((id) => ({ id, nome: nomes.get(id) || "" })),
      salas, ocupados, saldos, descontos, reservas,
    }, 200, req);
  } catch (e) {
    return erroInterno(req, "reservas-cliente", e);
  }
});
