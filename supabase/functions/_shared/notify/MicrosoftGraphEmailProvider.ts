// ============================================================================
// MicrosoftGraphEmailProvider — envio pela Microsoft 365 (Graph /me/sendMail)
//
// Usa a conta conectada em Configurações → Integrações (OAuth delegado) e envia
// "como" a caixa configurada (envia_como, ex.: envio@grupociatos.com.br). A
// lógica de OAuth/armazenamento está em ../msgraph.ts.
//
// • O access token é renovado uma vez e reaproveitado enquanto vale (cache do
//   módulo, com folga de 2 min), então um laço de e-mails não renova a cada envio.
// • Graph não devolve id da mensagem: providerId = null.
// • Erro vira { ok:false, erro:"Microsoft <status>: <mensagem>" } — inclusive
//   token inválido/expirado. Não cai para o Resend: a falha fica registrada em
//   notificacoes para a equipe ver e reconectar a conta.
// • `texto` (versão sem HTML) não é usado pelo Graph.
// ============================================================================

import type { NotificationProvider } from "./NotificationProvider.ts";
import type { OutboundMessage, SendResult } from "./types.ts";
import {
  type ArmazemEmail, type ConfigMs365, ErroMicrosoft, type FetchFn,
  enviarSendMail, montarSendMail, renovarAccessToken,
} from "../msgraph.ts";

const FOLGA_MS = 2 * 60 * 1000;
let tokenCache: { chave: string; token: string; expiraEm: number } | null = null;

/** Esquece o access token em memória (após desconectar/reconectar ou nos testes). */
export function limparTokenMicrosoft() {
  tokenCache = null;
}

const chaveDoToken = (cfg: ConfigMs365) => `${cfg.tenant_id}|${cfg.client_id}|${cfg.conectado_em ?? ""}`;

export class MicrosoftGraphEmailProvider implements NotificationProvider {
  readonly canal = "email" as const;

  constructor(
    private readonly armazem: ArmazemEmail,
    private readonly cfg: ConfigMs365,
    private readonly fetchFn: FetchFn = fetch,
    private readonly replyToPadrao = Deno.env.get("EMAIL_REPLY_TO") ?? "",
  ) {}

  /** Caixa que aparece como remetente. */
  get remetente(): string {
    return this.cfg.envia_como || this.cfg.conta_email || "";
  }

  private async token(): Promise<string> {
    const chave = chaveDoToken(this.cfg);
    if (tokenCache && tokenCache.chave === chave && tokenCache.expiraEm - FOLGA_MS > Date.now()) return tokenCache.token;
    const novo = await renovarAccessToken(this.armazem, this.cfg, this.fetchFn);
    tokenCache = { chave, ...novo };
    return novo.token;
  }

  async enviar(msg: OutboundMessage): Promise<SendResult> {
    try {
      const corpo = montarSendMail(
        { para: msg.para, assunto: msg.assunto, html: msg.html, replyTo: msg.replyTo || this.replyToPadrao || undefined, anexos: msg.anexos },
        this.cfg.envia_como,
      );
      await enviarSendMail(await this.token(), corpo, this.fetchFn);
      return { ok: true, providerId: null };
    } catch (e) {
      // Token recusado pelo Graph: não reaproveita na próxima tentativa.
      if (e instanceof ErroMicrosoft && e.status === 401) limparTokenMicrosoft();
      const erro = e instanceof ErroMicrosoft ? e.message : `Microsoft: ${(e as Error)?.message ?? String(e)}`;
      return { ok: false, erro };
    }
  }
}
