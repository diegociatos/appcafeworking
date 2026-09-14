import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { renderTemplate } from "./templates.ts";

Deno.test("assinatura_ativa com link manda criar a senha", () => {
  const m = renderTemplate("assinatura_ativa", {
    cliente: "Mariana", email: "m@exemplo.com", plano: "Fiscal Pro", unidade: "Luxemburgo",
    categoria: "endereco_fiscal", linkSenha: "https://auth.exemplo/verify?token=1&type=recovery",
  });
  assertEquals(m.para, "m@exemplo.com");
  assertStringIncludes(m.assunto, "Fiscal Pro");
  assertStringIncludes(m.html, "Criar minha senha");
  assertStringIncludes(m.html, "https://auth.exemplo/verify?token=1&amp;type=recovery");
  assertStringIncludes(m.html, "cartão CNPJ");
});

Deno.test("assinatura_ativa sem link manda entrar e não fala de documentos fora do endereço fiscal", () => {
  const m = renderTemplate("assinatura_ativa", {
    cliente: "Rui", email: "r@exemplo.com", plano: "Coworking Flex", unidade: "Estoril", categoria: "coworking", linkSenha: "",
  });
  assertStringIncludes(m.html, "Entrar na área do cliente");
  assertEquals(m.html.includes("cartão CNPJ"), false);
});

Deno.test("assinatura_ativa não deixa o nome digitado virar HTML", () => {
  const m = renderTemplate("assinatura_ativa", {
    cliente: "<img src=x onerror=alert(1)>", email: "x@exemplo.com", plano: "Fiscal", unidade: "Lux", categoria: null, linkSenha: "",
  });
  assertEquals(m.html.includes("<img src=x"), false);
  assertStringIncludes(m.html, "&lt;img");
});
