// ============================================================================
// Rede de parceiros — regras puras (sem rede e sem banco). docs/PARCEIROS.md
//
// Toda cobrança de unidade de conta parceira sai da conta Asaas da CafeWorking
// com split para a carteira do parceiro:
//
//   parte do parceiro   = parceiro_pct do bruto            (75%)
//   garantia retida     = garantia_pct da parte do parceiro (10% de 75 = 7,5%)
//   repasse imediato    = parte do parceiro − garantia      (67,5%) → split
//   parte da CafeWorking = bruto − parte do parceiro        (25%)   → nota da CafeWorking
//
// Os valores são calculados em centavos inteiros para fechar sempre:
// bruto = parceiro + cafeworking e parceiro = garantia + repasse (o banco
// confere com o check cobrancas_split_check).
//
//   deno test supabase/functions/_shared/parceiros_test.ts
// ============================================================================

export const STATUS_PARCEIRO = ["em_analise", "ativo", "suspenso", "encerrado"] as const;
export type StatusParceiro = typeof STATUS_PARCEIRO[number];

export const PARCEIRO_PERCENTUAL_PADRAO = 75;
export const GARANTIA_PERCENTUAL_PADRAO = 10;

/** Colunas de contas que decidem a venda. */
export interface ContaVenda {
  id?: string | null;
  nome?: string | null;
  email?: string | null;
  tipo?: string | null;
  parceiro_percentual?: number | string | null;
  garantia_percentual?: number | string | null;
  asaas_wallet_id?: string | null;
  parceiro_status?: string | null;
  emails_aviso?: string[] | null;
}

export interface SplitAsaas {
  walletId: string;
  percentualValue: number;
}

/** Percentuais congelados na cobrança (o que foi mandado ao Asaas). */
export interface SnapshotSplit {
  contaId: string;
  walletId: string | null;
  parceiroPct: number;
  garantiaPct: number;
}

export type RegraVenda =
  | { parceiro: false }
  | { parceiro: true; ok: false; codigo: "PARCEIRO_INATIVO" | "PARCEIRO_SEM_CARTEIRA" | "PARCEIRO_PERCENTUAL_INVALIDO"; erro: string }
  | { parceiro: true; ok: true; snapshot: SnapshotSplit; imediatoPct: number; split: SplitAsaas[] };

export interface Divisao {
  bruto: number;
  parceiro: number;
  garantia: number;
  repasse: number;
  cafeworking: number;
}

export const MSG_PARCEIRO_INATIVO =
  "Esta unidade parceira está com as vendas online suspensas no momento. Fale com a CafeWorking.";
export const MSG_PARCEIRO_SEM_CARTEIRA =
  "Esta unidade parceira ainda não concluiu o credenciamento de pagamentos. A venda online fica disponível em breve.";
export const MSG_PARCEIRO_PERCENTUAL =
  "O repasse desta unidade parceira está configurado de forma inválida. Fale com a CafeWorking.";

export const ehContaParceira = (conta: ContaVenda | null | undefined): boolean => conta?.tipo === "parceiro";

const numero = (v: unknown): number => (v === null || v === undefined || v === "" ? NaN : Number(v));
const pctParceiroValido = (n: number) => Number.isFinite(n) && n > 0 && n < 100;
const pctGarantiaValido = (n: number) => Number.isFinite(n) && n >= 0 && n < 100;

/** Parte imediata do parceiro no split, em % do valor: 75 × (1 − 10/100) = 67,5. Até 4 casas. */
export function percentualImediato(parceiroPct: number, garantiaPct: number): number {
  const p = Number(parceiroPct), g = Number(garantiaPct);
  if (!pctParceiroValido(p) || !pctGarantiaValido(g)) throw new Error("PERCENTUAL_INVALIDO");
  return Math.round(p * (1 - g / 100) * 10000) / 10000;
}

/** Divide o valor em centavos inteiros. Valor inválido ou zero → tudo zero. */
export function divisaoDoValor(valor: number | string, parceiroPct: number, garantiaPct: number): Divisao {
  const p = Number(parceiroPct), g = Number(garantiaPct);
  if (!pctParceiroValido(p) || !pctGarantiaValido(g)) throw new Error("PERCENTUAL_INVALIDO");
  const brutoC = Math.round(Number(valor) * 100);
  if (!(brutoC > 0)) return { bruto: 0, parceiro: 0, garantia: 0, repasse: 0, cafeworking: 0 };
  const parceiroC = Math.round((brutoC * p) / 100);
  const garantiaC = Math.round((parceiroC * g) / 100);
  return {
    bruto: brutoC / 100,
    parceiro: parceiroC / 100,
    garantia: garantiaC / 100,
    repasse: (parceiroC - garantiaC) / 100,
    cafeworking: (brutoC - parceiroC) / 100,
  };
}

/** Snapshot da conta parceira (ignora a situação: serve para registrar o que já saiu com split). */
export function snapshotDaConta(conta: ContaVenda | null | undefined): SnapshotSplit | null {
  if (!ehContaParceira(conta) || !conta?.id) return null;
  const p = numero(conta.parceiro_percentual ?? PARCEIRO_PERCENTUAL_PADRAO);
  const g = numero(conta.garantia_percentual ?? GARANTIA_PERCENTUAL_PADRAO);
  if (!pctParceiroValido(p) || !pctGarantiaValido(g)) return null;
  return { contaId: conta.id, walletId: conta.asaas_wallet_id?.trim() || null, parceiroPct: p, garantiaPct: g };
}

/**
 * Pode vender? Conta própria (ou unidade sem conta): venda normal, sem split.
 * Conta parceira: só com situação 'ativo', carteira e percentuais válidos.
 * Nunca cobra sem split numa unidade parceira.
 */
export function regraDeVenda(conta: ContaVenda | null | undefined): RegraVenda {
  if (!ehContaParceira(conta)) return { parceiro: false };
  if (conta!.parceiro_status !== "ativo") return { parceiro: true, ok: false, codigo: "PARCEIRO_INATIVO", erro: MSG_PARCEIRO_INATIVO };
  const snapshot = snapshotDaConta(conta);
  if (!snapshot) return { parceiro: true, ok: false, codigo: "PARCEIRO_PERCENTUAL_INVALIDO", erro: MSG_PARCEIRO_PERCENTUAL };
  if (!snapshot.walletId) return { parceiro: true, ok: false, codigo: "PARCEIRO_SEM_CARTEIRA", erro: MSG_PARCEIRO_SEM_CARTEIRA };
  const imediatoPct = percentualImediato(snapshot.parceiroPct, snapshot.garantiaPct);
  return { parceiro: true, ok: true, snapshot, imediatoPct, split: [{ walletId: snapshot.walletId, percentualValue: imediatoPct }] };
}

/** Colunas de cobrancas com a divisão (vazio quando não há snapshot ou valor). */
export function camposDaDivisao(snapshot: SnapshotSplit | null | undefined, valor: number | string): Record<string, unknown> {
  if (!snapshot) return {};
  const d = divisaoDoValor(valor, snapshot.parceiroPct, snapshot.garantiaPct);
  if (!(d.bruto > 0)) return {};
  return {
    parceiro_conta_id: snapshot.contaId,
    asaas_wallet_id: snapshot.walletId,
    split_parceiro_pct: snapshot.parceiroPct,
    split_garantia_pct: snapshot.garantiaPct,
    valor_bruto: d.bruto,
    valor_parceiro: d.parceiro,
    valor_garantia: d.garantia,
    valor_repasse: d.repasse,
    valor_cafeworking: d.cafeworking,
  };
}

/** Snapshot gravado numa linha de cobrancas; null se a cobrança não é de parceiro. */
// deno-lint-ignore no-explicit-any
export function snapshotDaCobranca(c: Record<string, any> | null | undefined): SnapshotSplit | null {
  if (!c?.parceiro_conta_id) return null;
  const p = numero(c.split_parceiro_pct), g = numero(c.split_garantia_pct);
  if (!pctParceiroValido(p) || !pctGarantiaValido(g)) return null;
  return { contaId: String(c.parceiro_conta_id), walletId: c.asaas_wallet_id ?? null, parceiroPct: p, garantiaPct: g };
}

// ---------------------------------------------------------------------------
// Nota fiscal da CafeWorking em unidade parceira
// ---------------------------------------------------------------------------

/** Base da cobrança: valor pago, senão o valor. */
// deno-lint-ignore no-explicit-any
function baseDaCobranca(c: Record<string, any>): number {
  const pago = Number(c.valor_pago);
  if (Number.isFinite(pago) && pago > 0) return pago;
  const v = Number(c.valor);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** Valor da nota da CafeWorking: só a parte dela sobre o valor pago. 0 se não for cobrança de parceiro. */
// deno-lint-ignore no-explicit-any
export function valorNotaCafeWorking(c: Record<string, any>): number {
  const s = snapshotDaCobranca(c);
  if (!s) return 0;
  return divisaoDoValor(baseDaCobranca(c), s.parceiroPct, s.garantiaPct).cafeworking;
}

/** "Endereço Fiscal · assinatura" → "Intermediação e plataforma CafeWorking — Endereço Fiscal". */
// deno-lint-ignore no-explicit-any
export function descricaoNotaCafeWorking(c: Record<string, any>): string {
  const plano = String(c.descricao ?? "").split(" · ")[0].trim();
  return `Intermediação e plataforma CafeWorking — ${plano || "serviço contratado"}`;
}

// ---------------------------------------------------------------------------
// Avisos ao parceiro
// ---------------------------------------------------------------------------

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Lista de aviso da conta; vazia → e-mail do master (login). Sem repetição, em minúsculas. */
export function destinatariosAvisoParceiro(conta: ContaVenda | null | undefined): string[] {
  const limpar = (l: unknown[]) => [...new Set(l.map((e) => String(e ?? "").trim().toLowerCase()).filter((e) => EMAIL.test(e)))];
  const lista = limpar(Array.isArray(conta?.emails_aviso) ? conta!.emails_aviso! : []);
  return lista.length ? lista : limpar([conta?.email]);
}

const brl = (n: number) => "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Linha "Valor: R$ 100,00 · sua parte R$ 75,00 (repasse R$ 67,50 + garantia R$ 7,50)". */
export function linhaValorParceiro(valor: number | string, conta: ContaVenda | null | undefined): string {
  const s = snapshotDaConta(conta);
  const v = Number(valor);
  if (!s || !(v > 0)) return `Valor: ${brl(v)}`;
  const d = divisaoDoValor(v, s.parceiroPct, s.garantiaPct);
  return `Valor: ${brl(d.bruto)} · sua parte ${brl(d.parceiro)} (repasse ${brl(d.repasse)} + garantia ${brl(d.garantia)})`;
}
