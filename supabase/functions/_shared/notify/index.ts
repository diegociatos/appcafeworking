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
