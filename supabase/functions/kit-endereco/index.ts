// ============================================================================
// Edge Function: kit-endereco  (área do cliente · Endereço fiscal)
//
// GET /functions/v1/kit-endereco   (JWT do cliente; deploy --no-verify-jwt)
// → { unidades: [{ unidade_id, unidade, plano, etapa, parecer, documentos }] }
//
// Os documentos do imóvel (IPTU, alvará, modelo de anuência...) ficam no bucket
// privado documentos-unidade e só saem daqui, como link assinado de 10 minutos,
// para quem tem assinatura de endereço fiscal ATIVA (ou com cancelamento
// agendado, ainda dentro do contrato) e documentos APROVADOS naquela unidade.
//
// etapa:
//   enviar_documentos | em_conferencia | reprovado  → passo a passo, sem links
//   pagamento_pendente                              → fatura em atraso, sem links
//   preparando                                      → aprovado, kit ainda não cadastrado
//   liberado                                        → aprovado e com documentos
//   legado                                          → cadastro antigo (fale com a recepção)
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { usuarioDoReq } from "../_shared/assinaturas.ts";
import { padraoEmail } from "../_shared/reservaCliente.ts";
import { clientesDoEmail, erroInterno, type Linha, nomesDasUnidades } from "../_shared/clienteArea.ts";

const BUCKET = "documentos-unidade";
const VALIDADE_LINK_S = 600;

function etapaDaAssinatura(a: Linha): string {
  if (a.status === "inadimplente") return "pagamento_pendente";
  if (a.docs_status === "aprovado") return "preparando";
  if (a.docs_status === "enviado") return "em_conferencia";
  if (a.docs_status === "reprovado") return "reprovado";
  return "enviar_documentos";
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "Método não permitido" }, 405, req);

  try {
    const usuario = await usuarioDoReq(req);
    if (!usuario) return json({ error: "Entre na sua conta para ver os documentos." }, 401, req);
    const admin = adminClient();

    const [{ data: assinaturas, error }, clientes] = await Promise.all([
      admin.from("assinaturas").select("id, unidade_id, plano_nome, status, docs_status, docs_parecer, created_at")
        .ilike("cliente_email", padraoEmail(usuario.email)).eq("categoria", "endereco_fiscal")
        .in("status", ["ativa", "inadimplente", "cancelando"]).order("created_at", { ascending: false }),
      clientesDoEmail(admin, usuario.email),
    ]);
    if (error) throw new Error(`assinaturas: ${error.message}`);

    // Uma entrada por unidade: vale a assinatura mais adiantada no processo.
    const ordem = ["enviar_documentos", "reprovado", "em_conferencia", "pagamento_pendente", "preparando"];
    const porUnidade = new Map<string, { plano: string; etapa: string; parecer: string | null }>();
    for (const a of assinaturas || []) {
      const etapa = etapaDaAssinatura(a);
      const atual = porUnidade.get(a.unidade_id);
      if (!atual || ordem.indexOf(etapa) > ordem.indexOf(atual.etapa)) {
        porUnidade.set(a.unidade_id, { plano: a.plano_nome, etapa, parecer: a.docs_parecer || null });
      }
    }
    for (const c of clientes) {
      if (c.fiscal && c.unidade_id && !porUnidade.has(c.unidade_id)) {
        porUnidade.set(c.unidade_id, { plano: c.plano || "Endereço fiscal", etapa: "legado", parecer: null });
      }
    }

    const nomes = await nomesDasUnidades(admin, [...porUnidade.keys()]);
    const unidades = [];
    for (const [unidadeId, info] of porUnidade) {
      let documentos: Linha[] = [];
      let etapa = info.etapa;
      if (etapa === "preparando") {
        const { data: docs, error: dErr } = await admin.from("unidade_documentos")
          .select("id, tipo, titulo, nome_arquivo, mime, validade, storage_path, created_at")
          .eq("unidade_id", unidadeId).order("tipo").order("created_at", { ascending: false });
        if (dErr) throw new Error(`unidade_documentos: ${dErr.message}`);
        if (docs?.length) {
          const { data: links, error: lErr } = await admin.storage.from(BUCKET)
            .createSignedUrls(docs.map((d) => d.storage_path), VALIDADE_LINK_S);
          if (lErr) throw new Error(`links: ${lErr.message}`);
          const porCaminho = new Map((links || []).map((l) => [l.path, l.signedUrl]));
          documentos = docs.map(({ storage_path, ...d }) => ({ ...d, url: porCaminho.get(storage_path) || null }))
            .filter((d) => d.url);
          if (documentos.length) etapa = "liberado";
        }
      }
      unidades.push({
        unidade_id: unidadeId, unidade: nomes.get(unidadeId) || "", plano: info.plano, etapa,
        parecer: etapa === "reprovado" ? info.parecer : null, documentos,
      });
    }

    return json({ unidades, validade_link_minutos: VALIDADE_LINK_S / 60 }, 200, req);
  } catch (e) {
    return erroInterno(req, "kit-endereco", e);
  }
});
