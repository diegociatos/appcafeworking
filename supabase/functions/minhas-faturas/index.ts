// ============================================================================
// Edge Function: minhas-faturas  (área do cliente)
//
// GET /functions/v1/minhas-faturas   (JWT do cliente; deploy --no-verify-jwt,
// a função confere o login por conta própria)
// → { faturas: [...], resumo: { em_aberto, vencidas, valor_em_aberto, proxima },
//     notas: [{ id, numero, emitida_em, valor, descricao, unidade, pdf_url, xml_url }] }
//
// Uma lista só com o que o cliente realmente deve ou pagou:
//   • cobranças do Asaas (assinatura, reserva, avulsas) pelo e-mail do login
//     ou pelo CPF/CNPJ do próprio cadastro;
//   • boletos bancários pelo CPF/CNPJ do próprio cadastro;
//   • cadastro pelo site aguardando o primeiro pagamento.
// E as notas fiscais AUTORIZADAS do cliente (nunca simulada/cancelada), pelo
// CPF/CNPJ do próprio cadastro (mesmo vínculo da RLS de notas_fiscais) ou pela
// cobrança dele (notas_fiscais.cobranca_id). O XML ganha link assinado na hora
// (o gravado na emissão expira em 7 dias). Falha ao ler notas não esconde as faturas.
// Só links reais (fatura do Asaas, PDF do boleto, PIX emitido). O cliente nunca
// marca nada como pago: a baixa vem do banco/Asaas.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { usuarioDoReq } from "../_shared/assinaturas.ts";
import { hojeBRT } from "../_shared/venda.ts";
import { padraoEmail } from "../_shared/reservaCliente.ts";
import { clientesDoEmail, erroInterno, nomesDasUnidades } from "../_shared/clienteArea.ts";
import {
  type Fatura, type NotaCliente, faturaDeBoleto, faturaDeCobranca, faturaDePedido, notaDoCliente, ordenarFaturas, ordenarNotas,
  resumoFaturas, variantesDocumento,
} from "../_shared/faturas.ts";

const COLUNAS_COBRANCA = "id, unidade_id, descricao, valor, vencimento, status, invoice_url, boleto_url, pix_payload, linha_digitavel, pago_em, cliente_documento";
const COLUNAS_BOLETO = "id, unidade_id, instrucoes, valor, vencimento, status, pdf_url, pix_copia_cola, linha_digitavel";
const COLUNAS_NOTA = "id, unidade_id, numero, rps_numero, created_at, valor, descricao, status, pdf_url, xml_url";
const BUCKET_NFSE = "notas-fiscais";

type Admin = ReturnType<typeof adminClient>;

/** Notas autorizadas do cliente. Nunca lança: erro vai para o log e a lista volta vazia. */
async function notasDoCliente(admin: Admin, vinculos: Map<string, Set<string>>, cobrancaIds: string[]) {
  try {
    const consultas = [];
    for (const [unidadeId, docs] of vinculos) {
      const lista = [...new Set([...docs].flatMap(variantesDocumento))];
      if (!lista.length) continue;
      consultas.push(admin.from("notas_fiscais").select(COLUNAS_NOTA).eq("unidade_id", unidadeId)
        .in("tomador_documento", lista).eq("status", "autorizada").order("created_at", { ascending: false }).limit(40));
    }
    if (cobrancaIds.length) {
      consultas.push(admin.from("notas_fiscais").select(COLUNAS_NOTA).in("cobranca_id", cobrancaIds.slice(0, 150))
        .eq("status", "autorizada").order("created_at", { ascending: false }).limit(40));
    }
    const porId = new Map<string, NotaCliente>();
    for (const r of await Promise.all(consultas)) {
      if (r.error) throw new Error(r.error.message);
      for (const linha of r.data || []) {
        const nota = notaDoCliente(linha);
        if (nota) porId.set(nota.id, nota);
      }
    }
    const notas = ordenarNotas([...porId.values()]).slice(0, 40);
    return await Promise.all(notas.map(async (n) => {
      let xml_url: string | null = null;
      if (n.tem_xml && n.unidade_id) {
        const { data } = await admin.storage.from(BUCKET_NFSE).createSignedUrl(`${n.unidade_id}/${n.id}.xml`, 60 * 60);
        xml_url = data?.signedUrl ?? null;
      }
      const { tem_xml: _tem, ...resto } = n;
      return { ...resto, xml_url };
    }));
  } catch (e) {
    console.error("[minhas-faturas] notas:", (e as Error)?.message ?? e);
    return [];
  }
}

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

    // Cobranças do próprio cliente (por e-mail ou documento) → notas vinculadas a elas.
    const cobrancaIds = [...new Set([porEmail, ...porDocumento.filter((_, i) => i % 2 === 0)]
      .flatMap((r) => (r.data || []).map((c) => String(c.id))))];
    const notas = await notasDoCliente(admin, vinculos, cobrancaIds);

    const nomes = await nomesDasUnidades(admin, [...faturas.map((f) => f.unidade_id || ""), ...notas.map((n) => n.unidade_id || "")]);
    const unidadeDe = (id: string | null) => (id ? nomes.get(id) || "" : "");
    const comUnidade = faturas.map((f) => ({ ...f, unidade: unidadeDe(f.unidade_id) }));

    return json({
      faturas: comUnidade, resumo: resumoFaturas(faturas),
      notas: notas.map((n) => ({ ...n, unidade: unidadeDe(n.unidade_id) })),
    }, 200, req);
  } catch (e) {
    return erroInterno(req, "minhas-faturas", e);
  }
});
