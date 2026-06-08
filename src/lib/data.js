// CafeWorking — dados de demonstração
// 🔌 No Codex: substituir esses arrays por funções que chamam a API real (Supabase, etc.)
import { C } from "./theme.js";

export const UNIDADES = [
  { id: "lux", nome: "Luxemburgo", endereco: "Rua Guaicuí, 715 · BH/MG", salas: 14, ocupacao: 86, membros: 92, receita: 184500, cor: C.cafe },
  { id: "est", nome: "Estoril", endereco: "Av. Raja Gabaglia, 2000 · BH/MG", salas: 9, ocupacao: 71, membros: 58, receita: 121300, cor: C.teal },
];

export const PRODUTOS = [
  { id: 1, nome: "Espresso", cat: "Café", preco: 7.0, emoji: "☕", cmv: 1.8, foto: "https://picsum.photos/seed/espresso/240/240" },
  { id: 2, nome: "Cappuccino", cat: "Café", preco: 12.0, emoji: "☕", cmv: 3.5, foto: "https://picsum.photos/seed/cappuccino/240/240" },
  { id: 3, nome: "Latte", cat: "Café", preco: 13.5, emoji: "🥛", cmv: 4.0 },
  { id: 4, nome: "Coado Especial", cat: "Café", preco: 11.0, emoji: "☕", cmv: 2.6 },
  { id: 5, nome: "Cold Brew", cat: "Café", preco: 15.0, emoji: "🧊", cmv: 4.2 },
  { id: 6, nome: "Pão de Queijo", cat: "Salgados", preco: 6.5, emoji: "🧀", cmv: 1.9 },
  { id: 7, nome: "Croissant", cat: "Salgados", preco: 9.0, emoji: "🥐", cmv: 2.8 },
  { id: 8, nome: "Sanduíche Fit", cat: "Salgados", preco: 18.0, emoji: "🥪", cmv: 6.5 },
  { id: 9, nome: "Bolo de Cenoura", cat: "Doces", preco: 8.5, emoji: "🍰", cmv: 2.4 },
  { id: 10, nome: "Cookie", cat: "Doces", preco: 7.0, emoji: "🍪", cmv: 1.9 },
  { id: 11, nome: "Suco Verde", cat: "Bebidas", preco: 14.0, emoji: "🥤", cmv: 4.1 },
  { id: 12, nome: "Água", cat: "Bebidas", preco: 4.0, emoji: "💧", cmv: 0.8 },
];

export const SALAS = [
  { id: "s1", nome: "Sala Master", unidade: "Luxemburgo", tipo: "Reunião", cap: 12, bases: 0,
    descricao: "Sala de reunião premium com mesa de imbuia, TV 65\", videoconferência e isolamento acústico.",
    comodidades: ["Ar-condicionado", "TV / Monitor", "Videoconferência", "Lousa branca", "Café incluso"],
    valor: "R$ 120/h", valorHora: 120,
    fotos: ["https://picsum.photos/seed/salamaster/640/400", "https://picsum.photos/seed/salamaster2/640/400"], foto: "https://picsum.photos/seed/salamaster/640/400" },
  { id: "s2", nome: "Sala Executiva", unidade: "Luxemburgo", tipo: "Reunião", cap: 6, bases: 0,
    descricao: "Reunião para até 6 pessoas com monitor e lousa branca.",
    comodidades: ["Ar-condicionado", "TV / Monitor", "Lousa branca"],
    valor: "R$ 80/h", valorHora: 80, fotos: ["https://picsum.photos/seed/salaexec/640/400"], foto: "https://picsum.photos/seed/salaexec/640/400" },
  { id: "s3", nome: "Auditório", unidade: "Luxemburgo", tipo: "Auditório", cap: 40, bases: 0,
    descricao: "Auditório para eventos, palestras e workshops, com palco, projetor e sistema de som.",
    comodidades: ["Ar-condicionado", "Projetor", "Sistema de som", "Microfone", "Palco"],
    valor: "Sob consulta", valorHora: 0, fotos: ["https://picsum.photos/seed/auditorio/640/400"], foto: "https://picsum.photos/seed/auditorio/640/400" },
  { id: "s7", nome: "Espaço Compartilhado", unidade: "Luxemburgo", tipo: "Compartilhada", cap: 30, bases: 30,
    descricao: "Área coworking compartilhada com 30 estações de trabalho, internet dedicada e café à vontade.",
    comodidades: ["Ar-condicionado", "Wi-Fi dedicado", "Café incluso", "Armário", "Cadeira ergonômica"],
    valor: "Plano mensal", valorHora: 0, fotos: ["https://picsum.photos/seed/shared/640/400"], foto: "https://picsum.photos/seed/shared/640/400" },
  { id: "s4", nome: "Sala Vidro 1", unidade: "Estoril", tipo: "Reunião", cap: 8, bases: 0,
    descricao: "Sala de reunião com paredes de vidro e monitor.",
    comodidades: ["Ar-condicionado", "TV / Monitor"],
    valor: "R$ 90/h", valorHora: 90, fotos: ["https://picsum.photos/seed/vidro1/640/400"], foto: "https://picsum.photos/seed/vidro1/640/400" },
  { id: "s5", nome: "Sala Vidro 2", unidade: "Estoril", tipo: "Atendimento", cap: 4, bases: 0,
    descricao: "Sala de atendimento individual.",
    comodidades: ["Ar-condicionado"],
    valor: "R$ 60/h", valorHora: 60, fotos: ["https://picsum.photos/seed/vidro2/640/400"], foto: "https://picsum.photos/seed/vidro2/640/400" },
  { id: "s6", nome: "Sala Privativa 1", unidade: "Luxemburgo", tipo: "Privativa", cap: 4, bases: 4,
    descricao: "Escritório privativo mobiliado para até 4 pessoas, com 4 estações de trabalho.",
    comodidades: ["Ar-condicionado", "Wi-Fi dedicado", "Armário", "Mesa de reunião"],
    valor: "R$ 2.890/mês", fotos: ["https://picsum.photos/seed/priv1/640/400"], foto: "https://picsum.photos/seed/priv1/640/400",
    contratada: true, contratante: "Mendes Advocacia", valorMensal: 2890 },
];

export const HORARIOS = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];

export const RESERVAS_INIT = [
  { id: "r1", sala: "s1", dia: 0, inicio: 2, dur: 2, cliente: "Ciatos Log", cor: C.cafe },
  { id: "r2", sala: "s2", dia: 0, inicio: 5, dur: 1, cliente: "Mendes Adv.", cor: C.teal },
  { id: "r3", sala: "s4", dia: 1, inicio: 3, dur: 3, cliente: "TechBH", cor: C.teal2 },
  { id: "r4", sala: "s1", dia: 2, inicio: 6, dur: 2, cliente: "Consultoria RM", cor: C.cafe2 },
  { id: "r5", sala: "s3", dia: 3, inicio: 1, dur: 4, cliente: "Workshop Vendas", cor: C.amber },
];

export const CLIENTES = [
  {
    id: "c1", nome: "Ciatos Log Transportes", cnpj: "20.351.761/0001-03",
    plano: "Sala Privativa", unidade: "Luxemburgo", fiscal: true, status: "ativo", desde: "2023",
    contato: "Rafael Mendes", email: "rafael@ciatoslog.com.br", tel: "(31) 99100-2030",
    docs: [
      { nome: "Contrato Social.pdf", tipo: "Societário", data: "12/03/2024", status: "ok" },
      { nome: "IPTU 2025.pdf", tipo: "Fiscal", data: "08/01/2025", status: "ok" },
      { nome: "Correspondência DET.pdf", tipo: "Correspondência", data: "21/05/2026", status: "novo" },
    ],
  },
  {
    id: "c2", nome: "Mendes Advocacia", cnpj: "31.882.004/0001-77",
    plano: "Endereço Fiscal", unidade: "Luxemburgo", fiscal: true, status: "ativo", desde: "2024",
    contato: "Carla Mendes", email: "carla@mendesadv.com.br", tel: "(31) 98822-1140",
    docs: [
      { nome: "Comprovante Endereço.pdf", tipo: "Fiscal", data: "15/02/2025", status: "ok" },
      { nome: "Notificação Receita.pdf", tipo: "Correspondência", data: "19/05/2026", status: "novo" },
    ],
  },
  {
    id: "c3", nome: "TechBH Software", cnpj: "44.120.330/0001-90",
    plano: "Coworking", unidade: "Estoril", fiscal: false, status: "ativo", desde: "2025",
    contato: "Diego Alves", email: "diego@techbh.io", tel: "(31) 99988-7766", docs: [],
  },
  {
    id: "c4", nome: "Consultoria RM", cnpj: "18.445.992/0001-12",
    plano: "Sala Privativa", unidade: "Estoril", fiscal: true, status: "pendente", desde: "2026",
    contato: "Renata Maia", email: "renata@rmconsult.com.br", tel: "(31) 98700-5521",
    docs: [{ nome: "Contrato CafeWorking.pdf", tipo: "Societário", data: "02/05/2026", status: "pendente" }],
  },
];

export const CHATS_INIT = [
  { id: "ch1", cliente: "Rafael Mendes", empresa: "Ciatos Log", unread: 2, online: true,
    msgs: [
      { de: "cli", txt: "Bom dia! Chegou alguma correspondência pra gente?", h: "08:42" },
      { de: "cli", txt: "Estou esperando uma notificação do DET.", h: "08:42" },
    ]},
  { id: "ch2", cliente: "Carla Mendes", empresa: "Mendes Adv.", unread: 1, online: true,
    msgs: [{ de: "cli", txt: "Preciso da Sala Master quinta às 14h, é possível?", h: "Ontem" }]},
  { id: "ch3", cliente: "Diego Alves", empresa: "TechBH", unread: 0, online: false,
    msgs: [
      { de: "cli", txt: "Valeu pelo café hoje! 🙌", h: "Seg" },
      { de: "adm", txt: "Disponha, Diego! Qualquer coisa estamos aqui.", h: "Seg" },
    ]},
];

export const FATURAS = [
  { id: "f1", cliente: "Ciatos Log Transportes", valor: 2890, venc: "05/06/2026", status: "pago", plano: "Sala Privativa" },
  { id: "f2", cliente: "Mendes Advocacia", valor: 119, venc: "05/06/2026", status: "pago", plano: "Endereço Fiscal" },
  { id: "f3", cliente: "TechBH Software", valor: 390, venc: "10/06/2026", status: "aberto", plano: "Coworking" },
  { id: "f4", cliente: "Consultoria RM", valor: 2890, venc: "28/05/2026", status: "vencido", plano: "Sala Privativa" },
  { id: "f5", cliente: "Studio Design", valor: 390, venc: "12/06/2026", status: "aberto", plano: "Coworking" },
];

export const EVENTOS = [
  { id: "e1", nome: "Workshop de Vendas B2B", tipo: "Workshop", sala: "Auditório", unidade: "Luxemburgo", data: "29/05", hora: "09:00–13:00", inscritos: 28, cap: 40, formato: "Escolar" },
  { id: "e2", nome: "Café com Networking", tipo: "Networking", sala: "Área Comum", unidade: "Luxemburgo", data: "30/05", hora: "18:00–20:00", inscritos: 45, cap: 60, formato: "Livre" },
  { id: "e3", nome: "Treinamento Tributário", tipo: "Treinamento", sala: "Sala Master", unidade: "Luxemburgo", data: "03/06", hora: "14:00–17:00", inscritos: 12, cap: 12, formato: "U" },
  { id: "e4", nome: "Pitch Day Startups", tipo: "Evento", sala: "Auditório", unidade: "Estoril", data: "05/06", hora: "19:00–22:00", inscritos: 33, cap: 40, formato: "Auditório" },
];

// === NOVO: CRM de leads (Instagram, WhatsApp, Site, Google) ===
export const LEADS_INIT = [
  { id: "l1", nome: "Ana Paula Ribeiro", origem: "Instagram", interesse: "Endereço Fiscal", etapa: "novo", valor: 119, prob: 20, tel: "(31) 99876-1234", desde: "27/05" },
  { id: "l2", nome: "Bruno Lima", origem: "Site", interesse: "Sala Privativa", etapa: "visita", valor: 2890, prob: 65, tel: "(31) 98123-4567", desde: "25/05" },
  { id: "l3", nome: "Marina Costa", origem: "WhatsApp", interesse: "Auditório (evento)", etapa: "proposta", valor: 1800, prob: 55, tel: "(31) 97654-3210", desde: "23/05" },
  { id: "l4", nome: "Renato Alves", origem: "Google Ads", interesse: "Coworking Mensal", etapa: "fechado", valor: 390, prob: 100, tel: "(31) 96543-2109", desde: "20/05" },
  { id: "l5", nome: "Studio Fernanda", origem: "Instagram", interesse: "Sala Compartilhada", etapa: "contato", valor: 590, prob: 35, tel: "(31) 95432-1098", desde: "26/05" },
  { id: "l6", nome: "Patrick Souza", origem: "Site", interesse: "Endereço Fiscal + Contabilidade", etapa: "contato", valor: 449, prob: 40, tel: "(31) 94321-0987", desde: "26/05" },
];

export const ETAPAS_CRM = [
  { id: "novo", label: "Novo Lead", cor: C.text3 },
  { id: "contato", label: "Em Contato", cor: C.blue },
  { id: "visita", label: "Visita Marcada", cor: C.amber },
  { id: "proposta", label: "Proposta Enviada", cor: C.cafe },
  { id: "fechado", label: "Fechado", cor: C.green },
];

// Origens de leads (editável na tela do CRM)
export const ORIGENS_INIT = ["Instagram", "Site", "WhatsApp", "Google Ads", "Indicação"];

// === NOVO: Correspondências (operação diária do endereço fiscal) ===
export const CORRESP_INIT = [
  { id: "co1", cliente: "Mendes Advocacia", remetente: "Receita Federal", tipo: "Notificação", recebido: "Hoje 09:18", status: "aguardando", urgente: true, foto: true },
  { id: "co2", cliente: "Ciatos Log Transportes", remetente: "DET-MG", tipo: "Notificação", recebido: "Ontem 16:40", status: "digitalizada", urgente: false, foto: true },
  { id: "co3", cliente: "Consultoria RM", remetente: "Banco Itaú", tipo: "Extrato", recebido: "26/05 11:20", status: "notificado", urgente: false, foto: true },
  { id: "co4", cliente: "Mendes Advocacia", remetente: "Tribunal de Justiça MG", tipo: "Intimação", recebido: "25/05 14:00", status: "retirada", urgente: false, foto: true },
];

// === NOVO: Alertas inteligentes para o dashboard ===
export const ALERTAS = [
  { id: "a1", tipo: "fatura", titulo: "Fatura vencida há 3 dias", sub: "Consultoria RM · R$ 2.890 · acionar cobrança", cor: C.red },
  { id: "a2", tipo: "corresp", titulo: "Correspondência sensível chegou", sub: "Mendes Adv. · Receita Federal · notificar agora", cor: C.amber },
  { id: "a3", tipo: "sala", titulo: "Sala Master livre amanhã", sub: "Oportunidade para Bruno Lima (visita marcada)", cor: C.teal },
  { id: "a4", tipo: "lead", titulo: "3 novos leads não respondidos", sub: "Instagram · responder em < 1h aumenta conversão 35%", cor: C.cafe },
];
