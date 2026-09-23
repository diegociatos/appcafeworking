// ============================================================================
// Edge Function: testar-fiscal  (diagnóstico do NFS-e Nacional)
//
// POST /functions/v1/testar-fiscal   body: { unidade_id }
//
// Consulta GET /parametros_municipais/{codMun}/convenio no SEFIN Nacional para:
//   1. testar o mesmo host e transporte HTTP/1.1 usados na emissão;
//   2. confirmar se o município está conveniado ao Sistema Nacional NFS-e;
//   3. validar o certificado A1 na conexão (mTLS), quando disponível em PEM.
// Não emite nota — é só leitura/diagnóstico.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { userClient, adminClient } from "../_shared/supabaseAdmin.ts";
import { podeMexerNoDinheiro, recusaSemFinanceiro } from "../_shared/permissoes.ts";
import { getFiscalCredentials } from "../_shared/fiscalVault.ts";
import { credenciaisPemComCadeia } from "../_shared/nfse/certificado.ts";
import { buscarSefin } from "../_shared/nfse/transporteNacional.ts";

const SEFIN: Record<string, string> = {
  homologacao: "https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional",
  producao: "https://sefin.nfse.gov.br/SefinNacional",
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

    // só admin da plataforma ou master/financeiro da unidade (recepção e contabilidade não)
    if (!(await podeMexerNoDinheiro(admin, auth.user.id, body.unidade_id))) {
      return recusaSemFinanceiro("Testar a emissão fiscal");
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

    let temCert = false;
    let cert: string | undefined, key: string | undefined;
    try {
      const creds = await getFiscalCredentials(admin, cfg.certificado_ref || "");
      temCert = Boolean(creds.cert_pfx_base64 || (creds.cert_pem && creds.key_pem));
      ({ cert, key } = credenciaisPemComCadeia(creds));
    } catch (_) { /* segue sem cert */ }

    type Sondagem = { base: string; url: string; rotulo: string; status: number; ok: boolean; erro?: string; detalhe?: string };
    const resultados: Sondagem[] = [];
    const base = SEFIN[ambiente];
    const url = `${base}/parametros_municipais/${codMun}/convenio`;

    // Duas sondagens para separar as duas causas possíveis de falha:
    //   1. com certificado = o caminho real da emissão;
    //   2. sem certificado = só alcança o host. Se esta responde (403 é o
    //      esperado, por falta de certificado) e a primeira não, o problema é o
    //      certificado. Se nenhuma responde, o host não é alcançável daqui.
    const sondar = async (rotulo: string, modo: "certificado" | "http1" | "http2" | "certSemFlag") => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12000);
      const init: RequestInit = { method: "GET", headers: { Accept: "application/json" }, signal: ctrl.signal };
      let cliente: { close(): void } | undefined;
      try {
        let res: Response;
        if (modo === "certificado") {
          res = await buscarSefin(url, init, cert, key, Deno, fetch as never, String(body.unidade_id));
        } else if (modo === "http1") {
          // Mesmo transporte da emissão, sem certificado: separa problema de
          // transporte HTTP/1.1 de recusa do certificado pelo SEFIN.
          cliente = Deno.createHttpClient({ http1: true, http2: false });
          res = await fetch(url, { ...init, client: cliente } as RequestInit);
        } else if (modo === "certSemFlag") {
          // Certificado sem travar HTTP/1.1: se o servidor responder (mesmo
          // exigindo HTTP/1.1), o certificado foi aceito no handshake.
          cliente = Deno.createHttpClient({ cert: cert as string, key: key as string });
          res = await fetch(url, { ...init, client: cliente } as RequestInit);
        } else {
          res = await fetch(url, init);
        }
        resultados.push({ base, url, rotulo, status: res.status, ok: res.ok });
      } catch (e) {
        const erro = e instanceof DOMException && e.name === "AbortError"
          ? "Tempo de resposta esgotado. Tente novamente mais tarde."
          : String((e as Error).message || e);
        const detalhe = String((e as Error)?.cause || "").slice(0, 600) || undefined;
        resultados.push({ base, url, rotulo, status: 0, ok: false, erro, detalhe });
      } finally {
        clearTimeout(t);
        cliente?.close();
      }
    };

    if (cert && key) await sondar("Com certificado, HTTP/1.1 (caminho da emissão)", "certificado");
    await sondar("Sem certificado, HTTP/1.1 (testa só o transporte)", "http1");
    if (cert && key) await sondar("Com certificado, sem travar protocolo", "certSemFlag");
    await sondar("Sem certificado, padrão do runtime (só alcance do host)", "http2");

    return json({ unidade_id: body.unidade_id, codMun, ambiente, temCertificado: temCert, certificadoMtls: Boolean(cert && key), resultados }, 200);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500);
  }
});
