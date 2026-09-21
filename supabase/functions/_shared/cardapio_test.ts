import { assertEquals } from "jsr:@std/assert@1";
import { produtoPublico } from "./cardapio.ts";

Deno.test("cardápio expõe somente campos públicos", () => {
  const p = produtoPublico({ id: "p1", tipo: "produto", publicarNoSite: true, nome: "Cappuccino", categoria: "Café", preco: 12, custo: 3, ficha: [{ nome: "leite" }], foto: "https://cdn.exemplo/foto.webp" }, "u1");
  assertEquals(p, { id: "p1", unidade_id: "u1", nome: "Cappuccino", categoria: "Café", preco: 12, emoji: "☕", foto: "https://cdn.exemplo/foto.webp" });
});

Deno.test("cardápio não publica serviço, inativo ou foto embutida", () => {
  assertEquals(produtoPublico({ tipo: "servico", nome: "Sala", preco: 10 }, "u1"), null);
  assertEquals(produtoPublico({ tipo: "produto", ativo: false, publicarNoSite: true, nome: "Café", preco: 7 }, "u1"), null);
  assertEquals(produtoPublico({ tipo: "produto", nome: "Caneta", preco: 3 }, "u1"), null);
  assertEquals(produtoPublico({ id: "p2", tipo: "produto", publicarNoSite: true, nome: "Café", preco: 7, foto: "data:image/png;base64,secreta" }, "u1")?.foto, "");
});
