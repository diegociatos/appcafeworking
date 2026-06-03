// ============================================================================
// WhatsAppProvider — Meta Cloud API  [STUB — Fase 2]
//
// WhatsApp exige: conta Business verificada, templates (HSM) aprovados pela
// Meta para mensagens proativas, opt-in do cliente e respeito à janela de 24h.
// Por isso fica para depois — a assinatura já está pronta.
//
// Fluxo (resumo):
//   POST https://graph.facebook.com/v20.0/{phone_number_id}/messages
//   headers: Authorization: Bearer WHATSAPP_TOKEN
//   body: { messaging_product:"whatsapp", to, type:"template",
//           template:{ name, language, components:[...] } }
// ============================================================================

import type { NotificationProvider } from "./NotificationProvider.ts";
import { NotifyError, type OutboundMessage, type SendResult } from "./types.ts";

export class WhatsAppProvider implements NotificationProvider {
  readonly canal = "whatsapp" as const;

  enviar(_msg: OutboundMessage): Promise<SendResult> {
    throw new NotifyError("WhatsAppProvider ainda não implementado (Fase 2)", "whatsapp", 501);
  }
}
