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
// Venda com abertura de empresa (categoria abertura_empresa ou direito
// aberturaEmpresa) cria o processo em aberturas e pede ao cliente os dados.
//
// Nota fiscal automática: com a cobrança paga e a unidade com "emitir ao
// receber" ligado (config_fiscal.emitir_ao_receber), emite a NFS-e pela mesma
// lógica do emitir-nfse (_shared/nfse/emitirNota.ts). Uma nota por cobrança;
// falha nunca derruba o webhook, vira aviso à equipe com o motivo.
//
// Unidade parceira (docs/PARCEIROS.md): a cobrança guarda a divisão do split,
// recalculada sobre o valor pago; a garantia retida entra no razão
// parceiro_garantias (paga → retenção, estornada → estorno); a nota automática é
// só da parte da CafeWorking; o parceiro recebe e-mail a cada venda ativada e
// reserva paga.
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
import { atualizarCobranca, garantirCobranca } from "../_shared/cobrancas.ts";
import { registrarLancamentoReserva, removerLancamentoReserva } from "../_shared/lancamentoReserva.ts";
import { avisarParceiro, contaDaUnidade, lancarGarantia, linkParceiro } from "../_shared/parceirosDb.ts";
import { ehContaParceira, linhaValorParceiro } from "../_shared/parceiros.ts";
import { getNotifProvider, renderTemplate } from "../_shared/notify/index.ts";
import { proximaCobranca } from "../_shared/ciclo.ts";
import { avisarEquipe } from "../_shared/assinaturas.ts";
import { criarAberturaDaVenda } from "../_shared/aberturas.ts";
import { ocuparSala } from "../_shared/disponibilidade.ts";
import { nomeExibicaoUnidade } from "../_shared/unidadeNome.ts";
import { emitirNotaAoReceber } from "../_shared/nfse/emitirNota.ts";
import {
  creditosDoPlano, fidelidadeAte, hojeBRT, idCreditoPagamento, referenciaExterna, servicosDaVenda, STATUS_PAGAMENTO_ASAAS,
} from "../_shared/venda.ts";

const APP_URL = Deno.env.get("APP_URL") ?? "https://app.cafeworking.com.br";

// Pagamento que não deve virar nota: reserva inexistente ou paga sem horário (vai ser estornada).
const SEM_NOTA_AO_RECEBER = ["reserva_inexistente", "reserva_sem_horario", "reserva_nao_reconfirmavel"];

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
      // ?acesso=novo: a tela de senha fala de primeiro acesso, não de "esqueci a senha"
      type: "recovery", email: ps.email, options: { redirectTo: `${APP_URL}/?acesso=novo` },
    });
    if (error) throw new Error(`link de senha: ${error.message}`);
    linkSenha = data?.properties?.action_link || "";
  }
  const { data: unidade } = await admin.from("unidades").select("nome").eq("id", ps.unidade_id).maybeSingle();
  const msg = renderTemplate("assinatura_ativa", {
    cliente: ps.nome, email: ps.email, plano: ps.plano_nome, unidade: nomeExibicaoUnidade(unidade?.nome),
    categoria: ps.categoria, linkSenha, ...servicosDaVenda(ps.categoria, ps.direitos),
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
  await atualizarCobranca(admin, pay, status); // recalcula a divisão do parceiro quando paga
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
    desde: hojeBRT(), contato: ps.nome, email: ps.email, telefone: ps.telefone || null,
  });
  if (error) throw new Error(`clientes: ${error.message}`);
  return clienteId;
}

/**
 * Quem reservou e pagou pelo link/site vira cliente da unidade (sem login), para
 * a recepção ter o contato. Cliente novo gera aviso à equipe. Nunca lança.
 */
async function cadastrarClienteDaReserva(admin: SupabaseClient, r: Linha) {
  try {
    const email = String(r.cliente_email || "").trim().toLowerCase();
    if (!email) return;
    const { data: existente } = await admin
      .from("clientes").select("id").eq("unidade_id", r.unidade_id).ilike("email", email).limit(1).maybeSingle();
    if (existente?.id) return;
    const clienteId = "c_" + crypto.randomUUID().replace(/-/g, "").slice(0, 10);
    const { error } = await admin.from("clientes").insert({
      id: clienteId, unidade_id: r.unidade_id, nome: r.cliente_nome || email, documento: r.cliente_documento || null,
      plano: "Avulso · sala por hora", fiscal: false, status: "ativo", desde: hojeBRT(),
      contato: r.cliente_nome || email, email, telefone: r.cliente_telefone || null,
    });
    if (error) throw new Error(error.message);
    const { data: sala } = await admin.from("salas").select("nome").eq("id", r.sala_id).maybeSingle();
    await avisarEquipe(`Novo cliente: reserva paga de ${r.cliente_nome || email}`, [
      `Sala: ${sala?.nome || r.sala_id}`,
      `Quando: ${new Date(r.start_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}`,
      `E-mail: ${email}`,
      `Telefone: ${r.cliente_telefone || "não informado"}`,
      `CPF/CNPJ: ${r.cliente_documento || "não informado"}`,
      "Reserva paga pelo link de reserva. O cadastro foi criado em Clientes.",
    ], `${APP_URL}/?p=clientes`);
    // (o aviso ao parceiro sai em tratarReserva a cada reserva paga, cliente novo ou não)
  } catch (e) {
    console.error(`[reserva ${r.id}] cadastro do cliente:`, (e as Error).message);
  }
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
      const linha = {
        unidade_id: ps.unidade_id, cliente_id: clienteId, cliente_nome: ps.nome, cliente_email: ps.email,
        cliente_documento: ps.documento, plano_id: ps.plano_id, plano_nome: ps.plano_nome, categoria: ps.categoria,
        valor: ps.valor, recorrencia: ps.recorrencia === "anual" ? "anual" : "mensal", prazo_minimo_meses: prazo, fidelidade_ate: fidelidadeAte(inicio, prazo),
        direitos: ps.direitos || {}, asaas_customer_id: ps.asaas_customer_id,
        asaas_subscription_id: ps.asaas_subscription_id, aceite_id: ps.aceite_id, pending_signup_id: ps.id,
        status: "ativa", inicio,
        proxima_cobranca: proximaCobranca(inicio, ps.recorrencia === "anual" ? "anual" : "mensal"),
        docs_status: ps.categoria === "endereco_fiscal" ? "pendente" : null,
        turno: ps.turno ?? null,
        sala_id: ps.sala_id ?? null,
      };
      let { data, error } = await admin.from("assinaturas").insert(linha).select("*").single();
      if (error && error.code !== "23505") throw new Error(`assinaturas: ${error.message}`);
      assinatura = data ?? (await admin.from("assinaturas").select("*")
        .eq("asaas_subscription_id", ps.asaas_subscription_id).maybeSingle()).data;
      if (!assinatura && linha.sala_id) {
        // a sala escolhida foi para outra assinatura no meio do caminho: ativa sem sala e a equipe atribui
        ({ data, error } = await admin.from("assinaturas").insert({ ...linha, sala_id: null }).select("*").single());
        if (error) throw new Error(`assinaturas: ${error.message}`);
        assinatura = data;
        await avisarEquipe(`Sala escolhida já estava ocupada: ${ps.plano_nome}`, [
          `Cliente: ${ps.nome} (${ps.email})`, `Sala escolhida no site: ${linha.sala_id}`,
          "O plano foi ativado sem sala. Atribua outra em Assinaturas > Sala a atribuir.",
        ], APP_URL);
      } else if (assinatura?.sala_id && data) {
        await ocuparSala(admin, assinatura);
      }
    }

    await admin.from("pending_signups").update({ status: "ativo", ativado_em: new Date().toISOString() }).eq("id", ps.id);
    const servicos = servicosDaVenda(ps.categoria, ps.direitos);
    await avisarEquipe(`${servicos.abertura || servicos.certificado ? "INICIAR ATENDIMENTO · " : ""}Nova venda pelo site: ${ps.plano_nome}`, [
      `Cliente: ${ps.nome} (${ps.email}${ps.telefone ? `, ${ps.telefone}` : ""})`,
      `CPF/CNPJ: ${ps.documento || "não informado"}`,
      `Valor: R$ ${Number(ps.valor).toFixed(2)} (${ps.recorrencia || "mensal"})`,
      ...(ps.turno ? [`Turno: ${ps.turno === "manha" ? "manhã (8h às 12h)" : "tarde (12h às 18h)"}`] : []),
      ...(servicos.abertura ? ["Abertura de empresa: o cliente preenche os dados e anexa os documentos no app; a Ciatos Contabilidade acompanha em Aberturas. Taxas oficiais por conta do cliente."] : []),
      ...(servicos.certificado ? ["Certificado digital e-CNPJ A1 (1 ano): emitir depois que o CNPJ existir; agendar a validação com o cliente."] : []),
    ], APP_URL);
    // Unidade parceira: o parceiro fica sabendo do contrato novo (nunca lança)
    const contaParceira = await contaDaUnidade(admin, ps.unidade_id).catch((e) => {
      console.error(`aviso ao parceiro ${ps.id}:`, (e as Error).message);
      return null;
    });
    if (ehContaParceira(contaParceira)) {
      await avisarParceiro(admin, ps.unidade_id, `Novo contrato: ${ps.plano_nome}`, [
        `Cliente: ${ps.nome}`,
        `E-mail: ${ps.email}`,
        `Telefone: ${ps.telefone || "não informado"}`,
        `CPF/CNPJ: ${ps.documento || "não informado"}`,
        `Plano: ${ps.plano_nome} (${ps.recorrencia || "mensal"})`,
        linhaValorParceiro(Number(ps.valor), contaParceira),
        ...(ps.turno ? [`Turno: ${ps.turno === "manha" ? "manhã (8h às 12h)" : "tarde (12h às 18h)"}`] : []),
        ...(ps.categoria === "endereco_fiscal" ? ["Endereço fiscal: o cliente envia os documentos pelo app; confira em Assinaturas e contratos."] : []),
        "Pagamento confirmado. O contrato está em Assinaturas e contratos no app.",
      ], linkParceiro("assinaturas"), contaParceira);
    }
    // Processo de abertura da empresa (idempotente; nunca derruba a ativação)
    if (servicos.abertura) await criarAberturaDaVenda(admin, ps, assinatura);
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

/** E-mail de reserva confirmada (template "reserva"). Nunca lança. */
async function confirmarReservaPorEmail(admin: SupabaseClient, r: Linha) {
  if (!r.cliente_email) return;
  try {
    const { data: sala } = await admin.from("salas").select("nome").eq("id", r.sala_id).maybeSingle();
    const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", ...o });
    const quando = `${fmt(r.start_at, { day: "2-digit", month: "2-digit", year: "numeric" })}, das ${fmt(r.start_at, { hour: "2-digit", minute: "2-digit" })} às ${fmt(r.end_at, { hour: "2-digit", minute: "2-digit" })}`;
    const msg = renderTemplate("reserva", { cliente: r.cliente_nome, email: r.cliente_email, sala: sala?.nome || "sala", quando });
    const envio = await getNotifProvider("email").enviar({ ...msg, para: r.cliente_email });
    await admin.from("notificacoes").insert({
      unidade_id: r.unidade_id, cliente_nome: r.cliente_nome, destinatario: r.cliente_email, canal: "email",
      evento: "reserva", template: "reserva", dados: { reserva_id: r.id },
      status: envio.ok ? "enviado" : "erro", assunto: msg.assunto, provider_id: envio.providerId ?? null,
      sent_at: envio.ok ? new Date().toISOString() : null, erro: envio.ok ? null : envio.erro,
    });
  } catch (e) {
    console.error(`reserva ${r.id} e-mail:`, (e as Error).message);
  }
}

/** Reserva paga em unidade parceira: e-mail ao parceiro. Nunca lança. */
async function avisarParceiroReserva(admin: SupabaseClient, r: Linha, pay: Linha) {
  try {
    const conta = await contaDaUnidade(admin, r.unidade_id);
    if (!ehContaParceira(conta)) return;
    const { data: sala } = await admin.from("salas").select("nome").eq("id", r.sala_id).maybeSingle();
    const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", ...o });
    await avisarParceiro(admin, r.unidade_id, `Reserva paga: ${sala?.nome || "sala"} em ${fmt(r.start_at, { dateStyle: "short" })}`, [
      `Sala: ${sala?.nome || r.sala_id}`,
      `Quando: ${fmt(r.start_at, { dateStyle: "short", timeStyle: "short" })} às ${fmt(r.end_at, { timeStyle: "short" })}`,
      `Cliente: ${r.cliente_nome || "—"} (${r.cliente_email || "sem e-mail"})`,
      `Telefone: ${r.cliente_telefone || "não informado"}`,
      `CPF/CNPJ: ${r.cliente_documento || "não informado"}`,
      linhaValorParceiro(Number(pay.value), conta),
      "Prepare a sala para o horário. A reserva já está na agenda do app.",
    ], linkParceiro("reservas"), conta);
  } catch (e) {
    console.error(`[reserva ${r.id}] aviso ao parceiro:`, (e as Error).message);
  }
}

async function tratarReserva(admin: SupabaseClient, reservaId: string, pay: Linha, status: string): Promise<string> {
  const { data: r } = await admin
    .from("reservas").select("id, unidade_id, sala_id, cliente_nome, cliente_email, cliente_documento, cliente_telefone, status, start_at, end_at, valor, desconto_plano_pct")
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
      await avisarEquipe(`ESTORNAR: reserva paga sem horário (${r.cliente_nome})`, [
        `Reserva ${r.id}, pagamento ${pay.id}, situação ${resultado}.`, `Cliente: ${r.cliente_nome} (${r.cliente_email})`,
      ]);
    }
    if (resultado === "confirmada") {
      await confirmarReservaPorEmail(admin, r);
      await cadastrarClienteDaReserva(admin, r);
      await avisarParceiroReserva(admin, r, pay);
      // Receita da reserva no financeiro. Id determinístico: reentrega do
      // webhook (CONFIRMED + RECEIVED) só reescreve a mesma linha.
      const { data: sala } = await admin.from("salas").select("nome, tipo").eq("id", r.sala_id).maybeSingle();
      await registrarLancamentoReserva(admin, {
        reservaId: String(r.id), unidadeId: r.unidade_id, salaNome: sala?.nome, salaTipo: sala?.tipo,
        clienteNome: r.cliente_nome, valor: Number(pay.value) > 0 ? Number(pay.value) : Number(r.valor || 0),
        status: "pago", quando: new Date().toISOString(), descontoPct: Number(r.desconto_plano_pct || 0),
      });
    }
    return `reserva_${resultado}`;
  }

  if (["cancelado", "estornado"].includes(status)) {
    await admin.from("reservas")
      .update({ status: "cancelada", payment_status: status })
      .eq("id", r.id).in("status", ["aguardando_pagamento", "confirmada"]);
    // Pagamento cancelado/estornado no Asaas: a receita não existe mais.
    await removerLancamentoReserva(admin, r.unidade_id, String(r.id));
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

    // Razão de garantia do parceiro (idempotente; erro de banco responde 500 e o Asaas reenvia)
    const garantia = await lancarGarantia(admin, pay.id, status);

    // Nota automática: depois da baixa, nunca falha o webhook.
    let nota: string | undefined;
    if (status === "pago" && !SEM_NOTA_AO_RECEBER.includes(resultado)) {
      try {
        nota = await emitirNotaAoReceber(admin, pay.id);
      } catch (e) {
        console.error("asaas-webhook nota", pay.id, (e as Error).message);
        nota = "nota_erro";
      }
    }
    return json({ ok: true, status, resultado, ...(garantia ? { garantia } : {}), ...(nota ? { nota } : {}) }, 200, req);
  } catch (e) {
    console.error("asaas-webhook", ev, pay.id, (e as Error).message);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500, req);
  }
});
