// ============================================================================
// Edge Function: reenviar-boleto-email
//
// POST /functions/v1/reenviar-boleto-email   body: { boleto_id, email? }
//
// Reenvia o e-mail de um boleto JÁ EMITIDO (com o PDF anexo) ao sacado, SEM
// registrar/emitir de novo no banco. Útil quando o boleto foi criado antes de o
// envio automático existir, ou quando o cliente pede a 2ª via.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { userClient, adminClient } from "../_shared/supabaseAdmin.ts";
import { podeMexerNoDinheiro, recusaSemFinanceiro } from "../_shared/permissoes.ts";
import { dispatchNotificacao } from "../_shared/notify/index.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const body = await req.json();
    if (!body?.boleto_id) return json({ error: "Campo obrigatório ausente: boleto_id" }, 400);

    // 1) usuário autenticado
    const user = userClient(req);
    const { data: auth } = await user.auth.getUser();
    if (!auth?.user) return json({ error: "Não autenticado" }, 401);

    // 2) boleto (RLS do usuário garante acesso à unidade)
    const { data: boleto, error } = await user
      .from("boletos")
      .select("id, unidade_id, sacado, sacado_email, valor, vencimento, instrucoes, pdf_url, linha_digitavel, pix_copia_cola, status")
      .eq("id", body.boleto_id)
      .single();
    if (error || !boleto) return json({ error: "Boleto não encontrado ou sem acesso" }, 403);

    // 3) só quem mexe no dinheiro da unidade
    const admin = adminClient();
    if (!(await podeMexerNoDinheiro(admin, auth.user.id, boleto.unidade_id))) {
      return recusaSemFinanceiro("Reenviar o boleto");
    }

    const email = String(body.email || boleto.sacado_email || "").trim();
    if (!email) {
      return json({ ok: false, detalhe: "Este boleto não tem e-mail do sacado. Informe um e-mail para reenviar." }, 200);
    }

    await dispatchNotificacao(admin, {
      unidade_id: boleto.unidade_id, evento: "boleto_nova", email, cliente: boleto.sacado,
      dados: {
        valor: boleto.valor, vencimento: boleto.vencimento, descricao: boleto.instrucoes ?? "",
        pdfUrl: boleto.pdf_url ?? null,
        linhaDigitavel: boleto.linha_digitavel ?? null,
        pixCopiaCola: boleto.pix_copia_cola ?? null,
      },
    });
    return json({ ok: true, email }, 200);
  } catch (e) {
    console.error(e);
    return json({ ok: false, detalhe: (e as Error).message ?? "Erro interno" }, 200);
  }
});
