// ============================================================================
// Edge Function: enviar-email  (genérica, agnóstica de evento)
//
// Dois modos:
//  A) { notificacao_id }            → processa uma linha já enfileirada (outbox)
//  B) { unidade_id, evento, email,  → envia na hora e registra
//       cliente, dados, canal? }
//
// Quem pode chamar (deploy --no-verify-jwt; a função confere):
//   • backend com a service_role no Authorization; ou
//   • equipe da unidade (master/financeiro/recepção) ou admin da plataforma,
//     só com os eventos de aviso ao cliente abaixo.
// Antes o endpoint não conferia ninguém: qualquer um com a chave pública podia
// disparar e-mail com a marca do CafeWorking para qualquer endereço.
//
// Renderiza o template, respeita a preferência do cliente (lembretes/reservas),
// chama o provedor (Resend) e grava o status real em `notificacoes`.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { ehEquipe } from "../_shared/assinaturas.ts";
import { getNotifProvider, NotifyError, preferenciaPermite, renderTemplate, enviarCopiasFinanceiras, type Canal, type Evento } from "../_shared/notify/index.ts";
import { emailValido } from "../_shared/venda.ts";
import { anexosFinanceiros } from "../_shared/notify/anexosFinanceiros.ts";

/** Avisos ao cliente que a equipe pode disparar pelo app. */
const EVENTOS_EQUIPE: Evento[] = [
  "boleto_nova", "boleto_lembrete", "boleto_pago", "boleto_vencido", "cobranca_nova", "nfse_emitida",
  "correspondencia", "cafe_pedido", "cafe_pronto", "reserva",
];

function ehServiceRole(req: Request): boolean {
  const chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const auth = req.headers.get("Authorization") || "";
  return !!chave && auth === `Bearer ${chave}`;
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405, req);

  const admin = adminClient();
  try {
    const body = await req.json().catch(() => ({}));
    const backend = ehServiceRole(req);
    // deno-lint-ignore no-explicit-any
    let row: any;

    if (body.notificacao_id) {
      const { data } = await admin.from("notificacoes").select("*").eq("id", body.notificacao_id).maybeSingle();
      if (!data) return json({ error: "Notificação não encontrada" }, 404, req);
      if (!backend && !(EVENTOS_EQUIPE.includes(data.evento) && await ehEquipe(req, data.unidade_id))) {
        return json({ error: "Sem permissão para enviar este aviso." }, 403, req);
      }
      row = data;
    } else {
      if (!body.unidade_id || !body.evento || !body.email) {
        return json({ error: "Campos obrigatórios: unidade_id, evento, email" }, 400, req);
      }
      if (!emailValido(body.email)) return json({ error: "E-mail do cliente inválido." }, 400, req);
      if (!backend && !(EVENTOS_EQUIPE.includes(body.evento) && await ehEquipe(req, body.unidade_id))) {
        return json({ error: "Sem permissão para enviar este aviso." }, 403, req);
      }
      const canal: Canal = body.canal ?? "email";
      const email = String(body.email).trim();
      if (!(await preferenciaPermite(admin, email, body.evento))) {
        const { data } = await admin.from("notificacoes").insert({
          unidade_id: body.unidade_id, cliente_nome: body.cliente ?? null, destinatario: email, canal,
          evento: body.evento, template: body.evento, dados: body.dados ?? {}, status: "cancelado",
          erro: "cliente optou por não receber este tipo de e-mail",
        }).select().single();
        return json({ notificacao: data, enviado: false, ignorado: true }, 200, req);
      }
      const ins = {
        unidade_id: body.unidade_id, cliente_nome: body.cliente ?? null, destinatario: email,
        canal, evento: body.evento, template: body.evento, dados: body.dados ?? {}, status: "fila", tracking_token: crypto.randomUUID(),
      };
      const { data, error } = await admin.from("notificacoes").insert(ins).select().single();
      if (error) {
        console.error("enviar-email: enfileirar", error.message);
        return json({ error: "Não foi possível registrar o aviso." }, 500, req);
      }
      row = data;
    }

    // Renderiza + envia
    const baseRastreio = `${Deno.env.get("SUPABASE_URL") || ""}/functions/v1/email-rastreamento`;
    const dados = { ...(row.dados ?? {}), cliente: row.cliente_nome, email: row.destinatario,
      openUrl: row.tracking_token ? `${baseRastreio}?token=${row.tracking_token}&evento=abrir` : undefined,
      confirmUrl: row.tracking_token ? `${baseRastreio}?token=${row.tracking_token}&evento=confirmar` : undefined };
    const msg = renderTemplate(row.evento as Evento, dados);
    const provider = getNotifProvider(row.canal as Canal);
    const anexos = row.canal === "email" ? await anexosFinanceiros(row.evento as Evento, row.dados ?? {}) : [];
    const result = await provider.enviar({ ...msg, para: row.destinatario, ...(anexos.length ? { anexos } : {}) });

    const patch = result.ok
      ? { status: "enviado", assunto: msg.assunto, provider_id: result.providerId, sent_at: new Date().toISOString(), erro: null }
      : { status: "erro", assunto: msg.assunto, erro: result.erro };
    const { data: updated } = await admin.from("notificacoes").update(patch).eq("id", row.id).select().single();

    if (result.ok && row.canal === "email" && !body.sem_copias) await enviarCopiasFinanceiras(admin, {
      unidade_id: row.unidade_id, evento: row.evento as Evento, email: row.destinatario, cliente: row.cliente_nome, dados: row.dados ?? {},
    });
    return json({ notificacao: updated, enviado: result.ok }, result.ok ? 200 : 502, req);
  } catch (e) {
    if (e instanceof NotifyError) {
      console.error("enviar-email:", e.message);
      return json({ error: "O envio de e-mails está indisponível no momento.", canal: e.canal }, e.status ?? 502, req);
    }
    console.error("enviar-email:", e);
    return json({ error: "Não foi possível enviar o aviso agora." }, 500, req);
  }
});
