// ============================================================================
// Edge Function: asaas-cobranca  (cria cobrança boleto/PIX/cartão via Asaas)
//
// POST /functions/v1/asaas-cobranca
// body: { unidade_id, cliente, cliente_documento, cliente_email?, valor,
//         vencimento, descricao?, tipo? (BOLETO|PIX|CREDIT_CARD|UNDEFINED) }
//
// Credencial pelo _shared/asaas.ts: Vault asaas_<unidade> ou o secret
// ASAAS_API_KEY. Cria/recupera o cliente no Asaas, cria a cobrança e grava em
// public.cobrancas. Devolve o link de pagamento (aceita cartão), o boleto e o
// PIX quando aplicável.
//
// Unidade de conta parceira: sempre a conta Asaas da CafeWorking, com split
// para a carteira do parceiro, e a divisão gravada na cobrança. Parceiro sem
// carteira ou fora de 'ativo': recusa sem cobrar.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { userClient, adminClient } from "../_shared/supabaseAdmin.ts";
import { podeMexerNoDinheiro, recusaSemFinanceiro } from "../_shared/permissoes.ts";
import { dispatchNotificacao } from "../_shared/notify/index.ts";
import { asaas, credenciaisAsaas } from "../_shared/asaas.ts";
import { regraDaUnidade } from "../_shared/parceirosDb.ts";
import { camposDaDivisao } from "../_shared/parceiros.ts";
import { comSplit } from "../_shared/venda.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const body = await req.json();
    for (const k of ["unidade_id", "cliente", "cliente_documento", "valor"]) {
      if (!body?.[k]) return json({ error: `Campo obrigatório ausente: ${k}` }, 400);
    }

    const user = userClient(req);
    const { data: auth } = await user.auth.getUser();
    if (!auth?.user) return json({ error: "Não autenticado" }, 401);
    const admin = adminClient();

    // só admin da plataforma ou master/financeiro da unidade (recepção e contabilidade não)
    if (!(await podeMexerNoDinheiro(admin, auth.user.id, body.unidade_id))) {
      return recusaSemFinanceiro("Criar cobrança");
    }

    const regra = await regraDaUnidade(admin, body.unidade_id);
    if (regra.parceiro && !regra.ok) return json({ error: regra.erro, codigo: regra.codigo }, 412);
    const snapshot = regra.parceiro && regra.ok ? regra.snapshot : null;

    const cred = await credenciaisAsaas(admin, body.unidade_id);
    if (!cred) {
      return json({ error: regra.parceiro
        ? "A conta Asaas da CafeWorking não está configurada (Vault asaas_plataforma ou secret ASAAS_API_KEY)."
        : "Chave da API Asaas não configurada para esta unidade (Vault ref asaas_" + body.unidade_id + ")." }, 412);
    }

    const tipo = ["BOLETO", "PIX", "CREDIT_CARD", "UNDEFINED"].includes(body.tipo) ? body.tipo : "UNDEFINED";
    const valor = Number(body.valor);
    if (!(valor > 0)) return json({ error: "Valor inválido." }, 400);

    // 1) cliente no Asaas (cria; se já existir, o Asaas resolve pelo cpfCnpj)
    const doc = String(body.cliente_documento).replace(/\D/g, "");
    const customer = await asaas(cred, "/customers", "POST", {
      name: body.cliente, cpfCnpj: doc, email: body.cliente_email || undefined,
    });

    // 2) cobrança (com split em unidade parceira)
    const venc = body.vencimento || new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
    const pay = await asaas(cred, "/payments", "POST", comSplit({
      customer: customer.id, billingType: tipo, value: valor,
      dueDate: venc, description: body.descricao || "Cobrança CafeWorking",
    }, regra.parceiro && regra.ok ? regra.split : null));

    // 3) PIX / boleto extras (best-effort)
    let pixPayload = "", linha = "";
    if (tipo === "PIX" || tipo === "UNDEFINED") {
      try { const qr = await asaas(cred, `/payments/${pay.id}/pixQrCode`); pixPayload = qr?.payload || ""; } catch (_) { /* */ }
    }
    if (tipo === "BOLETO" || tipo === "UNDEFINED") {
      try { const id = await asaas(cred, `/payments/${pay.id}/identificationField`); linha = id?.identificationField || ""; } catch (_) { /* */ }
    }

    // 4) grava
    const insert = {
      unidade_id: body.unidade_id, cliente: body.cliente, cliente_documento: doc,
      cliente_email: body.cliente_email || null, valor, vencimento: venc,
      descricao: body.descricao || null, tipo, gateway: "asaas",
      asaas_customer_id: customer.id, asaas_payment_id: pay.id,
      status: pay.status === "RECEIVED" || pay.status === "CONFIRMED" ? "pago" : "pendente",
      invoice_url: pay.invoiceUrl || null, boleto_url: pay.bankSlipUrl || null,
      linha_digitavel: linha || null, pix_payload: pixPayload || null,
      created_by: auth.user.id,
      ...camposDaDivisao(snapshot, valor),
    };
    const { data: cob, error: insErr } = await admin.from("cobrancas").insert(insert).select().single();
    if (insErr) return json({ error: `Cobrança criada no Asaas, mas falhou ao gravar: ${insErr.message}` }, 500);

    // Avisa o cliente por e-mail (Resend) com o link de pagamento — best-effort.
    if (body.cliente_email) {
      await dispatchNotificacao(admin, {
        unidade_id: body.unidade_id, evento: "cobranca_nova", email: body.cliente_email, cliente: body.cliente,
        dados: { valor, vencimento: venc, descricao: cob.descricao, invoiceUrl: cob.invoice_url, pdfUrl: cob.boleto_url, pixCopiaCola: cob.pix_payload, linhaDigitavel: cob.linha_digitavel },
      });
    }

    return json({ cobranca: cob }, 201);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500);
  }
});
