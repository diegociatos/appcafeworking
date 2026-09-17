import { assertEquals } from "jsr:@std/assert@1";
import { avaliarEmissaoAoReceber, descricaoDaNota, pedidoDaCobranca, valorDaNota } from "./aoReceber.ts";

const CONFIG = { emitir_ao_receber: true, emissao_ativa: true, ambiente: "producao", descricao_servico: "Locação de espaço" };
const PAGA = {
  id: "c1", unidade_id: "un", status: "pago", cliente: "Cliente X", cliente_documento: "111.222.333-44",
  cliente_email: "x@teste.local", valor: "119.00", valor_pago: "119.00", descricao: "Endereço Fiscal · assinatura",
  nota_id: null, nota_status: null,
};

Deno.test("ao receber: desligado por padrão e sem aviso", () => {
  assertEquals(avaliarEmissaoAoReceber({ ...CONFIG, emitir_ao_receber: false }, PAGA).acao, "ignorar");
  assertEquals(avaliarEmissaoAoReceber({ ...CONFIG, emitir_ao_receber: undefined }, PAGA).acao, "ignorar");
  assertEquals(avaliarEmissaoAoReceber(null, PAGA).acao, "ignorar");
});

Deno.test("ao receber: idempotente — cobrança com nota ou já tentada não emite de novo", () => {
  assertEquals(avaliarEmissaoAoReceber(CONFIG, { ...PAGA, nota_id: "n1" }).acao, "ignorar");
  assertEquals(avaliarEmissaoAoReceber(CONFIG, { ...PAGA, nota_status: "emitindo" }).acao, "ignorar");
  assertEquals(avaliarEmissaoAoReceber(CONFIG, { ...PAGA, nota_status: "erro" }).acao, "ignorar");
  assertEquals(avaliarEmissaoAoReceber(CONFIG, { ...PAGA, status: "pendente" }).acao, "ignorar");
  assertEquals(avaliarEmissaoAoReceber(CONFIG, null).acao, "ignorar");
});

Deno.test("ao receber: ligado mas sem condição avisa a equipe", () => {
  const motivo = (cfg: Record<string, unknown>, cob: Record<string, unknown>) => {
    const a = avaliarEmissaoAoReceber(cfg, cob);
    return a.acao === "recusar" ? a.motivo : a.acao;
  };
  assertEquals(motivo({ ...CONFIG, emissao_ativa: false }, PAGA), "A emissão fiscal está inativa na unidade.");
  assertEquals(motivo({ ...CONFIG, ambiente: "homologacao" }, PAGA), "A emissão automática só funciona com o ambiente fiscal em Produção.");
  assertEquals(avaliarEmissaoAoReceber(CONFIG, { ...PAGA, cliente_documento: "" }).acao, "recusar");
  assertEquals(avaliarEmissaoAoReceber(CONFIG, { ...PAGA, cliente_documento: "123" }).acao, "recusar");
  assertEquals(avaliarEmissaoAoReceber(CONFIG, { ...PAGA, valor_pago: null, valor: 0 }).acao, "recusar");
  assertEquals(avaliarEmissaoAoReceber(CONFIG, PAGA).acao, "emitir");
});

Deno.test("ao receber: valor pago, descrição do plano e tomador da cobrança", () => {
  assertEquals(valorDaNota({ valor: "150", valor_pago: "149.9" }), 149.9);
  assertEquals(valorDaNota({ valor: "150", valor_pago: null }), 150);
  assertEquals(descricaoDaNota({ descricao: "  " }, CONFIG), "Locação de espaço");
  const p = pedidoDaCobranca(PAGA, { nome: "Outro nome", cep: "30000-000", endereco: "Rua A", numero: "10", bairro: "Centro", cidade: "Belo Horizonte", uf: "MG" }, CONFIG);
  assertEquals([p.tomador, p.tomador_documento, p.tomador_email, p.valor, p.descricao, p.cobranca_id], ["Cliente X", "11122233344", "x@teste.local", 119, "Endereço Fiscal · assinatura", "c1"]);
  assertEquals([p.tomador_cep, p.tomador_logradouro, p.tomador_uf], ["30000-000", "Rua A", "MG"]);
  assertEquals(pedidoDaCobranca({ ...PAGA, cliente_email: null }, null, CONFIG).tomador_email, undefined);
});

Deno.test("ao receber: unidade parceira emite só a parte da CafeWorking, pela config da CafeWorking", () => {
  const PARCEIRA = {
    ...PAGA, unidade_id: "un_parceira", valor: "100.00", valor_pago: "100.00",
    parceiro_conta_id: "fr_parc", asaas_wallet_id: "w-123456789", split_parceiro_pct: "75.00", split_garantia_pct: "10.00",
    valor_bruto: "100.00", valor_parceiro: "75.00", valor_garantia: "7.50", valor_repasse: "67.50", valor_cafeworking: "25.00",
  };
  const CONFIG_CW = { ...CONFIG, unidade_id: "un_cafeworking" };
  assertEquals(valorDaNota(PARCEIRA), 25);
  assertEquals(valorDaNota({ ...PARCEIRA, valor_pago: "80.00" }), 20);
  assertEquals(descricaoDaNota(PARCEIRA, CONFIG_CW), "Intermediação e plataforma CafeWorking — Endereço Fiscal");
  assertEquals(avaliarEmissaoAoReceber(CONFIG_CW, PARCEIRA).acao, "emitir");
  const p = pedidoDaCobranca(PARCEIRA, null, CONFIG_CW);
  assertEquals([p.unidade_id, p.valor, p.descricao, p.cobranca_id], ["un_cafeworking", 25, "Intermediação e plataforma CafeWorking — Endereço Fiscal", "c1"]);
  // unidade própria continua com a unidade da cobrança e o valor cheio
  assertEquals(pedidoDaCobranca(PAGA, null, CONFIG_CW).unidade_id, "un");
  assertEquals(pedidoDaCobranca(PAGA, null, CONFIG_CW).valor, 119);
});
