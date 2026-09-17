// ============================================================================
// EmailRoteador — escolhe o provedor de e-mail de cada invocação.
//
//   Microsoft 365 conectada E ativa (Configurações → Integrações) → Microsoft
//   caso contrário                                                → Resend
//
// A decisão lê public.integracoes_plataforma uma vez e guarda em memória do
// módulo por CACHE_MS, para um laço de e-mails não consultar o banco a cada
// envio. Se a tabela não existir (migration não aplicada) ou a leitura falhar,
// segue no Resend como antes. Uma falha da Microsoft (ex.: token inválido) NÃO
// cai para o Resend: volta { ok:false } para ficar visível em notificacoes.
// ============================================================================

import type { NotificationProvider } from "./NotificationProvider.ts";
import type { OutboundMessage, SendResult } from "./types.ts";
import { EmailProvider } from "./EmailProvider.ts";
import { limparTokenMicrosoft, MicrosoftGraphEmailProvider } from "./MicrosoftGraphEmailProvider.ts";
import { type ArmazemEmail, armazemSupabase, type ConfigMs365, usarMicrosoft } from "../msgraph.ts";
import { adminClient } from "../supabaseAdmin.ts";

export const CACHE_MS = 30_000;

let decisao: { em: number; cfg: ConfigMs365 | null } | null = null;
let armazemPadrao: ArmazemEmail | null = null;

/** Esquece a decisão e o token em memória (use depois de mudar a integração). */
export function limparCacheEmail() {
  decisao = null;
  limparTokenMicrosoft();
}

export interface DepsRoteador {
  armazem?: () => ArmazemEmail;
  resend?: () => NotificationProvider;
  microsoft?: (armazem: ArmazemEmail, cfg: ConfigMs365) => NotificationProvider;
  agora?: () => number;
}

export class EmailRoteador implements NotificationProvider {
  readonly canal = "email" as const;

  constructor(private readonly deps: DepsRoteador = {}) {}

  private armazem(): ArmazemEmail {
    if (this.deps.armazem) return this.deps.armazem();
    armazemPadrao ??= armazemSupabase(adminClient());
    return armazemPadrao;
  }

  /** Config da Microsoft vigente (com cache curto). null = não usar/indisponível. */
  async configVigente(): Promise<ConfigMs365 | null> {
    const agora = (this.deps.agora ?? Date.now)();
    if (decisao && agora - decisao.em < CACHE_MS) return decisao.cfg;
    let cfg: ConfigMs365 | null = null;
    try {
      cfg = await this.armazem().lerConfig();
    } catch (e) {
      console.warn("[email] não leu a integração Microsoft; usando Resend:", (e as Error).message);
      cfg = null;
    }
    decisao = { em: agora, cfg };
    return cfg;
  }

  /** Provedor que vai enviar nesta invocação. */
  async escolher(): Promise<NotificationProvider> {
    const cfg = await this.configVigente();
    if (cfg && usarMicrosoft(cfg)) {
      const criar = this.deps.microsoft ?? ((a, c) => new MicrosoftGraphEmailProvider(a, c));
      return criar(this.armazem(), cfg);
    }
    return (this.deps.resend ?? (() => new EmailProvider()))();
  }

  async enviar(msg: OutboundMessage): Promise<SendResult> {
    return (await this.escolher()).enviar(msg);
  }
}
