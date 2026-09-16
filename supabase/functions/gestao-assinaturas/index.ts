// ============================================================================
// Edge Function: gestao-assinaturas  (equipe da unidade)
//
// GET  /functions/v1/gestao-assinaturas?unidade_id=...   (JWT de equipe)
//   → { assinaturas: [...com documentos e aceite] }
// POST { acao: "avaliar_documentos", assinatura_id, decisao: "aprovado"|"reprovado", parecer }
// POST { acao: "atribuir_sala", assinatura_id, sala_id }
// POST { acao: "resolver_acerto", assinatura_id, observacao? }
//
// Documentos reprovados (contrato de endereço fiscal, 3.4): cancela na hora e
// devolve integralmente o que foi pago.
//
// Permissões: a recepção lista, aprova documentos e atribui sala. Mexe em
// dinheiro, e por isso é só do master/financeiro (ou admin da plataforma):
// ver as últimas cobranças, reprovar documentos (gera estorno) e resolver acerto.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import {
  APP_URL, avisarCliente, avisarEquipe, cancelarAgora, carregarAssinatura, documentosComLink, ehEquipe, usuarioDoReq,
} from "../_shared/assinaturas.ts";
import { ocuparSala } from "../_shared/disponibilidade.ts";
import { podeMexerNoDinheiro, recusaSemFinanceiro } from "../_shared/permissoes.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const usuario = await usuarioDoReq(req);
    if (!usuario) return json({ error: "Não autenticado" }, 401, req);
    const admin = adminClient();

    if (req.method === "GET") {
      const unidadeId = new URL(req.url).searchParams.get("unidade_id") || "";
      if (!unidadeId) return json({ error: "unidade_id é obrigatório." }, 400, req);
      if (!(await ehEquipe(req, unidadeId))) return json({ error: "Acesso só da equipe da unidade." }, 403, req);
      const verCobrancas = await podeMexerNoDinheiro(admin, usuario.id, unidadeId);

      const { data, error } = await admin.from("assinaturas").select("*")
        .eq("unidade_id", unidadeId).order("created_at", { ascending: false }).limit(300);
      if (error) return json({ error: error.message }, 500, req);

      // salas privativas: livres (para atribuir) e nomes das já atribuídas
      const [{ data: salas }, { data: planosDocs }] = await Promise.all([
        admin.from("salas").select("id, nome, capacidade, contratada, active").eq("unidade_id", unidadeId).eq("tipo", "Privativa"),
        admin.from("app_state").select("item_id, doc").eq("entity", "planos").eq("unidade_id", unidadeId),
      ]);
      const capacidadePlano = new Map((planosDocs || []).map((p) => [p.item_id, Number(p.doc?.capacidade) || null]));
      const nomeSala = new Map((salas || []).map((s) => [s.id, s.nome]));
      const salasLivres = (salas || []).filter((s) => s.active && !s.contratada)
        .map((s) => ({ id: s.id, nome: s.nome, capacidade: s.capacidade }))
        .sort((x, y) => String(x.nome).localeCompare(String(y.nome), "pt-BR"));

      const assinaturas = await Promise.all((data || []).map(async (a) => {
        const [documentos, aceite, { data: cobrancas }] = await Promise.all([
          a.docs_status ? documentosComLink(admin, a.id) : Promise.resolve([]),
          a.aceite_id
            ? admin.from("aceites_contrato").select("aceito_em, versao, ip, origem").eq("id", a.aceite_id).maybeSingle().then((r) => r.data)
            : Promise.resolve(null),
          verCobrancas
            ? admin.from("cobrancas").select("valor, vencimento, status, forma:tipo").eq("assinatura_id", a.id)
              .order("vencimento", { ascending: false }).limit(6)
            : Promise.resolve({ data: [] }),
        ]);
        return {
          ...a, documentos, aceite, cobrancas: cobrancas || [],
          capacidade: a.categoria === "sala_privativa" ? capacidadePlano.get(a.plano_id) ?? null : null,
          sala_nome: a.sala_id ? nomeSala.get(a.sala_id) || a.sala_id : null,
        };
      }));
      return json({ assinaturas, salas_livres: salasLivres, pode_financeiro: verCobrancas }, 200, req);
    }

    if (req.method !== "POST") return json({ error: "Método não permitido" }, 405, req);
    const body = await req.json().catch(() => ({}));
    const a = await carregarAssinatura(admin, body?.assinatura_id);
    if (!a) return json({ error: "Assinatura não encontrada." }, 404, req);
    if (!(await ehEquipe(req, a.unidade_id))) return json({ error: "Acesso só da equipe da unidade." }, 403, req);

    if (body.acao === "avaliar_documentos") {
      const parecer = typeof body.parecer === "string" ? body.parecer.trim().slice(0, 1000) : "";
      if (!a.docs_status) return json({ error: "Este plano não tem conferência de documentos." }, 400, req);

      if (body.decisao === "aprovado") {
        await admin.from("assinaturas").update({
          docs_status: "aprovado", docs_parecer: parecer || null,
          docs_avaliado_em: new Date().toISOString(), docs_avaliado_por: usuario.id,
        }).eq("id", a.id);
        await avisarCliente(admin, a, "documentos_aprovados", {});
        return json({ ok: true, docs_status: "aprovado" }, 200, req);
      }

      if (body.decisao === "reprovado") {
        if (!(await podeMexerNoDinheiro(admin, usuario.id, a.unidade_id))) {
          return recusaSemFinanceiro("Reprovar documentos cancela o plano e devolve o pagamento", req);
        }
        if (!parecer) return json({ error: "Informe o motivo da reprovação: ele vai no e-mail ao cliente." }, 400, req);
        const r = await cancelarAgora(admin, a, "documentos_reprovados", parecer, {
          docs_status: "reprovado", docs_parecer: parecer,
          docs_avaliado_em: new Date().toISOString(), docs_avaliado_por: usuario.id,
        });
        if (r.jaCancelada) return json({ error: "Este plano já está cancelado." }, 409, req);
        await avisarCliente(admin, a, "documentos_reprovados", { parecer, reembolso: r.reembolso });
        await avisarEquipe(`Documentos reprovados, plano cancelado: ${a.plano_nome}`, [
          `Cliente: ${a.cliente_nome} (${a.cliente_email})`, `Motivo: ${parecer}`, `Por: ${usuario.email}`,
          `Devolução: ${r.reembolso === "manual" ? `MANUAL, R$ ${r.valorManual.toFixed(2)}` : r.reembolso}`,
        ], APP_URL);
        return json({ ok: true, docs_status: "reprovado", reembolso: r.reembolso }, 200, req);
      }
      return json({ error: "Decisão inválida." }, 400, req);
    }

    if (body.acao === "atribuir_sala") {
      if (a.categoria !== "sala_privativa") return json({ error: "Só assinatura de sala privativa recebe sala." }, 400, req);
      if (!["ativa", "inadimplente"].includes(a.status)) return json({ error: "A assinatura não está ativa." }, 409, req);
      if (a.sala_id) return json({ error: "Esta assinatura já tem sala atribuída." }, 409, req);
      const salaId = typeof body.sala_id === "string" ? body.sala_id : "";
      const { data: sala } = await admin.from("salas").select("id, unidade_id, nome, tipo, contratada, active")
        .eq("id", salaId).maybeSingle();
      if (!sala || sala.unidade_id !== a.unidade_id || sala.tipo !== "Privativa" || !sala.active) {
        return json({ error: "Sala inválida para esta unidade." }, 400, req);
      }
      if (sala.contratada) return json({ error: "Esta sala já está alugada." }, 409, req);

      // reserva a sala para a assinatura (índice único impede a mesma sala em duas)
      const { error: aErr } = await admin.from("assinaturas").update({ sala_id: sala.id }).eq("id", a.id).is("sala_id", null);
      if (aErr) return json({ error: `Não foi possível atribuir: ${aErr.message}` }, 409, req);

      await ocuparSala(admin, { ...a, sala_id: sala.id });
      return json({ ok: true, sala: { id: sala.id, nome: sala.nome } }, 200, req);
    }

    if (body.acao === "resolver_acerto") {
      if (!(await podeMexerNoDinheiro(admin, usuario.id, a.unidade_id))) {
        return recusaSemFinanceiro("Resolver acerto financeiro", req);
      }
      if (!a.requer_acerto) return json({ error: "Esta assinatura não tem acerto pendente." }, 400, req);
      const obs = typeof body.observacao === "string" ? body.observacao.trim().slice(0, 500) : "";
      await admin.from("assinaturas").update({
        acerto_resolvido_em: new Date().toISOString(),
        cancelamento_motivo: [a.cancelamento_motivo, obs && `Acerto: ${obs} (${usuario.email})`].filter(Boolean).join(" | ") || null,
      }).eq("id", a.id);
      return json({ ok: true }, 200, req);
    }

    return json({ error: "Ação inválida." }, 400, req);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500, req);
  }
});
