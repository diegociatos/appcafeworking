// ============================================================================
// Permissão do dinheiro nas Edge Functions.
//
// Boleto, cobrança, nota fiscal, certificado, integração bancária e estorno são
// do master ou do financeiro da unidade (ou do admin da plataforma). Recepção e
// contabilidade recebem 403 com mensagem para pedir ao financeiro.
//
// A checagem usa o service_role (platform_admins + unidade_members) e não a RPC
// is_unidade_financeiro: assim a função funciona mesmo se for publicada antes
// da migration 20260917160000.
// ============================================================================

import { json } from "./cors.ts";

// Só o pedaço do supabase-js usado aqui (sem importar o pacote: o teste roda sem rede).
// deno-lint-ignore no-explicit-any
type ClienteAdmin = { from(tabela: string): any };

export const PAPEIS_DO_FINANCEIRO = ["master", "financeiro"] as const;

export const MSG_SO_FINANCEIRO = "Só o master ou o financeiro da unidade pode fazer isso. Peça a alguém do financeiro.";

/** O papel do vínculo (unidade_members.role) pode mexer em dinheiro? */
export function papelDoFinanceiro(role: unknown): boolean {
  return (PAPEIS_DO_FINANCEIRO as readonly string[]).includes(String(role ?? ""));
}

/** Admin da plataforma, ou master/financeiro da unidade. */
export async function podeMexerNoDinheiro(
  admin: ClienteAdmin, userId: string | null | undefined, unidadeId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false;
  const { data: pa } = await admin.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
  if (pa) return true;
  if (!unidadeId) return false;
  const { data: vinculos } = await admin.from("unidade_members").select("role")
    .eq("user_id", userId).eq("unidade_id", unidadeId);
  return (vinculos || []).some((v: { role: unknown }) => papelDoFinanceiro(v.role));
}

/** Resposta 403 padrão. `acao` completa a frase: "Emitir nota fiscal: só o master…". */
export function recusaSemFinanceiro(acao?: string, req?: Request): Response {
  const error = acao ? `${acao}: ${MSG_SO_FINANCEIRO.charAt(0).toLowerCase()}${MSG_SO_FINANCEIRO.slice(1)}` : MSG_SO_FINANCEIRO;
  return json({ error, codigo: "SO_FINANCEIRO" }, 403, req);
}
