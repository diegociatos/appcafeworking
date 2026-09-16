// ============================================================================
// aberturasApi — abertura de empresa (cliente, contabilidade parceira e equipe).
//
// Tudo passa pela Edge Function aberturas com o JWT do usuário; o servidor
// confere dono e papel. Arquivos vão direto ao Storage por link de envio de uso
// único (com progresso) e são confirmados pela função.
//
// As regras de validação são as MESMAS do servidor: importamos
// supabase/functions/_shared/abertura.ts (TypeScript puro, sem Deno).
// ============================================================================

import { supabaseConfigured, getAccessToken } from "./supabaseAuth.js";
import { erroDaResposta, erroDeRede, MSG } from "./erros.js";
import { enviarComProgresso, prepararArquivo } from "./assinaturasApi.js";

export * from "../../supabase/functions/_shared/abertura.ts";

const URL_SUPA = import.meta.env?.VITE_SUPABASE_URL || "";
const ANON = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";
const FUNCAO = "/functions/v1/aberturas";
const TTL = 30_000;
let cacheMinhas = null; // { em, promessa }

async function chamar(caminho, { method = "GET", body } = {}) {
  if (!supabaseConfigured) throw new Error(MSG.demo);
  const token = await getAccessToken();
  if (!token) throw new Error(MSG.sessao);
  let res;
  try {
    res = await fetch(`${URL_SUPA}${caminho}`, {
      method,
      headers: { "content-type": "application/json", apikey: ANON, authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw erroDeRede(e, "aberturas");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const erro = erroDaResposta(res.status, data, "aberturas");
    if (Array.isArray(data?.pendencias)) erro.pendencias = data.pendencias;
    throw erro;
  }
  return data;
}

const acao = (id, nome, extra = {}) => chamar(FUNCAO, { method: "POST", body: { acao: nome, id, ...extra } });

export function limparCacheAberturas() {
  cacheMinhas = null;
}

export const aberturasApi = {
  configured: supabaseConfigured,

  // ---- cliente
  minhas: (forcar = false) => {
    if (!forcar && cacheMinhas && Date.now() - cacheMinhas.em < TTL) return cacheMinhas.promessa;
    const promessa = chamar(`${FUNCAO}?minhas=1`).catch((e) => { cacheMinhas = null; throw e; });
    cacheMinhas = { em: Date.now(), promessa };
    return promessa;
  },
  detalhe: (id, { comoCliente = false } = {}) =>
    chamar(`${FUNCAO}?id=${encodeURIComponent(id)}${comoCliente ? "&como=cliente" : ""}`),
  salvarRascunho: (id, dados) => acao(id, "salvar_rascunho", { dados }),
  enviar: async (id, dados) => {
    const r = await acao(id, "enviar", { dados });
    limparCacheAberturas();
    return r;
  },

  // ---- anexos (cliente e contabilidade)
  enviarDocumento: async (id, { lado, categoria, socioId = null }, original, onProgresso) => {
    const arquivo = await prepararArquivo(original);
    const base = { lado, categoria, socio_id: socioId, nome: arquivo.name };
    const preparo = await acao(id, "url_upload", { ...base, mime: arquivo.type, bytes: arquivo.size });
    await enviarComProgresso(preparo.upload_url, arquivo, onProgresso);
    return acao(id, "confirmar_upload", { ...base, doc_id: preparo.doc_id });
  },
  removerDocumento: (id, docId) => acao(id, "remover_documento", { doc_id: docId }),

  // ---- contabilidade e equipe
  listar: ({ unidadeId = "", status = "" } = {}) => {
    const q = new URLSearchParams();
    if (unidadeId) q.set("unidade_id", unidadeId);
    if (status) q.set("status", status);
    return chamar(`${FUNCAO}${q.toString() ? `?${q}` : ""}`);
  },
  pedirCorrecao: (id, texto) => acao(id, "pedir_correcao", { texto }),
  mudarStatus: (id, status, texto = "") => acao(id, "mudar_status", { status, texto }),
  salvarResultado: (id, resultado) => acao(id, "salvar_resultado", { resultado }),
  concluir: (id, resultado) => acao(id, "concluir", { resultado }),
  criar: ({ unidadeId, clienteEmail, usaEnderecoUnidade }) => chamar(FUNCAO, {
    method: "POST", body: { acao: "criar", unidade_id: unidadeId, cliente_email: clienteEmail, usa_endereco_unidade: usaEnderecoUnidade },
  }),
};

// ---------------------------------------------------------------------------
// Rótulos de tela
// ---------------------------------------------------------------------------

/** rotulo: equipe/contabilidade · cliente: o que o cliente lê · cor: chave de C (theme.js) */
export const STATUS_ABERTURA_UI = {
  aguardando_cliente: { rotulo: "Aguardando cliente", cliente: "Preencha os dados", cor: "amber" },
  em_analise: { rotulo: "Em análise", cliente: "Em análise pela contabilidade", cor: "teal" },
  pendente_cliente: { rotulo: "Correção pedida", cliente: "Precisamos de um ajuste", cor: "red" },
  em_registro: { rotulo: "Em registro", cliente: "Em registro nos órgãos", cor: "blue" },
  concluida: { rotulo: "Concluída", cliente: "Empresa aberta", cor: "green" },
  cancelada: { rotulo: "Cancelada", cliente: "Cancelado", cor: "text3" },
};

export const AUTOR_EVENTO = {
  cliente: "Cliente",
  contabilidade: "Contabilidade",
  equipe: "Equipe CafeWorking",
  admin: "CafeWorking",
  sistema: "CafeWorking",
};

export const dataBR = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "—");
export const dataHoraBR = (iso) => (iso
  ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
  : "—");

/** Id estável do sócio (liga os anexos ao sócio mesmo se a ordem mudar). */
export const novoIdSocio = () => Math.random().toString(36).slice(2, 10).padEnd(8, "0");

export const socioVazio = () => ({
  id: novoIdSocio(), nome: "", cpf: "", rg: "", rg_orgao: "", nascimento: "", estado_civil: "", regime_bens: "",
  profissao: "", endereco: { cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "" },
  email: "", telefone: "", participacao: null, administrador: false, govbr: "",
});
