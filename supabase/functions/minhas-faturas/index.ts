// ============================================================================
// Edge Function: minhas-faturas  (área do cliente)
//
// GET /functions/v1/minhas-faturas   (JWT do cliente; deploy --no-verify-jwt,
// a função confere o login por conta própria)
// → { faturas: [...], resumo: { em_aberto, vencidas, valor_em_aberto, proxima } }
//
// Uma lista só com o que o cliente realmente deve ou pagou:
//   • cobranças do Asaas (assinatura, reserva, avulsas) pelo e-mail do login
//     ou pelo CPF/CNPJ do próprio cadastro;
//   • boletos bancários pelo CPF/CNPJ do próprio cadastro;
//   • cadastro pelo site aguardando o primeiro pagamento.
// Só links reais (fatura do Asaas, PDF do boleto, PIX emitido). O cliente nunca
// marca nada como pago: a baixa vem do banco/Asaas.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { usuarioDoReq } from "../_shared/assinaturas.ts";
import { hojeBRT } from "../_shared/venda.ts";
import { padraoEmail } from "../_shared/reservaCliente.ts";
import { clientesDoEmail, erroInterno, nomesDasUnidades } from "../_shared/clienteArea.ts";
import { type Fatura, faturaDeBoleto, faturaDeCobranca, faturaDePedido, ordenarFaturas, resumoFaturas } from "../_shared/faturas.ts";

const COLUNAS_COBRANCA = "id, unidade_id, descricao, valor, vencimento, status, invoice_url, boleto_url, pix_payload, linha_digitavel, pago_em, cliente_documento";
const COLUNAS_BOLETO = "id, unidade_id, instrucoes, valor, vencimento, status, pdf_url, pix_copia_cola, linha_digitavel";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "Método não permitido" }, 405, req);

  try {
    const usuario = await usuarioDoReq(req);
    if (!usuario) return json({ error: "Entre na sua conta para ver as faturas." }, 401, req);
    const admin = adminClient();
    const hoje = hojeBRT();
    const email = padraoEmail(usuario.email);

    // Documento (CPF/CNPJ) só do PRÓPRIO cadastro na tabela clientes, por
    // unidade — mesmo vínculo da RLS de boletos/cobranças (20260627120000).
    const clientes = await clientesDoEmail(admin, usuario.email);
    const vinculos = new Map<string, Set<string>>(); // unidade → documentos
    for (const c of clientes) {
      const doc = String(c.documento || "").trim();
      if (!c.unidade_id || !doc) continue;
      if (!vinculos.has(c.unidade_id)) vinculos.set(c.unidade_id, new Set());
      vinculos.get(c.unidade_id)!.add(doc);
    }

    // deno-lint-ignore no-explicit-any
    const consultas: PromiseLike<{ data: any[] | null; error: { message: string } | null }>[] = [
      admin.from("cobrancas").select(COLUNAS_COBRANCA).ilike("cliente_email", email).order("vencimento", { ascending: false }).limit(60),
      admin.from("pending_signups").select("id, unidade_id, plano_nome, valor, invoice_url, created_at").ilike("email", email).eq("status", "aguardando"),
    ];
    for (const [unidadeId, docs] of vinculos) {
      const lista = [...docs];
      consultas.push(admin.from("cobrancas").select(COLUNAS_COBRANCA).eq("unidade_id", unidadeId).in("cliente_documento", lista).order("vencimento", { ascending: false }).limit(60));
      consultas.push(admin.from("boletos").select(COLUNAS_BOLETO).eq("unidade_id", unidadeId).in("sacado_documento", lista).order("vencimento", { ascending: false }).limit(60));
    }
    const [porEmail, pedidos, ...porDocumento] = await Promise.all(consultas);
    for (const r of [porEmail, pedidos, ...porDocumento]) if (r.error) throw new Error(r.error.message);

    const porId = new Map<string, Fatura>();
    const incluir = (f: Fatura | null) => { if (f) porId.set(f.id, f); };
    (porEmail.data || []).forEach((c) => incluir(faturaDeCobranca(c, hoje)));
    porDocumento.forEach((r, i) => {
      const ehBoleto = i % 2 === 1;
      (r.data || []).forEach((l) => incluir(ehBoleto ? faturaDeBoleto(l, hoje) : faturaDeCobranca(l, hoje)));
    });
    (pedidos.data || []).forEach((p) => incluir(faturaDePedido(p)));

    const faturas = ordenarFaturas([...porId.values()]).slice(0, 80);
    const nomes = await nomesDasUnidades(admin, faturas.map((f) => f.unidade_id || ""));
    const comUnidade = faturas.map((f) => ({ ...f, unidade: f.unidade_id ? nomes.get(f.unidade_id) || "" : "" }));

    return json({ faturas: comUnidade, resumo: resumoFaturas(faturas) }, 200, req);
  } catch (e) {
    return erroInterno(req, "minhas-faturas", e);
  }
});
