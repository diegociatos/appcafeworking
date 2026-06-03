// ============================================================================
// EmailProvider — Resend  (IMPLEMENTAÇÃO DE REFERÊNCIA)
//
// Envia e-mail transacional via API do Resend. A API key (RESEND_API_KEY) e o
// remetente (EMAIL_FROM, ex.: "CafeWorking <nao-responda@grupociatos.com.br>")
// ficam nos secrets do Supabase. Configure SPF/DKIM no DNS do domínio para
// não cair em spam.
//
// Docs: https://resend.com/docs/api-reference/emails/send-email
// ============================================================================

import type { NotificationProvider } from "./NotificationProvider.ts";
import { NotifyError, type OutboundMessage, type SendResult } from "./types.ts";

export class EmailProvider implements NotificationProvider {
  readonly canal = "email" as const;

  constructor(
    private readonly apiKey = Deno.env.get("RESEND_API_KEY") ?? "",
    private readonly from = Deno.env.get("EMAIL_FROM") ?? "CafeWorking <onboarding@resend.dev>",
    private readonly replyTo = Deno.env.get("EMAIL_REPLY_TO") ?? "",
  ) {
    if (!this.apiKey) throw new NotifyError("RESEND_API_KEY não configurada", "email");
  }

  async enviar(msg: OutboundMessage): Promise<SendResult> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [msg.para],
        subject: msg.assunto,
        html: msg.html,
        ...(msg.texto ? { text: msg.texto } : {}),
        ...(this.replyTo ? { reply_to: this.replyTo } : {}),
      }),
    });

    if (!res.ok) {
      const detalhe = await res.text().catch(() => "");
      return { ok: false, erro: `Resend ${res.status}: ${detalhe}` };
    }
    const json = await res.json();
    return { ok: true, providerId: json?.id };
  }
}
