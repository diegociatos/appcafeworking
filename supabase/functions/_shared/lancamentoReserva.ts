// ============================================================================
// Receita da reserva no financeiro (lançamento em app_state).
//
// PROBLEMA QUE ISTO RESOLVE
//   Só a reserva feita pela recepção virava lançamento (src/lib/store.jsx →
//   criarReserva → addLancamento). A reserva que o cliente faz no app e a que é
//   paga pelo link do site não entravam no financeiro: a receita sumia do
//   Dashboard, do fluxo de caixa e do DRE.
//
// COMO
//   O lançamento mora no mesmo lugar que o da recepção: app_state, entity
//   'lancamentos', um doc por item, no formato que src/lib/store.jsx lê. O id é
//   DETERMINÍSTICO ("lc_res_<id da reserva>"), então:
//     • o webhook do Asaas pode entregar o mesmo pagamento várias vezes e o
//       upsert só reescreve a mesma linha;
//     • a reserva criada pelo cliente (previsto) e depois paga (pago) é a mesma
//       linha, trocando o status — nunca duas receitas pela mesma reserva;
//     • a recepção NÃO passa por aqui (o lançamento dela sai do store, com id
//       próprio), então não há lançamento em dobro.
//
// A parte pura (doc, competência, descrição) é testada em
// lancamentoReserva_test.ts, sem banco.
// ============================================================================

const FUSO = "America/Sao_Paulo";

// deno-lint-ignore no-explicit-any
export type ClienteBanco = { from: (tabela: string) => any };

export interface DadosLancamentoReserva {
  reservaId: string;
  unidadeId: string;
  salaNome?: string | null;
  salaTipo?: string | null;
  clienteNome?: string | null;
  valor: number;
  status: "pago" | "previsto";
  /** Data do fato (ISO). Padrão: agora. */
  quando?: string | Date | null;
  contaId?: string | null;
  /** Desconto do plano já aplicado ao valor (para a descrição). */
  descontoPct?: number | null;
}

/** Id determinístico do lançamento de uma reserva. */
export const idLancamentoReserva = (reservaId: string) => `lc_res_${reservaId}`;

/** Competência { mes 0..11, ano } e "DD/MM" no fuso de Brasília. */
export function competenciaBRT(quando?: string | Date | null): { mes: number; ano: number; data: string } {
  const d = quando ? new Date(quando) : new Date();
  const base = Number.isNaN(d.getTime()) ? new Date() : d;
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(base);
  const pega = (t: string) => partes.find((p) => p.type === t)?.value ?? "";
  const ano = Number(pega("year"));
  const mes = Number(pega("month"));
  return { mes: mes - 1, ano, data: `${pega("day")}/${pega("month")}` };
}

/** Subcategoria do plano de contas, igual à que a recepção usa. */
export const subcategoriaSala = (tipo?: string | null) =>
  String(tipo || "") === "Privativa" ? "Aluguel de Salas Privativas" : "Aluguel de Sala de Reunião";

/** Doc do lançamento, no formato que o app lê de app_state. */
export function docLancamentoReserva(d: DadosLancamentoReserva): Record<string, unknown> {
  const { mes, ano, data } = competenciaBRT(d.quando);
  const pct = Number(d.descontoPct || 0);
  const sala = String(d.salaNome || "").trim();
  return {
    id: idLancamentoReserva(d.reservaId),
    unidadeId: d.unidadeId,
    tipo: "entrada",
    descricao: `Reserva ${sala}${sala ? " · " : ""}${d.clienteNome || "cliente"}${pct > 0 ? ` (−${pct}% do plano)` : ""}`,
    categoria: "Receita Operacional Bruta",
    subcategoria: subcategoriaSala(d.salaTipo),
    valor: Math.round(Number(d.valor || 0) * 100) / 100,
    status: d.status,
    contaId: d.contaId ?? null,
    data,
    mes,
    ano,
    origem: "reserva",
    reservaId: d.reservaId,
  };
}

/** Primeira conta da unidade (preferindo o caixa), como a recepção faz. Nunca lança. */
export async function contaPadraoDaUnidade(admin: ClienteBanco, unidadeId: string): Promise<string | null> {
  try {
    const { data } = await admin.from("app_state").select("doc").eq("unidade_id", unidadeId).eq("entity", "contas");
    const contas = (data || []).map((l: { doc?: Record<string, unknown> }) => l?.doc).filter(Boolean);
    const caixa = contas.find((c: Record<string, unknown>) => /caixa/i.test(String(c?.banco || "")));
    return String((caixa || contas[0])?.id || "") || null;
  } catch (_) {
    return null;
  }
}

/**
 * Grava (ou reescreve) o lançamento da reserva. Best-effort: falha vira log e
 * nunca derruba a reserva nem o webhook.
 */
export async function registrarLancamentoReserva(
  admin: ClienteBanco, d: DadosLancamentoReserva,
): Promise<Record<string, unknown> | null> {
  if (!d.reservaId || !d.unidadeId || !(Number(d.valor) > 0)) return null;
  try {
    const contaId = d.contaId ?? await contaPadraoDaUnidade(admin, d.unidadeId);
    const doc = docLancamentoReserva({ ...d, contaId });
    const { error } = await admin.from("app_state").upsert({
      unidade_id: d.unidadeId, entity: "lancamentos", item_id: String(doc.id), doc,
    }, { onConflict: "unidade_id,entity,item_id" });
    if (error) throw new Error(error.message);
    return doc;
  } catch (e) {
    console.error(`[lancamentoReserva] ${d.reservaId}:`, (e as Error).message);
    return null;
  }
}

/** Apaga o lançamento da reserva (cancelamento sem dinheiro recebido). Nunca lança. */
export async function removerLancamentoReserva(
  admin: ClienteBanco, unidadeId: string, reservaId: string,
): Promise<boolean> {
  try {
    const { error } = await admin.from("app_state").delete()
      .eq("unidade_id", unidadeId).eq("entity", "lancamentos").eq("item_id", idLancamentoReserva(reservaId));
    if (error) throw new Error(error.message);
    return true;
  } catch (e) {
    console.error(`[lancamentoReserva] remover ${reservaId}:`, (e as Error).message);
    return false;
  }
}

export type AjusteCancelamento = "removido" | "mantido_pago" | "nada";

/**
 * O que fazer com o lançamento quando a reserva é cancelada:
 *   • não foi paga            → some (nunca entrou dinheiro);
 *   • paga e estornada no Asaas → some (o dinheiro voltou);
 *   • paga sem estorno automático → FICA (o dinheiro está na conta; a devolução
 *     manual é lançada como saída pelo financeiro).
 */
export function decidirCancelamento(paga: boolean, estorno: string): AjusteCancelamento {
  if (!paga) return "removido";
  return estorno === "automatico" ? "removido" : "mantido_pago";
}

/** Aplica decidirCancelamento. Devolve o que foi feito. Nunca lança. */
export async function ajustarLancamentoNoCancelamento(
  admin: ClienteBanco, unidadeId: string, reservaId: string, paga: boolean, estorno: string,
): Promise<AjusteCancelamento> {
  const decisao = decidirCancelamento(paga, estorno);
  if (decisao === "removido") await removerLancamentoReserva(admin, unidadeId, reservaId);
  return decisao;
}
