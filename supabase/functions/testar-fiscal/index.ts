// ============================================================================
// Edge Function: testar-fiscal  (diagnóstico do NFS-e Nacional)
//
// POST /functions/v1/testar-fiscal   body: { unidade_id }
//
// Consulta GET /parametros_municipais/{codMun}/convenio em VÁRIOS hosts
// candidatos (ADN/contribuintes e SEFIN Nacional) para:
//   1. descobrir qual endpoint responde (lockar o host de emissão);
//   2. confirmar se o município está conveniado ao Sistema Nacional NFS-e;
//   3. validar o certificado A1 na conexão (mTLS), quando disponível em PEM.
// Não emite nota — é só leitura/diagnóstico.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { userClient, adminClient } from "../_shared/supabaseAdmin.ts";
import { getFiscalCredentials } from "../_shared/fiscalVault.ts";

const CANDIDATOS: Record<string, string[]> = {
  homologacao: [
    "https://adn.producaorestrita.nfse.gov.br/contribuintes",
    "https://sefin.producaorestrita.nfse.gov.br/sefinnacional",
    "https://sefin.producaorestrita.nfse.gov.br/SefinNacional",
  ],
  producao: [
    "https://adn.nfse.gov.br/contribuintes",
    "https://sefin.nfse.gov.br/sefinnacional",
    "https://sefin.nfse.gov.br/SefinNacional",
  ],
};

const MAPA_IBGE: Record<string, string> = {
  "belo horizonte": "3106200", "sao paulo": "3550308", "rio de janeiro": "3304557",
};

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const body = await req.json();
    if (!body?.unidade_id) return json({ error: "unidade_id é obrigatório." }, 400);

    const user = userClient(req);
    const { data: auth } = await user.auth.getUser();
    if (!auth?.user) return json({ error: "Não autenticado" }, 401);
    const admin = adminClient();

    // acesso à unidade (membro ou admin)
    const { data: pa } = await admin.from("platform_admins").select("user_id").eq("user_id", auth.user.id).maybeSingle();
    if (!pa) {
      const { data: mem } = await admin.from("unidade_members").select("unidade_id").eq("user_id", auth.user.id).eq("unidade_id", body.unidade_id).maybeSingle();
      if (!mem) return json({ error: "Sem acesso a esta unidade." }, 403);
    }

    const { data: cfg } = await admin.from("config_fiscal").select("*").eq("unidade_id", body.unidade_id).maybeSingle();
    if (!cfg) return json({ error: "Configuração fiscal não encontrada para esta unidade." }, 404);

    const ambiente = cfg.ambiente === "producao" ? "producao" : "homologacao";
    let codMun = String(cfg.codigo_municipio || "").replace(/\D/g, "");
    if (codMun.length !== 7) {
      const norm = String(cfg.municipio || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
      codMun = MAPA_IBGE[norm] || "";
    }
    if (codMun.length !== 7) return json({ error: "Código IBGE do município ausente na config fiscal (cLocEmi)." }, 400);

    // certificado (mTLS) — só dá pra usar se houver PEM (cert_pem + key_pem)
    let httpClient: unknown = undefined;
    let temCert = false, certMtls = false;
    try {
      const creds = await getFiscalCredentials(admin, cfg.certificado_ref || "");
      temCert = Boolean(creds.cert_pfx_base64 || (creds.cert_pem && creds.key_pem));
      const anyDeno = (globalThis as any).Deno;
      if (creds.cert_pem && creds.key_pem && anyDeno?.createHttpClient) {
        httpClient = anyDeno.createHttpClient({ certChain: creds.cert_pem, privateKey: creds.key_pem });
        certMtls = true;
      }
    } catch (_) { /* segue sem cert */ }

    const resultados = [];
    for (const base of CANDIDATOS[ambiente]) {
      const url = `${base}/parametros_municipais/${codMun}/convenio`;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      try {
        const init: RequestInit = { method: "GET", headers: { Accept: "application/json" }, signal: ctrl.signal };
        if (httpClient) (init as any).client = httpClient;
        const res = await fetch(url, init);
        const txt = (await res.text().catch(() => "")).slice(0, 400);
        resultados.push({ base, url, status: res.status, ok: res.ok, corpo: txt });
      } catch (e) {
        resultados.push({ base, url, status: 0, ok: false, erro: String((e as Error).message || e) });
      } finally {
        clearTimeout(t);
      }
    }

    return json({ unidade_id: body.unidade_id, codMun, ambiente, temCertificado: temCert, certificadoMtls: certMtls, resultados }, 200);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500);
  }
});
