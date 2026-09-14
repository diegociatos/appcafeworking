// ============================================================================
// Contratos de adesão — versão vigente, conferência e registro do aceite.
// ============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ipDaReq } from "./audit.ts";

export interface ContratoVigente {
  id: string;
  unidade_id: string | null;
  categoria: string;
  versao: number;
  titulo: string;
  corpo: string;
  hash: string;
}

/** Versão vigente da categoria: a da própria unidade tem preferência sobre a geral. */
export async function contratoVigente(
  admin: SupabaseClient, unidadeId: string, categoria: string,
): Promise<ContratoVigente | null> {
  const { data, error } = await admin
    .from("contratos_modelos")
    .select("id, unidade_id, categoria, versao, titulo, corpo, hash")
    .eq("categoria", categoria)
    .eq("vigente", true)
    .or(`unidade_id.eq.${unidadeId},unidade_id.is.null`);
  if (error) throw new Error(`contratos_modelos: ${error.message}`);
  const linhas = (data || []) as ContratoVigente[];
  return linhas.find((c) => c.unidade_id === unidadeId) || linhas.find((c) => c.unidade_id === null) || null;
}

/**
 * O cliente só compra aceitando exatamente o texto vigente: id e hash precisam
 * bater. Se o contrato mudou entre abrir a página e pagar, o aceite é recusado
 * e o front mostra a versão nova.
 */
export function aceiteConfere(vigente: ContratoVigente, aceite: unknown): boolean {
  const a = aceite as { modelo_id?: unknown; hash?: unknown } | null;
  return !!a && a.modelo_id === vigente.id && a.hash === vigente.hash;
}

export interface DadosAceite {
  unidade_id: string;
  cliente_nome: string;
  cliente_email: string;
  cliente_documento?: string | null;
  plano_id?: string | null;
  plano_nome?: string | null;
  valor?: number | null;
  recorrencia?: string | null;
  prazo_minimo_meses?: number | null;
  referencia_tipo: "signup" | "reserva";
  referencia_id: string;
  origem: string;
}

/** Grava a prova do aceite. Lança em caso de falha — sem prova, não há venda. */
export async function registrarAceite(
  admin: SupabaseClient, req: Request, vigente: ContratoVigente, dados: DadosAceite,
): Promise<string> {
  const { data, error } = await admin
    .from("aceites_contrato")
    .insert({
      modelo_id: vigente.id,
      categoria: vigente.categoria,
      versao: vigente.versao,
      hash: vigente.hash,
      ...dados,
      ip: ipDaReq(req),
      user_agent: (req.headers.get("user-agent") || "").slice(0, 500),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Falha ao registrar o aceite: ${error?.message}`);
  return data.id as string;
}
