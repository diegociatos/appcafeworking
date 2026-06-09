// ============================================================================
// Edge Function: asaas-cobranca  (cria cobrança boleto/PIX/cartão via Asaas)
//
// POST /functions/v1/asaas-cobranca
// body: { unidade_id, cliente, cliente_documento, cliente_email?, valor,
//         vencimento, descricao?, tipo? (BOLETO|PIX|CREDIT_CARD|UNDEFINED) }
//
// Lê a chave da API Asaas do Vault (ref asaas_<unidade>) — ou do segredo de
// função ASAAS_API_KEY como fallback. Cria/recupera o cliente no Asaas, cria a
// cobrança e grava em public.cobrancas. Devolve o link de pagamento (aceita
// cartão), o boleto e o PIX quando aplicável.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { userClient, adminClient } from "../_shared/supabaseAdmin.ts";

const BASE = {
  producao: "https://api.asaas.com/v3",
  sandbox: "https://sandbox.asaas.com/api/v3",
};

async function asaas(base: string, key: string, path: string, method = "GET", body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", access_token: key },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.errors?.[0]?.description || `Asaas ${path} (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

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

    // acesso à unidade (membro ou admin)
    const { data: pa } = await admin.from("platform_admins").select("user_id").eq("user_id", auth.user.id).maybeSingle();
    if (!pa) {
      const { data: mem } = await admin.from("unidade_members").select("unidade_id").eq("user_id", auth.user.id).eq("unidade_id", body.unidade_id).maybeSingle();
      if (!mem) return json({ error: "Sem acesso a esta unidade." }, 403);
    }

    // chave da API: Vault (asaas_<unidade>) ou env ASAAS_API_KEY
    let apiKey = "", ambiente = "producao";
    try {
      const { data: cred } = await admin.rpc("get_bank_credentials", { p_ref: `asaas_${body.unidade_id}` });
      if (cred?.api_key) { apiKey = cred.api_key; ambiente = cred.ambiente || "producao"; }
    } catch (_) { /* sem Vault → tenta env */ }
    if (!apiKey) { apiKey = Deno.env.get("ASAAS_API_KEY") || ""; ambiente = Deno.env.get("ASAAS_AMBIENTE") || "producao"; }
    if (!apiKey) return json({ error: "Chave da API Asaas não configurada para esta unidade (Vault ref asaas_" + body.unidade_id + ")." }, 412);

    const baseUrl = BASE[ambiente as keyof typeof BASE] || BASE.producao;
    const tipo = ["BOLETO", "PIX", "CREDIT_CARD", "UNDEFINED"].includes(body.tipo) ? body.tipo : "UNDEFINED";

    // 1) cliente no Asaas (cria; se já existir, o Asaas resolve pelo cpfCnpj)
    const doc = String(body.cliente_documento).replace(/\D/g, "");
    const customer = await asaas(baseUrl, apiKey, "/customers", "POST", {
      name: body.cliente, cpfCnpj: doc, email: body.cliente_email || undefined,
    });

    // 2) cobrança
    const venc = body.vencimento || new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
    const pay = await asaas(baseUrl, apiKey, "/payments", "POST", {
      customer: customer.id, billingType: tipo, value: Number(body.valor),
      dueDate: venc, description: body.descricao || "Cobrança CafeWorking",
    });

    // 3) PIX / boleto extras (best-effort)
    let pixPayload = "", linha = "";
    if (tipo === "PIX" || tipo === "UNDEFINED") {
      try { const qr = await asaas(baseUrl, apiKey, `/payments/${pay.id}/pixQrCode`); pixPayload = qr?.payload || ""; } catch (_) { /* */ }
    }
    if (tipo === "BOLETO" || tipo === "UNDEFINED") {
      try { const id = await asaas(baseUrl, apiKey, `/payments/${pay.id}/identificationField`); linha = id?.identificationField || ""; } catch (_) { /* */ }
    }

    // 4) grava
    const insert = {
      unidade_id: body.unidade_id, cliente: body.cliente, cliente_documento: doc,
      cliente_email: body.cliente_email || null, valor: Number(body.valor), vencimento: venc,
      descricao: body.descricao || null, tipo, gateway: "asaas",
      asaas_customer_id: customer.id, asaas_payment_id: pay.id,
      status: pay.status === "RECEIVED" || pay.status === "CONFIRMED" ? "pago" : "pendente",
      invoice_url: pay.invoiceUrl || null, boleto_url: pay.bankSlipUrl || null,
      linha_digitavel: linha || null, pix_payload: pixPayload || null,
      created_by: auth.user.id,
    };
    const { data: cob, error: insErr } = await admin.from("cobrancas").insert(insert).select().single();
    if (insErr) return json({ error: `Cobrança criada no Asaas, mas falhou ao gravar: ${insErr.message}` }, 500);

    return json({ cobranca: cob }, 201);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500);
  }
});
