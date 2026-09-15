// ============================================================================
// Disponibilidade de sala privativa para venda pelo site.
//
// Uma sala privativa vendida pelo site é um plano por tamanho ("sala para 4
// pessoas"); a sala exata é atribuída pela equipe na entrega (termo de entrega,
// contrato de sala privativa 1.3). Enquanto não atribui, a venda já ocupa uma
// vaga daquele tamanho.
// ============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { vagasDeSala } from "./catalogo.ts";

const JANELA_COMPRA_MS = 48 * 3600_000;

export async function vagasSalaPrivativa(
  admin: SupabaseClient, unidadeId: string, capacidade: number, planoId: string,
): Promise<number> {
  const [livres, vendidas, andamento] = await Promise.all([
    admin.from("salas").select("id", { count: "exact", head: true })
      .eq("unidade_id", unidadeId).eq("tipo", "Privativa").eq("active", true).eq("contratada", false)
      .eq("capacidade", capacidade),
    admin.from("assinaturas").select("id", { count: "exact", head: true })
      .eq("unidade_id", unidadeId).eq("plano_id", planoId).in("status", ["ativa", "inadimplente"]).is("sala_id", null),
    admin.from("pending_signups").select("id", { count: "exact", head: true })
      .eq("unidade_id", unidadeId).eq("plano_id", planoId).in("status", ["aguardando", "ativando"])
      .gt("created_at", new Date(Date.now() - JANELA_COMPRA_MS).toISOString()),
  ]);
  if (livres.error) throw new Error(`salas: ${livres.error.message}`);
  return vagasDeSala(livres.count || 0, vendidas.count || 0, andamento.count || 0);
}
