// ============================================================================
// Cancelamento de reserva pela equipe — regras puras.
//
// Usadas pela Edge Function cancelar-reserva e testadas em
// cancelamentoReserva_test.ts sem banco. Quem cancela: admin da plataforma ou
// equipe da unidade (master, recepção, financeiro). Contabilidade parceira e
// cliente não (o cliente tem o próprio caminho em reservas-cliente, com prazo).
// Estorno do pagamento online é dinheiro: só master/financeiro/admin.
// ============================================================================

/** Papéis de unidade_members que cancelam reserva pela agenda. */
export const PAPEIS_CANCELAM_RESERVA = ["master", "recepcao", "financeiro"] as const;

export const MSG_SEM_PAPEL_CANCELAR = "Só a equipe da unidade (recepção, master ou financeiro) pode cancelar reservas.";

/** Algum dos vínculos do usuário na unidade permite cancelar? */
export function papelCancelaReserva(papeis: unknown[] | null | undefined): boolean {
  return (papeis || []).some((p) => (PAPEIS_CANCELAM_RESERVA as readonly string[]).includes(String(p ?? "")));
}

/** Mesma regra do banco (cancelar_reserva_equipe): paga online e com valor. */
export function reservaPaga(r: { payment_status?: string | null; valor?: number | string | null }): boolean {
  return r.payment_status === "pago" && Number(r.valor || 0) > 0;
}

export const MENSAGENS_CANCELAMENTO_EQUIPE: Record<string, string> = {
  RESERVA_INEXISTENTE: "Reserva não encontrada. Recarregue a agenda.",
  JA_CANCELADA: "Esta reserva já estava cancelada. Recarregue a agenda.",
  NAO_CANCELAVEL: "Esta reserva não pode ser cancelada (já teve check-in ou foi concluída).",
  PAGA_CONFIRMAR: "Esta reserva foi paga online. Confirme o cancelamento sabendo que a devolução do pagamento é feita à parte.",
};

/** Traduz o código de erro do banco para a equipe. */
export function mensagemCancelamentoEquipe(erro: string | null | undefined, padrao = "Não foi possível cancelar agora. Tente de novo."): string {
  const msg = String(erro || "");
  const chave = Object.keys(MENSAGENS_CANCELAMENTO_EQUIPE).find((k) => msg.includes(k));
  return chave ? MENSAGENS_CANCELAMENTO_EQUIPE[chave] : padrao;
}

/** Status HTTP do erro conhecido (409 conflito de estado, 404 inexistente); null = erro inesperado. */
export function statusDoErroCancelamento(erro: string | null | undefined): number | null {
  const msg = String(erro || "");
  if (msg.includes("RESERVA_INEXISTENTE")) return 404;
  if (/JA_CANCELADA|NAO_CANCELAVEL|PAGA_CONFIRMAR/.test(msg)) return 409;
  return null;
}

export type Estorno = "nao_se_aplica" | "automatico" | "manual";

/**
 * O que fazer com o pagamento depois de cancelar:
 *   não paga                          → nao_se_aplica
 *   paga, pediu estorno, cartão/PIX   → automatico (tenta no Asaas)
 *   paga, qualquer outro caso         → manual (a equipe devolve à parte)
 */
export function planoDeEstorno(
  o: { paga: boolean; estornar: boolean; asaasPaymentId?: string | null; billingType?: string | null },
): Estorno {
  if (!o.paga) return "nao_se_aplica";
  if (o.estornar && o.asaasPaymentId && (o.billingType === "CREDIT_CARD" || o.billingType === "PIX")) return "automatico";
  return "manual";
}

/** "quinta-feira, 18/09/2026, das 10:00 às 12:00" no horário de Brasília. */
export function quandoReservaBR(startISO: string, endISO: string): string {
  const f = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", ...o });
  return `${f(startISO, { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}, das ${f(startISO, { hour: "2-digit", minute: "2-digit" })} às ${f(endISO, { hour: "2-digit", minute: "2-digit" })}`;
}
