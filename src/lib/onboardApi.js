// ============================================================================
// onboardApi — onboarding de coworkings (cria login master + conta + unidade).
// Chama a Edge Function criar-coworking (service_role no backend). Só o admin
// da plataforma consegue (a função valida platform_admins).
// ============================================================================

import { supabaseConfigured, getAccessToken } from "./supabaseAuth.js";

const URL = import.meta.env?.VITE_SUPABASE_URL || "";
const ANON = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";

export const onboardApi = {
  configured: supabaseConfigured,
  async criarCoworking(dados) {
    if (!supabaseConfigured) throw new Error("Backend não configurado.");
    const token = await getAccessToken();
    const res = await fetch(`${URL}/functions/v1/criar-coworking`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: ANON,
        authorization: `Bearer ${token || ANON}`,
      },
      body: JSON.stringify(dados),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Falha ao criar coworking (${res.status})`);
    return data;
  },
};
