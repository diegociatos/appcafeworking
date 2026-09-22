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
    const { data: linhas, error } = await admin.from("app_state").select("unidade_id, entity, item_id, doc")
      .in("entity", ["catalogo", "contratos"]).in("unidade_id", unidadeIds);
    if (error) throw new Error(`app_state: ${error.message}`);
    const clienteIds = clientes.map((c) => String(c.id));
    const { data: assinaturas } = await admin.from("assinaturas").select("cliente_id, unidade_id, recorrencia, status")
      .in("cliente_id", clienteIds).eq("status", "ativa");
    const competencia = hojeBRT().slice(0, 7);
    const { data: consumosMes, error: consumosErr } = await admin.from("consumos_cafeteria")
      .select("id, unidade_id, cliente_id, valor, itens, created_at")
      .in("cliente_id", clienteIds).ilike("cliente_email", usuario.email)
      .eq("competencia", competencia).eq("status", "aberto")
      .order("created_at", { ascending: false });
    if (consumosErr) throw new Error(`consumos_cafeteria: ${consumosErr.message}`);
    const mensalPor = new Set((assinaturas || []).filter((a) => a.recorrencia === "mensal").map((a) => `${a.unidade_id}|${a.cliente_id}`));
    for (const c of clientes) {
      const contrato = (linhas || []).find((l) => l.entity === "contratos" && l.unidade_id === c.unidade_id && l.doc?.clienteId === c.id && l.doc?.status === "ativo");
      if (contrato) mensalPor.add(`${c.unidade_id}|${c.id}`);
    }
    const nomes = await nomesDasUnidades(admin, unidadeIds);
    const unidades = unidadeIds.map((id) => ({
      id, nome: nomes.get(id) || "CafeWorking",
      produtos: produtosDaAreaCliente((linhas || []).filter((l) => l.entity === "catalogo" && l.unidade_id === id)),
      cliente_mensal: clientes.some((c) => c.unidade_id === id && mensalPor.has(`${id}|${c.id}`)),
      consumo_mes: Math.round((consumosMes || []).filter((c) => c.unidade_id === id).reduce((s, c) => s + Number(c.valor), 0) * 100) / 100,
      consumos: (consumosMes || []).filter((c) => c.unidade_id === id).map((c) => ({
        id: c.id, data: c.created_at, valor: Number(c.valor),
        itens: Array.isArray(c.itens) ? c.itens.map((i: { nome?: unknown; q?: unknown; preco?: unknown }) => ({
          nome: String(i.nome || "Produto"), quantidade: Number(i.q) || 1, preco: Number(i.preco) || 0,
        })) : [],
      })),
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

    const pedidoId = crypto.randomUUID();
    const pedidoBase = {
      id: pedidoId, unidadeId, cliente: cadastro.nome, clienteId: cadastro.id, origem: "app",
      total: compra.total, itens: compra.itens.map((i) => ({ id: i.id, nome: i.nome, preco: i.preco, q: i.quantidade, emoji: i.emoji })),
      hora: "agora", createdAt: new Date().toISOString(),
    };
    if (body?.forma_pagamento === "mensal") {
      if (!unidade.cliente_mensal) return json({ error: "A compra mensal está disponível somente para contratos recorrentes ativos." }, 403, req);
      const { data: consumo, error: consumoErr } = await admin.from("consumos_cafeteria").insert({
        unidade_id: unidadeId, cliente_id: cadastro.id, cliente_email: usuario.email,
        competencia: hojeBRT().slice(0, 7), itens: pedidoBase.itens, valor: compra.total, pedido_id: pedidoId,
      }).select("id").single();
      if (consumoErr) throw new Error(`consumo mensal: ${consumoErr.message}`);
      const pedido = { ...pedidoBase, status: "recebido", formaPagamento: "fatura_mensal" };
      const { error: pedErr } = await admin.from("app_state").insert({ unidade_id: unidadeId, entity: "pedidos", item_id: pedidoId, doc: pedido });
      if (pedErr) {
        await admin.from("consumos_cafeteria").delete().eq("id", consumo.id);
        throw new Error(`pedido: ${pedErr.message}`);
      }
      return json({ pedido_id: pedidoId, faturado_no_mes: true, competencia: hojeBRT().slice(0, 7) }, 201, req);
    }

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
    const pedido = {
      ...pedidoBase, status: "aguardando_pagamento", formaPagamento: "online", cobrancaId: cobranca.id,
    };
    const { error: pedErr } = await admin.from("app_state").insert({ unidade_id: unidadeId, entity: "pedidos", item_id: pedidoId, doc: pedido });
    if (pedErr) throw new Error(`pedido: ${pedErr.message}`);
    return json({ pedido_id: pedidoId, cobranca }, 201, req);
  } catch (e) {
    return erroInterno(req, "loja-cliente", e, "Não foi possível concluir a compra agora. Tente novamente.");
  }
});
