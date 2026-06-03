// ============================================================================
// Tipos do módulo de notificações ao cliente.
// ============================================================================

export type Canal = "email" | "whatsapp";

/** Mensagem já renderizada, pronta para o provedor enviar. */
export interface OutboundMessage {
  para: string;        // e-mail (ou telefone)
  nome?: string;
  assunto: string;
  html: string;
  texto?: string;
}

export interface SendResult {
  providerId?: string; // id no provedor (Resend/Meta)
  ok: boolean;
  erro?: string;
}

/** Evento de negócio que gera a notificação. */
export type Evento =
  | "boleto_nova"
  | "boleto_lembrete"
  | "boleto_pago"
  | "boleto_vencido"
  | "correspondencia"
  | "cafe_pedido"
  | "cafe_pronto"
  | "reserva";

export class NotifyError extends Error {
  constructor(message: string, public readonly canal: Canal, public readonly status?: number) {
    super(message);
    this.name = "NotifyError";
  }
}
