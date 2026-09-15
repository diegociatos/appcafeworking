// ============================================================================
// Faturas do cliente — junta cobranças (Asaas), boletos e pedidos aguardando
// pagamento numa lista só, no formato da tela Faturas e do Início. Regras puras,
// testadas em faturas_test.ts.
// ============================================================================

// deno-lint-ignore no-explicit-any
type Linha = Record<string, any>;

export type Situacao = "aberta" | "vencida" | "paga" | "estornada";

export interface Fatura {
  id: string;
  fonte: "cobranca" | "boleto" | "pedido";
  unidade_id: string | null;
  descricao: string;
  valor: number;
  vencimento: string | null;
  situacao: Situacao;
  pago_em: string | null;
  pagar_url: string | null;
  boleto_url: string | null;
  pix_copia_cola: string | null;
  linha_digitavel: string | null;
}

const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const dia = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 10) : null);

function situacaoAberta(vencimento: string | null, hoje: string): Situacao {
  return vencimento && vencimento < hoje ? "vencida" : "aberta";
}

/** Cobrança do Asaas → fatura. Cancelada some da lista (null). */
export function faturaDeCobranca(c: Linha, hoje: string): Fatura | null {
  const st = String(c.status || "pendente");
  if (st === "cancelado") return null;
  const vencimento = dia(c.vencimento);
  const situacao: Situacao = st === "pago" ? "paga" : st === "estornado" ? "estornada" : st === "vencido" ? "vencida" : situacaoAberta(vencimento, hoje);
  return {
    id: `cob_${c.id}`, fonte: "cobranca", unidade_id: c.unidade_id ?? null,
    descricao: texto(c.descricao) || "Cobrança", valor: Number(c.valor || 0), vencimento, situacao,
    pago_em: c.pago_em ?? null, pagar_url: texto(c.invoice_url), boleto_url: texto(c.boleto_url),
    pix_copia_cola: situacao === "paga" || situacao === "estornada" ? null : texto(c.pix_payload),
    linha_digitavel: situacao === "paga" || situacao === "estornada" ? null : texto(c.linha_digitavel),
  };
}

/** Boleto bancário → fatura. Cancelado ou com erro de emissão some (null). */
export function faturaDeBoleto(b: Linha, hoje: string): Fatura | null {
  const st = String(b.status || "emitido");
  if (st === "cancelado" || st === "erro") return null;
  const vencimento = dia(b.vencimento);
  const situacao: Situacao = st === "pago" ? "paga" : st === "vencido" ? "vencida" : situacaoAberta(vencimento, hoje);
  const aberta = situacao !== "paga";
  return {
    id: `bol_${b.id}`, fonte: "boleto", unidade_id: b.unidade_id ?? null,
    descricao: texto(b.instrucoes) || "Boleto", valor: Number(b.valor || 0), vencimento, situacao,
    pago_em: null, pagar_url: null, boleto_url: texto(b.pdf_url),
    pix_copia_cola: aberta ? texto(b.pix_copia_cola) : null, linha_digitavel: aberta ? texto(b.linha_digitavel) : null,
  };
}

/** Cadastro pelo site que ainda espera o primeiro pagamento. */
export function faturaDePedido(p: Linha): Fatura | null {
  if (!texto(p.invoice_url)) return null;
  return {
    id: `ped_${p.id ?? p.created_at}`, fonte: "pedido", unidade_id: p.unidade_id ?? null,
    descricao: `${texto(p.plano_nome) || "Plano"} · primeiro pagamento`, valor: Number(p.valor || 0),
    vencimento: dia(p.created_at), situacao: "aberta", pago_em: null, pagar_url: texto(p.invoice_url),
    boleto_url: null, pix_copia_cola: null, linha_digitavel: null,
  };
}

/** Em aberto primeiro (vencimento mais antigo antes); depois as pagas, mais recentes antes. */
export function ordenarFaturas(lista: Fatura[]): Fatura[] {
  const peso = (f: Fatura) => (f.situacao === "vencida" ? 0 : f.situacao === "aberta" ? 1 : 2);
  return [...lista].sort((a, b) => {
    const p = peso(a) - peso(b);
    if (p) return p;
    const va = a.vencimento || "", vb = b.vencimento || "";
    return peso(a) < 2 ? va.localeCompare(vb) : vb.localeCompare(va);
  });
}

export function resumoFaturas(lista: Fatura[]) {
  const abertas = lista.filter((f) => f.situacao === "aberta" || f.situacao === "vencida");
  return {
    em_aberto: abertas.length,
    vencidas: abertas.filter((f) => f.situacao === "vencida").length,
    valor_em_aberto: Math.round(abertas.reduce((s, f) => s + f.valor, 0) * 100) / 100,
    proxima: ordenarFaturas(abertas)[0] ?? null,
  };
}
