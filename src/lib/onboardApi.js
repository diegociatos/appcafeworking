// ============================================================================
// onboardApi — onboarding de coworkings (cria login master + conta + unidade)
// e manutenção das contas (dados e contrato em Storage privado).
// Chama as Edge Functions criar-coworking e contas-plataforma (service_role no
// backend). Só o admin da plataforma consegue (as funções validam platform_admins).
// ============================================================================

import { supabaseConfigured, getAccessToken } from "./supabaseAuth.js";
import { enviarComProgresso } from "./assinaturasApi.js";
import { MSG } from "./erros.js";

const URL = import.meta.env?.VITE_SUPABASE_URL || "";
const ANON = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";

async function callFn(name, body) {
  if (!supabaseConfigured) throw new Error("Backend não configurado.");
  const token = await getAccessToken();
  let res;
  try {
    res = await fetch(`${URL}/functions/v1/${name}`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: ANON, authorization: `Bearer ${token || ANON}` },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.warn(`[${name}] rede`, e);
    throw new Error(MSG.semConexao);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(res.status === 401 ? MSG.sessao : data?.error || `Falha em ${name} (${res.status})`);
  return data;
}

/** Arquivo anexado no formulário (data URL do FileInput) → File para enviar ao Storage. */
export function arquivoDoAnexo(anexo) {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(anexo?.url || "");
  if (!m) return null;
  const binario = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  const tipo = anexo.tipo || m[1] || "application/octet-stream";
  return new File([bytes], anexo.nome || "contrato", { type: tipo });
}

const contas = (acao, conta_id, extra = {}) => callFn("contas-plataforma", { acao, conta_id, ...extra });

export const onboardApi = {
  configured: supabaseConfigured,
  criarCoworking: (dados) => callFn("criar-coworking", dados),
  excluirCoworking: (conta_id) => callFn("excluir-coworking", { conta_id }),
  criarUsuarioEquipe: (dados) => callFn("criar-usuario-equipe", dados),
  excluirUsuarioEquipe: (usuario_id) => callFn("excluir-usuario-equipe", { usuario_id }),
  criarUnidade: (dados) => callFn("criar-unidade", dados),
  excluirUnidade: (unidade_id) => callFn("excluir-unidade", { unidade_id }),

  // ---- contas (tela Contas/Franqueados) ---------------------------------------
  /** Grava os dados editados. Devolve a linha da conta (formato do banco). */
  salvarConta: async (contaId, dados) => (await contas("salvar", contaId, { dados })).conta,
  /** Envia o contrato ao bucket privado (link de uso único) e grava na conta. */
  enviarContrato: async (contaId, anexo, onProgresso) => {
    const arquivo = anexo instanceof File ? anexo : arquivoDoAnexo(anexo);
    if (!arquivo) throw new Error("Não foi possível ler o contrato. Anexe de novo.");
    if (!["application/pdf", "image/jpeg", "image/png"].includes(arquivo.type)) throw new Error(MSG.tipoArquivo);
    const preparo = await contas("preparar_contrato", contaId, { nome: arquivo.name, mime: arquivo.type, bytes: arquivo.size });
    await enviarComProgresso(preparo.upload_url, arquivo, onProgresso);
    return (await contas("confirmar_contrato", contaId, { id: preparo.id, nome: arquivo.name })).conta;
  },
  removerContrato: async (contaId) => (await contas("remover_contrato", contaId)).conta,
  /** Link assinado (10 min) para baixar o contrato. */
  linkContrato: async (contaId) => (await contas("link_contrato", contaId)).url,
};
