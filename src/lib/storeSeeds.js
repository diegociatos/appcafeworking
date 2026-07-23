// ============================================================================
// CafeWorking — dados de seed (demonstração) e constantes de catálogo.
//
// Extraído de store.jsx para deixar o provider focado na lógica de estado.
// Em produção (Supabase configurado) estes seeds NÃO são exibidos — o store
// parte vazio (seedOr) e hidrata do banco. Aqui vivem apenas:
//   • PERFIS (RBAC) e SECOES (DRE) — constantes de config exportadas às telas;
//   • seed* — dados de demonstração;
//   • gerarDadosBoleto — gerador de linha digitável/PIX para o modo demo.
// ============================================================================

import { UNIDADES, SALAS, PRODUTOS } from "./data.js";

const NOME_TO_ID = { Luxemburgo: "lux", Estoril: "est" };

// Perfis de acesso (RBAC). `modules: null` = vê tudo. `landing` = página inicial.
export const PERFIS = {
  franqueador: { label: "Administrador (plataforma)", cor: "#0E4B4F", modules: ["dash", "franqueados", "auditoria"], landing: "dash" },
  master: {
    label: "Master (coworking)",
    cor: "#B8862F",
    modules: ["dash", "equipe", "crm", "planos", "unidades", "salas", "patrimonio", "reservas", "corresp", "pdv", "kds", "catalogo", "estoque", "clientes", "chat", "financeiro", "boletos", "cobrancas", "notafiscal", "eventos", "auditoria"],
    landing: "dash",
  },
  recepcao: {
    label: "Recepção",
    cor: "#335C81",
    modules: ["salas", "reservas", "pdv", "kds", "catalogo", "estoque", "crm", "corresp", "clientes", "chat"],
    landing: "reservas",
  },
  financeiro: {
    label: "Financeiro",
    cor: "#3D7A5A",
    modules: ["dash", "financeiro", "boletos", "cobrancas", "notafiscal", "planos", "patrimonio", "estoque", "catalogo", "clientes", "crm"],
    landing: "financeiro",
  },
  cliente: {
    label: "Cliente",
    cor: "#6E4E3B",
    modules: ["cli_inicio", "cli_reservar", "cli_cafe", "cli_faturas", "cli_docs", "cli_fiscal", "cli_chat", "cli_notif"],
    landing: "cli_inicio",
  },
};

// Seeds normalizados --------------------------------------------------------
// Toda unidade pertence a uma CONTA (coworking/master). O Admin da plataforma
// não tem unidades — ele vende o app e gerencia as contas.
export const seedUnidades = [
  ...UNIDADES.map((u) => ({ ...u, franqueadoId: "fr_ciatos" })),
];

// Contas (cada coworking que assina o app), com usuário master e plano/assinatura
export const seedFranqueados = [
  { id: "fr_ciatos", nome: "Grupo Ciatos", master: "Diego Garcia", email: "diego.garcia@grupociatos.com.br", documento: "20.351.761/0001-03", telefone: "(31) 99712-9789", plano: "Pro", mensalidade: 597, criadoEm: "2024-01" },
];

// Equipe começa vazia — os usuários reais são cadastrados pela tela (Equipe).
export const seedUsuarios = [];

// ===== Financeiro (ERP) — contas bancárias, lançamentos, catálogo =========
export const seedContas = [
  { id: "cb1", unidadeId: "lux", banco: "Itaú", tipo: "Conta corrente", saldo: 48250 },
  { id: "cb2", unidadeId: "lux", banco: "Mercado Pago", tipo: "Conta digital", saldo: 9120 },
  { id: "cb3", unidadeId: "lux", banco: "Caixa da loja", tipo: "Dinheiro", saldo: 1850 },
  { id: "cb4", unidadeId: "est", banco: "Sicoob", tipo: "Conta corrente", saldo: 22300 },
  { id: "cb5", unidadeId: "est", banco: "Caixa da loja", tipo: "Dinheiro", saldo: 940 },
];

export const seedLancamentos = [
  // histórico (meses 0..4) — Luxemburgo
  ...[0, 1, 2, 3, 4].flatMap((m) => [
    { id: `he${m}`, unidadeId: "lux", mes: m, tipo: "entrada", descricao: "Mensalidades e serviços", categoria: "Receita Operacional Bruta", subcategoria: "Coworking", valor: [44200, 46800, 43900, 49100, 51200][m], contaId: "cb1", status: "pago", data: `05/0${m + 1}` },
    { id: `ht${m}`, unidadeId: "lux", mes: m, tipo: "saida", descricao: "Simples Nacional", categoria: "Tributos", subcategoria: "Simples Nacional", valor: [3500, 3700, 3500, 3900, 4100][m], contaId: "cb1", status: "pago", data: `15/0${m + 1}` },
    { id: `hs${m}`, unidadeId: "lux", mes: m, tipo: "saida", descricao: "Despesas operacionais", categoria: "Despesas Operacionais", subcategoria: "Folha de pagamento", valor: [31200, 30800, 32400, 33100, 31900][m], contaId: "cb1", status: "pago", data: `10/0${m + 1}` },
  ]),
  // mês atual (5 = Jun) — Luxemburgo
  { id: "l1", unidadeId: "lux", mes: 5, tipo: "entrada", descricao: "Mensalidades · planos coworking", categoria: "Receita Operacional Bruta", subcategoria: "Coworking", valor: 38200, contaId: "cb1", status: "pago", data: "05/06" },
  { id: "l2", unidadeId: "lux", mes: 5, tipo: "entrada", descricao: "Vendas da cafeteria", categoria: "Receita Operacional Bruta", subcategoria: "Cafeteria", valor: 8750, contaId: "cb3", status: "pago", data: "28/06" },
  { id: "l3", unidadeId: "lux", mes: 5, tipo: "entrada", descricao: "Locação de salas de reunião", categoria: "Receita Operacional Bruta", subcategoria: "Aluguel de Sala de Reunião", valor: 4300, contaId: "cb1", status: "pago", data: "20/06" },
  { id: "l4", unidadeId: "lux", mes: 5, tipo: "entrada", descricao: "Mensalidade sala privativa · Consultoria RM", categoria: "Receita Operacional Bruta", subcategoria: "Aluguel de Salas Privativas", valor: 2890, contaId: "cb1", status: "previsto", data: "28/06" },
  { id: "l9", unidadeId: "lux", mes: 5, tipo: "saida", descricao: "Simples Nacional", categoria: "Tributos", subcategoria: "Simples Nacional", valor: 4200, contaId: "cb1", status: "pago", data: "15/06" },
  { id: "l8", unidadeId: "lux", mes: 5, tipo: "saida", descricao: "Insumos da cafeteria", categoria: "Custo Direto", subcategoria: "Insumos cafeteria", valor: 3900, contaId: "cb3", status: "previsto", data: "30/06" },
  { id: "l5", unidadeId: "lux", mes: 5, tipo: "saida", descricao: "Aluguel do imóvel", categoria: "Despesas Operacionais", subcategoria: "Aluguel do imóvel", valor: 12000, contaId: "cb1", status: "pago", data: "05/06" },
  { id: "l6", unidadeId: "lux", mes: 5, tipo: "saida", descricao: "Folha de pagamento", categoria: "Despesas Operacionais", subcategoria: "Folha de pagamento", valor: 16800, contaId: "cb1", status: "pago", data: "05/06" },
  { id: "l7", unidadeId: "lux", mes: 5, tipo: "saida", descricao: "Energia e água", categoria: "Despesas Operacionais", subcategoria: "Energia e água", valor: 2450, contaId: "cb1", status: "pago", data: "12/06" },
  { id: "l10", unidadeId: "lux", mes: 5, tipo: "entrada", descricao: "Aporte do sócio", categoria: "Conta Movimentação", subcategoria: "Aporte de sócio", valor: 10000, contaId: "cb1", status: "pago", data: "03/06" },
  // Estoril
  { id: "e1", unidadeId: "est", mes: 5, tipo: "entrada", descricao: "Mensalidades · planos", categoria: "Receita Operacional Bruta", subcategoria: "Coworking", valor: 21400, contaId: "cb4", status: "pago", data: "05/06" },
  { id: "e4", unidadeId: "est", mes: 5, tipo: "saida", descricao: "Simples Nacional", categoria: "Tributos", subcategoria: "Simples Nacional", valor: 1850, contaId: "cb4", status: "pago", data: "15/06" },
  { id: "e2", unidadeId: "est", mes: 5, tipo: "saida", descricao: "Aluguel do imóvel", categoria: "Despesas Operacionais", subcategoria: "Aluguel do imóvel", valor: 8500, contaId: "cb4", status: "pago", data: "05/06" },
  { id: "e3", unidadeId: "est", mes: 5, tipo: "saida", descricao: "Folha de pagamento", categoria: "Despesas Operacionais", subcategoria: "Folha de pagamento", valor: 9200, contaId: "cb4", status: "previsto", data: "05/06" },
];

// Seções do DRE (ordem e regra de cálculo). `tipo` limita entrada/saida.
export const SECOES = [
  { key: "receita_bruta", label: "Receita Operacional Bruta", tipo: "entrada" },
  { key: "tributos", label: "Tributos", tipo: "saida" },
  { key: "custo_direto", label: "Custo Direto", tipo: "saida" },
  { key: "despesa_operacional", label: "Despesas Operacionais", tipo: "saida" },
  // Abaixo da linha do resultado (não afetam o Lucro Líquido):
  { key: "investimentos", label: "Investimentos/Dividendos", tipo: "ambos" },
  { key: "movimentacao", label: "Conta Movimentação", tipo: "ambos" },
];

// Categorias = linhas do DRE; cada uma tem subcategorias. Globais.
export const seedCategorias = [
  { id: "cat_rob", secao: "receita_bruta", nome: "Receita Operacional Bruta", subs: ["Aluguel de Salas Privativas", "Aluguel de Sala de Reunião", "Endereço Fiscal", "Coworking", "Cafeteria"] },
  { id: "cat_trib", secao: "tributos", nome: "Tributos", subs: ["Simples Nacional", "ISS", "Taxas"] },
  { id: "cat_cd", secao: "custo_direto", nome: "Custo Direto", subs: ["Insumos cafeteria", "Comissões", "Material de consumo"] },
  { id: "cat_do", secao: "despesa_operacional", nome: "Despesas Operacionais", subs: ["Aluguel do imóvel", "Folha de pagamento", "Energia e água", "Internet", "Marketing", "Limpeza"] },
  { id: "cat_inv", secao: "investimentos", nome: "Investimentos/Dividendos", subs: ["Dividendos (distribuição de lucros)", "Aplicação financeira", "Resgate de aplicação", "Compra de FII/Ações", "Venda de FII/Ações", "Rendimentos de aplicações", "Compra de equipamentos"] },
  { id: "cat_mov", secao: "movimentacao", nome: "Conta Movimentação", subs: ["Transferência entre contas", "Aporte de sócio", "Retirada de sócio", "Empréstimo"] },
];

// Planos e serviços que cada unidade comercializa (faturamento)
export const seedCatalogoServicos = [
  { id: "ct1", unidadeId: "lux", nome: "Sala Privativa", tipo: "plano", preco: 2890, custo: 900, recorrente: true, ativo: true },
  { id: "ct2", unidadeId: "lux", nome: "Endereço Fiscal", tipo: "plano", preco: 119, custo: 20, recorrente: true, ativo: true },
  { id: "ct3", unidadeId: "lux", nome: "Coworking Mensal", tipo: "plano", preco: 390, custo: 80, recorrente: true, ativo: true },
  { id: "ct4", unidadeId: "lux", nome: "Diária de Coworking", tipo: "servico", preco: 59, custo: 12, recorrente: false, ativo: true },
  { id: "ct5", unidadeId: "lux", nome: "Hora de Sala de Reunião", tipo: "servico", preco: 120, custo: 25, recorrente: false, ativo: true },
  { id: "ct6", unidadeId: "est", nome: "Coworking Mensal", tipo: "plano", preco: 390, custo: 80, recorrente: true, ativo: true },
  { id: "ct7", unidadeId: "est", nome: "Sala Privativa", tipo: "plano", preco: 2490, custo: 850, recorrente: true, ativo: true },
];

// Produtos da cafeteria — agora fazem parte do catálogo (tipo "produto").
// Cadastrados em "Produtos e Serviços" e exibidos no PDV/cafeteria para a recepção.
export const seedCatalogoProdutos = UNIDADES.flatMap((u) =>
  PRODUTOS.map((p) => ({
    id: `cafe-${u.id}-${p.id}`, unidadeId: u.id, nome: p.nome,
    tipo: "produto", categoria: p.cat, preco: p.preco, custo: p.cmv,
    emoji: p.emoji, foto: p.foto || null, recorrente: false, ativo: true,
  }))
);

export const seedCatalogo = [...seedCatalogoProdutos, ...seedCatalogoServicos];

// Correspondências do endereço fiscal (por unidade)
const anexoFoto = (seed) => ({ nome: "correspondencia.jpg", tipo: "image/jpeg", url: `https://picsum.photos/seed/${seed}/420/560` });
export const seedCorresp = [
  { id: "co1", unidadeId: "lux", cliente: "Mendes Advocacia", remetente: "Receita Federal", tipo: "Notificação", descricao: "Notificação de malha fina do exercício 2025.", recebido: "Hoje 09:18", status: "aguardando", urgente: true, anexo: anexoFoto("corr1") },
  { id: "co2", unidadeId: "lux", cliente: "Ciatos Log Transportes", remetente: "DET-MG", tipo: "Notificação", descricao: "Auto de infração de trânsito do veículo da frota.", recebido: "Ontem 16:40", status: "digitalizada", urgente: false, anexo: anexoFoto("corr2") },
  { id: "co3", unidadeId: "est", cliente: "Consultoria RM", remetente: "Banco Itaú", tipo: "Extrato", descricao: "Extrato bancário mensal.", recebido: "26/05 11:20", status: "notificado", urgente: false, anexo: anexoFoto("corr3") },
  { id: "co4", unidadeId: "lux", cliente: "Mendes Advocacia", remetente: "Tribunal de Justiça MG", tipo: "Intimação", descricao: "Intimação para audiência do processo 0012345.", recebido: "25/05 14:00", status: "retirada", urgente: false, anexo: anexoFoto("corr4") },
];

// Conversas do chat (cliente <-> recepção), por unidade
export const seedConversas = [
  { id: "cv1", unidadeId: "lux", cliente: "Ciatos Log Transportes", online: true, unread: 1, msgs: [
    { de: "adm", txt: "Olá! Aqui é a recepção do CafeWorking. Como podemos ajudar?", h: "08:40" },
    { de: "cli", txt: "Bom dia! Chegou alguma correspondência pra gente?", h: "08:42" },
  ] },
  { id: "cv2", unidadeId: "lux", cliente: "Mendes Advocacia", online: true, unread: 1, msgs: [
    { de: "cli", txt: "Preciso da Sala Master quinta às 14h, é possível?", h: "Ontem" },
  ] },
  { id: "cv3", unidadeId: "est", cliente: "TechBH Software", online: false, unread: 0, msgs: [
    { de: "cli", txt: "Valeu pelo café hoje! 🙌", h: "Seg" },
    { de: "adm", txt: "Disponha! Qualquer coisa estamos aqui.", h: "Seg" },
  ] },
];

// Pedidos da cafeteria (feitos pelo cliente no app → chegam na recepção)
export const seedPedidos = [
  {
    id: "pd_seed1", unidadeId: "lux", cliente: "Mendes Advocacia", origem: "app",
    itens: [{ nome: "Cappuccino", preco: 12, q: 2, emoji: "☕" }, { nome: "Pão de Queijo", preco: 6.5, q: 3, emoji: "🧀" }],
    total: 43.5, status: "recebido", hora: "09:12",
  },
];

export const seedSalas = SALAS.map((s) => ({
  ...s,
  unidadeId: s.unidadeId || NOME_TO_ID[s.unidade] || UNIDADES[0].id,
}));

// Produtos da cafeteria migraram para o catálogo (seedCatalogoProdutos).
// O estado `produtos` permanece apenas por compatibilidade (legado, não exibido).
export const seedProdutos = [];

// Contas bancárias para emissão de boletos (franqueado x franqueador).
// As CREDENCIAIS reais NÃO ficam aqui — em produção vão para o Supabase Vault
// e estas linhas guardam só `credenciaisRef`. Aqui é seed de demonstração.
export const seedBankAccounts = [
  { id: "ba_inter_ciatos", unidadeId: "lux", franqueadoId: "fr_ciatos", banco: "inter", tipo: "franqueado", apelido: "Inter · Grupo Ciatos", ambiente: "prod", beneficiarioNome: "Grupo Ciatos Coworking LTDA", beneficiarioDocumento: "20.351.761/0001-03", agencia: "0001", conta: "12345678-9", pixChave: "financeiro@grupociatos.com.br", credenciaisRef: "inter_grupo_ciatos_prod", ativo: true,
    conexao: { status: "conectado", boleto: true, pix: true, conectadoEm: "2026-05-20" }, autoRegistrar: true, gerarPix: true },
  { id: "ba_btg_ciatos", unidadeId: "lux", franqueadoId: "fr_ciatos", banco: "btg", tipo: "franqueado", apelido: "BTG · Grupo Ciatos", ambiente: "prod", beneficiarioNome: "Grupo Ciatos Coworking LTDA", beneficiarioDocumento: "20.351.761/0001-03", agencia: "0050", conta: "809124-0", pixChave: "", credenciaisRef: "btg_grupo_ciatos_prod", ativo: true,
    conexao: { status: "desconectado", boleto: false, pix: false }, autoRegistrar: true, gerarPix: true },
  { id: "ba_itau_plat", unidadeId: "lux", franqueadoId: null, banco: "itau", tipo: "franqueador", apelido: "Itaú · Plataforma CafeWorking", ambiente: "sandbox", beneficiarioNome: "CafeWorking Tecnologia LTDA", beneficiarioDocumento: "48.112.090/0001-55", agencia: "", conta: "", pixChave: "", credenciaisRef: "itau_plataforma_sandbox", ativo: true,
    conexao: { status: "desconectado", boleto: false, pix: false }, autoRegistrar: true, gerarPix: false },
];

// Gera dados plausíveis de um boleto (modo demonstração).
let _boletoSeq = 184500;
export const gerarDadosBoleto = (banco) => {
  const nn = String(++_boletoSeq).padStart(11, "0");
  const bloco = () => String(Math.floor(Math.random() * 1e10)).padStart(10, "0");
  const linha = `${banco === "inter" ? "077" : "341"}9${bloco()} ${bloco()} ${bloco()} 4 ${String(Math.floor(Math.random() * 1e14)).padStart(14, "0")}`;
  const pix = `00020126580014BR.GOV.BCB.PIX0136${crypto?.randomUUID?.() || "demo-pix-" + nn}5204000053039865802BR5920CAFEWORKING6009SAO PAULO62070503***6304ABCD`;
  return { nossoNumero: nn, linhaDigitavel: linha, pixCopiaCola: pix };
};

export const seedBoletos = [
  { id: "bol_1", bankAccountId: "ba_inter_ciatos", unidadeId: "lux", sacado: "Mendes Advocacia", sacadoDocumento: "12.345.678/0001-90", valor: 2890, vencimento: "2026-06-10", instrucoes: "Mensalidade sala privativa - Junho", ...gerarDadosBoleto("inter"), status: "registrado", pdfUrl: "", createdAt: "2026-06-01" },
  { id: "bol_2", bankAccountId: "ba_inter_ciatos", unidadeId: "lux", sacado: "TechBH Software", sacadoDocumento: "33.444.555/0001-22", valor: 390, vencimento: "2026-06-05", instrucoes: "Plano coworking mensal", ...gerarDadosBoleto("inter"), status: "pago", pdfUrl: "", createdAt: "2026-05-28", paidAt: "2026-06-02" },
  { id: "bol_3", bankAccountId: "ba_itau_plat", unidadeId: "lux", sacado: "Franquia Savassi", sacadoDocumento: "42.518.770/0001-22", valor: 297, vencimento: "2026-06-15", instrucoes: "Assinatura plataforma - Essencial", ...gerarDadosBoleto("itau"), status: "registrado", pdfUrl: "", createdAt: "2026-06-02" },
];

// Contratos recorrentes: o sistema emite boleto todo mês até o fim do prazo;
// ao vencer, o contrato é sinalizado para o financeiro renovar/atualizar valores.
export const seedContratos = [
  { id: "ct_mendes", unidadeId: "lux", cliente: "Mendes Advocacia", documento: "12.345.678/0001-90", plano: "Sala Privativa", valorMensal: 2890, bankAccountId: "ba_inter_ciatos", diaVencimento: "10", mesInicial: 0, meses: 12, status: "ativo", criadoEm: "2026-01" },
  { id: "ct_rm", unidadeId: "lux", cliente: "Consultoria RM", documento: "55.666.777/0001-88", plano: "Endereço Fiscal", valorMensal: 119, bankAccountId: "ba_inter_ciatos", diaVencimento: "05", mesInicial: 0, meses: 6, status: "ativo", criadoEm: "2026-01" },
];

export const seedEstoque = [
  { id: "es1", unidadeId: "lux", nome: "Espresso", tipo: "insumo", categoria: "Cafeteria", quantidade: 120, estoqueMinimo: 40, unidade: "un", custo: 1.8, precoVenda: 7 },
  { id: "es2", unidadeId: "lux", nome: "Cappuccino", tipo: "insumo", categoria: "Cafeteria", quantidade: 12, estoqueMinimo: 20, unidade: "un", custo: 3.5, precoVenda: 12 },
  { id: "es3", unidadeId: "lux", nome: "Pão de Queijo", tipo: "insumo", categoria: "Cafeteria", quantidade: 64, estoqueMinimo: 24, unidade: "un", custo: 1.9, precoVenda: 6.5 },
  { id: "es4", unidadeId: "lux", nome: "Café em grãos", tipo: "insumo", categoria: "Insumo", quantidade: 9, estoqueMinimo: 5, unidade: "kg", custo: 42, precoVenda: 0 },
  { id: "es5", unidadeId: "lux", nome: "Leite integral", tipo: "insumo", categoria: "Insumo", quantidade: 6, estoqueMinimo: 12, unidade: "L", custo: 5.2, precoVenda: 0 },
  { id: "es6", unidadeId: "lux", nome: "Copos descartáveis", tipo: "uso", categoria: "Suprimento", quantidade: 380, estoqueMinimo: 200, unidade: "un", custo: 0.12, precoVenda: 0 },
  { id: "es7", unidadeId: "lux", nome: "Papel higiênico", tipo: "uso", categoria: "Limpeza", quantidade: 18, estoqueMinimo: 24, unidade: "rolo", custo: 1.4, precoVenda: 0 },
  { id: "es8", unidadeId: "lux", nome: "Caderno A5", tipo: "revenda", categoria: "Escritório", quantidade: 25, estoqueMinimo: 8, unidade: "un", custo: 7.5, precoVenda: 18 },
  { id: "es9", unidadeId: "lux", nome: "Caneta esferográfica", tipo: "revenda", categoria: "Escritório", quantidade: 60, estoqueMinimo: 20, unidade: "un", custo: 1.2, precoVenda: 4 },
];

// Patrimônio: ativos mobilizados (mobília/equipamentos) com contrato/NF.
export const seedPatrimonio = [
  { id: "pt1", unidadeId: "lux", nome: "Mesa de reunião 8 lugares", categoria: "Mobiliário", quantidade: 3, valorUnitario: 2400, aquisicao: "2024-02", fornecedor: "Marcenaria BH", anexo: null },
  { id: "pt2", unidadeId: "lux", nome: "Cadeira ergonômica", categoria: "Mobiliário", quantidade: 40, valorUnitario: 890, aquisicao: "2024-01", fornecedor: "Flexform", anexo: null },
  { id: "pt3", unidadeId: "lux", nome: "Projetor 4K", categoria: "Equipamento", quantidade: 4, valorUnitario: 3200, aquisicao: "2024-03", fornecedor: "Epson", anexo: null },
  { id: "pt4", unidadeId: "lux", nome: "Ar-condicionado split", categoria: "Equipamento", quantidade: 6, valorUnitario: 2800, aquisicao: "2023-11", fornecedor: "LG", anexo: null },
  { id: "pt5", unidadeId: "lux", nome: "Notebook recepção", categoria: "TI", quantidade: 2, valorUnitario: 4500, aquisicao: "2024-04", fornecedor: "Dell", anexo: null },
];

// Configuração fiscal POR UNIDADE (NFS-e). O certificado digital A1 real vai
// pro Vault (certificadoRef) — nunca no app. Cada unidade tem a sua (município,
// inscrição municipal, código de serviço, alíquota ISS, ambiente).
export const seedConfigFiscal = [
  { unidadeId: "lux", municipio: "Belo Horizonte", uf: "MG", inscricaoMunicipal: "1.234.567/001-8", regime: "Simples Nacional", codigoServico: "08.01", descricaoServico: "Locação de espaço para coworking e salas", aliquotaISS: 2, emissor: "nacional", ambiente: "homologacao", certificadoRef: "cert_nfse_lux", emissaoAtiva: true },
  { unidadeId: "est", municipio: "Belo Horizonte", uf: "MG", inscricaoMunicipal: "1.234.567/002-6", regime: "Simples Nacional", codigoServico: "08.01", descricaoServico: "Locação de espaço para coworking e salas", aliquotaISS: 2, emissor: "nacional", ambiente: "homologacao", certificadoRef: "cert_nfse_est", emissaoAtiva: true },
];

export const seedNotasFiscais = [
  { id: "nf1", unidadeId: "lux", numero: "000124", tomador: "Mendes Advocacia", tomadorDoc: "31.882.004/0001-77", descricao: "Mensalidade sala privativa · Jun/2026", valor: 2890, iss: 57.8, status: "autorizada", emitidaEm: "2026-06-05", pdfUrl: "", xmlUrl: "" },
  { id: "nf2", unidadeId: "lux", numero: "000123", tomador: "TechBH Software", tomadorDoc: "33.444.555/0001-22", descricao: "Plano coworking mensal · Jun/2026", valor: 390, iss: 7.8, status: "autorizada", emitidaEm: "2026-06-02", pdfUrl: "", xmlUrl: "" },
];

// Planos vendáveis POR UNIDADE — o coworking define o que vende (mensal/avulso),
// preço e se emite nota fiscal. Usados no lançador de cobrança e no autocheckout
// do cliente (escolhe um plano e paga no cadastro).
export const seedPlanos = [
  { id: "pl_fiscal", unidadeId: "lux", nome: "Endereço Fiscal", preco: 119, recorrencia: "mensal", emiteNF: true, descricao: "Endereço fiscal + recebimento de correspondências", ativo: true },
  { id: "pl_cowork", unidadeId: "lux", nome: "Coworking Mensal", preco: 390, recorrencia: "mensal", emiteNF: true, descricao: "Estação compartilhada + café à vontade", ativo: true },
  { id: "pl_priv", unidadeId: "lux", nome: "Sala Privativa", preco: 2890, recorrencia: "mensal", emiteNF: true, descricao: "Escritório privativo mobiliado", ativo: true },
  { id: "pl_day", unidadeId: "lux", nome: "Day Pass", preco: 59, recorrencia: "avulso", emiteNF: true, descricao: "Acesso por um dia ao coworking", ativo: true },
];
