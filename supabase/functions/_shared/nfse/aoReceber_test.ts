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
