// deno test --allow-env supabase/functions/_shared/parceiroCandidatura_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  checklistDoParceiro, nomeDaUnidadeParceira, nomeDeCidade, pendenciasDoParceiro, resumoDaCandidatura,
  rotuloServico, slugDaCidade, validarCandidatura,
} from "./parceiroCandidatura.ts";

const BASE = {
  escritorio: "Mendes Contabilidade LTDA",
  documento: "20.351.761/0001-03",
  responsavel: "Ana Mendes",
  email: "ANA@MENDES.com.br ",
  whatsapp: "(31) 99712-9789",
  cidade: "  belo   horizonte ",
  uf: "mg",
  endereco: "Rua Guaicuí, 715, sala 3, Luxemburgo",
  servicos: ["endereco_fiscal", "sala_reuniao", "endereco_fiscal", "voar"],
  salas: "3",
  observacoes: "  ",
  aceite: true,
};

Deno.test("candidatura válida: limpa, deduplica serviços e deduz o tipo de pessoa", () => {
  const r = validarCandidatura({ ...BASE });
  assert(r.ok);
  if (!r.ok) return;
  assertEquals(r.dados.documento, "20351761000103");
  assertEquals(r.dados.tipo_pessoa, "PJ");
  assertEquals(r.dados.email, "ana@mendes.com.br");
  assertEquals(r.dados.cidade, "Belo Horizonte");
  assertEquals(r.dados.uf, "MG");
  assertEquals(r.dados.servicos, ["endereco_fiscal", "sala_reuniao"]);
  assertEquals(r.dados.salas, 3);
  assertEquals(r.dados.observacoes, null);
});

Deno.test("CPF no lugar do CNPJ vira pessoa física", () => {
  const r = validarCandidatura({ ...BASE, documento: "529.982.247-25" });
  assert(r.ok);
  if (!r.ok) return;
  assertEquals(r.dados.tipo_pessoa, "PF");
  assertEquals(r.dados.documento, "52998224725");
});

Deno.test("recusa campo a campo, com mensagem em português", () => {
  const casos: [Record<string, unknown>, RegExp][] = [
    [{ escritorio: "" }, /nome do escritório/i],
    [{ documento: "123" }, /CNPJ ou CPF/i],
    [{ responsavel: "Jo" }, /respons/i],
    [{ email: "ana@" }, /e-mail/i],
    [{ whatsapp: "9971" }, /WhatsApp/i],
    [{ cidade: "" }, /cidade/i],
    [{ uf: "XX" }, /UF/i],
    [{ endereco: "Rua 1" }, /endereço completo/i],
    [{ servicos: [] }, /ao menos um serviço/i],
    [{ salas: 5000 }, /quantas salas/i],
    [{ aceite: false }, /contrato de parceria/i],
  ];
  for (const [patch, esperado] of casos) {
    const r = validarCandidatura({ ...BASE, ...patch });
    assertEquals(r.ok, false, `deveria recusar ${JSON.stringify(patch)}`);
    if (!r.ok) assert(esperado.test(r.erro), `mensagem "${r.erro}" não bate com ${esperado}`);
  }
});

Deno.test("formulário vazio não quebra", () => {
  assertEquals(validarCandidatura(null).ok, false);
  assertEquals(validarCandidatura(undefined).ok, false);
});

Deno.test("nome da cidade e da unidade", () => {
  assertEquals(nomeDeCidade("SÃO joão DEL rei"), "São João del Rei");
  assertEquals(nomeDaUnidadeParceira("uberlândia"), "CafeWorking Uberlândia");
  assertEquals(nomeDaUnidadeParceira(""), "CafeWorking Unidade");
});

Deno.test("slug da cidade serve de endereço no site", () => {
  assertEquals(slugDaCidade("Belo Horizonte", "MG"), "belo-horizonte-mg");
  assertEquals(slugDaCidade("São João del Rei", "mg"), "sao-joao-del-rei-mg");
  assertEquals(slugDaCidade("", ""), "");
});

Deno.test("resumo tem tudo que a equipe precisa ler no e-mail", () => {
  const r = validarCandidatura({ ...BASE, observacoes: "Tenho 2 vagas de garagem" });
  assert(r.ok);
  if (!r.ok) return;
  const linhas = resumoDaCandidatura(r.dados).join("\n");
  assertStringIncludes(linhas, "Mendes Contabilidade LTDA");
  assertStringIncludes(linhas, "CNPJ: 20351761000103");
  assertStringIncludes(linhas, "Belo Horizonte/MG");
  assertStringIncludes(linhas, rotuloServico("endereco_fiscal"));
  assertStringIncludes(linhas, "Tenho 2 vagas de garagem");
});

Deno.test("checklist: sem carteira, trava a venda; com tudo, nada pendente", () => {
  const vazio = checklistDoParceiro({ walletId: "", tiposDeDocumento: [], salasComFoto: 0, temContratoParceria: true });
  assertEquals(vazio.filter((i) => i.ok).length, 0);
  assertEquals(vazio.filter((i) => i.trava && !i.ok).map((i) => i.id), ["wallet"]);
  assertEquals(pendenciasDoParceiro(vazio).length, vazio.length);

  const completo = checklistDoParceiro({
    walletId: "0f1e2d3c-aaaa-bbbb-cccc-1234567890ab",
    tiposDeDocumento: ["iptu", "autorizacao_proprietario", "avcb"],
    salasComFoto: 2,
    temContratoParceria: true,
  });
  assertEquals(pendenciasDoParceiro(completo), []);
});

Deno.test("sem contrato de parceria publicado, o checklist avisa", () => {
  const itens = checklistDoParceiro({ walletId: "abc12345", temContratoParceria: false });
  assert(itens.some((i) => i.id === "contrato" && !i.ok));
});
