import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { montarCompra, produtosDaAreaCliente } from "./lojaCliente.ts";

const linhas = [
  { item_id: "cafe", doc: { tipo: "produto", ativo: true, venderNoAppCliente: true, publicarNoSite: false, nome: "Café", categoria: "Café", preco: 7, foto: "https://img/cafe.jpg" } },
  { item_id: "lapis", doc: { tipo: "produto", ativo: true, venderNoAppCliente: true, nome: "Lápis", categoria: "Papelaria", preco: 3 } },
  { item_id: "site", doc: { tipo: "produto", ativo: true, publicarNoSite: true, venderNoAppCliente: false, nome: "Só no site", preco: 5 } },
  { item_id: "servico", doc: { tipo: "servico", ativo: true, venderNoAppCliente: true, nome: "Sala", preco: 50 } },
];

Deno.test("loja do cliente mostra somente produtos liberados para esse canal", () => {
  assertEquals(produtosDaAreaCliente(linhas).map((p) => p.id), ["cafe", "lapis"]);
});

Deno.test("compra usa preço do servidor e valida quantidade", () => {
  const produtos = produtosDaAreaCliente(linhas);
  assertEquals(montarCompra(produtos, [{ id: "cafe", quantidade: 2 }, { id: "lapis", quantidade: 1 }]).total, 17);
  assertThrows(() => montarCompra(produtos, [{ id: "site", quantidade: 1 }]), Error, "ITEM_INVALIDO");
  assertThrows(() => montarCompra(produtos, [{ id: "cafe", quantidade: 0 }]), Error, "ITEM_INVALIDO");
});
