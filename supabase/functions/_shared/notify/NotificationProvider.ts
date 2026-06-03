// ============================================================================
// NotificationProvider — interface comum (adapter pattern), igual aos bancos.
// As Edge Functions falam só com esta abstração; trocar/adicionar canal
// (e-mail, WhatsApp, SMS, push) não muda a function nem o front-end.
// ============================================================================

import type { Canal, OutboundMessage, SendResult } from "./types.ts";

export interface NotificationProvider {
  readonly canal: Canal;
  enviar(msg: OutboundMessage): Promise<SendResult>;
}
