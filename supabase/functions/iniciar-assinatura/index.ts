// ============================================================================
// Edge Function: iniciar-assinatura  (autocheckout no cadastro do cliente)
//
// POST /functions/v1/iniciar-assinatura   (deploy com --no-verify-jwt)
// body: { nome, email, senha, telefone?, documento?, unidade_id, plano_id, tipo? }
//
// Cria o login (BLOQUEADO até pagar), a cobrança do plano no Asaas e uma linha
// em pending_signups. Devolve o link de pagamento. A ativação (desbanir + criar
// cliente/vínculo) acontece no asaas-webhook quando o pagamento confirma.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";

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
  if (!res.ok) throw new Error(data?.errors?.[0]?.description || `Asaas ${path} (${res.status})`);
  return data;
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const body = await req.json();
    for (const k of ["nome", "email", "senha", "unidade_id", "plano_id"]) {
      if (!body?.[k]) return json({ error: `Campo obrigatório ausente: ${k}` }, 400);
    }
    const email = String(body.email).toLowerCase().trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "E-mail inválido." }, 400);
    if (String(body.senha).length < 6) return json({ error: "A senha precisa de pelo menos 6 caracteres." }, 400);
    const doc = body.documento ? String(body.documento).replace(/\D/g, "") : "";
    if (!doc) return json({ error: "Informe seu CPF ou CNPJ (necessário para o pagamento)." }, 400);

    const admin = adminClient();

    // unidade + franqueado
    const { data: unidade } = await admin.from("unidades").select("id, franqueado_id, nome").eq("id", body.unidade_id).maybeSingle();
    if (!unidade) return json({ error: "Unidade inválida." }, 404);

    // plano (lido do app_state)
    const { data: planosRows } = await admin.from("app_state").select("doc").eq("entity", "planos").eq("unidade_id", unidade.id);
    const plano = (planosRows || []).map((r) => r.doc).find((p) => p && p.id === body.plano_id && p.ativo !== false);
    if (!plano) return json({ error: "Plano indisponível." }, 404);
    const valor = Number(plano.preco || 0);
    if (!(valor > 0)) return json({ error: "Plano sem preço válido." }, 400);

    // chave Asaas da unidade (Vault) ou env
    let apiKey = "", ambiente = "producao";
    try {
      const { data: cred } = await admin.rpc("get_bank_credentials", { p_ref: `asaas_${unidade.id}` });
      if (cred?.api_key) { apiKey = cred.api_key; ambiente = cred.ambiente || "producao"; }
    } catch (_) { /* sem Vault */ }
    if (!apiKey) { apiKey = Deno.env.get("ASAAS_API_KEY") || ""; ambiente = Deno.env.get("ASAAS_AMBIENTE") || "producao"; }
    if (!apiKey) return json({ error: "Esta unidade ainda não habilitou pagamentos online." }, 412);
    const baseUrl = BASE[ambiente as keyof typeof BASE] || BASE.producao;

    // 1) cria o login JÁ BANIDO (não consegue entrar até o pagamento confirmar)
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email, password: String(body.senha), email_confirm: true,
      user_metadata: { nome: body.nome, tipo: "cliente" },
    });
    if (cErr || !created?.user) {
      const dup = /already|registered|exists/i.test(cErr?.message || "");
      return json({ error: dup ? "Já existe uma conta com este e-mail. Tente entrar." : `Não foi possível criar a conta: ${cErr?.message}` }, dup ? 409 : 422);
    }
    const userId = created.user.id;
    await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" }); // ~100 anos
    const rollback = async () => { try { await admin.auth.admin.deleteUser(userId); } catch (_) { /* */ } };

    // 2) cobrança no Asaas (link aceita cartão/PIX/boleto)
    let cobranca;
    try {
      const tipo = ["BOLETO", "PIX", "CREDIT_CARD", "UNDEFINED"].includes(body.tipo) ? body.tipo : "UNDEFINED";
      const customer = await asaas(baseUrl, apiKey, "/customers", "POST", { name: body.nome, cpfCnpj: doc, email });
      const venc = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
      const pay = await asaas(baseUrl, apiKey, "/payments", "POST", {
        customer: customer.id, billingType: tipo, value: valor, dueDate: venc,
        description: `${plano.nome} · ${unidade.nome}`,
        externalReference: `signup:${userId}`,
      });
      let pixPayload = "";
      try { const qr = await asaas(baseUrl, apiKey, `/payments/${pay.id}/pixQrCode`); pixPayload = qr?.payload || ""; } catch (_) { /* */ }
      cobranca = { customerId: customer.id, paymentId: pay.id, invoiceUrl: pay.invoiceUrl || "", pixPayload };
    } catch (e) {
      await rollback();
      return json({ error: `Não foi possível gerar o pagamento: ${(e as Error).message}` }, 502);
    }

    // 3) registra o cadastro pendente
    const { error: pErr } = await admin.from("pending_signups").insert({
      user_id: userId, unidade_id: unidade.id, franqueado_id: unidade.franqueado_id,
      nome: body.nome, email, telefone: body.telefone || null, documento: doc,
      plano_id: plano.id, plano_nome: plano.nome, valor, emite_nf: !!plano.emiteNF,
      asaas_customer_id: cobranca.customerId, asaas_payment_id: cobranca.paymentId,
      invoice_url: cobranca.invoiceUrl, status: "aguardando",
    });
    if (pErr) { await rollback(); return json({ error: `Falha ao registrar o cadastro: ${pErr.message}` }, 500); }

    return json({
      ok: true, checkoutUrl: cobranca.invoiceUrl, payment_id: cobranca.paymentId,
      pix_payload: cobranca.pixPayload, plano: plano.nome, valor,
    }, 201);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500);
  }
});
