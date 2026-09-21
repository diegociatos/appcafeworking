import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { asaas, credenciaisAsaas, pixDoPagamento } from "../_shared/asaas.ts";
import { regraDaUnidade } from "../_shared/parceirosDb.ts";
import { camposDaDivisao } from "../_shared/parceiros.ts";
import { comSplit, hojeBRT } from "../_shared/venda.ts";
import { dispatchNotificacao } from "../_shared/notify/index.ts";

const somarDias = (iso: string, dias: number) => {
  const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10);
};

Deno.serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405, req);
  const segredo = Deno.env.get("CRON_SECRET") || Deno.env.get("ROTINA_DIARIA_TOKEN") || "";
  const tokenRecebido = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || req.headers.get("x-rotina-token") || "";
  if (!segredo || tokenRecebido !== segredo) return json({ error: "Não autorizado" }, 401, req);
  const admin = adminClient();
  const body = await req.json().catch(() => ({}));
  const hoje = hojeBRT();
  const competenciaInformada = /^\d{4}-\d{2}$/.test(body?.competencia || "");
  const competencia = competenciaInformada ? body.competencia : hoje.slice(0, 7);
  // A automação pode rodar diariamente: sem competência manual, só fecha no último dia do mês.
  if (!competenciaInformada && somarDias(hoje, 1).slice(0, 7) === competencia) {
    return json({ competencia, resultados: [], status: "fora_do_fechamento" }, 200, req);
  }
  const { data: abertos, error } = await admin.from("consumos_cafeteria").select("*").eq("competencia", competencia).eq("status", "aberto");
  if (error) return json({ error: error.message }, 500, req);
  const grupos = new Map<string, typeof abertos>();
  for (const c of abertos || []) {
    const k = `${c.unidade_id}|${c.cliente_id}`;
    grupos.set(k, [...(grupos.get(k) || []), c]);
  }
  const resultados = [];
  for (const consumos of grupos.values()) {
    const primeiro = consumos[0];
    const valor = Math.round(consumos.reduce((s, c) => s + Number(c.valor), 0) * 100) / 100;
    const { data: fechamento, error: claimErr } = await admin.from("fechamentos_cafeteria").insert({
      unidade_id: primeiro.unidade_id, cliente_id: primeiro.cliente_id, competencia, valor,
    }).select("id").single();
    if (claimErr?.code === "23505") { resultados.push({ cliente_id: primeiro.cliente_id, status: "ja_fechado" }); continue; }
    if (claimErr || !fechamento) { resultados.push({ cliente_id: primeiro.cliente_id, status: "erro", erro: claimErr?.message }); continue; }
    try {
      const { data: cliente } = await admin.from("clientes").select("nome, documento, email").eq("id", primeiro.cliente_id).single();
      const doc = String(cliente?.documento || "").replace(/\D/g, "");
      if (!cliente || ![11, 14].includes(doc.length)) throw new Error("Cliente sem CPF/CNPJ válido");
      const regra = await regraDaUnidade(admin, primeiro.unidade_id);
      if (regra.parceiro && !regra.ok) throw new Error(regra.erro);
      const cred = await credenciaisAsaas(admin, primeiro.unidade_id);
      if (!cred) throw new Error("Asaas não configurado");
      const customer = await asaas(cred, "/customers", "POST", { name: cliente.nome, cpfCnpj: doc, email: cliente.email });
      const descricao = `Consumo CafeWorking · ${competencia}`;
      const pay = await asaas(cred, "/payments", "POST", comSplit({
        customer: customer.id, billingType: "UNDEFINED", value: valor,
        dueDate: somarDias(hojeBRT(), 5), description: descricao,
      }, regra.parceiro && regra.ok ? regra.split : null));
      const pix = await pixDoPagamento(cred, pay.id);
      const { data: cobranca, error: cobErr } = await admin.from("cobrancas").insert({
        unidade_id: primeiro.unidade_id, cliente: cliente.nome, cliente_documento: doc, cliente_email: cliente.email,
        valor, vencimento: somarDias(hojeBRT(), 5), descricao, tipo: "UNDEFINED", gateway: "asaas",
        asaas_customer_id: customer.id, asaas_payment_id: pay.id, status: "pendente",
        invoice_url: pay.invoiceUrl || null, boleto_url: pay.bankSlipUrl || null, pix_payload: pix.payload || null,
        origem: "cafeteria_mensal", ...camposDaDivisao(regra.parceiro && regra.ok ? regra.snapshot : null, valor),
      }).select("id").single();
      if (cobErr) throw new Error(cobErr.message);
      await admin.from("consumos_cafeteria").update({ status: "faturado", cobranca_id: cobranca.id, faturado_em: new Date().toISOString() })
        .in("id", consumos.map((c) => c.id)).eq("status", "aberto");
      await admin.from("fechamentos_cafeteria").update({ status: "faturado", cobranca_id: cobranca.id }).eq("id", fechamento.id);
      await dispatchNotificacao(admin, {
        unidade_id: primeiro.unidade_id, evento: "cobranca_nova", email: cliente.email, cliente: cliente.nome,
        dados: { valor, vencimento: somarDias(hojeBRT(), 5), descricao, invoiceUrl: pay.invoiceUrl, pdfUrl: pay.bankSlipUrl, pixCopiaCola: pix.payload },
      });
      resultados.push({ cliente_id: primeiro.cliente_id, status: "faturado", valor });
    } catch (e) {
      await admin.from("fechamentos_cafeteria").update({ status: "erro", erro: String((e as Error).message).slice(0, 500) }).eq("id", fechamento.id);
      resultados.push({ cliente_id: primeiro.cliente_id, status: "erro", erro: (e as Error).message });
    }
  }
  return json({ competencia, resultados }, 200, req);
});
