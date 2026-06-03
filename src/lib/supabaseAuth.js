// ============================================================================
// supabaseAuth — sessão de usuário via Supabase Auth (GoTrue) por REST/fetch.
//
// Sem o SDK (mesma linha do boletosApi): chamamos os endpoints /auth/v1/*.
// Mantém a sessão em localStorage, renova o token perto de expirar e expõe
// getAccessToken() para o boletosApi enviar o JWT do usuário às Edge Functions
// (necessário para o RLS — cada unidade só acessa seus dados).
//
// Sem VITE_SUPABASE_URL/ANON_KEY → supabaseConfigured = false e o app roda em
// modo demonstração, sem exigir login.
// ============================================================================

const URL = import.meta.env?.VITE_SUPABASE_URL || "";
const ANON = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";

export const supabaseConfigured = Boolean(URL && ANON);

const STORAGE_KEY = "cw_session";
const listeners = new Set();
let session = loadSession();

function loadSession() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch { return null; }
}
function saveSession(s) {
  session = s;
  try { s ? localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) : localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  listeners.forEach((f) => { try { f(s); } catch { /* ignore */ } });
}
function normalize(d) {
  return {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: d.expires_at || (Math.floor(Date.now() / 1000) + (d.expires_in || 3600)),
    user: d.user || null,
  };
}

export function getSession() { return session; }
export function getUser() { return session?.user || null; }
/** Inscreve um callback para mudanças de sessão. Retorna o "unsubscribe". */
export function onAuthChange(cb) { listeners.add(cb); return () => listeners.delete(cb); }

async function authFetch(query, body) {
  const res = await fetch(`${URL}/auth/v1/${query}`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error_description || data?.msg || data?.error || `Auth ${res.status}`);
  return data;
}

export async function signInWithPassword(email, password) {
  const data = await authFetch("token?grant_type=password", { email, password });
  saveSession(normalize(data));
  return data;
}

async function refresh() {
  if (!session?.refresh_token) return;
  try {
    const data = await authFetch("token?grant_type=refresh_token", { refresh_token: session.refresh_token });
    saveSession(normalize(data));
  } catch {
    saveSession(null); // refresh inválido → derruba a sessão
  }
}

/** Token válido (renova se estiver perto de expirar). */
export async function getAccessToken() {
  if (!session) return null;
  if (session.expires_at && session.expires_at * 1000 < Date.now() + 30_000) {
    await refresh();
  }
  return session?.access_token || null;
}

export async function signOut() {
  try {
    if (session?.access_token) {
      await fetch(`${URL}/auth/v1/logout`, {
        method: "POST",
        headers: { apikey: ANON, authorization: `Bearer ${session.access_token}` },
      });
    }
  } catch { /* ignore */ }
  saveSession(null);
}
