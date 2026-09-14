// ============================================================================
// Edge Function: iniciar-assinatura  (checkout do plano — site e autocadastro)
//
// POST /functions/v1/iniciar-assinatura   (deploy com --no-verify-jwt)
// body: { nome, email, senha, documento, telefone?, unidade_id, plano_id, tipo?,
//         aceite?: { modelo_id, hash }, origem?: "site" | "app", turnstile? }
//
// 1. Cria o login BLOQUEADO até o pagamento confirmar.
// 2. Plano mensal → assinatura no Asaas (cobra sozinha todo mês).
//    Plano avulso → uma cobrança.
// 3. Registra o cadastro pendente e a prova do aceite do contrato.
// 4. Devolve o link de pagamento da primeira fatura.
// A ativação (desbloquear login, criar cliente, assinatura e créditos) acontece
// no asaas-webhook quando o pagamento confirma.
//
// Contrato: se existe versão vigente para a categoria do plano, o aceite é
// obrigatório e precisa bater com ela (id + hash). Pelo site, sem contrato
// publicado o plano não é vendido.
//
// Se o mesmo e-mail já tem uma compra aguardando pagamento: é a mesma compra →
// retoma (devolve o link de antes e atualiza a senha); é outra → descarta a
// anterior. Antes disso o cliente que abandonava o pagamento ficava travado
// com "já existe conta com este e-mail" numa conta que continuava bloqueada.
// ============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { ipDaReq } from "../_shared/audit.ts";
import { asaas, cancelarNoAsaas, type CredAsaas, credenciaisAsaas, pixDoPagamento } from "../_shared/asaas.ts";
import { verificarTurnstile } from "../_shared/turnstile.ts";
import { aceiteConfere, contratoVigente, registrarAceite } from "../_shared/contratos.ts";
import {
  categoriaValida, documentoValido, emailValido, hojeBRT, normalizarDocumento, payloadAssinaturaAsaas,
} from "../_shared/venda.ts";

const JANELA_RETOMADA_MS = 48 * 3600_000;
const BLOQUEIO = "876000h"; // ~100 anos

// deno-lint-ignore no-explicit-any
type Linha = Record<string, any>;

/** Primeira fatura gerada pela assinatura. O Asaas cria na hora; tenta de novo uma vez. */
async function primeiraFatura(cred: CredAsaas, subscriptionId: string): Promise<Linha | null> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const lista = await asaas(cred, `/subscriptions/${subscriptionId}/payments`);
    const pagamentos = (lista?.data || []) as Linha[];
    if (pagamentos.length) {
      return pagamentos.sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))[0];
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}

/** Descarta uma tentativa anterior que ficou aguardando pagamento. Best-effort. */
async function descartarTentativa(admin: SupabaseClient, anterior: Linha) {
  const { data: claim } = await admin
    .from("pending_signups").update({ status: "cancelado" })
    .eq("id", anterior.id).eq("status", "aguardando").select("id");
  if (!claim?.length) return; // o webhook ativou no meio do caminho

  const cred = await credenciaisAsaas(admin, anterior.unidade_id);
  if (cred) {
    await cancelarNoAsaas(cred, { subscriptionId: anterior.asaas_subscription_id, paymentId: anterior.asaas_payment_id });
  }
  if (anterior.user_id) {
    // Só apaga login que ainda está bloqueado: é o que este fluxo criou e nunca foi ativado.
    try {
      const { data } = await admin.auth.admin.getUserById(anterior.user_id);
      const bloqueadoAte = data?.user?.banned_until ? new Date(data.user.banned_until).getTime() : 0;
      if (bloqueadoAte > Date.now()) await admin.auth.admin.deleteUser(anterior.user_id);
    } catch (e) {
      console.error("descartarTentativa:", (e as Error).message);
    }
  }
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405, req);

  try {
    const body = await req.json().catch(() => ({}));
    const origem = body?.origem === "site" ? "site" : "app";

    if (origem === "site") {
      const robo = await verificarTurnstile(body?.turnstile, ipDaReq(req));
      if (!robo.ok) return json({ error: "Não foi possível confirmar que você não é um robô. Recarregue a página." }, 403, req);
    }

    for (const k of ["nome", "email", "senha", "documento", "unidade_id", "plano_id"]) {
      if (!body?.[k]) {
        const msg = k === "documento" ? "Informe seu CPF ou CNPJ (necessário para o pagamento)." : `Campo obrigatório ausente: ${k}`;
        return json({ error: msg }, 400, req);
      }
    }
    const nome = String(body.nome).trim();
    const email = String(body.email).toLowerCase().trim();
    if (!emailValido(email)) return json({ error: "E-mail inválido." }, 400, req);
    if (String(body.senha).length < 6) return json({ error: "A senha precisa de pelo menos 6 caracteres." }, 400, req);
    const documento = normalizarDocumento(body.documento);
    if (!documentoValido(documento)) return json({ error: "CPF ou CNPJ inválido." }, 400, req);
    const telefone = body.telefone ? String(body.telefone) : null;

    const admin = adminClient();

    const { data: unidade } = await admin.from("unidades").select("id, franqueado_id, nome").eq("id", body.unidade_id).maybeSingle();
    if (!unidade) return json({ error: "Unidade inválida." }, 404, req);

    const { data: planosRows } = await admin.from("app_state").select("doc").eq("entity", "planos").eq("unidade_id", unidade.id);
    const plano = (planosRows || []).map((r) => r.doc).find((p) => p && p.id === body.plano_id && p.ativo !== false);
    if (!plano) return json({ error: "Plano indisponível." }, 404, req);
    if (origem === "site" && plano.venderNoSite !== true) return json({ error: "Plano indisponível para contratação online." }, 404, req);
    const valor = Number(plano.preco || 0);
    if (!(valor > 0)) return json({ error: "Plano sem preço válido." }, 400, req);

    const categoria = categoriaValida(plano.categoria) ? plano.categoria : null;
    const recorrente = (plano.recorrencia || "mensal") === "mensal";
    const prazoMinimo = Math.max(0, Math.floor(Number(plano.prazoMinimoMeses || 0)));

    const contrato = categoria ? await contratoVigente(admin, unidade.id, categoria) : null;
    if (origem === "site" && !contrato) {
      return json({ error: "Contratação online indisponível para este plano no momento.", codigo: "SEM_CONTRATO" }, 412, req);
    }
    if (contrato && !aceiteConfere(contrato, body.aceite)) {
      return json({ error: "É preciso aceitar a versão atual do contrato.", codigo: "ACEITE_NECESSARIO", contrato }, 412, req);
    }

    const cred = await credenciaisAsaas(admin, unidade.id);
    if (!cred) return json({ error: "Esta unidade ainda não habilitou pagamentos online." }, 412, req);

    const dadosAceite = {
      unidade_id: unidade.id, cliente_nome: nome, cliente_email: email, cliente_documento: documento,
      plano_id: plano.id, plano_nome: plano.nome, valor, recorrencia: recorrente ? "mensal" : "avulso",
      prazo_minimo_meses: prazoMinimo, referencia_tipo: "signup" as const, origem,
    };

    // ---- tentativa anterior do mesmo e-mail ---------------------------------
    const { data: anterior } = await admin
      .from("pending_signups").select("*").eq("email", email).eq("status", "aguardando").maybeSingle();
    if (anterior) {
      const recente = Date.now() - new Date(anterior.created_at).getTime() < JANELA_RETOMADA_MS;
      const mesmaCompra = anterior.plano_id === plano.id && anterior.unidade_id === unidade.id && Number(anterior.valor) === valor;
      if (recente && mesmaCompra && anterior.invoice_url) {
        if (anterior.user_id) await admin.auth.admin.updateUserById(anterior.user_id, { password: String(body.senha) });
        if (contrato) await registrarAceite(admin, req, contrato, { ...dadosAceite, referencia_id: anterior.id });
        const pix = anterior.asaas_payment_id ? await pixDoPagamento(cred, anterior.asaas_payment_id) : { payload: "" };
        return json({
          ok: true, retomado: true, checkoutUrl: anterior.invoice_url, payment_id: anterior.asaas_payment_id,
          pix_payload: pix.payload, plano: anterior.plano_nome, valor: Number(anterior.valor),
          recorrente: !!anterior.asaas_subscription_id, fidelidade_meses: anterior.prazo_minimo_meses ?? 0,
        }, 200, req);
      }
      await descartarTentativa(admin, anterior);
    }

    // ---- 1) login bloqueado até pagar ---------------------------------------
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email, password: String(body.senha), email_confirm: true,
      user_metadata: { nome, tipo: "cliente" },
    });
    if (cErr || !created?.user) {
      const dup = /already|registered|exists/i.test(cErr?.message || "");
      return json({
        error: dup
          ? "Já existe uma conta com este e-mail. Entre na área do cliente em app.cafeworking.com.br."
          : `Não foi possível criar a conta: ${cErr?.message}`,
        codigo: dup ? "EMAIL_EXISTENTE" : undefined,
      }, dup ? 409 : 422, req);
    }
    const userId = created.user.id;
    await admin.auth.admin.updateUserById(userId, { ban_duration: BLOQUEIO });

    const pendingId = crypto.randomUUID();
    let subscriptionId: string | null = null;
    let pagamento: Linha | null = null;
    let customerId = "";
    const desfazer = async () => {
      await cancelarNoAsaas(cred, { subscriptionId, paymentId: pagamento?.id });
      try { await admin.auth.admin.deleteUser(userId); } catch (_) { /* */ }
    };

    // ---- 2) Asaas -----------------------------------------------------------
    try {
      const tipo = ["BOLETO", "PIX", "CREDIT_CARD", "UNDEFINED"].includes(body.tipo) ? body.tipo : "UNDEFINED";
      const descricao = `${plano.nome} · ${unidade.nome}`;
      const customer = await asaas(cred, "/customers", "POST", {
        name: nome, cpfCnpj: documento, email,
        mobilePhone: telefone ? telefone.replace(/\D/g, "") : undefined,
      });
      customerId = customer.id;

      if (recorrente) {
        const assinatura = await asaas(cred, "/subscriptions", "POST", payloadAssinaturaAsaas({
          customer: customer.id, valor, descricao, nextDueDate: hojeBRT(),
          externalReference: `assinatura:${pendingId}`, billingType: tipo,
        }));
        subscriptionId = assinatura.id;
        pagamento = await primeiraFatura(cred, assinatura.id);
        if (!pagamento) throw new Error("o Asaas não gerou a primeira fatura da assinatura");
      } else {
        pagamento = await asaas(cred, "/payments", "POST", {
          customer: customer.id, billingType: tipo, value: valor,
          dueDate: hojeBRT(new Date(Date.now() + 2 * 864e5)),
          description: descricao, externalReference: `signup:${pendingId}`,
        });
      }
    } catch (e) {
      await desfazer();
      return json({ error: `Não foi possível gerar o pagamento: ${(e as Error).message}` }, 502, req);
    }

    // ---- 3) cadastro pendente -----------------------------------------------
    const { error: pErr } = await admin.from("pending_signups").insert({
      id: pendingId, user_id: userId, unidade_id: unidade.id, franqueado_id: unidade.franqueado_id,
      nome, email, telefone, documento,
      plano_id: plano.id, plano_nome: plano.nome, valor, emite_nf: !!plano.emiteNF,
      asaas_customer_id: customerId, asaas_payment_id: pagamento!.id, asaas_subscription_id: subscriptionId,
      invoice_url: pagamento!.invoiceUrl || "", status: "aguardando",
      categoria, recorrencia: recorrente ? "mensal" : "avulso", prazo_minimo_meses: prazoMinimo,
      direitos: plano.direitos || {}, origem,
    });
    if (pErr) {
      await desfazer();
      const dup = pErr.code === "23505";
      return json({
        error: dup ? "Já existe uma compra em andamento para este e-mail. Tente de novo em instantes." : `Falha ao registrar o cadastro: ${pErr.message}`,
      }, dup ? 409 : 500, req);
    }

    // ---- 4) prova do aceite ---------------------------------------------------
    if (contrato) {
      try {
        const aceiteId = await registrarAceite(admin, req, contrato, { ...dadosAceite, referencia_id: pendingId });
        await admin.from("pending_signups").update({ aceite_id: aceiteId }).eq("id", pendingId);
      } catch (e) {
        console.error(e);
        await admin.from("pending_signups").update({ status: "cancelado" }).eq("id", pendingId);
        await desfazer();
        return json({ error: "Não foi possível registrar o aceite do contrato. Nada foi cobrado; tente de novo." }, 500, req);
      }
    }

    const pix = await pixDoPagamento(cred, pagamento!.id);

    return json({
      ok: true, checkoutUrl: pagamento!.invoiceUrl || "", payment_id: pagamento!.id,
      pix_payload: pix.payload, plano: plano.nome, valor, recorrente, fidelidade_meses: prazoMinimo,
    }, 201, req);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500, req);
  }
});
