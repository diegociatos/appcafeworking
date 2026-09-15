// ============================================================================
// Utilidades das Edge Functions da área do cliente (JWT do próprio cliente).
//
// Tudo é filtrado pelo e-mail do login. Comparação sem diferenciar maiúsculas
// (o e-mail pode ter sido digitado com maiúscula no site ou na recepção).
// Erro técnico vai para o log; o cliente recebe mensagem simples.
// ============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { json } from "./cors.ts";
import { padraoEmail } from "./reservaCliente.ts";
import { nomeExibicaoUnidade } from "./unidadeNome.ts";

// deno-lint-ignore no-explicit-any
export type Linha = Record<string, any>;

export const ERRO_GENERICO = "Não foi possível carregar agora. Tente de novo em instantes.";

/** Resposta 500 sem detalhe técnico (o detalhe fica no log da função). */
export function erroInterno(req: Request, contexto: string, e: unknown, mensagem = ERRO_GENERICO): Response {
  console.error(`[${contexto}]`, (e as Error)?.message ?? e);
  return json({ error: mensagem }, 500, req);
}

/** Cadastros de cliente (tabela clientes) com o e-mail do login. */
export async function clientesDoEmail(admin: SupabaseClient, email: string): Promise<Linha[]> {
  const { data, error } = await admin.from("clientes")
    .select("id, unidade_id, nome, documento, plano, fiscal, status, desde, email, telefone, created_at")
    .ilike("email", padraoEmail(email));
  if (error) throw new Error(`clientes: ${error.message}`);
  return data || [];
}

/** Unidades em que o usuário tem acesso de cliente (unidade_members). */
export async function unidadesDoCliente(admin: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await admin.from("unidade_members").select("unidade_id").eq("user_id", userId).eq("role", "cliente");
  if (error) throw new Error(`unidade_members: ${error.message}`);
  return [...new Set((data || []).map((m) => m.unidade_id as string))];
}

/** id da unidade → nome para exibição ("Luxemburgo"). */
export async function nomesDasUnidades(admin: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return new Map();
  const { data } = await admin.from("unidades").select("id, nome").in("id", unicos);
  return new Map((data || []).map((u) => [u.id as string, nomeExibicaoUnidade(u.nome)]));
}
