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
  replyTo?: string;    // opcional; sem ele vale EMAIL_REPLY_TO
}

export interface SendResult {
  providerId?: string | null; // id no provedor (Resend/Meta); Microsoft Graph não devolve (null)
  ok: boolean;
  erro?: string;
}

/** Evento de negócio que gera a notificação. */
export type Evento =
  | "boleto_nova"
  | "boleto_lembrete"
  | "boleto_pago"
  | "boleto_vencido"
  | "cobranca_nova"
  | "nfse_emitida"
  | "correspondencia"
  | "cafe_pedido"
  | "cafe_pronto"
  | "reserva"
  | "reserva_cancelada"
  | "assinatura_ativa"
  | "renovacao_anual"
  | "cancelamento_confirmado"
  | "documentos_aprovados"
  | "documentos_reprovados"
  | "abertura_preencher"
  | "abertura_pendencia"
  | "abertura_concluida"
  | "convite_acesso"
  | "aviso_equipe"
  | "aviso_parceiro"
  | "parceiro_boas_vindas"
  | "parceiro_recusado";

export class NotifyError extends Error {
  constructor(message: string, public readonly canal: Canal, public readonly status?: number) {
    super(message);
    this.name = "NotifyError";
  }
}
