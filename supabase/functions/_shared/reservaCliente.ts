// ============================================================================
// Reserva de sala pelo cliente logado (área do cliente) — regras puras.
//
// Usadas por criar-reserva (quando quem reserva é o próprio cliente) e por
// reservas-cliente (agenda, minhas reservas, cancelamento). Testadas em
// reservaCliente_test.ts sem banco.
// ============================================================================

import { hojeBRT, type JanelaReserva, JANELA_PADRAO, validarPeriodoReserva } from "./venda.ts";
import { somarDias } from "./ciclo.ts";

/** Até quantos dias à frente o cliente vê a agenda e pode reservar. */
export const DIAS_AGENDA = 30;
/** Cancelamento pelo próprio cliente só até 24 horas antes do início. */
export const ANTECEDENCIA_CANCELAMENTO_HORAS = 24;

/** Mesmo horário do site (seg a sex, 8h às 18h), com 30 minutos de antecedência. */
export const JANELA_CLIENTE: JanelaReserva = { ...JANELA_PADRAO, antecedenciaMinMinutos: 30 };

/** Status em que a reserva ainda segura o horário. */
export const STATUS_ATIVOS = ["solicitada", "confirmada", "checkin"];

/** Tipo de sala → tipo de crédito do plano. Salas que não casam não consomem crédito. */
export function tipoCredito(tipoSala?: string | null): "sala_reuniao" | "coworking" | null {
  const t = String(tipoSala || "").toLowerCase();
  if (t.includes("reuni")) return "sala_reuniao";
  if (t.includes("compartilh") || t.includes("cowork")) return "coworking";
  return null;
}

export interface SalaParaCliente {
  active?: boolean | null;
  contratada?: boolean | null;
  valor_hora?: number | string | null;
  tipo?: string | null;
}

/**
 * O cliente só reserva sala ativa, fora de locação fixa, que tenha preço por
 * hora ou que o plano cubra (reunião ou compartilhada). Sala privativa vaga sem
 * preço por hora é para locação mensal e não aparece.
 */
export function salaReservavelPeloCliente(s: SalaParaCliente): boolean {
  if (s.active === false || s.contratada === true) return false;
  return Number(s.valor_hora || 0) > 0 || tipoCredito(s.tipo) !== null;
}

export interface CalculoReserva {
  horas: number;
  cobertas: number;
  excedente: number;
  /** Excedente pelo preço cheio da sala, antes do desconto do plano. */
  valorSemDesconto: number;
  /** Desconto de sala do plano aplicado ao excedente (0 a 100). */
  descontoPct: number;
  /** Quanto o desconto do plano tirou do excedente. */
  descontoValor: number;
  /** O que o cliente paga: excedente menos o desconto do plano. */
  valorExcedente: number;
}

/** Percentual válido (0 a 100, duas casas). Lixo vira 0. */
export function percentualValido(valor: unknown): number {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(Math.min(100, n) * 100) / 100;
}

/**
 * Quantas horas o saldo do plano cobre, quanto sobra para pagar e quanto o
 * desconto de sala do plano (direitos.descontoSala) tira desse excedente.
 */
export function calcularReserva(horas: number, saldo: number, valorHora: number, descontoPct: unknown = 0): CalculoReserva {
  const h = Math.max(0, Math.floor(Number(horas) || 0));
  const disponivel = Math.max(0, Math.floor(Number(saldo) || 0));
  const cobertas = Math.min(disponivel, h);
  const excedente = h - cobertas;
  const vh = Math.max(0, Number(valorHora) || 0);
  const cheio = Math.round(excedente * vh * 100) / 100;
  const pct = percentualValido(descontoPct);
  const desconto = Math.round(cheio * pct) / 100;
  return {
    horas: h, cobertas, excedente,
    valorSemDesconto: cheio, descontoPct: pct, descontoValor: desconto,
    valorExcedente: Math.round((cheio - desconto) * 100) / 100,
  };
}

export type ResultadoReservaCliente = { ok: true; horas: number } | { ok: false; erro: string };

/**
 * Período pedido pelo cliente: regras do horário (hora cheia, dia útil, 8h–18h,
 * antecedência) e no máximo DIAS_AGENDA dias à frente.
 */
export function validarReservaCliente(startISO: string, endISO: string, agora: Date = new Date()): ResultadoReservaCliente {
  const r = validarPeriodoReserva(startISO, endISO, agora, JANELA_CLIENTE);
  if (!r.ok) return r;
  const limite = somarDias(hojeBRT(agora), DIAS_AGENDA);
  if (hojeBRT(new Date(startISO)) > limite) return { ok: false, erro: "LONGE_DEMAIS" };
  return r;
}

/** Mensagens para o cliente dos códigos de validarReservaCliente e da função do banco. */
export const MENSAGENS_RESERVA: Record<string, string> = {
  PERIODO_INVALIDO: "Escolha um horário de início antes do horário de término.",
  HORA_CHEIA: "As reservas começam e terminam em horas cheias.",
  ANTECEDENCIA: "Esse horário já passou ou está muito próximo. Escolha um horário a partir de 30 minutos daqui.",
  PERIODO_PASSADO: "Esse horário já passou. Escolha outro.",
  DIA_INDISPONIVEL: "Reservas pelo app são de segunda a sexta.",
  FORA_DO_HORARIO: "Reservas pelo app vão das 8h às 18h.",
  DIAS_DIFERENTES: "A reserva precisa começar e terminar no mesmo dia.",
  DURACAO_MAXIMA: "A reserva pode ter no máximo 10 horas.",
  LONGE_DEMAIS: `Dá para reservar com até ${DIAS_AGENDA} dias de antecedência.`,
  CONFLITO: "Esse horário acabou de ser reservado. Escolha outro.",
  SALA_CONTRATADA: "Esta sala não está disponível para reserva.",
  SALA_INATIVA: "Esta sala não está disponível para reserva.",
  SALA_NAO_RESERVAVEL: "Esta sala não está disponível para reserva pelo app.",
  BASE_INVALIDA: "Escolha uma das bases de trabalho livres.",
  SALA_INEXISTENTE: "Sala não encontrada.",
  SALA_DE_OUTRA_UNIDADE: "Sala não encontrada.",
  SEM_CREDITO: "Seu plano não tem horas suficientes para esta sala. Fale com a recepção para reservar.",
  RESERVA_INEXISTENTE: "Reserva não encontrada.",
  SEM_ACESSO: "Reserva não encontrada.",
  NAO_CANCELAVEL: "Esta reserva não pode mais ser cancelada.",
  PRAZO_CANCELAMENTO: `O cancelamento pelo app vai até ${ANTECEDENCIA_CANCELAMENTO_HORAS} horas antes do início. Fale com a recepção.`,
  PAGA_FALE_CONOSCO: "Esta reserva já foi paga. Para cancelar, fale com a recepção.",
};

/** Traduz a mensagem de erro do banco (que traz o código) para o cliente. */
export function mensagemReserva(erro: string | null | undefined, padrao = "Não foi possível concluir. Tente de novo."): string {
  const msg = String(erro || "");
  const chave = Object.keys(MENSAGENS_RESERVA).find((k) => msg.includes(k));
  return chave ? MENSAGENS_RESERVA[chave] : padrao;
}

/** O cliente ainda pode cancelar sozinho? */
export function podeCancelar(
  r: { status: string; start_at: string; payment_status?: string | null; valor?: number | string | null },
  agora: Date = new Date(),
): boolean {
  if (!["solicitada", "confirmada"].includes(r.status)) return false;
  if (r.payment_status === "pago" && Number(r.valor || 0) > 0) return false;
  return new Date(r.start_at).getTime() - agora.getTime() >= ANTECEDENCIA_CANCELAMENTO_HORAS * 3600_000;
}

/** Datas (YYYY-MM-DD) dos próximos dias em que a janela abre, a partir de hoje. */
export function datasDaAgenda(agora: Date = new Date(), janela: JanelaReserva = JANELA_CLIENTE, dias = DIAS_AGENDA): string[] {
  const hoje = hojeBRT(agora);
  const lista: string[] = [];
  for (let i = 0; i <= dias; i++) {
    const d = somarDias(hoje, i);
    const [a, m, dd] = d.split("-").map(Number);
    if (janela.diasSemana.includes(new Date(Date.UTC(a, m - 1, dd)).getUTCDay())) lista.push(d);
  }
  return lista;
}

/** Escapa curinga do ILIKE (%, _ e barra) para comparar e-mail sem diferenciar maiúsculas. */
export const padraoEmail = (email: string) => String(email).trim().replace(/[\\%_]/g, (c) => "\\" + c);
