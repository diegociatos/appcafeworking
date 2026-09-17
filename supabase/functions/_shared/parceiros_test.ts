import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  camposDaDivisao, descricaoNotaCafeWorking, destinatariosAvisoParceiro, divisaoDoValor, linhaValorParceiro,
  percentualImediato, regraDeVenda, snapshotDaCobranca, snapshotDaConta, valorNotaCafeWorking,
} from "./parceiros.ts";

const PARCEIRO = {
  id: "fr_parc", nome: "Contábil Alfa", email: "Dono@Alfa.com.br", tipo: "parceiro",
  parceiro_percentual: 75, garantia_percentual: 10, asaas_wallet_id: "0f1e2d3c-aaaa-bbbb-cccc-1234567890ab",
  parceiro_status: "ativo", emails_aviso: [],
};

Deno.test("percentual imediato: 75 × 0,90 = 67,5", () => {
  assertEquals(percentualImediato(75, 10), 67.5);
  assertEquals(percentualImediato(75, 0), 75);
  assertEquals(percentualImediato(70, 12.5), 61.25);
  assertThrows(() => percentualImediato(0, 10));
  assertThrows(() => percentualImediato(100, 10));
  assertThrows(() => percentualImediato(75, 100));
});

Deno.test("divisão de R$ 100: 75 / 7,50 / 67,50 / 25", () => {
  assertEquals(divisaoDoValor(100, 75, 10), { bruto: 100, parceiro: 75, garantia: 7.5, repasse: 67.5, cafeworking: 25 });
});

Deno.test("divisão fecha ao centavo em valores quebrados", () => {
  for (const v of [99.9, 149, 1609.2, 0.01, 0.03, 33.33, 1285.2, 12345.67]) {
    for (const [p, g] of [[75, 10], [70, 12.5], [80, 0], [66.67, 15]]) {
      const d = divisaoDoValor(v, p, g);
      const c = (n: number) => Math.round(n * 100);
      assertEquals(c(d.bruto), c(v), `bruto ${v}`);
      assertEquals(c(d.parceiro) + c(d.cafeworking), c(d.bruto), `bruto = parceiro + cafeworking (${v}, ${p}, ${g})`);
      assertEquals(c(d.garantia) + c(d.repasse), c(d.parceiro), `parceiro = garantia + repasse (${v}, ${p}, ${g})`);
      assert(d.repasse >= 0 && d.garantia >= 0 && d.cafeworking >= 0);
    }
  }
  assertEquals(divisaoDoValor(99.9, 75, 10), { bruto: 99.9, parceiro: 74.93, garantia: 7.49, repasse: 67.44, cafeworking: 24.97 });
  assertEquals(divisaoDoValor(0, 75, 10).bruto, 0);
  assertEquals(divisaoDoValor("abc", 75, 10).parceiro, 0);
});

Deno.test("regra de venda: conta própria vende sem split", () => {
  assertEquals(regraDeVenda({ tipo: "propria" }), { parceiro: false });
  assertEquals(regraDeVenda(null), { parceiro: false });
  assertEquals(regraDeVenda(undefined), { parceiro: false });
});

Deno.test("regra de venda: parceiro ativo com carteira manda o split de 67,5%", () => {
  const r = regraDeVenda(PARCEIRO);
  assert(r.parceiro && r.ok);
  if (!r.parceiro || !r.ok) return;
  assertEquals(r.split, [{ walletId: "0f1e2d3c-aaaa-bbbb-cccc-1234567890ab", percentualValue: 67.5 }]);
  assertEquals(r.snapshot, { contaId: "fr_parc", walletId: "0f1e2d3c-aaaa-bbbb-cccc-1234567890ab", parceiroPct: 75, garantiaPct: 10 });
  // percentuais vindos do banco como texto (numeric)
  const txt = regraDeVenda({ ...PARCEIRO, parceiro_percentual: "75.00", garantia_percentual: "10.00" });
  assert(txt.parceiro && txt.ok && txt.split[0].percentualValue === 67.5);
});

Deno.test("regra de venda: parceiro sem carteira ou fora de 'ativo' é recusado", () => {
  for (const status of ["em_analise", "suspenso", "encerrado", null]) {
    const r = regraDeVenda({ ...PARCEIRO, parceiro_status: status });
    assert(r.parceiro && !r.ok && r.codigo === "PARCEIRO_INATIVO", String(status));
  }
  for (const wallet of [null, "", "   "]) {
    const r = regraDeVenda({ ...PARCEIRO, asaas_wallet_id: wallet });
    assert(r.parceiro && !r.ok && r.codigo === "PARCEIRO_SEM_CARTEIRA");
  }
  const r = regraDeVenda({ ...PARCEIRO, parceiro_percentual: 120 });
  assert(r.parceiro && !r.ok && r.codigo === "PARCEIRO_PERCENTUAL_INVALIDO");
});

Deno.test("colunas da cobrança e snapshot de volta", () => {
  const s = snapshotDaConta(PARCEIRO)!;
  const campos = camposDaDivisao(s, 149);
  assertEquals(campos, {
    parceiro_conta_id: "fr_parc", asaas_wallet_id: "0f1e2d3c-aaaa-bbbb-cccc-1234567890ab",
    split_parceiro_pct: 75, split_garantia_pct: 10,
    valor_bruto: 149, valor_parceiro: 111.75, valor_garantia: 11.18, valor_repasse: 100.57, valor_cafeworking: 37.25,
  });
  assertEquals(snapshotDaCobranca(campos), s);
  assertEquals(camposDaDivisao(null, 149), {});
  assertEquals(camposDaDivisao(s, 0), {});
  assertEquals(snapshotDaConta({ tipo: "propria", id: "x" }), null);
  // percentual já congelado vale mesmo se a conta mudar depois
  assertEquals(camposDaDivisao(snapshotDaCobranca({ ...campos, split_parceiro_pct: "70.00" }), 100).valor_parceiro, 70);
  assertEquals(snapshotDaCobranca({ valor: 10 }), null);
});

Deno.test("nota da CafeWorking: só a parte dela sobre o valor pago", () => {
  const cob = { ...camposDaDivisao(snapshotDaConta(PARCEIRO), 100), valor: 100, valor_pago: 98, descricao: "Endereço Fiscal · assinatura" };
  assertEquals(valorNotaCafeWorking(cob), 24.5);
  assertEquals(valorNotaCafeWorking({ ...cob, valor_pago: null }), 25);
  assertEquals(valorNotaCafeWorking({ valor: 100 }), 0);
  assertEquals(descricaoNotaCafeWorking(cob), "Intermediação e plataforma CafeWorking — Endereço Fiscal");
  assertEquals(descricaoNotaCafeWorking({}), "Intermediação e plataforma CafeWorking — serviço contratado");
});

Deno.test("destinatários do aviso: lista da conta ou e-mail do master", () => {
  assertEquals(destinatariosAvisoParceiro(PARCEIRO), ["dono@alfa.com.br"]);
  assertEquals(
    destinatariosAvisoParceiro({ ...PARCEIRO, emails_aviso: [" Aviso@Alfa.com.br", "aviso@alfa.com.br", "invalido", "fin@alfa.com.br"] }),
    ["aviso@alfa.com.br", "fin@alfa.com.br"],
  );
  assertEquals(destinatariosAvisoParceiro({ tipo: "parceiro" }), []);
  assertEquals(destinatariosAvisoParceiro(null), []);
});

Deno.test("linha de valor do aviso mostra a parte do parceiro", () => {
  assertEquals(linhaValorParceiro(100, PARCEIRO), "Valor: R$ 100,00 · sua parte R$ 75,00 (repasse R$ 67,50 + garantia R$ 7,50)");
  assertEquals(linhaValorParceiro(100, { tipo: "propria" }), "Valor: R$ 100,00");
});
