// ============================================================================
// assinaturasApi — plano contratado (cliente) e gestão das assinaturas (equipe).
// Tudo passa pelas Edge Functions com o JWT do usuário; o servidor confere dono
// e papel. Contratos: leitura por RLS e publicação pela função do banco.
// ============================================================================

import { supabaseConfigured, getAccessToken } from "./supabaseAuth.js";

const URL = import.meta.env?.VITE_SUPABASE_URL || "";
const ANON = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";

async function cabecalhos() {
  if (!supabaseConfigured) throw new Error("Disponível só no ambiente real (com Supabase).");
  const token = await getAccessToken();
  if (!token) throw new Error("Sessão expirada. Entre de novo.");
  return { "content-type": "application/json", apikey: ANON, authorization: `Bearer ${token}` };
}

async function chamar(caminho, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(`${URL}${caminho}`, { method, headers: await cabecalhos(), body: body ? JSON.stringify(body) : undefined });
  } catch (e) {
    if (e?.message?.startsWith("Disponível") || e?.message?.startsWith("Sessão")) throw e;
    throw new Error("Sem conexão com o servidor. Tente de novo.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const erro = new Error(data?.error || data?.message || `Falha (${res.status})`);
    erro.codigo = data?.codigo;
    throw erro;
  }
  return data;
}

/** Arquivo do input → base64 (sem o prefixo data:). */
export function lerArquivoBase64(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result).split(",")[1] || "");
    leitor.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    leitor.readAsDataURL(arquivo);
  });
}

export const assinaturasApi = {
  configured: supabaseConfigured,

  // cliente
  minhaAssinatura: () => chamar("/functions/v1/minha-assinatura"),
  cancelar: (assinatura_id, motivo) => chamar("/functions/v1/cancelar-assinatura", { method: "POST", body: { assinatura_id, motivo } }),
  enviarDocumento: async (assinatura_id, tipo, arquivo) => chamar("/functions/v1/documentos-assinatura", {
    method: "POST",
    body: { assinatura_id, tipo, nome: arquivo.name, mime: arquivo.type, base64: await lerArquivoBase64(arquivo) },
  }),

  // equipe
  listarDaUnidade: (unidade_id) => chamar(`/functions/v1/gestao-assinaturas?unidade_id=${encodeURIComponent(unidade_id)}`),
  avaliarDocumentos: (assinatura_id, decisao, parecer) => chamar("/functions/v1/gestao-assinaturas", {
    method: "POST", body: { acao: "avaliar_documentos", assinatura_id, decisao, parecer },
  }),
  atribuirSala: (assinatura_id, sala_id) => chamar("/functions/v1/gestao-assinaturas", {
    method: "POST", body: { acao: "atribuir_sala", assinatura_id, sala_id },
  }),
  resolverAcerto: (assinatura_id, observacao) => chamar("/functions/v1/gestao-assinaturas", {
    method: "POST", body: { acao: "resolver_acerto", assinatura_id, observacao },
  }),

  // contratos (RLS: a equipe vê o histórico da unidade; publicar cria nova versão)
  listarContratos: (unidade_id) => chamar(
    `/rest/v1/contratos_modelos?select=id,unidade_id,categoria,versao,titulo,corpo,hash,vigente,created_at&or=(unidade_id.eq.${encodeURIComponent(unidade_id)},unidade_id.is.null)&order=categoria.asc,versao.desc`,
  ),
  publicarContrato: (unidade_id, categoria, titulo, corpo) => chamar("/rest/v1/rpc/publicar_contrato_modelo", {
    method: "POST", body: { p_unidade_id: unidade_id, p_categoria: categoria, p_titulo: titulo, p_corpo: corpo },
  }),
};

export const CATEGORIAS_CONTRATO = {
  endereco_fiscal: "Endereço fiscal",
  coworking: "Sala compartilhada (coworking)",
  sala_privativa: "Sala privativa",
  sala_hora: "Sala de reunião por hora",
};

export const STATUS_ASSINATURA = {
  ativa: { rotulo: "Ativa", cor: "green" },
  inadimplente: { rotulo: "Pagamento em atraso", cor: "red" },
  cancelando: { rotulo: "Cancelamento agendado", cor: "amber" },
  cancelada: { rotulo: "Cancelada", cor: "text3" },
};

export const STATUS_DOCUMENTOS = {
  pendente: { rotulo: "Documentos pendentes", cor: "amber" },
  enviado: { rotulo: "Documentos em conferência", cor: "teal" },
  aprovado: { rotulo: "Documentos aprovados", cor: "green" },
  reprovado: { rotulo: "Documentos reprovados", cor: "red" },
};

export const dataBR = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "—");
