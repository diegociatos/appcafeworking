// ============================================================================
// Trilha de auditoria — helper compartilhado das Edge Functions.
//
// registrarAuditoria(admin, evento): grava uma linha em audit_logs usando o
// admin client (service_role). NUNCA lança: auditoria não pode derrubar a
// operação principal — se falhar, apenas loga no console.
// ============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface EventoAuditoria {
  unidade_id?: string | null;
  ator_id?: string | null;
  ator_email?: string | null;
  acao: string;                          // ex.: 'reserva.criada'
  entidade?: string | null;              // ex.: 'reserva'
  entidade_id?: string | null;
  detalhe?: Record<string, unknown>;
  ip?: string | null;
}

/** Registra um evento na trilha de auditoria. Use sempre o admin client. */
export async function registrarAuditoria(admin: SupabaseClient, ev: EventoAuditoria): Promise<void> {
  try {
    await admin.from("audit_logs").insert({
      unidade_id: ev.unidade_id ?? null,
      ator_id: ev.ator_id ?? null,
      ator_email: ev.ator_email ?? null,
      acao: ev.acao,
      entidade: ev.entidade ?? null,
      entidade_id: ev.entidade_id ?? null,
      detalhe: ev.detalhe ?? {},
      ip: ev.ip ?? null,
    });
  } catch (e) {
    console.error("[auditoria] falha ao registrar", ev.acao, e);
  }
}

/** IP do cliente a partir dos headers padrão (proxy/Cloudflare). */
export function ipDaReq(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") || null;
}
