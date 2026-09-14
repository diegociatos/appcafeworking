import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import { ordenarPlanos, planoPublico, visivelNoSite } from "./catalogo.ts";

const base = {
  id: "pl_1", nome: "Fiscal Pro", preco: 149, recorrencia: "mensal", emiteNF: true, ativo: true,
  categoria: "endereco_fiscal", venderNoSite: true, prazoMinimoMeses: 6, destaque: " Mais procurado ",
  beneficios: ["Digitalização inclusa", " ", "Notificação por WhatsApp"], ordem: 2,
  direitos: { horasReuniao: 2 },
};

Deno.test("plano mensal com preço ganha preço anual do desconto da unidade", () => {
  const p = planoPublico(base, "un_lux", 10);
  assertEquals(p.preco, 149);
  assertEquals(p.precoAnual, 1609.2);
  assertEquals(p.descontoAnualPct, 10);
  assertEquals(p.destaque, "Mais procurado");
  assertEquals(p.beneficios, ["Digitalização inclusa", "Notificação por WhatsApp"]);
  assertEquals(p.unidade_id, "un_lux");
  assert(visivelNoSite(p));
});

Deno.test("sob consulta não expõe preço e continua visível no site", () => {
  const p = planoPublico({ ...base, sobConsulta: true, preco: 0 }, "un_lux", 10);
  assertEquals(p.preco, null);
  assertEquals(p.precoAnual, null);
  assert(p.sobConsulta);
  assert(visivelNoSite(p));
});

Deno.test("fica fora do site sem publicar, sem categoria ou sem preço", () => {
  assertFalse(visivelNoSite(planoPublico({ ...base, venderNoSite: false }, "u", 10)));
  assertFalse(visivelNoSite(planoPublico({ ...base, categoria: "qualquer" }, "u", 10)));
  assertFalse(visivelNoSite(planoPublico({ ...base, preco: 0 }, "u", 10)));
});

Deno.test("avulso não tem preço anual", () => {
  assertEquals(planoPublico({ ...base, recorrencia: "avulso" }, "u", 10).precoAnual, null);
});

Deno.test("plano antigo, sem os campos da vitrine, continua igual para o autocadastro", () => {
  const p = planoPublico({ id: "pl_old", nome: "Endereço Fiscal", preco: 119, recorrencia: "mensal", emiteNF: true }, "u", 10);
  assertEquals(p.preco, 119);
  assertEquals(p.categoria, null);
  assertEquals(p.beneficios, []);
  assertEquals(p.ordem, 999);
  assertFalse(p.sobConsulta);
  assertFalse(visivelNoSite(p));
});

Deno.test("ordem manda; empate vai por preço, sob consulta por último", () => {
  const a = planoPublico({ ...base, id: "a", ordem: 1, preco: 299 }, "u", 10);
  const b = planoPublico({ ...base, id: "b", ordem: 2, preco: 119 }, "u", 10);
  const c = planoPublico({ ...base, id: "c", ordem: 999, preco: 0, sobConsulta: true }, "u", 10);
  const d = planoPublico({ ...base, id: "d", ordem: 999, preco: 50 }, "u", 10);
  assertEquals([c, d, b, a].sort(ordenarPlanos).map((p) => p.id), ["a", "b", "d", "c"]);
});
