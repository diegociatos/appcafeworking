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

Deno.test("renovacao_anual avisa data, valor e como cancelar", () => {
  const m = renderTemplate("renovacao_anual", {
    cliente: "Mariana", email: "m@exemplo.com", plano: "Fiscal Pro", unidade: "Luxemburgo", valor: 1609.2, data: "2027-09-14",
  });
  assertStringIncludes(m.assunto, "14/09/2027");
  assertStringIncludes(m.html, "R$ 1.609,20");
  assertStringIncludes(m.html, "Gerenciar meu plano");
  assertStringIncludes(m.html, "sem nenhum custo");
});

Deno.test("cancelamento_confirmado: arrependimento com reembolso e endereço fiscal com prazo de retirada", () => {
  const arrep = renderTemplate("cancelamento_confirmado", {
    cliente: "Rui", email: "r@exemplo.com", plano: "Fiscal Pro", tipo: "arrependimento", cancelaEm: "2026-09-20",
    reembolso: "automatico", requerAcerto: false, categoria: "endereco_fiscal",
  });
  assertStringIncludes(arrep.html, "devolução integral");
  assertStringIncludes(arrep.html, "30 dias");
  const aviso = renderTemplate("cancelamento_confirmado", {
    cliente: "Rui", email: "r@exemplo.com", plano: "Coworking", tipo: "aviso_previo", cancelaEm: "2026-10-31",
    reembolso: "nenhum", requerAcerto: true, categoria: "coworking",
  });
  assertStringIncludes(aviso.html, "31/10/2026");
  assertStringIncludes(aviso.html, "acerto");
  assertEquals(aviso.html.includes("Receita Federal"), false);
});

Deno.test("documentos_aprovados e documentos_reprovados", () => {
  const ok = renderTemplate("documentos_aprovados", { cliente: "Ana", email: "a@exemplo.com", plano: "Fiscal Pro" });
  assertStringIncludes(ok.assunto, "aprovados");
  const nao = renderTemplate("documentos_reprovados", {
    cliente: "Ana", email: "a@exemplo.com", plano: "Fiscal Pro", parecer: "Atividade <industrial>", reembolso: "manual",
  });
  assertStringIncludes(nao.html, "Atividade &lt;industrial&gt;");
  assertStringIncludes(nao.html, "equipe");
});

Deno.test("aviso_equipe lista as linhas escapadas", () => {
  const m = renderTemplate("aviso_equipe", { email: "equipe@x.com", assunto: "Cancelamento", linhas: ["Cliente: <b>Rui</b>", "Plano: Pro"] });
  assertEquals(m.assunto, "[CafeWorking] Cancelamento");
  assertStringIncludes(m.html, "Cliente: &lt;b&gt;Rui&lt;/b&gt;");
});

Deno.test("assinatura_ativa não deixa o nome digitado virar HTML", () => {
  const m = renderTemplate("assinatura_ativa", {
    cliente: "<img src=x onerror=alert(1)>", email: "x@exemplo.com", plano: "Fiscal", unidade: "Lux", categoria: null, linkSenha: "",
  });
  assertEquals(m.html.includes("<img src=x"), false);
  assertStringIncludes(m.html, "&lt;img");
});

Deno.test("assinatura_ativa com abertura e certificado explica os próximos passos", () => {
  const m = renderTemplate("assinatura_ativa", {
    cliente: "Ana", email: "a@exemplo.com", plano: "Fiscal Pro + Certificado", unidade: "Luxemburgo",
    categoria: "endereco_fiscal", linkSenha: "", abertura: true, certificado: true,
  });
  assertStringIncludes(m.html, "Abertura da empresa");
  assertStringIncludes(m.html, "pagas à parte");
  assertStringIncludes(m.html, "e-CNPJ A1");
  assertStringIncludes(m.html, "futuros sócios");
});

Deno.test("assinatura_ativa da abertura avulsa não pede cartão CNPJ", () => {
  const m = renderTemplate("assinatura_ativa", {
    cliente: "Ana", email: "a@exemplo.com", plano: "Abertura de empresa", unidade: "Luxemburgo",
    categoria: "abertura_empresa", linkSenha: "", abertura: true, certificado: false,
  });
  assertStringIncludes(m.html, "Abertura da empresa");
  assertEquals(m.html.includes("cartão CNPJ"), false);
  assertEquals(m.html.includes("e-CNPJ"), false);
});