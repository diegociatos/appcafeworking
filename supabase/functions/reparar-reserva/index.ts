// ============================================================================
// Edge Function: reparar-reserva  (ferramenta de operação, token interno)
//
// POST ?acao=listar&q=<nome>&data=<YYYY-MM-DD>   header: x-ops-token
//   → lista reservas do site que batem (status, payment_status, horário, Asaas).
//
// POST ?acao=reconfirmar&id=<reservaId>          header: x-ops-token
//   → quando o Pix foi pago DEPOIS dos 30 min (horário liberado) e o pagamento
//     entrou sem reserva: se o horário ainda estiver LIVRE, reconfirma a reserva
//     (status 'confirmada') pela RPC oficial confirmar_reserva_paga e registra a
//     receita no financeiro. Só mexe em reserva com asaas_payment_id (foi paga).
//     Se o horário já estiver ocupado, devolve 'sem_horario' (não dá overbooking).
//
// Gate por OPS_TOKEN. Deploy com --no-verify-jwt.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { registrarLancamentoReserva } from "../_shared/lancamentoReserva.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405, req);

  const esperado = Deno.env.get("OPS_TOKEN") || "";
  if (!esperado || req.headers.get("x-ops-token") !== esperado) {
    return json({ error: "Não autorizado" }, 401, req);
  }

  const url = new URL(req.url);
  const acao = url.searchParams.get("acao") || "listar";
  const admin = adminClient();

  const COLS = "id, status, payment_status, cliente_nome, cliente_email, sala_id, unidade_id, start_at, end_at, valor, desconto_plano_pct, asaas_payment_id, expira_em, origem, created_at";

  if (acao === "listar") {
    const q = (url.searchParams.get("q") || "").trim();
    const data = (url.searchParams.get("data") || "").trim(); // YYYY-MM-DD
    let query = admin.from("reservas").select(COLS).order("created_at", { ascending: false }).limit(30);
    if (q) query = query.ilike("cliente_nome", `%${q}%`);
    if (data) query = query.gte("start_at", `${data}T00:00:00-03:00`).lte("start_at", `${data}T23:59:59-03:00`);
    const { data: rows, error } = await query;
    if (error) return json({ error: error.message }, 500, req);
    return json({ reservas: rows || [] }, 200, req);
  }

  if (acao === "reconfirmar") {
    const id = (url.searchParams.get("id") || "").trim();
    if (!id) return json({ error: "id obrigatório" }, 400, req);
    const { data: r } = await admin.from("reservas").select(COLS).eq("id", id).maybeSingle();
    if (!r) return json({ error: "reserva não encontrada" }, 404, req);
    if (!r.asaas_payment_id) return json({ error: "reserva sem pagamento Asaas; não reconfirmo", reserva: r }, 400, req);
    if (r.status === "confirmada") return json({ resultado: "ja_confirmada", reserva: r }, 200, req);

    // Reabilita a reserva cancelada/sem-horário para a RPC poder reconfirmar:
    // a RPC só aceita 'aguardando_pagamento' ou ('cancelada' + payment_status 'expirado').
    if (r.status === "cancelada" && r.payment_status !== "expirado") {
      await admin.from("reservas").update({ payment_status: "expirado" }).eq("id", id);
    }
    // A RPC re-checa conflito de horário e confirma SÓ se estiver livre.
    const { data: resultado, error } = await admin.rpc("confirmar_reserva_paga", { p_id: id });
    if (error) return json({ error: `confirmar_reserva_paga: ${error.message}` }, 500, req);

    let lancamento = "nao";
    if (resultado === "confirmada") {
      const { data: sala } = await admin.from("salas").select("nome, tipo").eq("id", r.sala_id).maybeSingle();
      try {
        await registrarLancamentoReserva(admin, {
          reservaId: String(r.id), unidadeId: r.unidade_id, salaNome: sala?.nome, salaTipo: sala?.tipo,
          clienteNome: r.cliente_nome, valor: Number(r.valor || 0), status: "pago",
          quando: r.start_at, descontoPct: r.desconto_plano_pct || 0,
        });
        lancamento = "registrado";
      } catch (e) {
        lancamento = `falhou: ${(e as Error).message}`;
      }
    }
    const { data: depois } = await admin.from("reservas").select(COLS).eq("id", id).maybeSingle();
    return json({ resultado, lancamento, reserva: depois }, 200, req);
  }

  return json({ error: "ação desconhecida (listar | reconfirmar)" }, 400, req);
});
