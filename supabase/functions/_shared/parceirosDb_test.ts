// Testes com banco e rede imitados: nada chama Supabase, Asaas nem Resend.
import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import { avisarParceiro, lancarGarantia, regraDaUnidade, unidadeFiscalPlataforma } from "./parceirosDb.ts";
import { garantirCobranca } from "./cobrancas.ts";
import { credenciaisAsaas } from "./asaas.ts";

type Linha = Record<string, unknown>;

// Imitação do supabase-js com o que as funções usam (filtros eq/not is null,
// update/insert com índice único e rpc).
function bancoFalso(tabelas: Record<string, Linha[]>, unicos: Record<string, string[][]> = {}, rpc?: (n: string, a: Linha) => unknown) {
  const chamadasRpc: [string, Linha][] = [];
  const admin = {
    chamadasRpc,
    tabelas,
    rpc(nome: string, args: Linha) {
      chamadasRpc.push([nome, args]);
      return Promise.resolve({ data: rpc ? rpc(nome, args) : nome === 'unidade_publicavel' ? true : null, error: null });
    },
    from(tabela: string) {
      const linhasDa = () => (tabelas[tabela] ||= []);
      const filtros: ((l: Linha) => boolean)[] = [];
      let op: "select" | "update" | "insert" = "select";
      let patch: Linha = {};
      let limite = Infinity;
      const casam = () => linhasDa().filter((l) => filtros.every((f) => f(l)));
      const executar = () => {
        if (op === "update") {
          const alvo = casam();
          for (const l of alvo) Object.assign(l, patch);
          return { data: alvo.map((l) => ({ ...l })), error: null };
        }
        return { data: casam().slice(0, limite).map((l) => ({ ...l })), error: null };
      };
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => { filtros.push((l) => l[c] === v); return q; },
        not: (c: string, _op: string, _v: null) => { filtros.push((l) => l[c] !== null && l[c] !== undefined); return q; },
        limit: (n: number) => { limite = n; return q; },
        update: (p: Linha) => { op = "update"; patch = p; return q; },
        insert: (row: Linha) => {
          for (const cols of unicos[tabela] || []) {
            if (cols.every((c) => row[c] !== null && row[c] !== undefined)
              && linhasDa().some((l) => cols.every((c) => l[c] === row[c]))) {
              return Promise.resolve({ error: { code: "23505", message: "duplicate key" } });
            }
          }
          linhasDa().push({ id: crypto.randomUUID(), ...row });
          return Promise.resolve({ error: null });
        },
        maybeSingle: () => Promise.resolve({ data: (executar().data as Linha[])[0] ?? null, error: null }),
        then: (ok: (r: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(executar()).then(ok, erro),
      };
      return q;
    },
  };
  return admin;
}

const CONTA_PARCEIRA = {
  id: "fr_parc", nome: "Contábil Alfa", email: "dono@alfa.com.br", tipo: "parceiro", parceiro_percentual: 75,
  garantia_percentual: 10, asaas_wallet_id: "0f1e2d3c-aaaa-bbbb-cccc-1234567890ab", parceiro_status: "ativo",
  emails_aviso: ["aviso@alfa.com.br", "fin@alfa.com.br"],
};
const CONTA_PROPRIA = { id: "fr_cw", nome: "CAFEWORKING LTDA", email: "adm@cafeworking.com.br", tipo: "propria" };

const base = () => ({
  unidades: [{ id: "un_parc", franqueado_id: "fr_parc" }, { id: "un_cw", franqueado_id: "fr_cw" }],
  contas: [{ ...CONTA_PARCEIRA }, { ...CONTA_PROPRIA }] as Linha[],
  cobrancas: [] as Linha[],
  parceiro_garantias: [] as Linha[],
  notificacoes: [] as Linha[],
});
const UNICOS = { cobrancas: [["asaas_payment_id"]], parceiro_garantias: [["cobranca_id", "tipo"]] };

Deno.test("regraDaUnidade: parceira com split, própria sem, suspensa recusada", async () => {
  const db = base();
  const admin = bancoFalso(db);
  const r = await regraDaUnidade(admin, "un_parc");
  assert(r.parceiro && r.ok && r.split[0].percentualValue === 67.5);
  assertEquals(await regraDaUnidade(admin, "un_cw"), { parceiro: false });
  assertEquals(await regraDaUnidade(admin, "un_inexistente"), { parceiro: false });
  db.contas[0].parceiro_status = "suspenso";
  const s = await regraDaUnidade(admin, "un_parc");
  assert(s.parceiro && !s.ok && s.codigo === "PARCEIRO_INATIVO");
});

Deno.test('Publicação pendente bloqueia contratação nova, mas preserva cobrança operacional', async () => {
  const admin = bancoFalso(base(), {}, () => false);
  const operacional = await regraDaUnidade(admin, 'un_parc');
  assert(operacional.parceiro && operacional.ok);
  const nova = await regraDaUnidade(admin, 'un_parc', true);
  assert(nova.parceiro && !nova.ok);
});

Deno.test("credenciaisAsaas: unidade parceira usa a conta da CafeWorking, nunca a chave do parceiro", async () => {
  const antes = Deno.env.get("ASAAS_API_KEY");
  Deno.env.set("ASAAS_API_KEY", "$chave_da_plataforma");
  try {
    const cofre: Record<string, Linha> = { asaas_un_parc: { api_key: "$chave_do_parceiro", ambiente: "producao" } };
    const admin = bancoFalso(base(), {}, (_n, a) => cofre[String(a.p_ref)] ?? null);
    const cred = await credenciaisAsaas(admin, "un_parc");
    assertEquals(cred?.apiKey, "$chave_da_plataforma");
    assertEquals(admin.chamadasRpc.map(([, a]) => a.p_ref), ["asaas_plataforma"]);

    cofre.asaas_plataforma = { api_key: "$chave_plataforma_no_vault", ambiente: "sandbox" };
    const doVault = await credenciaisAsaas(admin, "un_parc");
    assertEquals([doVault?.apiKey, doVault?.baseUrl], ["$chave_plataforma_no_vault", "https://sandbox.asaas.com/api/v3"]);

    cofre.asaas_un_cw = { api_key: "$chave_da_unidade_propria", ambiente: "producao" };
    assertEquals((await credenciaisAsaas(admin, "un_cw"))?.apiKey, "$chave_da_unidade_propria");
  } finally {
    if (antes === undefined) Deno.env.delete("ASAAS_API_KEY"); else Deno.env.set("ASAAS_API_KEY", antes);
  }
});

Deno.test("garantirCobranca: unidade parceira grava a divisão e recalcula sobre o valor pago", async () => {
  const db = base();
  const admin = bancoFalso(db, UNICOS);
  const pay = { id: "pay_1", value: 100, dueDate: "2026-09-20", billingType: "PIX", customer: "cus_1" };
  await garantirCobranca(admin, pay, "pendente", { unidade_id: "un_parc", cliente: "Rui", descricao: "Fiscal · avulso" });
  const c = db.cobrancas[0];
  assertEquals(
    [c.parceiro_conta_id, c.split_parceiro_pct, c.split_garantia_pct, c.valor_bruto, c.valor_parceiro, c.valor_garantia, c.valor_repasse, c.valor_cafeworking],
    ["fr_parc", 75, 10, 100, 75, 7.5, 67.5, 25],
  );

  // a conta muda depois; o pagamento (com desconto no Asaas) usa o percentual congelado
  db.contas[0].parceiro_percentual = 50;
  await garantirCobranca(admin, { ...pay, value: 98 }, "pago", { unidade_id: "un_parc", cliente: "Rui" });
  assertEquals(db.cobrancas.length, 1);
  assertEquals(
    [c.status, c.valor_pago, c.valor_bruto, c.valor_parceiro, c.valor_garantia, c.valor_repasse, c.valor_cafeworking],
    ["pago", 98, 98, 73.5, 7.35, 66.15, 24.5],
  );
});

Deno.test("garantirCobranca: unidade própria não grava split", async () => {
  const db = base();
  const admin = bancoFalso(db, UNICOS);
  await garantirCobranca(admin, { id: "pay_cw", value: 149 }, "pago", { unidade_id: "un_cw", cliente: "Ana" });
  assertEquals(db.cobrancas[0].valor_pago, 149);
  assertFalse("parceiro_conta_id" in db.cobrancas[0]);
  assertFalse("valor_repasse" in db.cobrancas[0]);
});

Deno.test("garantirCobranca: fatura nova da assinatura usa o split da primeira fatura", async () => {
  const db = base();
  const admin = bancoFalso(db, UNICOS);
  await garantirCobranca(admin, { id: "pay_m1", value: 149, subscription: "sub_1" }, "pago", { unidade_id: "un_parc", cliente: "Rui" });
  db.contas[0].parceiro_percentual = 60; // mudou na conta, mas a assinatura no Asaas manda o split antigo
  await garantirCobranca(admin, { id: "pay_m2", value: 149, subscription: "sub_1" }, "pendente", { unidade_id: "un_parc", cliente: "Rui" });
  assertEquals(db.cobrancas.map((c) => c.split_parceiro_pct), [75, 75]);
  assertEquals(db.cobrancas[1].valor_parceiro, 111.75);
});

Deno.test("lancarGarantia: retenção uma vez por cobrança e estorno quando estornada", async () => {
  const db = base();
  const admin = bancoFalso(db, UNICOS);
  await garantirCobranca(admin, { id: "pay_g", value: 100 }, "pago", { unidade_id: "un_parc", cliente: "Rui" });
  assertEquals(await lancarGarantia(admin, "pay_g", "pago"), "garantia_retida");
  assertEquals(await lancarGarantia(admin, "pay_g", "pago"), "garantia_ja_lancada"); // PAYMENT_RECEIVED depois do CONFIRMED
  assertEquals(await lancarGarantia(admin, "pay_g", "vencido"), null);
  assertEquals(await lancarGarantia(admin, "pay_g", "estornado"), "garantia_estornada");
  assertEquals(await lancarGarantia(admin, "pay_g", "estornado"), "garantia_ja_lancada");
  assertEquals(db.parceiro_garantias.map((g) => [g.tipo, g.valor, g.conta_id, g.unidade_id]), [
    ["retencao", 7.5, "fr_parc", "un_parc"],
    ["estorno", 7.5, "fr_parc", "un_parc"],
  ]);

  // unidade própria e estorno sem retenção: nada
  await garantirCobranca(admin, { id: "pay_cw", value: 50 }, "pago", { unidade_id: "un_cw", cliente: "Ana" });
  assertEquals(await lancarGarantia(admin, "pay_cw", "pago"), null);
  await garantirCobranca(admin, { id: "pay_e", value: 80 }, "estornado", { unidade_id: "un_parc", cliente: "Rui" });
  assertEquals(await lancarGarantia(admin, "pay_e", "estornado"), null);
  assertEquals(db.parceiro_garantias.length, 2);
});

Deno.test("avisarParceiro: e-mail para a lista da conta; conta própria não recebe; nunca lança", async () => {
  const fetchOriginal = globalThis.fetch;
  const chaveAntes = Deno.env.get("RESEND_API_KEY");
  Deno.env.set("RESEND_API_KEY", "re_teste");
  const enviados: { to: string[]; subject: string; html: string }[] = [];
  globalThis.fetch = ((_url: string, init: RequestInit) => {
    enviados.push(JSON.parse(String(init.body)));
    return Promise.resolve(new Response(JSON.stringify({ id: "em_1" }), { status: 200 }));
  }) as typeof fetch;
  try {
    const db = base();
    const admin = bancoFalso(db);
    await avisarParceiro(admin, "un_cw", "Novo contrato: Fiscal", ["Cliente: Ana"], "https://app/?p=assinaturas");
    assertEquals(enviados.length, 0);

    await avisarParceiro(admin, "un_parc", "Novo contrato: Fiscal", ["Cliente: <b>Rui</b>"], "https://app/?p=assinaturas");
    assertEquals(enviados.map((e) => e.to[0]), ["aviso@alfa.com.br", "fin@alfa.com.br"]);
    assertEquals(enviados[0].subject, "[CafeWorking · Parceiros] Novo contrato: Fiscal");
    assertFalse(enviados[0].html.includes("<b>Rui</b>"));
    assertEquals(db.notificacoes.map((n) => [n.evento, n.status]), [["aviso_parceiro", "enviado"], ["aviso_parceiro", "enviado"]]);

    // sem lista: vai para o e-mail do master
    enviados.length = 0;
    db.contas[0].emails_aviso = [];
    await avisarParceiro(admin, "un_parc", "Reserva paga", [], "https://app/?p=reservas");
    assertEquals(enviados.map((e) => e.to[0]), ["dono@alfa.com.br"]);

    // falha de rede não derruba quem chamou
    globalThis.fetch = (() => Promise.reject(new Error("sem rede"))) as typeof fetch;
    await avisarParceiro(admin, "un_parc", "Cancelamento", [], "https://app/?p=assinaturas");
  } finally {
    globalThis.fetch = fetchOriginal;
    if (chaveAntes === undefined) Deno.env.delete("RESEND_API_KEY"); else Deno.env.set("RESEND_API_KEY", chaveAntes);
  }
});

Deno.test("unidade fiscal da plataforma vem do secret", () => {
  const antes = Deno.env.get("UNIDADE_FISCAL_PLATAFORMA");
  try {
    Deno.env.delete("UNIDADE_FISCAL_PLATAFORMA");
    assertEquals(unidadeFiscalPlataforma(), null);
    Deno.env.set("UNIDADE_FISCAL_PLATAFORMA", "  un_cw ");
    assertEquals(unidadeFiscalPlataforma(), "un_cw");
  } finally {
    if (antes === undefined) Deno.env.delete("UNIDADE_FISCAL_PLATAFORMA"); else Deno.env.set("UNIDADE_FISCAL_PLATAFORMA", antes);
  }
});
