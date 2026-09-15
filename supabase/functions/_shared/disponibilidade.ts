// ============================================================================
// Disponibilidade de sala privativa para venda pelo site.
//
// O plano é por tamanho ("sala para 4 pessoas") e o site mostra cada sala
// daquele tamanho, com nome e fotos. O cliente escolhe a sala: ela fica
// segurada enquanto o pagamento está em andamento e é marcada como alugada na
// ativação. Venda antiga sem sala escolhida ocupa uma vaga até a equipe atribuir.
//
// A sala vive em dois lugares: tabela salas e doc do app (app_state 'salas').
// O app regrava a tabela a partir do doc, então os dois mudam juntos.
// ============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fotosPublicas, marcarOcupadas, type SalaPublica } from "./catalogo.ts";

const JANELA_COMPRA_MS = 48 * 3600_000;
const ATIVAS = ["ativa", "inadimplente", "cancelando"];

// deno-lint-ignore no-explicit-any
type Linha = Record<string, any>;

async function compromissos(admin: SupabaseClient, unidadeId: string, planoId: string, ignorarEmail?: string) {
  const desde = new Date(Date.now() - JANELA_COMPRA_MS).toISOString();
  const [assin, pend] = await Promise.all([
    admin.from("assinaturas").select("sala_id")
      .eq("unidade_id", unidadeId).in("status", ATIVAS).or(`sala_id.not.is.null,plano_id.eq.${planoId}`),
    admin.from("pending_signups").select("sala_id, plano_id, email")
      .eq("unidade_id", unidadeId).in("status", ["aguardando", "ativando"]).gt("created_at", desde),
  ]);
  if (assin.error) throw new Error(`assinaturas: ${assin.error.message}`);
  if (pend.error) throw new Error(`pending_signups: ${pend.error.message}`);
  const seguradas = new Set<string>();
  let semSala = 0;
  for (const a of assin.data || []) {
    if (a.sala_id) seguradas.add(a.sala_id);
    else semSala++; // o filtro já limitou as sem sala ao plano
  }
  for (const p of pend.data || []) {
    if (ignorarEmail && p.email === ignorarEmail) continue;
    if (p.sala_id) seguradas.add(p.sala_id);
    else if (p.plano_id === planoId) semSala++;
  }
  return { seguradas, semSala };
}

/** Salas privativas do tamanho do plano, com o que o site pode mostrar. */
export async function salasDoPlano(
  admin: SupabaseClient, unidadeId: string, capacidade: number, planoId: string, ignorarEmail?: string,
): Promise<SalaPublica[]> {
  const [{ data: salas, error }, { data: docs }, c] = await Promise.all([
    admin.from("salas").select("id, nome, capacidade, contratada")
      .eq("unidade_id", unidadeId).eq("tipo", "Privativa").eq("active", true).eq("capacidade", capacidade),
    admin.from("app_state").select("item_id, doc").eq("entity", "salas").eq("unidade_id", unidadeId),
    compromissos(admin, unidadeId, planoId, ignorarEmail),
  ]);
  if (error) throw new Error(`salas: ${error.message}`);
  const docPorId = new Map((docs || []).map((d) => [d.item_id, d.doc || {}]));
  return marcarOcupadas(salas || [], c.seguradas, c.semSala).map((s) => {
    const d = docPorId.get(s.id) || {};
    return {
      id: s.id, nome: s.nome, capacidade: s.capacidade, ocupada: s.ocupada,
      descricao: typeof d.descricao === "string" ? d.descricao.slice(0, 400) : "",
      comodidades: Array.isArray(d.comodidades) ? d.comodidades.filter((x: unknown) => typeof x === "string").slice(0, 12) : [],
      fotos: fotosPublicas(d.fotos),
    };
  });
}

async function gravarSala(admin: SupabaseClient, unidadeId: string, salaId: string, campos: Linha, doc: Linha) {
  await admin.from("salas").update(campos).eq("id", salaId);
  const { data } = await admin.from("app_state").select("doc")
    .eq("entity", "salas").eq("unidade_id", unidadeId).eq("item_id", salaId).maybeSingle();
  if (data?.doc) {
    await admin.from("app_state").update({ doc: { ...data.doc, ...doc } })
      .eq("entity", "salas").eq("unidade_id", unidadeId).eq("item_id", salaId);
  }
}

/** Marca a sala da assinatura como alugada (tabela e app), com cliente e valor mensal. */
export async function ocuparSala(admin: SupabaseClient, a: Linha) {
  if (!a?.sala_id) return;
  const valorMensal = a.recorrencia === "anual" ? Math.round((Number(a.valor) / 12) * 100) / 100 : Number(a.valor);
  await gravarSala(admin, a.unidade_id, a.sala_id,
    { contratada: true, valor_mensal: valorMensal },
    { contratada: true, contratante: a.cliente_nome, valorMensal });
}

/** Devolve a sala quando o plano termina, se ela ainda está no nome deste cliente. */
export async function liberarSala(admin: SupabaseClient, a: Linha) {
  if (!a?.sala_id) return;
  const { data } = await admin.from("app_state").select("doc")
    .eq("entity", "salas").eq("unidade_id", a.unidade_id).eq("item_id", a.sala_id).maybeSingle();
  const contratante = data?.doc?.contratante;
  if (contratante && contratante !== a.cliente_nome) return; // a equipe já passou a sala para outro
  await gravarSala(admin, a.unidade_id, a.sala_id, { contratada: false }, { contratada: false, contratante: "" });
}
