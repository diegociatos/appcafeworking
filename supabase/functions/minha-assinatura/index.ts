// ============================================================================
// Edge Function: minha-assinatura  (área do cliente)
//
// GET /functions/v1/minha-assinatura   (JWT do usuário)
// → { assinaturas: [...], pendentes: [...], tipos_documento }
//
// Tudo o que o cliente precisa ver do plano num lugar só: situação, próxima
// cobrança, faturas, contrato aceito (texto da versão aceita) e documentos.
// Filtra pelo e-mail do login; nada de outro cliente sai daqui.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { planoDeCancelamento, TIPOS_DOCUMENTO } from "../_shared/ciclo.ts";
import { hojeBRT } from "../_shared/venda.ts";
import { documentosComLink, usuarioDoReq } from "../_shared/assinaturas.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const usuario = await usuarioDoReq(req);
    if (!usuario) return json({ error: "Não autenticado" }, 401, req);
    const admin = adminClient();
    const hoje = hojeBRT();

    // A versão aceita (não a vigente): é o que vale para este cliente.
    const contratoAceito = async (aceiteId: string) => {
      const { data: ac } = await admin.from("aceites_contrato")
        .select("aceito_em, versao, hash, modelo_id").eq("id", aceiteId).maybeSingle();
      if (!ac) return null;
      const { data: modelo } = await admin.from("contratos_modelos")
        .select("titulo, corpo").eq("id", ac.modelo_id).maybeSingle();
      return { titulo: modelo?.titulo || "", corpo: modelo?.corpo || "", versao: ac.versao, hash: ac.hash, aceito_em: ac.aceito_em };
    };

    const { data: linhas, error } = await admin.from("assinaturas").select("*")
      .eq("cliente_email", usuario.email).order("created_at", { ascending: false });
    if (error) return json({ error: error.message }, 500, req);

    const assinaturas = [];
    for (const a of linhas || []) {
      const [{ data: cobrancas }, aceite, documentos, { data: unidade }] = await Promise.all([
        admin.from("cobrancas").select("id, valor, vencimento, status, invoice_url, pago_em, descricao")
          .eq("assinatura_id", a.id).order("vencimento", { ascending: false }).limit(24),
        a.aceite_id ? contratoAceito(a.aceite_id) : Promise.resolve(null),
        a.docs_status ? documentosComLink(admin, a.id) : Promise.resolve([]),
        admin.from("unidades").select("nome").eq("id", a.unidade_id).maybeSingle(),
      ]);

      const simulacao = ["ativa", "inadimplente"].includes(a.status)
        ? planoDeCancelamento({ inicio: a.inicio, hoje, recorrencia: a.recorrencia, fidelidade_ate: a.fidelidade_ate })
        : null;

      assinaturas.push({
        id: a.id, plano_nome: a.plano_nome, categoria: a.categoria, unidade: unidade?.nome || "",
        valor: Number(a.valor), recorrencia: a.recorrencia, status: a.status, inicio: a.inicio,
        proxima_cobranca: a.proxima_cobranca, fidelidade_ate: a.fidelidade_ate,
        cancela_em: a.cancela_em, cancelada_em: a.cancelada_em, requer_acerto: a.requer_acerto,
        docs_status: a.docs_status, docs_parecer: a.docs_parecer,
        cancelamento_se_pedir_hoje: simulacao,
        cobrancas: cobrancas || [],
        contrato: aceite,
        documentos,
      });
    }

    const { data: pendentes } = await admin.from("pending_signups")
      .select("plano_nome, valor, recorrencia, invoice_url, created_at")
      .eq("email", usuario.email).eq("status", "aguardando").order("created_at", { ascending: false });

    return json({ assinaturas, pendentes: pendentes || [], tipos_documento: TIPOS_DOCUMENTO }, 200, req);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500, req);
  }
});
