// ============================================================================
// Edge Function: aprovar-parceiro  (admin da plataforma · tela Parceiros)
//
// POST /functions/v1/aprovar-parceiro   (JWT do admin; deploy --no-verify-jwt)
//
//   { acao: "analisar", candidatura_id }            → marca 'em_analise'
//   { acao: "aprovar",  candidatura_id }            → { ok, conta, unidade, login, pendencias }
//   { acao: "recusar",  candidatura_id, motivo }    → { ok }  (e-mail ao candidato)
//
// Aprovar, em ordem, com service_role (docs/PARCEIROS.md, fase 2):
//   1. conta tipo 'parceiro', 75/10, situação 'em_analise', avisos no e-mail
//      do responsável;
//   2. unidade "CafeWorking <Cidade>" com o endereço da candidatura — o gatilho
//      da fase 1 copia a tabela nacional; a função aplicar_planos_modelo é
//      chamada de novo por garantia;
//   3. login master do responsável, com link de criar senha;
//   4. aceite do contrato de parceria, se houver versão publicada;
//   5. e-mail de boas-vindas com o que ainda falta.
//
// O parceiro NÃO fica ativo aqui: ele só vende quando o admin informar o
// asaas_wallet_id em Contas (a fase 1 recusa a venda sem carteira).
//
// Idempotente: cada etapa grava o que criou na candidatura (conta_id,
// unidade_id, user_id, aceite_id). Chamar de novo continua de onde parou e
// nunca duplica conta, unidade ou login. Tudo auditado.
// ============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { APP_URL, avisarEquipe, usuarioDoReq } from "../_shared/assinaturas.ts";
import { ipDaReq, registrarAuditoria } from "../_shared/audit.ts";
import { getNotifProvider, renderTemplate } from "../_shared/notify/index.ts";
import { contratoParceriaVigente, registrarAceite } from "../_shared/contratos.ts";
import { GARANTIA_PERCENTUAL_PADRAO, PARCEIRO_PERCENTUAL_PADRAO } from "../_shared/parceiros.ts";
import {
  checklistDoParceiro, nomeDaUnidadeParceira, pendenciasDoParceiro, resumoDaCandidatura, rotuloServico,
} from "../_shared/parceiroCandidatura.ts";

// deno-lint-ignore no-explicit-any
type Linha = Record<string, any>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const slug = (s: string) =>
  (s || "").toLowerCase().normalize("NFD")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 18) || "x";

/** Login existente pelo e-mail (mesma RPC da convidar-cliente). */
async function acharUsuario(admin: SupabaseClient, email: string): Promise<string | null> {
  const { data, error } = await admin.rpc("usuario_id_por_email", { p_email: email });
  if (!error) return (data as string | null) || null;
  for (let page = 1; page <= 20; page++) {
    const { data: lista, error: e } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (e || !lista?.users?.length) break;
    const achado = lista.users.find((u) => (u.email || "").toLowerCase() === email);
    if (achado) return achado.id;
    if (lista.users.length < 1000) break;
  }
  return null;
}

/** Anota na candidatura o que acabou de ser criado (para a próxima chamada pular). */
async function anotar(admin: SupabaseClient, id: string, campos: Linha): Promise<void> {
  const { error } = await admin.from("parceiro_candidaturas").update(campos).eq("id", id);
  if (error) throw new Error(`parceiro_candidaturas: ${error.message}`);
}

/** E-mail ao parceiro/candidato + registro em notificacoes. Nunca lança. */
async function enviar(
  admin: SupabaseClient, unidadeId: string | null, evento: "parceiro_boas_vindas" | "parceiro_recusado",
  dados: Record<string, unknown>, registro: Record<string, unknown>,
): Promise<boolean> {
  try {
    const msg = renderTemplate(evento, dados);
    const envio = await getNotifProvider("email").enviar({ ...msg, para: String(dados.email) });
    await admin.from("notificacoes").insert({
      unidade_id: unidadeId, cliente_nome: String(dados.cliente || ""), destinatario: String(dados.email),
      canal: "email", evento, template: evento, dados: registro,
      status: envio.ok ? "enviado" : "erro", assunto: msg.assunto, provider_id: envio.providerId ?? null,
      sent_at: envio.ok ? new Date().toISOString() : null, erro: envio.ok ? null : envio.erro ?? null,
    });
    if (!envio.ok) console.error(`[aprovar-parceiro] ${evento}:`, envio.erro);
    return envio.ok;
  } catch (e) {
    console.error(`[aprovar-parceiro] ${evento}:`, (e as Error).message);
    return false;
  }
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405, req);

  try {
    const usuario = await usuarioDoReq(req);
    if (!usuario) return json({ error: "Sua sessão expirou. Entre de novo." }, 401, req);

    const admin = adminClient();
    const { data: pa } = await admin.from("platform_admins").select("user_id").eq("user_id", usuario.id).maybeSingle();
    if (!pa) return json({ error: "Só o administrador da plataforma decide sobre candidaturas." }, 403, req);

    const body = await req.json().catch(() => ({}));
    const acao = String(body?.acao || "");
    const candidaturaId = String(body?.candidatura_id || "");
    if (!UUID.test(candidaturaId)) return json({ error: "Candidatura não informada." }, 400, req);

    const { data: cand } = await admin.from("parceiro_candidaturas").select("*").eq("id", candidaturaId).maybeSingle();
    if (!cand) return json({ error: "Candidatura não encontrada. Recarregue a tela." }, 404, req);

    const auditar = (acaoLog: string, detalhe: Record<string, unknown>) => registrarAuditoria(admin, {
      unidade_id: cand.unidade_id ?? null, ator_id: usuario.id, ator_email: usuario.email,
      acao: acaoLog, entidade: "parceiro_candidatura", entidade_id: cand.id, detalhe, ip: ipDaReq(req),
    });

    // ---- em análise ---------------------------------------------------------
    if (acao === "analisar") {
      if (cand.situacao !== "nova") return json({ ok: true, candidatura: cand }, 200, req);
      const { data, error } = await admin.from("parceiro_candidaturas")
        .update({ situacao: "em_analise" }).eq("id", cand.id).select("*").single();
      if (error) return json({ error: "Não foi possível mudar a situação. Tente de novo." }, 500, req);
      await auditar("parceiro.candidatura_em_analise", {});
      return json({ ok: true, candidatura: data }, 200, req);
    }

    // ---- recusar ------------------------------------------------------------
    if (acao === "recusar") {
      const motivo = String(body?.motivo || "").trim().slice(0, 1000);
      if (motivo.length < 10) {
        return json({ error: "Escreva o motivo da recusa (ele vai no e-mail ao candidato)." }, 400, req);
      }
      if (cand.situacao === "aprovada") {
        return json({ error: "Esta candidatura já foi aprovada. Suspenda o parceiro em Contas." }, 409, req);
      }
      if (cand.situacao === "recusada") return json({ ok: true, candidatura: cand, repetido: true }, 200, req);

      const { data, error } = await admin.from("parceiro_candidaturas").update({
        situacao: "recusada", motivo, decidida_em: new Date().toISOString(), decidida_por: usuario.id,
      }).eq("id", cand.id).select("*").single();
      if (error) {
        console.error("[aprovar-parceiro] recusar", error.message);
        return json({ error: "Não foi possível recusar agora. Tente de novo." }, 500, req);
      }
      const enviado = await enviar(admin, null, "parceiro_recusado", {
        cliente: cand.responsavel, email: cand.email, escritorio: cand.escritorio, motivo,
      }, { candidatura_id: cand.id });
      await auditar("parceiro.candidatura_recusada", { motivo, email_enviado: enviado });
      return json({ ok: true, candidatura: data, email_enviado: enviado }, 200, req);
    }

    if (acao !== "aprovar") return json({ error: "Pedido inválido." }, 400, req);

    // ---- aprovar ------------------------------------------------------------
    if (cand.situacao === "recusada") {
      return json({ error: "Esta candidatura foi recusada. Peça um novo cadastro pelo site." }, 409, req);
    }

    const cidadeUf = `${cand.cidade}/${cand.uf}`;
    const sufixo = crypto.randomUUID().slice(0, 6);
    const criado = { conta: false, unidade: false, login: false, aceite: false };

    // 1) conta parceira
    let conta: Linha | null = null;
    if (cand.conta_id) {
      const { data } = await admin.from("contas").select("*").eq("id", cand.conta_id).maybeSingle();
      conta = data;
    }
    if (!conta) {
      const contaId = `fr_${slug(cand.escritorio)}_${sufixo}`.slice(0, 40);
      const { data, error } = await admin.from("contas").insert({
        id: contaId,
        nome: cand.escritorio,
        master: cand.responsavel,
        email: cand.email,
        documento: cand.documento,
        telefone: cand.whatsapp,
        plano: null,
        mensalidade: 0,
        tipo_pessoa: cand.tipo_pessoa,
        responsavel: cand.responsavel,
        endereco: cand.endereco,
        cidade: cidadeUf,
        observacoes: [
          `Parceiro aprovado pela candidatura ${cand.id}.`,
          `Quer oferecer: ${(cand.servicos || []).map((s: string) => rotuloServico(s)).join(", ")}.`,
          `Salas informadas: ${cand.salas}.`,
          ...(cand.observacoes ? [`Observações do candidato: ${cand.observacoes}`] : []),
        ].join("\n").slice(0, 2000),
        tipo: "parceiro",
        parceiro_percentual: PARCEIRO_PERCENTUAL_PADRAO,
        garantia_percentual: GARANTIA_PERCENTUAL_PADRAO,
        // fica 'em_analise' de propósito: só vira 'ativo' com a carteira Asaas
        parceiro_status: "em_analise",
        emails_aviso: [cand.email],
      }).select("*").single();
      if (error) {
        console.error("[aprovar-parceiro] conta", error.message);
        return json({ error: `Não foi possível criar a conta do parceiro: ${error.message}` }, 500, req);
      }
      conta = data as Linha;
      criado.conta = true;
      await anotar(admin, cand.id, { conta_id: conta.id });
    }
    if (!conta) return json({ error: "A conta do parceiro sumiu. Recarregue a tela e tente de novo." }, 500, req);

    // 2) unidade "CafeWorking <Cidade>" (o gatilho da fase 1 copia a tabela nacional)
    let unidade: Linha | null = null;
    if (cand.unidade_id) {
      const { data } = await admin.from("unidades").select("*").eq("id", cand.unidade_id).maybeSingle();
      unidade = data;
    }
    if (!unidade) {
      const unidadeId = `un_${slug(cand.cidade)}_${sufixo}`.slice(0, 40);
      const { data, error } = await admin.from("unidades").insert({
        id: unidadeId, franqueado_id: conta.id, nome: nomeDaUnidadeParceira(cand.cidade),
        endereco: cand.endereco, cidade: cidadeUf,
        cor: "#6E4E3B", salas: Number(cand.salas) || 0, ocupacao: 0, membros: 0, receita: 0,
      }).select("*").single();
      if (error) {
        console.error("[aprovar-parceiro] unidade", error.message);
        return json({ error: `A conta foi criada, mas a unidade não: ${error.message}. Tente aprovar de novo.` }, 500, req);
      }
      unidade = data as Linha;
      criado.unidade = true;
      await anotar(admin, cand.id, { unidade_id: unidade.id });
    }
    if (!unidade) return json({ error: "A unidade do parceiro sumiu. Recarregue a tela e tente de novo." }, 500, req);

    // 3) tabela nacional na unidade (o gatilho já aplicou; aqui é a garantia)
    let planosAplicados = 0;
    try {
      const { data, error } = await admin.rpc("aplicar_planos_modelo", { p_unidade_id: unidade.id });
      if (error) throw new Error(error.message);
      planosAplicados = Number(data || 0);
    } catch (e) {
      console.error("[aprovar-parceiro] tabela nacional:", (e as Error).message);
    }

    // 4) login master do responsável
    let userId: string | null = cand.user_id || null;
    if (!userId) {
      userId = await acharUsuario(admin, cand.email);
      if (!userId) {
        const { data: novo, error } = await admin.auth.admin.createUser({
          email: cand.email, email_confirm: true,
          user_metadata: { nome: cand.responsavel, tipo: "parceiro" },
        });
        if (error || !novo?.user) {
          userId = /already|registered|exists/i.test(error?.message || "") ? await acharUsuario(admin, cand.email) : null;
          if (!userId) {
            return json({ error: `A unidade foi criada, mas o login não: ${error?.message}. Tente aprovar de novo.` }, 500, req);
          }
        } else {
          userId = novo.user.id;
          criado.login = true;
        }
      }
      await anotar(admin, cand.id, { user_id: userId });
    }

    const { data: vinculo } = await admin.from("unidade_members").select("role")
      .eq("user_id", userId).eq("unidade_id", unidade.id).maybeSingle();
    if (!vinculo) {
      const { error } = await admin.from("unidade_members").insert({
        user_id: userId, unidade_id: unidade.id, franqueado_id: conta.id, role: "master",
      });
      if (error && error.code !== "23505") {
        return json({ error: `Não foi possível dar acesso ao responsável: ${error.message}` }, 500, req);
      }
    }

    const { data: jaCadastrado } = await admin.from("usuarios").select("id")
      .eq("unidade_id", unidade.id).eq("email", cand.email).maybeSingle();
    if (!jaCadastrado) {
      const { error } = await admin.from("usuarios").insert({
        id: "us_" + crypto.randomUUID().slice(0, 8), unidade_id: unidade.id,
        nome: cand.responsavel, email: cand.email, perfil: "master", ativo: true,
      });
      if (error) console.error("[aprovar-parceiro] usuarios", error.message);
    }

    // 5) aceite do contrato de parceria (se houver texto publicado)
    let contratoPublicado = true;
    let aceiteId: string | null = cand.aceite_id || null;
    try {
      const vigente = await contratoParceriaVigente(admin);
      contratoPublicado = Boolean(vigente);
      if (vigente && !aceiteId) {
        aceiteId = await registrarAceite(admin, req, vigente, {
          unidade_id: unidade.id,
          cliente_nome: cand.responsavel,
          cliente_email: cand.email,
          cliente_documento: cand.documento,
          referencia_tipo: "parceria",
          referencia_id: cand.id,
          origem: "aprovacao_parceiro",
        });
        criado.aceite = true;
        await anotar(admin, cand.id, { aceite_id: aceiteId });
      }
    } catch (e) {
      console.error("[aprovar-parceiro] aceite:", (e as Error).message);
      contratoPublicado = false;
    }

    // 6) kit do endereço e demais pendências (só o roteiro: o envio é em Unidades)
    const { data: docs } = await admin.from("unidade_documentos").select("tipo").eq("unidade_id", unidade.id);
    const { data: salas } = await admin.from("app_state").select("doc")
      .eq("unidade_id", unidade.id).eq("entity", "salas");
    const pendencias = pendenciasDoParceiro(checklistDoParceiro({
      walletId: conta.asaas_wallet_id,
      tiposDeDocumento: (docs || []).map((d: Linha) => d.tipo),
      salasComFoto: (salas || []).filter((s: Linha) => Array.isArray(s.doc?.fotos) && s.doc.fotos.length).length,
      temContratoParceria: contratoPublicado,
    }));

    // 7) candidatura aprovada
    if (cand.situacao !== "aprovada") {
      const { error } = await admin.from("parceiro_candidaturas").update({
        situacao: "aprovada", decidida_em: new Date().toISOString(), decidida_por: usuario.id,
      }).eq("id", cand.id);
      if (error) console.error("[aprovar-parceiro] situação", error.message);
    }

    // 8) link de criar senha + boas-vindas
    let linkSenha = "";
    try {
      const { data: link, error } = await admin.auth.admin.generateLink({
        type: "recovery", email: cand.email, options: { redirectTo: `${APP_URL}/?acesso=novo` },
      });
      if (error) throw new Error(error.message);
      linkSenha = link?.properties?.action_link || "";
    } catch (e) {
      console.error("[aprovar-parceiro] link de senha:", (e as Error).message);
    }

    const emailEnviado = await enviar(admin, unidade.id, "parceiro_boas_vindas", {
      cliente: cand.responsavel, email: cand.email, escritorio: cand.escritorio, unidade: unidade.nome,
      percentual: PARCEIRO_PERCENTUAL_PADRAO, garantia: GARANTIA_PERCENTUAL_PADRAO, linkSenha, pendencias,
    }, { candidatura_id: cand.id, conta_id: conta.id });

    await auditar("parceiro.candidatura_aprovada", {
      conta_id: conta.id, unidade_id: unidade.id, user_id: userId, aceite_id: aceiteId,
      criado, planos_aplicados: planosAplicados, contrato_publicado: contratoPublicado,
      pendencias, email_enviado: emailEnviado,
    });

    await avisarEquipe(`Parceiro aprovado: ${cand.escritorio} (${cidadeUf})`, [
      ...resumoDaCandidatura({
        escritorio: cand.escritorio, tipo_pessoa: cand.tipo_pessoa, documento: cand.documento,
        responsavel: cand.responsavel, email: cand.email, whatsapp: cand.whatsapp, cidade: cand.cidade,
        uf: cand.uf, endereco: cand.endereco, servicos: cand.servicos || [], salas: cand.salas,
        observacoes: cand.observacoes,
      }),
      `Conta: ${conta.id} · Unidade: ${unidade.id} (${unidade.nome})`,
      "O parceiro NÃO vende ainda: informe a carteira Asaas em Contas e mude a situação para Ativo.",
      ...(pendencias.length ? ["Falta:", ...pendencias.map((p) => `• ${p}`)] : []),
    ], `${APP_URL}/?p=parceiros`);

    return json({
      ok: true,
      conta,
      unidade,
      login: { email: cand.email, link_senha_enviado: Boolean(linkSenha) && emailEnviado },
      planos_aplicados: planosAplicados,
      contrato_publicado: contratoPublicado,
      aceite_id: aceiteId,
      pendencias,
      email_enviado: emailEnviado,
      criado,
    }, 200, req);
  } catch (e) {
    console.error("[aprovar-parceiro]", e);
    return json({ error: "Não foi possível concluir agora. Tente de novo em instantes." }, 500, req);
  }
});
