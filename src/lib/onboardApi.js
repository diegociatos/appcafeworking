// ============================================================================
// onboardApi — onboarding de coworkings (cria login master + conta + unidade).
// Chama a Edge Function criar-coworking (service_role no backend). Só o admin
// da plataforma consegue (a função valida platform_admins).
// ============================================================================

import { supabaseConfigured, getAccessToken } from "./supabaseAuth.js";

const URL = import.meta.env?.VITE_SUPABASE_URL || "";
const ANON = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";

async function callFn(name, body) {
  if (!supabaseConfigured) throw new Error("Backend não configurado.");
  const token = await getAccessToken();
  const res = await fetch(`${URL}/functions/v1/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON, authorization: `Bearer ${token || ANON}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Falha em ${name} (${res.status})`);
  return data;
}

export const onboardApi = {
  configured: supabaseConfigured,
  criarCoworking: (dados) => callFn("criar-coworking", dados),
  excluirCoworking: (conta_id) => callFn("excluir-coworking", { conta_id }),
  criarUsuarioEquipe: (dados) => callFn("criar-usuario-equipe", dados),
  criarUnidade: (dados) => callFn("criar-unidade", dados),
  excluirUnidade: (unidade_id) => callFn("excluir-unidade", { unidade_id }),
};
