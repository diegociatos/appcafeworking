// ============================================================================
// parceirosApi — rede de parceiros, telas do admin da plataforma.
//
//   candidaturas()   pedidos do "Seja parceiro" (tabela parceiro_candidaturas,
//                    RLS: só o admin da plataforma lê)
//   indicadores()    clientes ativos, receita do mês, garantia e atrasos por
//                    parceiro (função parceiro_indicadores)
//   foraDoPrazo()    correspondências além de 1 dia útil (função
//                    correspondencias_fora_prazo; com unidade, serve à equipe)
//   analisar/aprovar/recusar  Edge Function aprovar-parceiro (service_role)
//
// Sem backend (demonstração) tudo devolve vazio: a rede de parceiros só existe
// no banco.
// ============================================================================

import { supabaseConfigured, getAccessToken } from "./supabaseAuth.js";
import { erroDaResposta, erroDeRede, MSG } from "./erros.js";

const URL = import.meta.env?.VITE_SUPABASE_URL || "";
const ANON = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";

async function rest(caminho, { method = "GET", body, prefer } = {}) {
  if (!supabaseConfigured) throw new Error(MSG.demo);
  const token = await getAccessToken();
  if (!token) throw new Error(MSG.sessao);
  let res;
  try {
    res = await fetch(`${URL}/rest/v1/${caminho}`, {
      method,
      headers: {
        apikey: ANON, authorization: `Bearer ${token}`, "content-type": "application/json",
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    throw erroDeRede(e, "parceiros");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw erroDaResposta(res.status, data, "parceiros");
  return data;
}

async function callFn(body) {
  if (!supabaseConfigured) throw new Error(MSG.demo);
  const token = await getAccessToken();
  let res;
  try {
    res = await fetch(`${URL}/functions/v1/aprovar-parceiro`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: ANON, authorization: `Bearer ${token || ANON}` },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw erroDeRede(e, "aprovar-parceiro");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(res.status === 401 ? MSG.sessao : data?.error || "Não foi possível concluir agora.");
  return data;
}

const mapCandidatura = (r) => ({
  id: r.id,
  situacao: r.situacao,
  escritorio: r.escritorio,
  tipoPessoa: r.tipo_pessoa,
  documento: r.documento,
  responsavel: r.responsavel,
  email: r.email,
  whatsapp: r.whatsapp,
  cidade: r.cidade,
  uf: r.uf,
  endereco: r.endereco,
  servicos: Array.isArray(r.servicos) ? r.servicos : [],
  salas: Number(r.salas || 0),
  observacoes: r.observacoes || "",
  aceiteTexto: r.aceite_texto || "",
  pagina: r.pagina || "",
  contaId: r.conta_id || "",
  unidadeId: r.unidade_id || "",
  aceiteId: r.aceite_id || "",
  motivo: r.motivo || "",
  decididaEm: r.decidida_em,
  criadaEm: r.created_at,
});

const mapIndicador = (r) => ({
  contaId: r.conta_id,
  conta: r.conta,
  parceiroStatus: r.parceiro_status || "",
  temCarteira: r.tem_carteira === true,
  unidades: Number(r.unidades || 0),
  clientesAtivos: Number(r.clientes_ativos || 0),
  receitaMes: Number(r.receita_mes || 0),
  parteParceiroMes: Number(r.parte_parceiro_mes || 0),
  garantiaSaldo: Number(r.garantia_saldo || 0),
  correspAtrasadas: Number(r.corresp_atrasadas || 0),
});

const mapAtraso = (r) => ({
  contaId: r.conta_id,
  unidadeId: r.unidade_id,
  unidade: r.unidade,
  itemId: r.item_id,
  cliente: r.cliente,
  remetente: r.remetente,
  recebidoEm: r.recebido_em,
  prazoEm: r.prazo_em,
  dias: Number(r.dias || 0),
});

export const SERVICOS_PARCEIRO = {
  endereco_fiscal: "Endereço fiscal",
  sala_privativa: "Sala privativa",
  escritorio_compartilhado: "Escritório compartilhado",
  sala_reuniao: "Sala de reunião",
};

/**
 * Documentos do imóvel esperados na unidade parceira (Unidades → Documentos).
 * Espelho de _shared/parceiroCandidatura.ts. O que trava a publicação da
 * unidade fica em public.parceiro_requisitos, não aqui.
 */
export const KIT_ENDERECO_PARCEIRO = [
  { tipo: "iptu", titulo: "IPTU do imóvel", detalhe: "com o índice cadastral, que a abertura de empresa usa" },
  { tipo: "autorizacao_proprietario", titulo: "Autorização do proprietário", detalhe: "se o imóvel não é do parceiro" },
  { tipo: "avcb", titulo: "AVCB (Corpo de Bombeiros)", detalhe: "quando o imóvel tiver" },
];

/**
 * O que falta para o parceiro vender. Mesma regra da Edge Function
 * (_shared/parceiroCandidatura.ts): a carteira Asaas é a única trava.
 */
export function checklistDoParceiro({ walletId, tiposDeDocumento = [], salasComFoto = 0, temContratoParceria = true }) {
  const tipos = new Set(tiposDeDocumento || []);
  const itens = [{
    id: "wallet",
    titulo: "Carteira Asaas (walletId) em Contas",
    detalhe: "sem ela o split não sai e o parceiro não pode ficar ativo",
    ok: Boolean(String(walletId || "").trim()),
    trava: true,
  }];
  for (const d of KIT_ENDERECO_PARCEIRO) {
    itens.push({
      id: `kit_${d.tipo}`,
      titulo: `Kit do endereço: ${d.titulo}`,
      detalhe: `${d.detalhe}. Envie em Unidades → Documentos do endereço fiscal`,
      ok: tipos.has(d.tipo),
      trava: false,
    });
  }
  itens.push({
    id: "fotos",
    titulo: "Fotos das salas",
    detalhe: "o site mostra a foto no card da sala privativa",
    ok: Number(salasComFoto || 0) > 0,
    trava: false,
  });
  if (temContratoParceria === false) {
    itens.push({
      id: "contrato",
      titulo: "Publicar o contrato de parceria",
      detalhe: "sem versão vigente da categoria \"parceria\", o aceite do parceiro não fica registrado",
      ok: false,
      trava: false,
    });
  }
  return itens;
}

export const parceirosApi = {
  configured: supabaseConfigured,

  async candidaturas() {
    const rows = (await rest("parceiro_candidaturas?select=*&order=created_at.desc")) || [];
    return rows.map(mapCandidatura);
  },

  async indicadores() {
    const rows = (await rest("rpc/parceiro_indicadores", { method: "POST", body: {} })) || [];
    return rows.map(mapIndicador);
  },

  /** Sem unidade: a rede toda (admin). Com unidade: a equipe da unidade também lê. */
  async foraDoPrazo(unidadeId = null) {
    const rows = (await rest("rpc/correspondencias_fora_prazo", {
      method: "POST", body: { p_unidade_id: unidadeId },
    })) || [];
    return rows.map(mapAtraso);
  },

  /** Tipos do kit já enviados, por unidade: { unidadeId: ["iptu", ...] }. */
  async documentosPorUnidade(unidadeIds = []) {
    const ids = [...new Set(unidadeIds.filter(Boolean))];
    if (!ids.length) return {};
    const lista = ids.map((id) => `"${id}"`).join(",");
    const rows = (await rest(`unidade_documentos?select=unidade_id,tipo&unidade_id=in.(${encodeURIComponent(lista)})`)) || [];
    const mapa = {};
    for (const r of rows) (mapa[r.unidade_id] = mapa[r.unidade_id] || []).push(r.tipo);
    return mapa;
  },

  /** Há contrato de parceria publicado? (categoria 'parceria', sem unidade) */
  async contratoParceriaPublicado() {
    const rows = (await rest("contratos_modelos?select=id,versao,titulo&categoria=eq.parceria&vigente=is.true&unidade_id=is.null")) || [];
    return rows[0] || null;
  },

  analisar: (id) => callFn({ acao: "analisar", candidatura_id: id }),
  aprovar: (id) => callFn({ acao: "aprovar", candidatura_id: id }),
  recusar: (id, motivo) => callFn({ acao: "recusar", candidatura_id: id, motivo }),
};
