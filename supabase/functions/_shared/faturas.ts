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

// ---------------------------------------------------------------------------
// Notas fiscais do cliente
// ---------------------------------------------------------------------------

export interface NotaCliente {
  id: string;
  unidade_id: string | null;
  numero: string;
  emitida_em: string | null;
  valor: number;
  descricao: string;
  pdf_url: string | null;
  tem_xml: boolean;
}

/**
 * CPF/CNPJ como pode ter sido digitado: como está no cadastro, só dígitos e com
 * máscara. A nota guarda o documento do jeito que a equipe digitou.
 */
export function variantesDocumento(doc: unknown): string[] {
  const bruto = String(doc ?? "").trim();
  const d = bruto.replace(/\D/g, "");
  const lista = [bruto, d];
  if (d.length === 11) lista.push(`${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`);
  if (d.length === 14) lista.push(`${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`);
  return [...new Set(lista.filter((v) => v.length >= 11))];
}

const linkHttp = (v: unknown) => (typeof v === "string" && /^https:\/\//i.test(v.trim()) ? v.trim() : null);

/** Nota fiscal → item da área do cliente. Só autorizada (nunca simulada, cancelada, com erro). */
export function notaDoCliente(n: Linha): NotaCliente | null {
  if (!n || n.status !== "autorizada") return null;
  return {
    id: String(n.id), unidade_id: n.unidade_id ?? null,
    numero: texto(n.numero) || texto(n.rps_numero) || "—",
    emitida_em: dia(n.created_at), valor: Number(n.valor || 0),
    descricao: texto(n.descricao) || "Nota fiscal de serviço",
    pdf_url: linkHttp(n.pdf_url), tem_xml: !!texto(n.xml_url),
  };
}

/** Mais recentes primeiro. */
export function ordenarNotas(lista: NotaCliente[]): NotaCliente[] {
  return [...lista].sort((a, b) => (b.emitida_em || "").localeCompare(a.emitida_em || ""));
}
