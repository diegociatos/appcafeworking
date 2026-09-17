// ============================================================================
// Venda pelo site — regras puras (sem rede e sem banco).
//
// Tudo o que decide dinheiro, prazo ou horário fica aqui para ser testado em
// venda_test.ts sem precisar de Supabase nem de Asaas. As Edge Functions só
// orquestram: leem o banco, chamam estas funções e gravam o resultado.
//
//   deno test supabase/functions/_shared/venda_test.ts
// ============================================================================

export const CATEGORIAS = ["endereco_fiscal", "coworking", "sala_privativa", "sala_hora", "abertura_empresa"] as const;
export type Categoria = typeof CATEGORIAS[number];
export const categoriaValida = (c: unknown): c is Categoria =>
  typeof c === "string" && (CATEGORIAS as readonly string[]).includes(c);

// ---------------------------------------------------------------------------
// Documento (CPF / CNPJ)
// ---------------------------------------------------------------------------

export const somenteDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");

/** Maiúsculas e só letras/números — cobre CPF, CNPJ numérico e CNPJ alfanumérico. */
export const normalizarDocumento = (s: unknown) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export function cpfValido(valor: unknown): boolean {
  const d = somenteDigitos(valor);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (base: string, pesoInicial: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(d.slice(0, 9), 10) === Number(d[9]) && dv(d.slice(0, 10), 11) === Number(d[10]);
}

/**
 * CNPJ numérico e alfanumérico. Desde julho de 2026 a Receita emite CNPJ com
 * letras nas 12 primeiras posições (IN RFB 2.229/2024). O cálculo é o mesmo
 * módulo 11 de sempre; cada caractere vale o próprio código ASCII menos 48, o
 * que mantém os CNPJs só com números válidos exatamente como antes.
 */
export function cnpjValido(valor: unknown): boolean {
  const c = normalizarDocumento(valor);
  if (!/^[A-Z0-9]{12}\d{2}$/.test(c) || /^(\d)\1{13}$/.test(c)) return false;
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += (base.charCodeAt(i) - 48) * pesos[i];
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return dv(c.slice(0, 12)) === Number(c[12]) && dv(c.slice(0, 13)) === Number(c[13]);
}

export function documentoValido(valor: unknown): boolean {
  const c = normalizarDocumento(valor);
  return c.length === 11 ? cpfValido(c) : cnpjValido(c);
}

export const emailValido = (e: unknown) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e ?? "").trim());

// ---------------------------------------------------------------------------
// Contrato
// ---------------------------------------------------------------------------

/**
 * SHA-256 em hexadecimal do texto em UTF-8. Bate byte a byte com o que o banco
 * grava em contratos_modelos.hash (encode(digest(convert_to(corpo,'UTF8'),'sha256'),'hex')),
 * que é a fonte da verdade — aqui só serve para conferir.
 */
export async function sha256Hex(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Datas — horário de Brasília
//
// O Brasil não tem horário de verão desde 2019, então America/Sao_Paulo é UTC-3
// fixo. Usar o deslocamento fixo evita depender do banco de fusos do runtime.
// ---------------------------------------------------------------------------

const OFFSET_BRT_MS = -3 * 3600_000;
const paraBRT = (d: Date) => new Date(d.getTime() + OFFSET_BRT_MS);
const pad = (n: number) => String(n).padStart(2, "0");

/** Data de hoje em Brasília, YYYY-MM-DD. */
export function hojeBRT(agora: Date = new Date()): string {
  const l = paraBRT(agora);
  return `${l.getUTCFullYear()}-${pad(l.getUTCMonth() + 1)}-${pad(l.getUTCDate())}`;
}

/** Soma meses a uma data YYYY-MM-DD, prendendo no último dia do mês (31/01 + 1 = 28/02). */
export function somarMeses(dataISO: string, meses: number): string {
  const [a, m, d] = dataISO.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  return `${alvo.getUTCFullYear()}-${pad(alvo.getUTCMonth() + 1)}-${pad(Math.min(d, ultimoDia))}`;
}

/** Até quando vale a fidelidade; null quando o plano não tem prazo mínimo. */
export function fidelidadeAte(inicioISO: string, prazoMinimoMeses: number): string | null {
  const meses = Math.floor(Number(prazoMinimoMeses) || 0);
  return meses > 0 ? somarMeses(inicioISO, meses) : null;
}

// ---------------------------------------------------------------------------
// Reserva de sala por hora
// ---------------------------------------------------------------------------

export interface JanelaReserva {
  diasSemana: number[];          // 0 = domingo … 6 = sábado (horário de Brasília)
  abre: string;                  // "HH:MM"
  fecha: string;                 // "HH:MM"
  antecedenciaMinMinutos: number;
  maxHoras: number;
}

/** Horário publicado do CafeWorking (seg a sex, 8h às 18h). Configurável por unidade depois. */
export const JANELA_PADRAO: JanelaReserva = {
  diasSemana: [1, 2, 3, 4, 5], abre: "08:00", fecha: "18:00", antecedenciaMinMinutos: 60, maxHoras: 10,
};

const minutosDoDia = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

export type ResultadoPeriodo = { ok: true; horas: number } | { ok: false; erro: string };

/**
 * Valida o período pedido no site. Códigos de erro estáveis (o front traduz):
 * PERIODO_INVALIDO, HORA_CHEIA, ANTECEDENCIA, DIA_INDISPONIVEL, FORA_DO_HORARIO,
 * DIAS_DIFERENTES, DURACAO_MAXIMA.
 */
export function validarPeriodoReserva(
  startISO: string, endISO: string, agora: Date = new Date(), janela: JanelaReserva = JANELA_PADRAO,
): ResultadoPeriodo {
  const ini = new Date(startISO), fim = new Date(endISO);
  if (isNaN(ini.getTime()) || isNaN(fim.getTime()) || ini >= fim) return { ok: false, erro: "PERIODO_INVALIDO" };

  const duracaoMin = (fim.getTime() - ini.getTime()) / 60_000;
  if (ini.getUTCMinutes() !== 0 || ini.getUTCSeconds() !== 0 || duracaoMin % 60 !== 0) {
    return { ok: false, erro: "HORA_CHEIA" };
  }
  if (ini.getTime() < agora.getTime() + janela.antecedenciaMinMinutos * 60_000) {
    return { ok: false, erro: "ANTECEDENCIA" };
  }

  const li = paraBRT(ini), lf = paraBRT(fim);
  if (!janela.diasSemana.includes(li.getUTCDay())) return { ok: false, erro: "DIA_INDISPONIVEL" };

  const iniMin = li.getUTCHours() * 60 + li.getUTCMinutes();
  // fim à meia-noite do dia seguinte conta como 24:00 do mesmo dia
  const mesmoDia = li.getUTCDate() === lf.getUTCDate() && li.getUTCMonth() === lf.getUTCMonth();
  const fimMin = mesmoDia ? lf.getUTCHours() * 60 + lf.getUTCMinutes() : (lf.getUTCHours() === 0 && lf.getUTCMinutes() === 0 ? 1440 : -1);
  if (fimMin < 0) return { ok: false, erro: "DIAS_DIFERENTES" };
  if (iniMin < minutosDoDia(janela.abre) || fimMin > minutosDoDia(janela.fecha)) {
    return { ok: false, erro: "FORA_DO_HORARIO" };
  }

  const horas = duracaoMin / 60;
  if (horas > janela.maxHoras) return { ok: false, erro: "DURACAO_MAXIMA" };
  return { ok: true, horas };
}

/** Valor da reserva em reais, arredondado ao centavo. Nunca aceita valor/hora zerado. */
export function valorReserva(horas: number, valorHora: number): number {
  const vh = Number(valorHora);
  if (!(horas > 0) || !(vh > 0)) throw new Error("VALOR_INVALIDO");
  return Math.round(horas * vh * 100) / 100;
}

// ---------------------------------------------------------------------------
// Créditos do plano
// ---------------------------------------------------------------------------

/** Mesmo mapa usado no app (store.jsx → DIREITO_CREDITO). */
export const DIREITO_CREDITO = {
  horasReuniao: "sala_reuniao",
  horasCoworking: "coworking",
  dayPass: "daypass",
  correspondencias: "correspondencia",
} as const;

export function creditosDoPlano(direitos: Record<string, unknown> | null | undefined): { tipo: string; quantidade: number }[] {
  if (!direitos) return [];
  return Object.entries(DIREITO_CREDITO)
    .map(([campo, tipo]) => ({ tipo, quantidade: Number(direitos[campo] || 0) }))
    .filter((c) => c.quantidade > 0);
}

/**
 * Id determinístico do crédito concedido por um pagamento. Como é a chave
 * primária do creditos_ledger, um webhook reenviado pelo Asaas não concede o
 * mesmo mês duas vezes.
 */
export const idCreditoPagamento = (paymentId: string, tipo: string) => `cr_asaas_${paymentId}_${tipo}`;

// ---------------------------------------------------------------------------
// Asaas
// ---------------------------------------------------------------------------

export const STATUS_PAGAMENTO_ASAAS: Record<string, string> = {
  PAYMENT_CONFIRMED: "pago",
  PAYMENT_RECEIVED: "pago",
  PAYMENT_OVERDUE: "vencido",
  PAYMENT_DELETED: "cancelado",
  PAYMENT_REFUNDED: "estornado",
  PAYMENT_CHARGEBACK_REQUESTED: "estornado",
};

/** externalReference que as funções gravam: signup:<id>, assinatura:<id>, reserva:<id>. */
export function referenciaExterna(ref: unknown): { tipo: "signup" | "assinatura" | "reserva" | "outro"; id: string | null } {
  const m = /^(signup|assinatura|reserva):(.+)$/.exec(String(ref ?? ""));
  return m ? { tipo: m[1] as "signup" | "assinatura" | "reserva", id: m[2] } : { tipo: "outro", id: null };
}

/** Split da unidade parceira (parceiros.ts): vazio ou ausente = sem split. */
type SplitPayload = { walletId: string; percentualValue: number }[] | null | undefined;

/** Acrescenta o split ao corpo do Asaas só quando existe (unidade parceira). */
export function comSplit<T extends Record<string, unknown>>(corpo: T, split: SplitPayload): T & { split?: NonNullable<SplitPayload> } {
  return split && split.length ? { ...corpo, split } : corpo;
}

export function payloadAssinaturaAsaas(p: {
  customer: string; valor: number; descricao: string; nextDueDate: string; externalReference: string;
  billingType?: string; ciclo?: "MONTHLY" | "YEARLY"; split?: SplitPayload;
}) {
  const billingType = ["BOLETO", "PIX", "CREDIT_CARD", "UNDEFINED"].includes(p.billingType || "") ? p.billingType : "UNDEFINED";
  return comSplit({
    customer: p.customer,
    billingType,
    value: p.valor,
    nextDueDate: p.nextDueDate,
    cycle: p.ciclo === "YEARLY" ? "YEARLY" : "MONTHLY",
    description: p.descricao,
    externalReference: p.externalReference,
  }, p.split);
}

// ---------------------------------------------------------------------------
// Periodicidade e desconto do anual (regra do Diego, 14/09/2026)
// ---------------------------------------------------------------------------

export const DESCONTO_ANUAL_PADRAO = 10;

/** Desconto entre 0 e 50; qualquer outro valor cai no padrão. */
export function descontoAnualValido(pct: unknown): number {
  const n = Number(pct);
  return pct !== null && pct !== "" && Number.isFinite(n) && n >= 0 && n <= 50 ? n : DESCONTO_ANUAL_PADRAO;
}

/** 12 mensalidades menos o desconto, ao centavo. */
export function precoAnual(precoMensal: number, descontoPct: number): number {
  const p = Number(precoMensal);
  if (!(p > 0)) throw new Error("VALOR_INVALIDO");
  return Math.round(p * 12 * (1 - descontoAnualValido(descontoPct) / 100) * 100) / 100;
}

export function economiaAnual(precoMensal: number, descontoPct: number): number {
  return Math.round((Number(precoMensal) * 12 - precoAnual(precoMensal, descontoPct)) * 100) / 100;
}

/** Mensal só cartão; anual PIX, boleto ou cartão à vista. null = combinação proibida. */
export function billingTypePara(periodicidade: unknown, forma: unknown): string | null {
  if (periodicidade === "mensal") return "CREDIT_CARD";
  if (periodicidade === "anual") {
    return ["PIX", "BOLETO", "CREDIT_CARD"].includes(String(forma)) ? String(forma) : null;
  }
  return null;
}

/** O que a página de pagamento pode saber: nada além de aguardando/confirmado/cancelado. */
export function statusPublicoDoCadastro(status: unknown): "aguardando" | "confirmado" | "cancelado" {
  if (status === "ativo") return "confirmado";
  if (status === "cancelado") return "cancelado";
  return "aguardando";
}

// Serviços executados depois da venda (abertura da empresa, certificado digital)

/** Serviços únicos que a equipe executa depois da venda: abertura da empresa e certificado digital. */
export function servicosDaVenda(categoria: unknown, direitos: unknown): { abertura: boolean; certificado: boolean } {
  const d = (direitos && typeof direitos === "object" ? direitos : {}) as Record<string, unknown>;
  return { abertura: categoria === "abertura_empresa" || d.aberturaEmpresa === true, certificado: d.certificadoDigital === true };
}

/** Linhas do aviso à equipe sobre abertura e certificado bonificados num plano cancelado. */
export function avisoBonificados(a: { categoria?: unknown; direitos?: unknown }): string[] {
  const s = servicosDaVenda(a.categoria, a.direitos);
  if (a.categoria === "abertura_empresa" || (!s.abertura && !s.certificado)) return [];
  return [`Plano com ${[s.abertura && "abertura da empresa", s.certificado && "certificado digital"].filter(Boolean).join(" e ")} bonificados: se já executados, cobrar a parte proporcional (cláusula 7.6 do contrato).`];
}
