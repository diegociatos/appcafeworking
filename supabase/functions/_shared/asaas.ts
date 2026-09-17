// ============================================================================
// Asaas — cliente HTTP e credenciais por unidade.
//
// A chave fica no Vault como asaas_<unidade> ({ api_key, ambiente }), gravada
// pela tela de integrações do app (Edge salvar-integracao). Sem Vault, cai no
// secret ASAAS_API_KEY (+ ASAAS_AMBIENTE). Sem nenhum dos dois, a unidade não
// vende online.
//
// Unidade de conta PARCEIRA (docs/PARCEIROS.md): sempre a credencial da
// CafeWorking (Vault asaas_plataforma, senão o secret ASAAS_API_KEY). A chave
// que o parceiro tenha gravado para a unidade é ignorada: a cobrança sai da
// conta da CafeWorking com split para a carteira do parceiro.
// ============================================================================

import { type ClienteBanco, unidadeEhParceira } from "./parceirosDb.ts";

/** Pedaço do supabase-js usado aqui (o SupabaseClient encaixa; os testes usam um imitado). */
// deno-lint-ignore no-explicit-any
type ClienteAsaas = ClienteBanco & { rpc(fn: string, args?: Record<string, unknown>): any };

export const REF_ASAAS_PLATAFORMA = "asaas_plataforma";

export const ASAAS_BASE = {
  producao: "https://api.asaas.com/v3",
  sandbox: "https://sandbox.asaas.com/api/v3",
} as const;

export interface CredAsaas {
  apiKey: string;
  ambiente: string;
  baseUrl: string;
}

/** Credencial da conta Asaas da CafeWorking (a que cobra com split). */
export function credenciaisPlataforma(admin: ClienteAsaas): Promise<CredAsaas | null> {
  return lerCredencial(admin, REF_ASAAS_PLATAFORMA);
}

export async function credenciaisAsaas(admin: ClienteAsaas, unidadeId: string): Promise<CredAsaas | null> {
  // Erro ao ler a conta lança: melhor falhar do que cobrar parceiro com a chave errada.
  if (await unidadeEhParceira(admin, unidadeId)) return credenciaisPlataforma(admin);
  return lerCredencial(admin, `asaas_${unidadeId}`);
}

async function lerCredencial(admin: ClienteAsaas, ref: string): Promise<CredAsaas | null> {
  let apiKey = "";
  let ambiente = "producao";
  try {
    const { data } = await admin.rpc("get_bank_credentials", { p_ref: ref });
    if (data?.api_key) {
      apiKey = data.api_key;
      ambiente = data.ambiente || "producao";
    }
  } catch (_) { /* sem Vault → tenta secret */ }
  if (!apiKey) {
    apiKey = Deno.env.get("ASAAS_API_KEY") || "";
    ambiente = Deno.env.get("ASAAS_AMBIENTE") || "producao";
  }
  if (!apiKey) return null;
  return { apiKey, ambiente, baseUrl: ASAAS_BASE[ambiente as keyof typeof ASAAS_BASE] || ASAAS_BASE.producao };
}

export class ErroAsaas extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

// deno-lint-ignore no-explicit-any
export async function asaas(cred: CredAsaas, path: string, method = "GET", body?: unknown): Promise<any> {
  const res = await fetch(`${cred.baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", access_token: cred.apiKey },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ErroAsaas(data?.errors?.[0]?.description || `Asaas ${method} ${path} (${res.status})`, res.status);
  return data;
}

/** Cancelamento best-effort usado nos rollbacks — nunca lança. */
export async function cancelarNoAsaas(cred: CredAsaas, alvo: { paymentId?: string | null; subscriptionId?: string | null }) {
  try {
    if (alvo.subscriptionId) await asaas(cred, `/subscriptions/${alvo.subscriptionId}`, "DELETE");
    else if (alvo.paymentId) await asaas(cred, `/payments/${alvo.paymentId}`, "DELETE");
  } catch (e) {
    console.error("cancelarNoAsaas:", (e as Error).message);
  }
}

/** Copia-e-cola e imagem do PIX de um pagamento. Vazio quando não disponível. */
export async function pixDoPagamento(cred: CredAsaas, paymentId: string): Promise<{ payload: string; imagem: string }> {
  try {
    const qr = await asaas(cred, `/payments/${paymentId}/pixQrCode`);
    return { payload: qr?.payload || "", imagem: qr?.encodedImage || "" };
  } catch (_) {
    return { payload: "", imagem: "" };
  }
}
