// ============================================================================
// nfseApi — cliente de PRODUÇÃO do módulo de Nota Fiscal (NFS-e).
//
// Chama as Edge Functions do Supabase (Deno). O certificado A1 é enviado UMA
// vez (salvarCertificado) e guardado no Vault pelo backend — NUNCA fica neste
// cliente nem no navegador depois do upload.
//
// O JWT do usuário logado vai em toda chamada (getAccessToken), para o RLS
// garantir que cada unidade só mexe nos próprios dados fiscais.
// ============================================================================

import { supabaseConfigured, getAccessToken } from "./supabaseAuth.js";

const URL = import.meta.env?.VITE_SUPABASE_URL || "";
const ANON = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";

export { supabaseConfigured };

async function callFn(name, body) {
  if (!supabaseConfigured) {
    throw new Error("Supabase não configurado (defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY).");
  }
  const token = await getAccessToken();
  const res = await fetch(`${URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: ANON,
      authorization: `Bearer ${token || ANON}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Falha em ${name} (${res.status})`);
  return data;
}

export const nfseApi = {
  configured: supabaseConfigured,
  // pfxBase64 pode vir como data URL — o backend remove o prefixo.
  salvarCertificado: ({ unidade_id, pfx_base64, senha }) =>
    callFn("salvar-certificado", { unidade_id, pfx_base64, senha }),
  emitir: (dados) => callFn("emitir-nfse", dados),
  cancelar: (nota_id, motivo) => callFn("cancelar-nfse", { nota_id, motivo }),
  // Diagnóstico: testa o endpoint nacional + convênio do município (não emite).
  testar: (unidade_id) => callFn("testar-fiscal", { unidade_id }),
};
