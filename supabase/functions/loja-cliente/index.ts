import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { usuarioDoReq } from "../_shared/assinaturas.ts";
import { clientesDoEmail, erroInterno, nomesDasUnidades } from "../_shared/clienteArea.ts";
import { montarCompra, produtosDaAreaCliente } from "../_shared/lojaCliente.ts";
import { asaas, credenciaisAsaas, pixDoPagamento } from "../_shared/asaas.ts";
import { regraDaUnidade } from "../_shared/parceirosDb.ts";
import { camposDaDivisao } from "../_shared/parceiros.ts";
import { comSplit, hojeBRT } from "../_shared/venda.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (!["GET", "POST"].includes(req.method)) return json({ error: "Método não permitido" }, 405, req);
  try {
    const usuario = await usuarioDoReq(req);
    if (!usuario) return json({ error: "Entre na sua conta para comprar." }, 401, req);
    const admin = adminClient();
    const clientes = (await clientesDoEmail(admin, usuario.email)).filter((c) => c.status !== "inativo");
    if (!clientes.length) return json({ error: "Seu cadastro de cliente não foi encontrado." }, 403, req);
    const unidadeIds = [...new Set(clientes.map((c) => String(c.unidade_id)).filter(Boolean))];
    const { data: linhas, error } = await admin.from("app_state").select("unidade_id, item_id, doc")
      .eq("entity", "catalogo").in("unidade_id", unidadeIds);
    if (error) throw new Error(`app_state: ${error.message}`);
    const nomes = await nomesDasUnidades(admin, unidadeIds);
    const unidades = unidadeIds.map((id) => ({
      id, nome: nomes.get(id) || "CafeWorking",
      produtos: produtosDaAreaCliente((linhas || []).filter((l) => l.unidade_id === id)),
    })).filter((u) => u.produtos.length);
    if (req.method === "GET") return json({ unidades }, 200, req);

    const body = await req.json();
    const unidadeId = String(body?.unidade_id || "");
    const cadastro = clientes.find((c) => String(c.unidade_id) === unidadeId);
    const unidade = unidades.find((u) => u.id === unidadeId);
    if (!cadastro || !unidade) return json({ error: "Unidade não disponível para este cliente." }, 403, req);
    const documento = String(cadastro.documento || "").replace(/\D/g, "");
    if (![11, 14].includes(documento.length)) return json({ error: "Atualize seu CPF/CNPJ com a recepção antes de pagar." }, 412, req);
    let compra;
    try { compra = montarCompra(unidade.produtos, body?.itens); }
    catch (_) { return json({ error: "Revise os itens e as quantidades do pedido." }, 400, req); }

    const regra = await regraDaUnidade(admin, unidadeId);
    if (regra.parceiro && !regra.ok) return json({ error: regra.erro }, 412, req);
    const cred = await credenciaisAsaas(admin, unidadeId);
    if (!cred) return json({ error: "O pagamento online ainda não está configurado nesta unidade." }, 412, req);
    const customer = await asaas(cred, "/customers", "POST", { name: cadastro.nome, cpfCnpj: documento, email: usuario.email });
    const descricao = `Cafeteria CafeWorking · ${compra.itens.map((i) => `${i.quantidade}x ${i.nome}`).join(", ")}`.slice(0, 500);
    const pay = await asaas(cred, "/payments", "POST", comSplit({
      customer: customer.id, billingType: "UNDEFINED", value: compra.total,
      dueDate: hojeBRT(), description: descricao,
    }, regra.parceiro && regra.ok ? regra.split : null));
    const pix = await pixDoPagamento(cred, pay.id);
    const snapshot = regra.parceiro && regra.ok ? regra.snapshot : null;
    const { data: cobranca, error: cobErr } = await admin.from("cobrancas").insert({
      unidade_id: unidadeId, cliente: cadastro.nome, cliente_documento: documento,
      cliente_email: usuario.email, valor: compra.total, vencimento: hojeBRT(), descricao,
      tipo: "UNDEFINED", gateway: "asaas", asaas_customer_id: customer.id, asaas_payment_id: pay.id,
      status: ["RECEIVED", "CONFIRMED"].includes(pay.status) ? "pago" : "pendente",
      invoice_url: pay.invoiceUrl || null, boleto_url: pay.bankSlipUrl || null,
      pix_payload: pix.payload || null, origem: "cafeteria_app", created_by: usuario.id,
      ...camposDaDivisao(snapshot, compra.total),
    }).select("id, invoice_url, boleto_url, pix_payload, status").single();
    if (cobErr) throw new Error(`cobrancas: ${cobErr.message}`);
    const pedidoId = crypto.randomUUID();
    const pedido = {
      id: pedidoId, unidadeId, cliente: cadastro.nome, clienteId: cadastro.id, origem: "app",
      status: "aguardando_pagamento", formaPagamento: "online", total: compra.total, cobrancaId: cobranca.id,
      itens: compra.itens.map((i) => ({ id: i.id, nome: i.nome, preco: i.preco, q: i.quantidade, emoji: i.emoji })),
      hora: "agora", createdAt: new Date().toISOString(),
    };
    const { error: pedErr } = await admin.from("app_state").insert({ unidade_id: unidadeId, entity: "pedidos", item_id: pedidoId, doc: pedido });
    if (pedErr) throw new Error(`pedido: ${pedErr.message}`);
    return json({ pedido_id: pedidoId, cobranca }, 201, req);
  } catch (e) {
    return erroInterno(req, "loja-cliente", e, "Não foi possível concluir a compra agora. Tente novamente.");
  }
});
