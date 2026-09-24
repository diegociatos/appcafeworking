// ============================================================================
// Edge Function: credenciais-fiscais  (deploy --no-verify-jwt)
//
// POST /functions/v1/credenciais-fiscais   body: { unidade_id }
// Cabeçalho x-fiscal-token = secret FISCAL_INTERNAL_TOKEN.
//
// Entrega o certificado A1 da unidade AO TRANSMISSOR FISCAL, o serviço Node que
// assina e transmite a NFS-e (o Deno do Supabase é recusado pelo SEFIN — ver
// docs/NFSE-TRANSMISSOR.md). É o mesmo desenho que o ContaOne já usa em
// produção, escolhido pelo Diego em 24/09/2026 para reaproveitar o certificado
// que já está no cofre, sem ninguém precisar do arquivo .pfx de novo.
//
// Travas:
//  • segredo próprio, que só existe entre esta função e o transmissor;
//  • comparação em tempo constante, para o segredo não vazar pelo tempo;
//  • sem JWT de usuário: ninguém alcança isto pelo app nem pelo navegador;
//  • erro genérico, que nunca conta o que existe no cofre.
// ============================================================================
import { json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { getFiscalCredentials } from "../_shared/fiscalVault.ts";

function tokenConfere(recebido: string | null, esperado: string): boolean {
  if (esperado.length < 32 || !recebido || recebido.length !== esperado.length) return false;
  let diferenca = 0;
  for (let i = 0; i < esperado.length; i++) diferenca |= recebido.charCodeAt(i) ^ esperado.charCodeAt(i);
  return diferenca === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erro: "Método não permitido" }, 405);
  const esperado = Deno.env.get("FISCAL_INTERNAL_TOKEN") || "";
  if (esperado.length < 32) return json({ erro: "Transmissor fiscal não configurado" }, 503);
  if (!tokenConfere(req.headers.get("x-fiscal-token"), esperado)) return json({ erro: "Não autorizado" }, 401);

  try {
    const { unidade_id } = await req.json().catch(() => ({}));
    if (!unidade_id) return json({ erro: "Unidade não informada" }, 400);

    const admin = adminClient();
    const { data: cfg } = await admin.from("config_fiscal")
      .select("certificado_ref").eq("unidade_id", unidade_id).maybeSingle();
    if (!cfg?.certificado_ref) return json({ erro: "Unidade sem certificado cadastrado" }, 404);

    const creds = await getFiscalCredentials(admin, cfg.certificado_ref);
    if (!creds.cert_pfx_base64 || !creds.cert_senha) return json({ erro: "Unidade sem certificado cadastrado" }, 404);

    return json({ cert_pfx_base64: creds.cert_pfx_base64, cert_senha: creds.cert_senha }, 200);
  } catch (e) {
    console.error(e);
    return json({ erro: "Não foi possível abrir o certificado" }, 500);
  }
});
