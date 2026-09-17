// ============================================================================
// Edge Function: reservar-sala-online  (reserva paga por hora, pelo site)
//
// POST /functions/v1/reservar-sala-online   (deploy com --no-verify-jwt)
// body: { unidade_id, sala_id, base?, start_at, end_at,
//         nome, email, documento, telefone?,
//         forma: "PIX" | "CREDIT_CARD",
//         aceite: { modelo_id, hash }, turnstile }
//
// 1. valida horário, sala, contrato e anti-robô;
// 2. segura o horário por 30 minutos (reserva aguardando_pagamento);
// 3. cria a cobrança no Asaas e devolve o link / PIX;
// 4. o asaas-webhook confirma a reserva quando o pagamento entra.
//
// Não cria login: reserva avulsa não precisa de conta.
//
// Unidade de conta parceira: cobra pela conta Asaas da CafeWorking com split
// para a carteira do parceiro; parceiro sem carteira ou fora de 'ativo' não
// reserva online (recusa antes de segurar o horário).
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { ipDaReq } from "../_shared/audit.ts";
import { asaas, cancelarNoAsaas, credenciaisAsaas, pixDoPagamento } from "../_shared/asaas.ts";
import { verificarTurnstile } from "../_shared/turnstile.ts";
import { aceiteConfere, contratoVigente, registrarAceite } from "../_shared/contratos.ts";
import { garantirCobranca } from "../_shared/cobrancas.ts";
import { regraDaUnidade } from "../_shared/parceirosDb.ts";
import {
  comSplit, documentoValido, emailValido, hojeBRT, JANELA_PADRAO, normalizarDocumento, validarPeriodoReserva, valorReserva,
} from "../_shared/venda.ts";

const MINUTOS_SEGURANDO = 30;
const MAX_ESPERAS_POR_EMAIL = 2;

const MENSAGEM_PERIODO: Record<string, string> = {
  PERIODO_INVALIDO: "Horário inválido.",
  HORA_CHEIA: "Reservas online são por hora cheia.",
  ANTECEDENCIA: "Reserve com pelo menos 1 hora de antecedência.",
  DIA_INDISPONIVEL: "Reserva online só de segunda a sexta.",
  FORA_DO_HORARIO: "Reserva online das 8h às 18h.",
  DIAS_DIFERENTES: "A reserva precisa começar e terminar no mesmo dia.",
  DURACAO_MAXIMA: "Duração acima do máximo para reserva online.",
};

const MENSAGEM_RPC: Record<string, [string, number]> = {
  CONFLITO: ["Esse horário acabou de ser reservado. Escolha outro.", 409],
  SALA_SEM_RESERVA_ONLINE: ["Esta sala não está disponível para reserva online.", 400],
  SALA_INATIVA: ["Sala indisponível.", 400],
  SALA_CONTRATADA: ["Sala indisponível.", 400],
  BASE_INVALIDA: ["Posição inválida para esta sala.", 400],
};

const pad = (n: number) => String(n).padStart(2, "0");
const horaBRT = (iso: string) => {
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000);
  return `${pad(d.getUTCHours())}h`;
};

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405, req);

  try {
    const body = await req.json().catch(() => ({}));
    const ip = ipDaReq(req);

    const robo = await verificarTurnstile(body?.turnstile, ip);
    if (!robo.ok) return json({ error: "Não foi possível confirmar que você não é um robô. Recarregue a página." }, 403, req);

    for (const k of ["unidade_id", "sala_id", "start_at", "end_at", "nome", "email", "documento"]) {
      if (!body?.[k]) return json({ error: `Campo obrigatório ausente: ${k}` }, 400, req);
    }
    const email = String(body.email).toLowerCase().trim();
    if (!emailValido(email)) return json({ error: "E-mail inválido." }, 400, req);
    const documento = normalizarDocumento(body.documento);
    if (!documentoValido(documento)) return json({ error: "CPF ou CNPJ inválido." }, 400, req);
    const forma = body.forma === "CREDIT_CARD" ? "CREDIT_CARD" : "PIX";

    const periodo = validarPeriodoReserva(body.start_at, body.end_at, new Date(), JANELA_PADRAO);
    if (!periodo.ok) return json({ error: MENSAGEM_PERIODO[periodo.erro] || "Horário inválido.", codigo: periodo.erro }, 400, req);

    const admin = adminClient();

    const { data: sala } = await admin
      .from("salas")
      .select("id, unidade_id, nome, valor_hora, reserva_online")
      .eq("id", body.sala_id)
      .maybeSingle();
    if (!sala || sala.unidade_id !== body.unidade_id || !sala.reserva_online) {
      return json({ error: "Esta sala não está disponível para reserva online." }, 400, req);
    }
    let valor: number;
    try {
      valor = valorReserva(periodo.horas, Number(sala.valor_hora));
    } catch (_) {
      return json({ error: "Sala sem preço por hora configurado." }, 400, req);
    }

    const contrato = await contratoVigente(admin, body.unidade_id, "sala_hora");
    if (!contrato) return json({ error: "Reserva online indisponível no momento.", codigo: "SEM_CONTRATO" }, 412, req);
    if (!aceiteConfere(contrato, body.aceite)) {
      return json({ error: "É preciso aceitar a versão atual do contrato.", codigo: "ACEITE_NECESSARIO", contrato }, 412, req);
    }

    const regra = await regraDaUnidade(admin, body.unidade_id);
    if (regra.parceiro && !regra.ok) return json({ error: regra.erro, codigo: regra.codigo }, 412, req);
    const split = regra.parceiro && regra.ok ? regra.split : null;

    const cred = await credenciaisAsaas(admin, body.unidade_id);
    if (!cred) return json({ error: "Esta unidade ainda não habilitou pagamentos online." }, 412, req);

    await admin.rpc("liberar_reservas_expiradas").then(() => {}, () => {});

    // Anti-abuso: ninguém segura a agenda inteira sem pagar.
    const { count: esperas } = await admin
      .from("reservas")
      .select("id", { count: "exact", head: true })
      .eq("cliente_email", email)
      .eq("status", "aguardando_pagamento")
      .gt("expira_em", new Date().toISOString());
    if ((esperas || 0) >= MAX_ESPERAS_POR_EMAIL) {
      return json({ error: "Você já tem reservas aguardando pagamento. Conclua ou aguarde 30 minutos." }, 429, req);
    }

    // 1) segura o horário
    const reservaId = "r_" + crypto.randomUUID().replace(/-/g, "");
    const expiraEm = new Date(Date.now() + MINUTOS_SEGURANDO * 60_000).toISOString();
    const { error: rErr } = await admin.rpc("criar_reserva_segura", {
      p_id: reservaId,
      p_unidade_id: body.unidade_id,
      p_sala_id: body.sala_id,
      p_cliente_id: null,
      p_cliente_nome: String(body.nome).trim(),
      p_cliente_email: email,
      p_start_at: body.start_at,
      p_end_at: body.end_at,
      p_base: body.base ?? null,
      p_origem: "site",
      p_valor: valor,
      p_status: "aguardando_pagamento",
      p_expira_em: expiraEm,
      p_cliente_documento: documento,
      p_cliente_telefone: body.telefone ? String(body.telefone) : null,
      p_somente_online: true,
    });
    if (rErr) {
      const chave = Object.keys(MENSAGEM_RPC).find((k) => (rErr.message || "").includes(k));
      const [msg, status] = chave ? MENSAGEM_RPC[chave] : [`Não foi possível reservar: ${rErr.message}`, 400];
      return json({ error: msg }, status, req);
    }

    const soltarHorario = async (motivo: string) => {
      await admin.from("reservas")
        .update({ status: "cancelada", payment_status: motivo })
        .eq("id", reservaId).eq("status", "aguardando_pagamento");
    };

    // 2) cobrança no Asaas
    const data = body.start_at.slice(0, 10);
    const descricao = `${sala.nome} · ${data.split("-").reverse().join("/")} ${horaBRT(body.start_at)}–${horaBRT(body.end_at)}`;
    // deno-lint-ignore no-explicit-any
    let pay: any;
    try {
      const customer = await asaas(cred, "/customers", "POST", {
        name: String(body.nome).trim(), cpfCnpj: documento, email,
        mobilePhone: body.telefone ? String(body.telefone).replace(/\D/g, "") : undefined,
      });
      pay = await asaas(cred, "/payments", "POST", comSplit({
        customer: customer.id,
        billingType: forma,
        value: valor,
        dueDate: hojeBRT(),
        description: descricao,
        externalReference: `reserva:${reservaId}`,
      }, split));
    } catch (e) {
      await soltarHorario("falha_cobranca");
      return json({ error: `Não foi possível gerar o pagamento: ${(e as Error).message}` }, 502, req);
    }

    // 3) vínculos: pagamento na reserva, cobrança e prova do aceite
    try {
      await admin.from("reservas").update({ asaas_payment_id: pay.id }).eq("id", reservaId);
      await garantirCobranca(admin, pay, "pendente", {
        unidade_id: body.unidade_id, cliente: String(body.nome).trim(), cliente_email: email,
        cliente_documento: documento, descricao, reserva_id: reservaId, origem: "site",
        split: regra.parceiro && regra.ok ? regra.snapshot : null,
      });
      await registrarAceite(admin, req, contrato, {
        unidade_id: body.unidade_id, cliente_nome: String(body.nome).trim(), cliente_email: email,
        cliente_documento: documento, plano_id: sala.id, plano_nome: sala.nome, valor,
        recorrencia: "avulso", prazo_minimo_meses: 0, referencia_tipo: "reserva", referencia_id: reservaId,
        origem: "site",
      });
    } catch (e) {
      await cancelarNoAsaas(cred, { paymentId: pay.id });
      await soltarHorario("falha_registro");
      console.error(e);
      return json({ error: "Não foi possível concluir a reserva. Nada foi cobrado; tente de novo." }, 500, req);
    }

    const pix = forma === "PIX" ? await pixDoPagamento(cred, pay.id) : { payload: "", imagem: "" };

    return json({
      ok: true,
      reserva_id: reservaId,
      expira_em: expiraEm,
      valor,
      horas: periodo.horas,
      descricao,
      checkoutUrl: pay.invoiceUrl || "",
      pix_payload: pix.payload,
      pix_imagem: pix.imagem,
    }, 201, req);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500, req);
  }
});
