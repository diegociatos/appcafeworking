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
//
// Mensagens de erro de login/senha são traduzidas aqui (mensagemAuth); o texto
// cru do servidor vai só para o console.
// ============================================================================

const URL = import.meta.env?.VITE_SUPABASE_URL || "";
const ANON = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";

export const supabaseConfigured = Boolean(URL && ANON);

export const SENHA_MINIMA = 8;

const STORAGE_KEY = "cw_session";
const FLAG_DEFINIR_SENHA = "cw_definir_senha"; // "novo" (primeiro acesso) | "recuperar"
const listeners = new Set();
let erroLinkSenha = null; // "expirado" | "invalido" — só nesta carga da página
lerRetornoDoLinkDeSenha();
let session = loadSession();

// Volta do e-mail "Criar minha senha" / "Esqueci minha senha" (link do Supabase):
// a sessão chega no fragmento da URL. Guarda a sessão, marca que falta definir a
// senha e limpa o fragmento para o token não ficar no histórico. O e-mail de
// boas-vindas manda ?acesso=novo; o "esqueci a senha" não.
function lerRetornoDoLinkDeSenha() {
  try {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const params = new URLSearchParams(hash);
    const tipo = params.get("type");
    const acesso = params.get("access_token");
    const erro = params.get("error_code") || params.get("error");
    const busca = new URLSearchParams(window.location.search);
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
      const primeiroAcesso = tipo === "invite" || busca.get("acesso") === "novo";
      sessionStorage.setItem(FLAG_DEFINIR_SENHA, primeiroAcesso ? "novo" : "recuperar");
    } else {
      return;
    }
    busca.delete("acesso");
    const resto = busca.toString();
    window.history.replaceState(null, "", window.location.pathname + (resto ? `?${resto}` : ""));
  } catch { /* sem storage ou URL inválida: segue sem sessão */ }
}

/** O cliente entrou pelo link do e-mail e ainda precisa criar a senha. */
export function precisaDefinirSenha() {
  try { return Boolean(sessionStorage.getItem(FLAG_DEFINIR_SENHA)); } catch { return false; }
}

/** "novo" (primeiro acesso, veio do e-mail de boas-vindas) ou "recuperar" (esqueci a senha). */
export function tipoDefinicaoSenha() {
  try { return sessionStorage.getItem(FLAG_DEFINIR_SENHA) === "novo" ? "novo" : "recuperar"; } catch { return "recuperar"; }
}

/** "expirado" | "invalido" | null — o link do e-mail não serviu (vale para esta carga da página). */
export function erroDoLinkDeSenha() {
  return erroLinkSenha;
}

/** Erro do GoTrue → frase para a tela. */
export function mensagemAuth(codigo, texto, status) {
  const c = String(codigo || "");
  const t = String(texto || "");
  if (c === "invalid_credentials" || /invalid login credentials/i.test(t)) return "E-mail ou senha incorretos.";
  if (c === "user_banned" || /banned/i.test(t)) {
    return "Seu acesso é liberado assim que o pagamento é confirmado. Se já pagou, aguarde alguns minutos ou fale com a gente.";
  }
  if (c === "email_not_confirmed" || /not confirmed/i.test(t)) return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
  if (c === "same_password" || /should be different/i.test(t)) return "Use uma senha diferente da anterior.";
  if (c === "weak_password" || /at least|characters|weak/i.test(t)) return `Senha fraca. Use pelo menos ${SENHA_MINIMA} caracteres, com letras e números.`;
  if (c === "over_request_rate_limit" || c === "over_email_send_rate_limit" || status === 429) return "Muitas tentativas seguidas. Aguarde um minuto e tente de novo.";
  if (c === "reauthentication_needed") return "Por segurança, saia e entre de novo antes de trocar a senha.";
  if (status === 401 || status === 403 || c === "session_not_found" || c === "bad_jwt") return "Sua sessão expirou. Entre de novo.";
  return "Não foi possível concluir agora. Tente de novo em instantes.";
}

function erroAuth(res, data) {
  console.warn("[auth]", res?.status, data);
  const e = new Error(mensagemAuth(data?.error_code || data?.code, data?.error_description || data?.msg || data?.error, res?.status));
  e.codigo = data?.error_code || null;
  e.status = res?.status;
  return e;
}

const SEM_CONEXAO = "Sem conexão com o servidor. Confira a internet e tente de novo.";

async function putSenha(token, novaSenha) {
  let res;
  try {
    res = await fetch(`${URL}/auth/v1/user`, {
      method: "PUT",
      headers: { "content-type": "application/json", apikey: ANON, authorization: `Bearer ${token}` },
      body: JSON.stringify({ password: novaSenha }),
    });
  } catch {
    throw new Error(SEM_CONEXAO);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw erroAuth(res, data);
  return data;
}

/** Grava a senha nova do usuário logado pelo link e libera o app. */
export async function definirSenha(novaSenha) {
  const token = await getAccessToken();
  if (!token) throw new Error("O link expirou. Peça um novo na tela de entrada.");
  let data;
  try {
    data = await putSenha(token, novaSenha);
  } catch (e) {
    if (e.status === 401 || e.status === 403) throw new Error("O link expirou. Clique em Sair e peça um novo em \"Esqueci minha senha\".");
    throw e;
  }
  try { sessionStorage.removeItem(FLAG_DEFINIR_SENHA); } catch { /* ignore */ }
  saveSession({ ...session, user: data?.id ? data : session?.user || null });
  return data;
}

/**
 * Troca de senha na área logada: confere a senha atual entrando de novo (isso
 * também dá uma sessão recente, exigida pelo Supabase para trocar senha) e grava
 * a nova com essa sessão.
 */
export async function trocarSenha(senhaAtual, novaSenha) {
  const email = emailDaSessao();
  if (!email) throw new Error("Sua sessão expirou. Entre de novo.");
  let nova;
  try {
    nova = await authFetch("token?grant_type=password", { email, password: senhaAtual });
  } catch (e) {
    if (e.codigo === "invalid_credentials" || /incorretos/.test(e.message)) throw new Error("A senha atual não confere.");
    throw e;
  }
  saveSession(normalize(nova));
  const data = await putSenha(nova.access_token, novaSenha);
  saveSession({ ...session, user: data?.id ? data : session?.user || null });
  return true;
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

/** E-mail do login, mesmo quando a sessão veio do link do e-mail (sem `user`). */
export function emailDaSessao() {
  if (session?.user?.email) return String(session.user.email).toLowerCase();
  try {
    const payload = JSON.parse(atob(String(session?.access_token || "").split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return String(payload?.email || "").toLowerCase();
  } catch {
    return "";
  }
}

/** Inscreve um callback para mudanças de sessão. Retorna o "unsubscribe". */
export function onAuthChange(cb) { listeners.add(cb); return () => listeners.delete(cb); }

async function authFetch(query, body) {
  let res;
  try {
    res = await fetch(`${URL}/auth/v1/${query}`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: ANON },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(SEM_CONEXAO);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw erroAuth(res, data);
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
