// ============================================================================
// Edge Function: ticket-certificado
//
// POST /functions/v1/ticket-certificado   body: { unidade_id }
//
// Devolve um passe curto (5 min) que autoriza ESTA pessoa a subir o certificado
// A1 DESTA unidade direto no transmissor fiscal. O arquivo vai do navegador
// para o transmissor sem passar por aqui: a chave privada não trafega entre
// serviços, e cada unidade (inclusive franquia) cadastra o próprio certificado
// de qualquer computador.
//
// Quem pode: admin da plataforma ou master/financeiro da unidade — a mesma
// régua de salvar-certificado.
// ============================================================================
import { handleOptions, json } from "../_shared/cors.ts";
import { userClient, adminClient } from "../_shared/supabaseAdmin.ts";
import { podeMexerNoDinheiro, recusaSemFinanceiro } from "../_shared/permissoes.ts";

const VALIDADE_MS = 5 * 60 * 1000;

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function assinarPasse(corpo: string, segredo: string): Promise<string> {
  const chave = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(segredo),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(corpo));
  return base64url(new Uint8Array(mac));
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const { unidade_id } = await req.json().catch(() => ({}));
    if (!unidade_id) return json({ error: "Campo obrigatório ausente: unidade_id" }, 400);

    const segredo = Deno.env.get("NFSE_TRANSMISSOR_TOKEN") || "";
    const destino = Deno.env.get("NFSE_TRANSMISSOR_URL") || "";
    if (segredo.length < 32 || !destino) return json({ error: "Transmissor fiscal não configurado" }, 503);

    const user = userClient(req);
    const { data: auth } = await user.auth.getUser();
    if (!auth?.user) return json({ error: "Não autenticado" }, 401);

    const admin = adminClient();
    if (!(await podeMexerNoDinheiro(admin, auth.user.id, unidade_id))) return recusaSemFinanceiro();

    const corpo = base64url(new TextEncoder().encode(JSON.stringify({
      unidade_id, expira: Date.now() + VALIDADE_MS,
    })));
    const ticket = `${corpo}.${await assinarPasse(corpo, segredo)}`;
    // O endereço do upload é o do transmissor, trocando a função por certificado.
    return json({ ticket, url: destino.replace(/\/transmitir$/, "/certificado"), expira_em_ms: VALIDADE_MS }, 200);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500);
  }
});
