// ============================================================================
// assinaturasApi — plano contratado (cliente) e gestão das assinaturas (equipe).
// Tudo passa pelas Edge Functions com o JWT do usuário; o servidor confere dono
// e papel. Contratos: leitura por RLS e publicação pela função do banco.
// Erros chegam à tela sempre em português simples (lib/erros.js).
// ============================================================================

import { supabaseConfigured, getAccessToken } from "./supabaseAuth.js";
import { erroDaResposta, erroDeRede, MSG } from "./erros.js";
import { limparCacheCliente } from "./clienteApi.js";

const URL = import.meta.env?.VITE_SUPABASE_URL || "";
const ANON = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";

async function cabecalhos() {
  if (!supabaseConfigured) throw new Error(MSG.demo);
  const token = await getAccessToken();
  if (!token) throw new Error(MSG.sessao);
  return { "content-type": "application/json", apikey: ANON, authorization: `Bearer ${token}` };
}

async function chamar(caminho, { method = "GET", body } = {}) {
  const headers = await cabecalhos();
  let res;
  try {
    res = await fetch(`${URL}${caminho}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch (e) {
    throw erroDeRede(e, caminho);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw erroDaResposta(res.status, data, caminho);
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

export const TAMANHO_MAX_DOCUMENTO = 8 * 1024 * 1024;
const LADO_MAX_FOTO = 2400;

/**
 * Foto de celular: converte para JPEG (HEIC/WebP não são aceitos) e reduz quando
 * passa do limite. PDF, JPG e PNG dentro do limite seguem como estão.
 */
export async function prepararArquivo(arquivo) {
  const ehImagem = (arquivo.type || "").startsWith("image/");
  const aceito = ["application/pdf", "image/jpeg", "image/png"].includes(arquivo.type);
  if (aceito && arquivo.size <= TAMANHO_MAX_DOCUMENTO) return arquivo;
  if (!ehImagem) {
    throw new Error(arquivo.size > TAMANHO_MAX_DOCUMENTO ? "Arquivo acima de 8 MB. Envie um PDF menor." : MSG.tipoArquivo);
  }
  const url = window.URL.createObjectURL(arquivo);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Não conseguimos ler esta foto. Tente tirar de novo ou envie em PDF."));
      i.src = url;
    });
    const escala = Math.min(1, LADO_MAX_FOTO / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * escala);
    canvas.height = Math.round(img.naturalHeight * escala);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) throw new Error("Não conseguimos preparar a foto. Envie em PDF.");
    if (blob.size > TAMANHO_MAX_DOCUMENTO) throw new Error("A foto ficou acima de 8 MB. Envie em PDF.");
    const nome = (arquivo.name || "foto").replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], nome, { type: "image/jpeg" });
  } finally {
    window.URL.revokeObjectURL(url);
  }
}

/** PUT do arquivo no link assinado, informando o progresso (0 a 100). */
export function enviarComProgresso(uploadUrl, arquivo, onProgresso) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("apikey", ANON);
    xhr.setRequestHeader("content-type", arquivo.type);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgresso?.(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else {
        console.warn("[upload] storage", xhr.status, xhr.responseText);
        reject(new Error(xhr.status === 413 ? "Arquivo acima de 8 MB." : xhr.status === 415 || xhr.status === 400 ? MSG.tipoArquivo : "Não foi possível enviar o arquivo. Tente de novo."));
      }
    };
    xhr.onerror = () => reject(new Error(MSG.semConexao));
    xhr.send(arquivo);
  });
}

export const assinaturasApi = {
  configured: supabaseConfigured,

  // cliente
  minhaAssinatura: () => chamar("/functions/v1/minha-assinatura"),
  cancelar: async (assinatura_id, motivo) => {
    const r = await chamar("/functions/v1/cancelar-assinatura", { method: "POST", body: { assinatura_id, motivo } });
    limparCacheCliente();
    return r;
  },
  /**
   * Envia um documento direto ao Storage (link assinado de uso único), com
   * progresso. Se o servidor ainda não tiver o envio direto, cai no envio antigo.
   */
  enviarDocumento: async (assinatura_id, tipo, original, onProgresso) => {
    const arquivo = await prepararArquivo(original);
    const base = { assinatura_id, tipo, nome: arquivo.name, mime: arquivo.type };
    let preparo = null;
    try {
      preparo = await chamar("/functions/v1/documentos-assinatura", { method: "POST", body: { acao: "preparar", ...base, bytes: arquivo.size } });
    } catch (e) {
      if (e.status && e.status !== 400) throw e;
      if (e.status === 400 && e.message !== "Arquivo inválido.") throw e; // recusa real (tipo, tamanho)
    }
    if (!preparo?.upload_url) {
      onProgresso?.(30);
      const r = await chamar("/functions/v1/documentos-assinatura", { method: "POST", body: { ...base, base64: await lerArquivoBase64(arquivo) } });
      onProgresso?.(100);
      limparCacheCliente("assinatura");
      return r;
    }
    await enviarComProgresso(preparo.upload_url, arquivo, onProgresso);
    const r = await chamar("/functions/v1/documentos-assinatura", { method: "POST", body: { acao: "confirmar", ...base, id: preparo.id } });
    limparCacheCliente("assinatura");
    return r;
  },

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
  abertura_empresa: "Abertura de empresa",
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
