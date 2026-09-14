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
const FLAG_DEFINIR_SENHA = "cw_definir_senha";
const listeners = new Set();
let erroLinkSenha = null; // "expirado" | "invalido" — só nesta carga da página
lerRetornoDoLinkDeSenha();
let session = loadSession();

// Volta do e-mail "Criar minha senha" (link de recuperação do Supabase): a
// sessão chega no fragmento da URL. Guarda a sessão, marca que falta definir a
// senha e limpa a URL para o token não ficar no histórico.
function lerRetornoDoLinkDeSenha() {
  try {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const params = new URLSearchParams(hash);
    const tipo = params.get("type");
    const acesso = params.get("access_token");
    const erro = params.get("error_code") || params.get("error");
    if (erro) {
      erroLinkSenha = params.get("error_code") === "otp_expired" ? "expirado" : "invalido";
    } else if (acesso && ["recovery", "invite"].includes(tipo)) {
      const nova = normalize({
        access_token: acesso,
        refresh_token: params.get("refresh_token"),
        expires_at: Number(params.get("expires_at")) || undefined,
        expires_in: Number(params.get("expires_in")) || 3600,
        user: null,
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nova));
      sessionStorage.setItem(FLAG_DEFINIR_SENHA, "1");
    } else {
      return;
    }
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  } catch { /* sem storage ou URL inválida: segue sem sessão */ }
}

/** O cliente entrou pelo link do e-mail e ainda precisa criar a senha. */
export function precisaDefinirSenha() {
  try { return sessionStorage.getItem(FLAG_DEFINIR_SENHA) === "1"; } catch { return false; }
}

/** "expirado" | "invalido" | null — o link do e-mail não serviu (vale para esta carga da página). */
export function erroDoLinkDeSenha() {
  return erroLinkSenha;
}

/** Grava a senha nova do usuário logado pelo link e libera o app. */
export async function definirSenha(novaSenha) {
  const token = await getAccessToken();
  if (!token) throw new Error("O link expirou. Peça um novo na tela de entrada.");
  let res;
  try {
    res = await fetch(`${URL}/auth/v1/user`, {
      method: "PUT",
      headers: { "content-type": "application/json", apikey: ANON, authorization: `Bearer ${token}` },
      body: JSON.stringify({ password: novaSenha }),
    });
  } catch {
    throw new Error("Sem conexão com o servidor. Confira a internet e tente de novo.");
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error("O link expirou. Clique em Sair e peça um novo em \"Esqueci minha senha\".");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error_description || data?.msg || data?.error || "";
    if (/should be different/i.test(msg)) throw new Error("Use uma senha diferente da anterior.");
    if (/at least|characters|weak/i.test(msg)) throw new Error("Senha fraca. Use pelo menos 8 caracteres, com letras e números.");
    throw new Error(msg || "Não foi possível salvar a senha.");
  }
  try { sessionStorage.removeItem(FLAG_DEFINIR_SENHA); } catch { /* ignore */ }
  saveSession({ ...session, user: data?.id ? data : session?.user || null });
  return data;
}

/** Pede o e-mail de redefinição de senha (link volta para o app). */
export async function pedirLinkDeSenha(email) {
  await authFetch(`recover?redirect_to=${encodeURIComponent(window.location.origin + "/")}`, { email });
}

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
  try { sessionStorage.removeItem(FLAG_DEFINIR_SENHA); } catch { /* ignore */ }
  saveSession(null);
}
