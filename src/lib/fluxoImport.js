// ============================================================================
// Importação de Fluxo de Caixa por planilha (Excel/CSV) + geração do modelo.
//
// O SheetJS (xlsx) é carregado sob demanda (import dinâmico) para não pesar o
// bundle inicial — só entra quando o usuário abre a importação.
// ============================================================================

import { parseDateToCompetencia } from "./dateUtils.js";
import { SECOES } from "./storeSeeds.js";

// Cabeçalhos do modelo (ordem e rótulos exatos).
export const COLUNAS = ["Data", "Tipo", "Descrição", "Valor", "Categoria", "Subcategoria", "Conta", "Situação"];

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

// "1.500,00" | "1500.00" | 1500 | "R$ 1.500,00" → número
function parseValorBR(v) {
  if (typeof v === "number") return v;
  let s = String(v ?? "").trim();
  if (!s) return NaN;
  s = s.replace(/r\$/gi, "").replace(/\s/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", "."); // BR: ponto=milhar, vírgula=decimal
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = parseFloat(s);
  return Number.isNaN(n) ? NaN : n;
}

function tipoDe(v) {
  const t = norm(v);
  if (["entrada", "entradas", "receita", "credito", "e", "+"].includes(t)) return "entrada";
  if (["saida", "saidas", "despesa", "debito", "s", "-"].includes(t)) return "saida";
  return null;
}

// Célula de data (Date do Excel ou texto) → "DD/MM/AAAA".
function dataDe(v) {
  if (v == null || v === "") return "";
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${String(v.getDate()).padStart(2, "0")}/${String(v.getMonth() + 1).padStart(2, "0")}/${v.getFullYear()}`;
  }
  return String(v).trim();
}

/** Gera e baixa o modelo .xlsx (aba de lançamentos + aba de instruções com os
 *  valores válidos DESTA unidade — contas e categorias). */
export async function gerarModeloFluxo({ contas = [], categorias = [], unidadeNome = "" }) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const contaEx = contas[0]?.banco || "Banco Inter";

  // Aba 1 — Lançamentos (com 2 exemplos que o usuário deve apagar)
  const exemplos = [
    { Data: "05/01/2026", Tipo: "Entrada", "Descrição": "EXEMPLO - Mensalidade Sala 3", Valor: 2890, Categoria: "Receita Operacional Bruta", Subcategoria: "Aluguel de Salas Privativas", Conta: contaEx, "Situação": "Pago" },
    { Data: "10/01/2026", Tipo: "Saída", "Descrição": "EXEMPLO - Conta de energia", Valor: 450.5, Categoria: "Despesas Operacionais", Subcategoria: "Energia e água", Conta: contaEx, "Situação": "Pago" },
  ];
  const ws = XLSX.utils.json_to_sheet(exemplos, { header: COLUNAS });
  ws["!cols"] = [{ wch: 12 }, { wch: 9 }, { wch: 36 }, { wch: 12 }, { wch: 27 }, { wch: 27 }, { wch: 16 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws, "Lançamentos");

  // Aba 2 — Instruções + valores válidos
  const guia = [
    ["COMO PREENCHER"],
    ["1) Vá na aba \"Lançamentos\". Apague as 2 linhas de EXEMPLO e coloque os seus lançamentos."],
    ["2) Não mude os títulos das colunas (linha 1)."],
    ["3) Salve o arquivo e faça o upload no app (Financeiro → Importar Excel)."],
    [""],
    ["REGRAS POR COLUNA"],
    ["Data", "dd/mm/aaaa — ex.: 05/01/2026"],
    ["Tipo", "Entrada ou Saída"],
    ["Valor", "número positivo — ex.: 2890 ou 2.890,50"],
    ["Situação", "Pago ou Previsto (vazio = Pago)"],
    ["Conta", "use EXATAMENTE um dos nomes de conta abaixo"],
    ["Categoria/Subcategoria", "use EXATAMENTE os nomes abaixo (subcategoria é opcional)"],
    [""],
    ["CONTAS VÁLIDAS (coluna Conta)"],
    ...contas.map((c) => [c.banco]),
    [""],
    ["CATEGORIAS E SUBCATEGORIAS VÁLIDAS", "(a categoria de receita só aceita Entrada; as de custo/despesa/tributo só aceitam Saída)"],
    ["Categoria", "Subcategorias possíveis"],
    ...categorias.map((c) => [c.nome, (c.subs || []).join("  |  ")]),
  ];
  const wsGuia = XLSX.utils.aoa_to_sheet(guia);
  wsGuia["!cols"] = [{ wch: 34 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, wsGuia, "Instruções");

  const slug = unidadeNome ? "-" + norm(unidadeNome).replace(/\s+/g, "-") : "";
  XLSX.writeFile(wb, `modelo-fluxo-de-caixa${slug}.xlsx`);
}

/** Lê a planilha enviada e devolve as linhas cruas (objetos por cabeçalho). */
export async function lerPlanilhaFluxo(file) {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { cellDates: true });
  const ws = wb.Sheets["Lançamentos"] || wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: "" });
}

/** Valida as linhas contra as contas/categorias da unidade. Retorna
 *  { validos: [lançamento pronto p/ addLancamentosBulk], erros: [{linha, motivo}] }. */
export function validarLinhas(rows, { contas = [], categorias = [] }) {
  const contaPorNome = new Map(contas.map((c) => [norm(c.banco), c]));
  const catPorNome = new Map(categorias.map((c) => [norm(c.nome), c]));
  const validos = [];
  const erros = [];

  rows.forEach((r, i) => {
    const linhaExcel = i + 2; // +1 cabeçalho, +1 base-1
    const get = (nomes) => {
      for (const n of nomes) {
        const k = Object.keys(r).find((kk) => norm(kk) === norm(n));
        if (k != null && r[k] !== "") return r[k];
      }
      return "";
    };
    const descricao = String(get(["Descrição", "Descricao", "Histórico", "Historico"]) || "").trim();
    const tipo = tipoDe(get(["Tipo"]));
    const valor = parseValorBR(get(["Valor"]));
    const dataStr = dataDe(get(["Data"]));
    const catNome = String(get(["Categoria"]) || "").trim();
    const subNome = String(get(["Subcategoria", "Subcategoría"]) || "").trim();
    const contaNome = String(get(["Conta", "Banco"]) || "").trim();
    const sit = norm(get(["Situação", "Situacao", "Status"]));
    const status = ["previsto", "a receber", "a pagar", "pendente", "aberto"].includes(sit) ? "previsto" : "pago";

    // Linha totalmente vazia → ignora sem erro.
    if (!descricao && !tipo && Number.isNaN(valor) && !dataStr && !catNome && !contaNome) return;

    const motivos = [];
    if (!descricao) motivos.push("descrição vazia");
    if (!tipo) motivos.push('tipo inválido (use "Entrada" ou "Saída")');
    if (Number.isNaN(valor) || valor <= 0) motivos.push("valor inválido (número maior que zero)");

    const cat = catPorNome.get(norm(catNome));
    if (!catNome) motivos.push("categoria vazia");
    else if (!cat) motivos.push(`categoria "${catNome}" não existe nesta unidade`);
    else if (tipo) {
      const sec = SECOES.find((s) => s.key === cat.secao);
      if (sec && sec.tipo !== "ambos" && sec.tipo !== tipo) {
        motivos.push(`categoria "${cat.nome}" é de ${sec.tipo === "entrada" ? "entrada" : "saída"} e não combina com ${tipo === "entrada" ? "Entrada" : "Saída"}`);
      }
    }

    const conta = contaPorNome.get(norm(contaNome));
    if (!contaNome) motivos.push("conta vazia");
    else if (!conta) motivos.push(`conta "${contaNome}" não existe nesta unidade`);

    let subFinal = "";
    if (cat) {
      const achou = subNome ? (cat.subs || []).find((s) => norm(s) === norm(subNome)) : null;
      subFinal = achou || (cat.subs || [])[0] || "";
    }

    if (motivos.length) { erros.push({ linha: linhaExcel, motivo: motivos.join("; "), descricao }); return; }

    const { mes } = parseDateToCompetencia(dataStr);
    validos.push({
      tipo, descricao, valor: Math.round(valor * 100) / 100,
      categoria: cat.nome, subcategoria: subFinal, contaId: conta.id,
      data: dataStr, status, mes, origem: "importacao",
    });
  });

  return { validos, erros };
}
