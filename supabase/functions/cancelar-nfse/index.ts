// ============================================================================
// Edge Function: cancelar-nfse
//
// POST /functions/v1/cancelar-nfse
// body: { nota_id, motivo? }
//
// Cancela a NFS-e no emissor e marca a nota como "cancelada".
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { userClient, adminClient } from "../_shared/supabaseAdmin.ts";
import { getFiscalCredentials } from "../_shared/fiscalVault.ts";
import { getNfseProvider, FiscalError, type ConfigFiscal } from "../_shared/nfse/index.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const body = await req.json();
    if (!body?.nota_id) return json({ error: "Campo obrigatório ausente: nota_id" }, 400);

    const user = userClient(req);
    const { data: auth } = await user.auth.getUser();
    if (!auth?.user) return json({ error: "Não autenticado" }, 401);

    // nota (RLS) + config fiscal da unidade
    const { data: nota, error: nErr } = await user
      .from("notas_fiscais").select("*").eq("id", body.nota_id).single();
    if (nErr || !nota) return json({ error: "Nota não encontrada ou sem acesso" }, 403);
    if (nota.status === "cancelada") return json({ nota }, 200);

    const { data: config, error: cErr } = await user
      .from("config_fiscal").select("*").eq("unidade_id", nota.unidade_id)
      .single<ConfigFiscal & { certificado_ref: string }>();
    if (cErr || !config) return json({ error: "Configuração fiscal não encontrada" }, 403);

    const admin = adminClient();
    const creds = await getFiscalCredentials(admin, config.certificado_ref);
    const provider = getNfseProvider(config as ConfigFiscal, creds);

    const result = await provider.cancelarNfse(nota.nfse_id, body.motivo);
    if (result.status !== "cancelada") {
      return json({ error: "Emissor não confirmou o cancelamento", detail: result.raw }, 502);
    }

    const { data: updated } = await admin
      .from("notas_fiscais").update({ status: "cancelada" }).eq("id", nota.id).select().single();
    return json({ nota: updated }, 200);
  } catch (e) {
    if (e instanceof FiscalError) {
      return json({ error: e.message, emissor: e.emissor, detail: e.detail }, e.httpStatus ?? 502);
    }
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500);
  }
});
