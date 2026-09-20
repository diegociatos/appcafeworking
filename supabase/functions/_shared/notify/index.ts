// ============================================================================
// Registry dos canais de notificação.
// ============================================================================

import type { NotificationProvider } from "./NotificationProvider.ts";
import { type Canal, NotifyError } from "./types.ts";
import { EmailRoteador } from "./EmailRoteador.ts";
import { WhatsAppProvider } from "./WhatsAppProvider.ts";

export function getNotifProvider(canal: Canal): NotificationProvider {
  switch (canal) {
    case "email":
      // Microsoft 365 quando conectada e ativa; senão Resend (decisão em cache curto).
      return new EmailRoteador();
    case "whatsapp":
      return new WhatsAppProvider();
    default:
      throw new NotifyError(`Canal não suportado: ${canal}`, canal);
  }
}

export { renderTemplate } from "./templates.ts";
export { NotifyError } from "./types.ts";
export { limparCacheEmail } from "./EmailRoteador.ts";
export type { Canal, Evento } from "./types.ts";

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderTemplate } from "./templates.ts";
import type { Evento } from "./types.ts";
import { preferenciaPermite } from "./preferencias.ts";
import { permiteCopiasFinanceiras, normalizarCopias } from "./contatosFinanceiros.ts";
export { categoriaOpcional, deveEnviar, preferenciaPermite } from "./preferencias.ts";

/**
 * Dispara uma notificação (registra em `notificacoes` + envia pelo provedor).
 * Best-effort: nunca lança — devolve { ok, erro? }. Use nos emissores (cobrança,
 * NFS-e) para avisar o cliente sem quebrar a operação principal.
 */
export async function dispatchNotificacao(
  admin: SupabaseClient,
  opts: { unidade_id: string; evento: Evento; email?: string; cliente?: string; dados?: Record<string, unknown>; canal?: Canal; copiaFinanceira?: boolean },
): Promise<{ ok: boolean; erro?: string; ignorado?: boolean }> {
  const canal: Canal = opts.canal ?? "email";
  if (!opts.email) return { ok: false, erro: "destinatário sem e-mail" };
  let rowId: string | null = null;
  try {
    // Avisos opcionais (lembrete, reserva) respeitam a escolha do cliente.
    if (!(await preferenciaPermite(admin, opts.email, opts.evento))) {
      return { ok: false, ignorado: true, erro: "cliente optou por não receber este tipo de e-mail" };
    }
    const { data: row } = await admin.from("notificacoes").insert({
      unidade_id: opts.unidade_id, cliente_nome: opts.cliente ?? null, destinatario: opts.email,
      canal, evento: opts.evento, template: opts.evento, dados: opts.dados ?? {}, status: "fila",
    }).select("id").single();
    rowId = row?.id ?? null;

    const msg = renderTemplate(opts.evento, { ...(opts.dados ?? {}), cliente: opts.cliente, email: opts.email });
    const provider = getNotifProvider(canal);
    const result = await provider.enviar({ ...msg, para: opts.email });

    if (rowId) {
      await admin.from("notificacoes").update(
        result.ok
          ? { status: "enviado", assunto: msg.assunto, provider_id: result.providerId, sent_at: new Date().toISOString(), erro: null }
          : { status: "erro", assunto: msg.assunto, erro: result.erro },
      ).eq("id", rowId);
    }
    if (result.ok && canal === "email" && !opts.copiaFinanceira) await enviarCopiasFinanceiras(admin, opts);
    return { ok: result.ok, erro: result.erro };
  } catch (e) {
    const erro = (e as Error).message ?? String(e);
    if (rowId) { try { await admin.from("notificacoes").update({ status: "erro", erro }).eq("id", rowId); } catch (_) { /* */ } }
    return { ok: false, erro };
  }
}

export async function enviarCopiasFinanceiras(admin: SupabaseClient, opts: {
  unidade_id: string; evento: Evento; email?: string; cliente?: string; dados?: Record<string, unknown>;
}, enviar = dispatchNotificacao): Promise<void> {
  if (!opts.email || !permiteCopiasFinanceiras(opts.evento)) return;
  try {
    // Só o cadastro da mesma unidade e do mesmo titular; ambiguidade não expande destinatários.
    const email = opts.email.trim().replace(/[\\%_]/g, "\\$&");
    const { data, error } = await admin.from("clientes").select("emails_adicionais")
      .eq("unidade_id", opts.unidade_id).ilike("email", email).limit(2);
    if (error || data?.length !== 1) return;
    for (const destino of normalizarCopias(opts.email, data[0].emails_adicionais)) {
      await enviar(admin, { ...opts, email: destino, canal: "email", copiaFinanceira: true });
    }
  } catch { /* Falha de cópia não repete cobrança nem bloqueia envio principal. */ }
}
