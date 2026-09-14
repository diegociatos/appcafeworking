// ============================================================================
// Edge Function: asaas-webhook  (baixa automática e ativação)
//
// POST /functions/v1/asaas-webhook   (deploy com --no-verify-jwt)
// Segurança: o cabeçalho `asaas-access-token` precisa bater com o secret
// ASAAS_WEBHOOK_TOKEN configurado no painel do Asaas.
//
// Um pagamento pode ser de três origens, identificadas nesta ordem:
//   1. reserva do site     externalReference "reserva:<id>"  → confirma a reserva
//   2. assinatura mensal   payment.subscription              → ativa na 1ª fatura,
//                          grava cada fatura, concede créditos, marca inadimplência
//   3. avulso              pending_signups pelo payment id   → ativa o cadastro
//                          (ou só atualiza a cobrança emitida pelo app)
//
// Tudo é idempotente: o Asaas reenvia eventos e manda PAYMENT_CONFIRMED e
// PAYMENT_RECEIVED para o mesmo pagamento.
//
// Falha ao ATIVAR responde 500 de propósito, para o Asaas tentar de novo. Antes
// o erro era engolido e o cliente ficava pago e bloqueado. Atenção: muitas
// falhas seguidas fazem o Asaas pausar a fila de webhooks (ele avisa por e-mail).
// ============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { garantirCobranca } from "../_shared/cobrancas.ts";
import { getNotifProvider, renderTemplate } from "../_shared/notify/index.ts";
import { proximaCobranca } from "../_shared/ciclo.ts";
import {
  creditosDoPlano, fidelidadeAte, hojeBRT, idCreditoPagamento, referenciaExterna, STATUS_PAGAMENTO_ASAAS,
} from "../_shared/venda.ts";

const APP_URL = Deno.env.get("APP_URL") ?? "https://app.cafeworking.com.br";

// deno-lint-ignore no-explicit-any
type Linha = Record<string, any>;

/**
 * Boas-vindas depois da ativação. Compra pelo site não tem senha: gera o link de
 * criar senha (recovery) e manda junto. O link não vai para `notificacoes`
 * porque dá acesso à conta.
 */
async function enviarBoasVindas(admin: SupabaseClient, ps: Linha) {
  let linkSenha = "";
  if (ps.senha_definida === false) {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery", email: ps.email, options: { redirectTo: `${APP_URL}/` },
    });
    if (error) throw new Error(`link de senha: ${error.message}`);
    linkSenha = data?.properties?.action_link || "";
  }
  const { data: unidade } = await admin.from("unidades").select("nome").eq("id", ps.unidade_id).maybeSingle();
  const msg = renderTemplate("assinatura_ativa", {
    cliente: ps.nome, email: ps.email, plano: ps.plano_nome, unidade: unidade?.nome || "",
    categoria: ps.categoria, linkSenha,
  });
  const envio = await getNotifProvider("email").enviar({ ...msg, para: ps.email });
  await admin.from("notificacoes").insert({
    unidade_id: ps.unidade_id, cliente_nome: ps.nome, destinatario: ps.email, canal: "email",
    evento: "assinatura_ativa", template: "assinatura_ativa", dados: { plano: ps.plano_nome, link_senha: !!linkSenha },
    status: envio.ok ? "enviado" : "erro", assunto: msg.assunto, provider_id: envio.providerId ?? null,
    sent_at: envio.ok ? new Date().toISOString() : null, erro: envio.ok ? null : envio.erro,
  });
}

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

async function atualizarCobrancaExistente(admin: SupabaseClient, pay: Linha, status: string) {
  const patch: Record<string, unknown> = { status };
  if (status === "pago") {
    patch.valor_pago = pay.value ?? null;
    patch.pago_em = new Date().toISOString();
  }
  const { error } = await admin.from("cobrancas").update(patch).eq("asaas_payment_id", pay.id);
  if (error) throw new Error(`cobrancas: ${error.message}`);
}

/** Cliente da unidade pelo e-mail; cria se ainda não existir. */
async function clienteDaUnidade(admin: SupabaseClient, ps: Linha): Promise<string> {
  const { data: existente } = await admin
    .from("clientes").select("id").eq("unidade_id", ps.unidade_id).eq("email", ps.email).limit(1).maybeSingle();
  if (existente?.id) return existente.id;

  const clienteId = "c_" + crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  const { error } = await admin.from("clientes").insert({
    id: clienteId, unidade_id: ps.unidade_id, nome: ps.nome, documento: ps.documento || null,
    plano: ps.plano_nome || "Assinante", fiscal: ps.categoria === "endereco_fiscal", status: "ativo",
    desde: String(new Date().getFullYear()), contato: ps.nome, email: ps.email, telefone: ps.telefone || null,
  });
  if (error) throw new Error(`clientes: ${error.message}`);
  return clienteId;
}

/**
 * Créditos do plano por pagamento confirmado. Id determinístico = não duplica.
 * O plano anual é um pagamento por 12 meses: libera os créditos dos 12 meses.
 */
async function concederCreditos(
  admin: SupabaseClient,
  alvo: {
    unidade_id: string; cliente_id: string | null; cliente_email: string; plano_nome: string; direitos: unknown;
    recorrencia?: string | null;
  },
  paymentId: string,
) {
  const meses = alvo.recorrencia === "anual" ? 12 : 1;
  for (const credito of creditosDoPlano(alvo.direitos as Record<string, unknown>)) {
    const tipo = credito.tipo;
    const quantidade = credito.quantidade * meses;
    const { data: movs } = await admin
      .from("creditos_ledger").select("quantidade")
      .eq("unidade_id", alvo.unidade_id).eq("cliente_email", alvo.cliente_email).eq("tipo", tipo);
    const saldo = (movs || []).reduce((s, m) => s + Number(m.quantidade || 0), 0);
    const { error } = await admin.from("creditos_ledger").insert({
      id: idCreditoPagamento(paymentId, tipo),
      unidade_id: alvo.unidade_id, cliente_id: alvo.cliente_id, cliente_email: alvo.cliente_email,
      tipo, quantidade, saldo_apos: saldo + quantidade, origem: "plano",
      motivo: `${alvo.plano_nome} · pagamento confirmado`, referencia_id: paymentId,
    });
    if (error && error.code !== "23505") throw new Error(`creditos_ledger: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Ativação do cadastro pago
// ---------------------------------------------------------------------------

async function ativarCadastro(
  admin: SupabaseClient, ps: Linha,
): Promise<{ clienteId: string | null; assinatura: Linha | null }> {
  // Reivindica: só uma entrega do webhook ativa o mesmo cadastro.
  const { data: claim } = await admin
    .from("pending_signups").update({ status: "ativando" })
    .eq("id", ps.id).eq("status", "aguardando").select("id");
  if (!claim?.length) {
    const { data: assinatura } = ps.asaas_subscription_id
      ? await admin.from("assinaturas").select("*").eq("asaas_subscription_id", ps.asaas_subscription_id).maybeSingle()
      : { data: null };
    return { clienteId: assinatura?.cliente_id ?? null, assinatura };
  }

  try {
    if (ps.user_id) {
      const { error } = await admin.auth.admin.updateUserById(ps.user_id, { ban_duration: "none" });
      if (error) throw new Error(`desbloquear login: ${error.message}`);
    }

    const clienteId = await clienteDaUnidade(admin, ps);

    if (ps.user_id) {
      const { data: vinculo } = await admin
        .from("unidade_members").select("user_id").eq("user_id", ps.user_id).eq("unidade_id", ps.unidade_id).maybeSingle();
      if (!vinculo) {
        const { error } = await admin.from("unidade_members").insert({
          user_id: ps.user_id, unidade_id: ps.unidade_id, franqueado_id: ps.franqueado_id, role: "cliente",
        });
        if (error) throw new Error(`unidade_members: ${error.message}`);
      }
    }

    let assinatura: Linha | null = null;
    if (ps.asaas_subscription_id) {
      const inicio = hojeBRT();
      const prazo = Number(ps.prazo_minimo_meses || 0);
      const { data, error } = await admin.from("assinaturas").insert({
        unidade_id: ps.unidade_id, cliente_id: clienteId, cliente_nome: ps.nome, cliente_email: ps.email,
        cliente_documento: ps.documento, plano_id: ps.plano_id, plano_nome: ps.plano_nome, categoria: ps.categoria,
        valor: ps.valor, recorrencia: ps.recorrencia === "anual" ? "anual" : "mensal", prazo_minimo_meses: prazo, fidelidade_ate: fidelidadeAte(inicio, prazo),
        direitos: ps.direitos || {}, asaas_customer_id: ps.asaas_customer_id,
        asaas_subscription_id: ps.asaas_subscription_id, aceite_id: ps.aceite_id, pending_signup_id: ps.id,
        status: "ativa", inicio,
        proxima_cobranca: proximaCobranca(inicio, ps.recorrencia === "anual" ? "anual" : "mensal"),
        docs_status: ps.categoria === "endereco_fiscal" ? "pendente" : null,
      }).select("*").single();
      if (error && error.code !== "23505") throw new Error(`assinaturas: ${error.message}`);
      assinatura = data ?? (await admin.from("assinaturas").select("*")
        .eq("asaas_subscription_id", ps.asaas_subscription_id).maybeSingle()).data;
    }

    await admin.from("pending_signups").update({ status: "ativo", ativado_em: new Date().toISOString() }).eq("id", ps.id);
    try {
      await enviarBoasVindas(admin, ps);
    } catch (e) {
      // e-mail não desfaz a ativação; o erro fica no log para a equipe reenviar
      console.error(`boas-vindas ${ps.email}:`, (e as Error).message);
    }
    return { clienteId, assinatura };
  } catch (e) {
    // devolve para a próxima entrega do webhook tentar de novo
    await admin.from("pending_signups").update({ status: "aguardando" }).eq("id", ps.id).eq("status", "ativando");
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Por origem
// ---------------------------------------------------------------------------

async function tratarReserva(admin: SupabaseClient, reservaId: string, pay: Linha, status: string): Promise<string> {
  const { data: r } = await admin
    .from("reservas").select("id, unidade_id, cliente_nome, cliente_email, cliente_documento, status")
    .eq("id", reservaId).maybeSingle();
  if (!r) return "reserva_inexistente";

  await garantirCobranca(admin, pay, status, {
    unidade_id: r.unidade_id, cliente: r.cliente_nome || "Cliente", cliente_email: r.cliente_email,
    cliente_documento: r.cliente_documento, reserva_id: r.id, origem: "site",
  });

  if (status === "pago") {
    const { data: resultado, error } = await admin.rpc("confirmar_reserva_paga", { p_id: r.id });
    if (error) throw new Error(`confirmar_reserva_paga: ${error.message}`);
    if (resultado === "sem_horario" || resultado === "nao_reconfirmavel") {
      // Pagou, mas o horário não pode ser dado: a equipe precisa estornar.
      console.error(`[reserva ${r.id}] paga sem horário (${resultado}) — ESTORNAR pagamento ${pay.id}`);
    }
    return `reserva_${resultado}`;
  }

  if (["cancelado", "estornado"].includes(status)) {
    await admin.from("reservas")
      .update({ status: "cancelada", payment_status: status })
      .eq("id", r.id).in("status", ["aguardando_pagamento", "confirmada"]);
  }
  return `reserva_${status}`;
}

async function tratarAssinatura(admin: SupabaseClient, pay: Linha, status: string): Promise<string> {
  const subId = pay.subscription as string;
  let { data: assinatura } = await admin.from("assinaturas").select("*").eq("asaas_subscription_id", subId).maybeSingle();

  if (!assinatura) {
    const { data: ps } = await admin.from("pending_signups").select("*").eq("asaas_subscription_id", subId).maybeSingle();
    if (!ps) {
      // assinatura criada fora do site/app: só espelha a cobrança se já existir
      await atualizarCobrancaExistente(admin, pay, status);
      return "assinatura_desconhecida";
    }
    const dadosPendente = {
      unidade_id: ps.unidade_id, cliente: ps.nome, cliente_email: ps.email, cliente_documento: ps.documento,
      descricao: `${ps.plano_nome} · assinatura`, origem: ps.origem,
    };
    if (status !== "pago") {
      await garantirCobranca(admin, pay, status, dadosPendente);
      return "assinatura_aguardando";
    }
    if (ps.status === "aguardando") assinatura = (await ativarCadastro(admin, ps)).assinatura;
    if (!assinatura) {
      assinatura = (await admin.from("assinaturas").select("*").eq("asaas_subscription_id", subId).maybeSingle()).data;
    }
    if (!assinatura) throw new Error(`assinatura ${subId} paga mas não ativada`);
  }

  await garantirCobranca(admin, pay, status, {
    unidade_id: assinatura.unidade_id, cliente: assinatura.cliente_nome, cliente_email: assinatura.cliente_email,
    cliente_documento: assinatura.cliente_documento, descricao: `${assinatura.plano_nome} · assinatura`,
    assinatura_id: assinatura.id, origem: "assinatura",
  });

  if (status === "pago") {
    await concederCreditos(admin, {
      unidade_id: assinatura.unidade_id, cliente_id: assinatura.cliente_id, cliente_email: assinatura.cliente_email,
      plano_nome: assinatura.plano_nome, direitos: assinatura.direitos, recorrencia: assinatura.recorrencia,
    }, pay.id);
    if (assinatura.status === "inadimplente") {
      await admin.from("assinaturas").update({ status: "ativa" }).eq("id", assinatura.id);
    }
    // próxima cobrança = vencimento desta fatura + ciclo (base do aviso de renovação do anual)
    if (pay.dueDate) {
      const proxima = proximaCobranca(String(pay.dueDate).slice(0, 10), assinatura.recorrencia);
      if (!assinatura.proxima_cobranca || proxima > assinatura.proxima_cobranca) {
        await admin.from("assinaturas").update({ proxima_cobranca: proxima }).eq("id", assinatura.id);
      }
    }
  } else if (status === "vencido" && assinatura.status === "ativa") {
    await admin.from("assinaturas").update({ status: "inadimplente" }).eq("id", assinatura.id);
  }
  return `assinatura_${status}`;
}

async function tratarAvulso(admin: SupabaseClient, pay: Linha, status: string): Promise<string> {
  const { data: ps } = await admin.from("pending_signups").select("*").eq("asaas_payment_id", pay.id).maybeSingle();
  if (!ps) {
    // cobrança emitida pelo app (asaas-cobranca): a linha já existe
    await atualizarCobrancaExistente(admin, pay, status);
    return "cobranca_atualizada";
  }

  await garantirCobranca(admin, pay, status, {
    unidade_id: ps.unidade_id, cliente: ps.nome, cliente_email: ps.email, cliente_documento: ps.documento,
    descricao: `${ps.plano_nome} · ${ps.recorrencia === "avulso" ? "avulso" : "assinatura"}`, origem: ps.origem,
  });

  if (status === "pago" && ps.status === "aguardando") {
    const { clienteId } = await ativarCadastro(admin, ps);
    await concederCreditos(admin, {
      unidade_id: ps.unidade_id, cliente_id: clienteId, cliente_email: ps.email,
      plano_nome: ps.plano_nome, direitos: ps.direitos,
    }, pay.id);
    return "cadastro_ativado";
  }
  return `avulso_${status}`;
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405, req);

  const esperado = Deno.env.get("ASAAS_WEBHOOK_TOKEN");
  if (esperado && req.headers.get("asaas-access-token") !== esperado) {
    return json({ error: "token inválido" }, 401, req);
  }

  const body = await req.json().catch(() => ({}));
  const ev = body?.event as string | undefined;
  const pay = body?.payment as Linha | undefined;
  if (!ev || !pay?.id) return json({ ok: true, ignored: true }, 200, req);

  const status = STATUS_PAGAMENTO_ASAAS[ev];
  if (!status) return json({ ok: true, ignored: ev }, 200, req);

  try {
    const admin = adminClient();
    const ref = referenciaExterna(pay.externalReference);
    let resultado: string;
    if (ref.tipo === "reserva" && ref.id) resultado = await tratarReserva(admin, ref.id, pay, status);
    else if (pay.subscription) resultado = await tratarAssinatura(admin, pay, status);
    else resultado = await tratarAvulso(admin, pay, status);
    return json({ ok: true, status, resultado }, 200, req);
  } catch (e) {
    console.error("asaas-webhook", ev, pay.id, (e as Error).message);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500, req);
  }
});
