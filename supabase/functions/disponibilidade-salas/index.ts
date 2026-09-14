// ============================================================================
// Edge Function: disponibilidade-salas  (agenda pública para reserva no site)
//
// GET/POST /functions/v1/disponibilidade-salas?unidade_id=...&data=YYYY-MM-DD
// (deploy com --no-verify-jwt)
//
// Devolve as salas marcadas para reserva online e os intervalos ocupados do dia
// — só início, fim, sala e base. Nenhum dado de quem reservou sai daqui.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { hojeBRT, JANELA_PADRAO, somarMeses } from "../_shared/venda.ts";

const STATUS_OCUPADO = ["solicitada", "confirmada", "checkin"];

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const url = new URL(req.url);
    let unidadeId = url.searchParams.get("unidade_id") || "";
    let data = url.searchParams.get("data") || "";
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      unidadeId = unidadeId || body?.unidade_id || "";
      data = data || body?.data || "";
    }
    if (!unidadeId) return json({ error: "unidade_id é obrigatório." }, 400, req);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return json({ error: "data deve ser YYYY-MM-DD." }, 400, req);

    const hoje = hojeBRT();
    if (data < hoje) return json({ error: "Data no passado." }, 400, req);
    if (data > somarMeses(hoje, 2)) return json({ error: "Reservas online abrem com até 2 meses de antecedência." }, 400, req);

    const admin = adminClient();
    await admin.rpc("liberar_reservas_expiradas").then(() => {}, () => {});

    const { data: unidade } = await admin.from("unidades").select("id, nome").eq("id", unidadeId).maybeSingle();
    if (!unidade) return json({ error: "Unidade inválida." }, 404, req);

    const { data: salas, error: sErr } = await admin
      .from("salas")
      .select("id, nome, tipo, capacidade, bases, descricao, comodidades, fotos, valor_hora")
      .eq("unidade_id", unidadeId)
      .eq("reserva_online", true)
      .eq("active", true)
      .eq("contratada", false)
      .gt("valor_hora", 0)
      .order("nome");
    if (sErr) return json({ error: sErr.message }, 500, req);

    const ids = (salas || []).map((s) => s.id);
    let ocupados: { sala_id: string; base: number | null; start_at: string; end_at: string }[] = [];
    if (ids.length) {
      // dia inteiro em Brasília (UTC-3 fixo)
      const inicio = `${data}T00:00:00-03:00`;
      const fim = new Date(new Date(inicio).getTime() + 24 * 3600_000).toISOString();
      const agora = new Date().toISOString();
      const { data: rs, error: rErr } = await admin
        .from("reservas")
        .select("sala_id, base, start_at, end_at")
        .in("sala_id", ids)
        .lt("start_at", fim)
        .gt("end_at", new Date(inicio).toISOString())
        .or(`status.in.(${STATUS_OCUPADO.join(",")}),and(status.eq.aguardando_pagamento,expira_em.gt.${agora})`);
      if (rErr) return json({ error: rErr.message }, 500, req);
      ocupados = rs || [];
    }

    return json({
      unidade: { id: unidade.id, nome: unidade.nome },
      data,
      janela: JANELA_PADRAO,
      salas: (salas || []).map((s) => ({ ...s, valor_hora: Number(s.valor_hora) })),
      ocupados,
    }, 200, req);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500, req);
  }
});
