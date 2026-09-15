// ============================================================================
// Edge Function: minha-assinatura  (área do cliente)
//
// GET /functions/v1/minha-assinatura   (JWT do usuário)
// → { assinaturas: [...], pendentes: [...], legados: [...], perfil, tipos_documento }
//
// Tudo o que o cliente precisa ver do plano num lugar só: situação, próxima
// cobrança, faturas, contrato aceito (texto da versão aceita) e documentos.
// `legados`: cadastro de cliente com plano contratado antes da venda online
// (sem assinatura nesta unidade) — a tela mostra o plano e manda falar com a
// recepção para mudar ou cancelar. `perfil`: dados de leitura para Minha conta.
// Filtra pelo e-mail do login; nada de outro cliente sai daqui.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { planoDeCancelamento, TIPOS_DOCUMENTO } from "../_shared/ciclo.ts";
import { hojeBRT } from "../_shared/venda.ts";
import { documentosComLink, usuarioDoReq } from "../_shared/assinaturas.ts";
import { padraoEmail } from "../_shared/reservaCliente.ts";
import { clientesDoEmail, erroInterno, nomesDasUnidades } from "../_shared/clienteArea.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const usuario = await usuarioDoReq(req);
    if (!usuario) return json({ error: "Entre na sua conta para ver o seu plano." }, 401, req);
    const admin = adminClient();
    const hoje = hojeBRT();
    const email = padraoEmail(usuario.email);

    // A versão aceita (não a vigente): é o que vale para este cliente.
    const contratoAceito = async (aceiteId: string) => {
      const { data: ac } = await admin.from("aceites_contrato")
        .select("aceito_em, versao, hash, modelo_id").eq("id", aceiteId).maybeSingle();
      if (!ac) return null;
      const { data: modelo } = await admin.from("contratos_modelos")
        .select("titulo, corpo").eq("id", ac.modelo_id).maybeSingle();
      return { titulo: modelo?.titulo || "", corpo: modelo?.corpo || "", versao: ac.versao, hash: ac.hash, aceito_em: ac.aceito_em };
    };

    const [{ data: linhas, error }, clientes] = await Promise.all([
      admin.from("assinaturas").select("*").ilike("cliente_email", email).order("created_at", { ascending: false }),
      clientesDoEmail(admin, usuario.email),
    ]);
    if (error) throw new Error(`assinaturas: ${error.message}`);
    const nomes = await nomesDasUnidades(admin, [...(linhas || []).map((a) => a.unidade_id), ...clientes.map((c) => c.unidade_id)]);

    const assinaturas = [];
    for (const a of linhas || []) {
      const [{ data: cobrancas }, aceite, documentos] = await Promise.all([
        admin.from("cobrancas").select("id, valor, vencimento, status, invoice_url, pago_em, descricao")
          .eq("assinatura_id", a.id).order("vencimento", { ascending: false }).limit(24),
        a.aceite_id ? contratoAceito(a.aceite_id) : Promise.resolve(null),
        a.docs_status ? documentosComLink(admin, a.id) : Promise.resolve([]),
      ]);

      const simulacao = ["ativa", "inadimplente"].includes(a.status)
        ? planoDeCancelamento({ inicio: a.inicio, hoje, recorrencia: a.recorrencia, fidelidade_ate: a.fidelidade_ate })
        : null;

      assinaturas.push({
        id: a.id, plano_nome: a.plano_nome, categoria: a.categoria, unidade: nomes.get(a.unidade_id) || "",
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

    // Plano contratado antes da venda online: cadastro sem assinatura na mesma unidade.
    const unidadesComAssinatura = new Set((linhas || []).filter((a) => a.status !== "cancelada").map((a) => a.unidade_id));
    const legados = clientes
      .filter((c) => c.plano && String(c.plano).trim() && !unidadesComAssinatura.has(c.unidade_id))
      .map((c) => ({
        id: c.id, plano: String(c.plano).trim(), unidade: nomes.get(c.unidade_id) || "",
        situacao: c.status || "ativo", fiscal: !!c.fiscal, desde: c.desde || null,
      }));

    const { data: pendentes } = await admin.from("pending_signups")
      .select("plano_nome, valor, recorrencia, invoice_url, created_at")
      .ilike("email", email).eq("status", "aguardando").order("created_at", { ascending: false });

    // Dados de leitura para "Minha conta": o cadastro da recepção vale mais que o do site.
    const cad = clientes[0] || null;
    const ultima = (linhas || [])[0] || null;
    const perfil = {
      nome: cad?.nome || ultima?.cliente_nome || "",
      email: usuario.email,
      telefone: cad?.telefone || "",
      documento: cad?.documento || ultima?.cliente_documento || "",
      desde: cad?.desde || ultima?.inicio || null,
    };

    return json({ assinaturas, pendentes: pendentes || [], legados, perfil, tipos_documento: TIPOS_DOCUMENTO }, 200, req);
  } catch (e) {
    return erroInterno(req, "minha-assinatura", e);
  }
});
