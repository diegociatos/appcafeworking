// ============================================================================
// Registry dos canais de notificação.
// ============================================================================

import type { NotificationProvider } from "./NotificationProvider.ts";
import { type Canal, NotifyError } from "./types.ts";
import { EmailProvider } from "./EmailProvider.ts";
import { WhatsAppProvider } from "./WhatsAppProvider.ts";

export function getNotifProvider(canal: Canal): NotificationProvider {
  switch (canal) {
    case "email":
      return new EmailProvider();
    case "whatsapp":
      return new WhatsAppProvider();
    default:
      throw new NotifyError(`Canal não suportado: ${canal}`, canal);
  }
}

export { renderTemplate } from "./templates.ts";
export { NotifyError } from "./types.ts";
export type { Canal, Evento } from "./types.ts";

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderTemplate } from "./templates.ts";
import type { Canal, Evento } from "./types.ts";

/**
 * Dispara uma notificação (registra em `notificacoes` + envia pelo provedor).
 * Best-effort: nunca lança — devolve { ok, erro? }. Use nos emissores (cobrança,
 * NFS-e) para avisar o cliente sem quebrar a operação principal.
 */
export async function dispatchNotificacao(
  admin: SupabaseClient,
  opts: { unidade_id: string; evento: Evento; email?: string; cliente?: string; dados?: Record<string, unknown>; canal?: Canal },
): Promise<{ ok: boolean; erro?: string }> {
  const canal: Canal = opts.canal ?? "email";
  if (!opts.email) return { ok: false, erro: "destinatário sem e-mail" };
  let rowId: string | null = null;
  try {
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
    return { ok: result.ok, erro: result.erro };
  } catch (e) {
    const erro = (e as Error).message ?? String(e);
    if (rowId) { try { await admin.from("notificacoes").update({ status: "erro", erro }).eq("id", rowId); } catch (_) { /* */ } }
    return { ok: false, erro };
  }
}
