// ============================================================================
// Edge Function: criar-reserva  (criação transacional e segura de reserva)
//
// POST /functions/v1/criar-reserva
// body: { unidade_id, sala_id, cliente_id?, cliente_nome, cliente_email?,
//         start_at, end_at, base?, origem?, valor? }
//
// Autorização por papel:
//   • staff (master/recepcao/financeiro) ou platform_admin → reserva para
//     qualquer cliente da unidade;
//   • cliente final → só para si mesmo (cliente_email = e-mail do JWT).
// A não-corrida e o conflito são garantidos no banco (criar_reserva_segura).
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { userClient, adminClient } from "../_shared/supabaseAdmin.ts";
import { registrarAuditoria, ipDaReq } from "../_shared/audit.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const b = await req.json();
    for (const k of ["unidade_id", "sala_id", "cliente_nome", "start_at", "end_at"]) {
      if (!b?.[k]) return json({ error: `Campo obrigatório ausente: ${k}` }, 400);
    }

    const user = userClient(req);
    const { data: auth } = await user.auth.getUser();
    if (!auth?.user) return json({ error: "Não autenticado" }, 401);
    const email = (auth.user.email || "").toLowerCase();
    const admin = adminClient();

    // Papel do usuário na unidade.
    const { data: pa } = await admin.from("platform_admins").select("user_id").eq("user_id", auth.user.id).maybeSingle();
    const { data: mems } = await admin.from("unidade_members").select("role").eq("user_id", auth.user.id).eq("unidade_id", b.unidade_id);
    const ehAdmin = Boolean(pa);
    const ehStaff = (mems || []).some((m) => m.role !== "cliente");
    const ehCliente = (mems || []).some((m) => m.role === "cliente");

    if (!ehAdmin && !ehStaff && !ehCliente) {
      return json({ error: "Sem acesso a esta unidade." }, 403);
    }
    // Cliente só reserva para si mesmo.
    if (!ehAdmin && !ehStaff) {
      const alvo = String(b.cliente_email || "").toLowerCase();
      if (!alvo || alvo !== email) {
        return json({ error: "Como cliente, você só pode reservar para si mesmo." }, 403);
      }
    }

    const { data, error } = await admin.rpc("criar_reserva_segura", {
      p_id: b.id ?? null,
      p_unidade_id: b.unidade_id,
      p_sala_id: b.sala_id,
      p_cliente_id: b.cliente_id ?? null,
      p_cliente_nome: b.cliente_nome,
      p_cliente_email: b.cliente_email ?? null,
      p_start_at: b.start_at,
      p_end_at: b.end_at,
      p_base: b.base ?? null,
      p_origem: b.origem ?? "recepcao",
      p_valor: b.valor ?? null,
    });

    if (error) {
      const msg = error.message || "";
      const amigavel: Record<string, string> = {
        CONFLITO: "Esse horário/base já está reservado para este espaço.",
        SALA_CONTRATADA: "Esta sala está em locação fixa e não aceita reservas.",
        SALA_INATIVA: "Esta sala está inativa.",
        BASE_INVALIDA: "Base de trabalho inválida para esta sala.",
        PERIODO_INVALIDO: "Período inválido (início depois do fim).",
        SALA_INEXISTENTE: "Sala não encontrada.",
        SALA_DE_OUTRA_UNIDADE: "Sala não pertence a esta unidade.",
      };
      const chave = Object.keys(amigavel).find((k) => msg.includes(k));
      const status = msg.includes("CONFLITO") ? 409 : 400;
      return json({ error: chave ? amigavel[chave] : `Falha ao reservar: ${msg}` }, status);
    }

    await registrarAuditoria(admin, {
      unidade_id: b.unidade_id,
      ator_id: auth.user.id,
      ator_email: email,
      acao: "reserva.criada",
      entidade: "reserva",
      entidade_id: data?.id ?? null,
      detalhe: {
        sala_id: b.sala_id, base: b.base ?? null, start_at: b.start_at, end_at: b.end_at,
        cliente_nome: b.cliente_nome, cliente_email: b.cliente_email ?? null,
        origem: b.origem ?? "recepcao", valor: data?.valor ?? b.valor ?? null,
      },
      ip: ipDaReq(req),
    });

    return json({ ok: true, reserva: data }, 201);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500);
  }
});
