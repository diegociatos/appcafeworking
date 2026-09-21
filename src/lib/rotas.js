// ============================================================================
// Rotas por URL — o app não tem roteador; a tela vive no parâmetro ?p=.
//
//   Cliente: ?p=inicio | plano | abertura | reservas | faturas |
//            correspondencias | fiscal | contato | notificacoes | conta
//   Equipe:  ?p=<id da página> (ex.: ?p=assinaturas, ?p=aberturas)
//
// Endereços antigos dos e-mails já enviados (/faturas, /reservas, /documentos,
// /preferencias, /descadastro) também abrem a tela certa. A tela pedida é
// guardada até o login terminar.
// ============================================================================

export const TELAS_CLIENTE = {
  inicio: "cli_inicio",
  plano: "cli_plano",
  abertura: "cli_abertura",
  reservas: "cli_reservar",
  cafeteria: "cli_cafeteria",
  faturas: "cli_faturas",
  correspondencias: "cli_docs",
  fiscal: "cli_fiscal",
  contato: "cli_contato",
  notificacoes: "cli_notif",
  conta: "cli_conta",
};

const ALIASES = {
  reservar: "reservas",
  documentos: "correspondencias",
  docs: "correspondencias",
  preferencias: "notificacoes",
  descadastro: "notificacoes",
  descadastrar: "notificacoes",
  "minha-conta": "conta",
  "meu-plano": "plano",
  "endereco-fiscal": "fiscal",
  "abertura-empresa": "abertura",
  "abertura-de-empresa": "abertura",
};

const PAGINA_PARA_SLUG = Object.fromEntries(Object.entries(TELAS_CLIENTE).map(([slug, id]) => [id, slug]));

/** Slug ou id → id da página (ou null). */
export function paginaDoSlug(valor) {
  const v = String(valor || "").trim().toLowerCase().replace(/^\/+|\/+$/g, "");
  if (!v) return null;
  const slug = ALIASES[v] || v;
  if (TELAS_CLIENTE[slug]) return TELAS_CLIENTE[slug];
  return /^[a-z_]{2,30}$/.test(v) ? v : null;
}

/** Tela pedida na URL atual (?p= ou caminho antigo). */
export function telaDaUrl(loc = window.location) {
  const p = new URLSearchParams(loc.search).get("p");
  if (p) return paginaDoSlug(p);
  const caminho = loc.pathname.replace(/^\/+|\/+$/g, "");
  return caminho && !caminho.includes("/") ? paginaDoSlug(caminho) : null;
}

/** URL da tela (mantém outros parâmetros, troca o ?p= e volta o caminho para /). */
export function urlDaTela(pagina, loc = window.location) {
  const busca = new URLSearchParams(loc.search);
  busca.delete("acesso");
  if (pagina) busca.set("p", PAGINA_PARA_SLUG[pagina] || pagina);
  else busca.delete("p");
  const q = busca.toString();
  return `/${q ? `?${q}` : ""}${loc.hash || ""}`;
}
