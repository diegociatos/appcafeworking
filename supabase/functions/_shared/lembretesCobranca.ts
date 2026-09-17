// ============================================================================
// Lembrete de vencimento ao cliente (evento boleto_lembrete) — regras puras.
//
// O QUE ESTAVA FALTANDO
//   O app tem a preferência "Lembrete de vencimento" (Configurações → avisos e
//   tabela preferencias_notificacao, categoria "lembretes"), o template
//   boleto_lembrete e o envio (enviar-email / dispatchNotificacao). O que nunca
//   existiu foi QUEM DISPARA: a rotina-diaria não procura cobrança perto de
//   vencer, então a preferência era uma promessa sem dono.
//
// O QUE ESTE ARQUIVO FAZ
//   Só decide, sem tocar em banco nem em rede: dadas as cobranças em aberto, a
//   data de hoje e os lembretes já enviados, diz QUAIS cobranças vencem em N
//   dias e PARA QUEM avisar. Assim dá para ligar o gatilho em qualquer lugar
//   (rotina-diaria ou função própria) sem reescrever a regra, e o teste roda
//   sem banco (lembretesCobranca_test.ts).
//
// COMO LIGAR (ver relatório):
//   1. buscar cobranças 'pendente' com vencimento entre hoje+1 e hoje+DIAS_LEMBRETE;
//   2. buscar em `notificacoes` os lembretes já enviados (evento boleto_lembrete);
//   3. chamar cobrancasParaLembrar(...);
//   4. para cada item, dispatchNotificacao(admin, { evento: "boleto_lembrete", … }),
//      que já respeita a preferência do cliente (notify/preferencias.ts).
// ============================================================================

/** Dias de antecedência do lembrete (3 dias antes do vencimento). */
export const DIAS_LEMBRETE = 3;

export interface CobrancaEmAberto {
  id: string;
  unidade_id: string;
  cliente?: string | null;
  cliente_email?: string | null;
  valor?: number | string | null;
  vencimento?: string | null;
  status?: string | null;
}

export interface LembreteACobrar {
  cobrancaId: string;
  unidadeId: string;
  email: string;
  cliente: string;
  valor: number;
  vencimento: string;
  diasParaVencer: number;
}

/** Data (aaaa-mm-dd) somando dias, sem fuso: trabalha em data pura. */
export function somarDiasISO(data: string, dias: number): string {
  const [a, m, d] = String(data).slice(0, 10).split("-").map(Number);
  const base = new Date(Date.UTC(a, (m || 1) - 1, d || 1));
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

/** Quantos dias faltam do vencimento em relação a hoje (negativo = vencida). */
export function diasParaVencer(vencimento: string, hoje: string): number {
  const dia = (s: string) => {
    const [a, m, d] = String(s).slice(0, 10).split("-").map(Number);
    return Date.UTC(a, (m || 1) - 1, d || 1);
  };
  return Math.round((dia(vencimento) - dia(hoje)) / 86_400_000);
}

/** A cobrança é lembrável? Só em aberto, com e-mail, valor e vencimento. */
export function lembravel(c: CobrancaEmAberto): boolean {
  const status = String(c.status || "pendente");
  if (status !== "pendente") return false;
  if (!String(c.cliente_email || "").includes("@")) return false;
  if (!(Number(c.valor || 0) > 0)) return false;
  return /^\d{4}-\d{2}-\d{2}/.test(String(c.vencimento || ""));
}

/** Chave de idempotência do lembrete (uma vez por cobrança e vencimento). */
export const chaveLembrete = (cobrancaId: string, vencimento: string) =>
  `${cobrancaId}:${String(vencimento).slice(0, 10)}`;

/**
 * Quais cobranças pedem lembrete hoje e para quem.
 *
 * `jaEnviados` são as chaves de chaveLembrete já registradas em `notificacoes`
 * (rodar duas vezes no mesmo dia não manda dois e-mails). A preferência do
 * cliente NÃO é checada aqui: quem envia já respeita (notify/preferencias.ts),
 * e assim esta função continua pura.
 */
export function cobrancasParaLembrar(
  cobrancas: CobrancaEmAberto[],
  hoje: string,
  jaEnviados: Iterable<string> = [],
  dias = DIAS_LEMBRETE,
): LembreteACobrar[] {
  const enviados = new Set(jaEnviados);
  const lista: LembreteACobrar[] = [];
  for (const c of cobrancas || []) {
    if (!lembravel(c)) continue;
    const vencimento = String(c.vencimento).slice(0, 10);
    const faltam = diasParaVencer(vencimento, hoje);
    // Só no dia exato do lembrete: vencida (ou vencendo hoje) é outro assunto
    // (boleto_vencido), e antes disso ainda não é hora.
    if (faltam !== dias) continue;
    if (enviados.has(chaveLembrete(c.id, vencimento))) continue;
    lista.push({
      cobrancaId: c.id,
      unidadeId: c.unidade_id,
      email: String(c.cliente_email).trim().toLowerCase(),
      cliente: String(c.cliente || "cliente"),
      valor: Number(c.valor),
      vencimento,
      diasParaVencer: faltam,
    });
  }
  return lista;
}

/** Janela de vencimento a pedir ao banco (gte, lte) para o dia do lembrete. */
export function janelaDeBusca(hoje: string, dias = DIAS_LEMBRETE): { de: string; ate: string } {
  return { de: somarDiasISO(hoje, dias), ate: somarDiasISO(hoje, dias) };
}

/** Dados do template boleto_lembrete para um item da lista. */
export function dadosDoLembrete(l: LembreteACobrar): Record<string, unknown> {
  return { valor: l.valor, vencimento: l.vencimento, cobranca_id: l.cobrancaId };
}
