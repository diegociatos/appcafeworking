import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  cnpjValido, cpfValido, formatarCNAE, normalizarDados, normalizarResultado, pendenciasDaConclusao, pendenciasDoEnvio,
  podeMudarStatus, sociosSemGovbrParaAssinar, validarArquivoAbertura,
} from "./abertura.ts";

const HOJE = "2026-09-16";

const socio = (id: string, extra: Record<string, unknown> = {}) => ({
  id, nome: "Ana Maria Souza", cpf: "529.982.247-25", rg: "MG-12.345.678", rg_orgao: "SSP/MG",
  nascimento: "1990-05-10", estado_civil: "solteiro", profissao: "Designer",
  endereco: { cep: "30130-000", logradouro: "Rua da Bahia", numero: "100", bairro: "Centro", cidade: "Belo Horizonte", uf: "mg" },
  email: "Ana@Exemplo.com", telefone: "(31) 99999-0000", participacao: 100, administrador: true, govbr: "prata", ...extra,
});

const docsDoSocio = (id: string) => [
  { lado: "cliente", categoria: "socio_identidade", socio_id: id },
  { lado: "cliente", categoria: "socio_residencia", socio_id: id },
];

const empresaSlu = {
  tipo: "slu", nomes: ["Alfa Design", "Beta Design", "Gama Design"], nome_fantasia: "", atividades: "Design gráfico e web",
  capital_social: "10.000,00", atuacao: ["internet", "xpto"], faturamento_mensal: "",
};

Deno.test("CPF e CNPJ: dígitos verificadores", () => {
  assert(cpfValido("529.982.247-25"));
  assert(cpfValido("11144477735"));
  assertEquals(cpfValido("529.982.247-26"), false);
  assertEquals(cpfValido("111.111.111-11"), false);
  assertEquals(cpfValido("123"), false);
  assert(cnpjValido("11.222.333/0001-81"));
  assert(cnpjValido("20.351.761/0001-03"));
  assertEquals(cnpjValido("11.222.333/0001-82"), false);
  assertEquals(cnpjValido("00000000000000"), false);
});

Deno.test("normalizarDados limpa o que vem do navegador", () => {
  const d = normalizarDados({
    empresa: empresaSlu,
    socios: [socio("abc123"), socio("abc123"), { nome: "sem id" }, socio("x<script>")],
    local: { uf: "zz", area_m2: "35,5", imovel_de_socio: "sim" },
    extra: "ignorado",
  });
  assertEquals(d.empresa.capital_social, 10000);
  assertEquals(d.empresa.atuacao, ["internet"]);
  assertEquals(d.socios.length, 1, "id repetido, ausente ou inválido é descartado");
  assertEquals(d.socios[0].cpf, "52998224725");
  assertEquals(d.socios[0].email, "ana@exemplo.com");
  assertEquals(d.socios[0].endereco.uf, "MG");
  assertEquals(d.local.uf, "");
  assertEquals(d.local.area_m2, 35.5);
  assertEquals(d.local.imovel_de_socio, null);
  assertEquals("extra" in d, false);
  assertEquals(normalizarDados({ empresa: { capital_social: "1500.5" } }).empresa.capital_social, 1500.5);
});

Deno.test("envio completo com endereço da unidade não pede IPTU", () => {
  const dados = { empresa: empresaSlu, socios: [socio("abc123")] };
  assertEquals(pendenciasDoEnvio(dados, docsDoSocio("abc123"), true, HOJE), []);
});

Deno.test("envio com endereço próprio exige local, IPTU e autorização quando o imóvel não é do sócio", () => {
  const dados = {
    empresa: empresaSlu, socios: [socio("abc123")],
    local: { cep: "30130000", logradouro: "Rua A", numero: "1", bairro: "B", cidade: "BH", uf: "MG", indice_cadastral: "123.456", area_m2: 40, tipo_imovel: "comercial", imovel_de_socio: false },
  };
  const semDocs = pendenciasDoEnvio(dados, docsDoSocio("abc123"), false, HOJE).map((p) => p.mensagem);
  assertEquals(semDocs, ["Anexe o IPTU do imóvel.", "Anexe a autorização do proprietário do imóvel."]);
  const completo = pendenciasDoEnvio(dados, [
    ...docsDoSocio("abc123"), { lado: "cliente", categoria: "iptu" }, { lado: "cliente", categoria: "autorizacao_proprietario" },
  ], false, HOJE);
  assertEquals(completo, []);
  const deSocio = pendenciasDoEnvio({ ...dados, local: { ...dados.local, imovel_de_socio: true } },
    [...docsDoSocio("abc123"), { lado: "cliente", categoria: "iptu" }], false, HOJE);
  assertEquals(deSocio, []);
});

Deno.test("MEI: nome fantasia basta, sem capital e com um único titular", () => {
  const mei = { tipo: "mei", nomes: [], nome_fantasia: "Ana Doces", atividades: "Venda de doces caseiros", atuacao: ["fora"] };
  assertEquals(pendenciasDoEnvio({ empresa: mei, socios: [socio("abc123")] }, docsDoSocio("abc123"), true, HOJE), []);
  const dois = pendenciasDoEnvio({ empresa: mei, socios: [socio("abc123"), socio("def456", { cpf: "11144477735" })] },
    [...docsDoSocio("abc123"), ...docsDoSocio("def456")], true, HOJE);
  assert(dois.some((p) => p.etapa === "socios" && p.mensagem.includes("único titular")));
  const semFantasia = pendenciasDoEnvio({ empresa: { ...mei, nome_fantasia: "" }, socios: [socio("abc123")] }, docsDoSocio("abc123"), true, HOJE);
  assertEquals(semFantasia.map((p) => p.mensagem), ["Informe o nome fantasia do MEI."]);
});

Deno.test("LTDA com sócios: participação soma 100, CPF sem repetição, regime de bens e administrador", () => {
  const empresa = { ...empresaSlu, tipo: "ltda" };
  const base = [
    socio("abc123", { participacao: 60, administrador: false, estado_civil: "casado" }),
    socio("def456", { participacao: 30, administrador: false }),
  ];
  const msgs = pendenciasDoEnvio({ empresa, socios: base }, [...docsDoSocio("abc123"), ...docsDoSocio("def456")], true, HOJE)
    .map((p) => p.mensagem);
  assert(msgs.some((m) => m.includes("regime de bens")));
  assert(msgs.some((m) => m.includes("CPF repetido")));
  assert(msgs.some((m) => m.includes("hoje dá 90%")));
  assert(msgs.includes("Indique quem vai administrar a empresa."));

  const ok = [
    socio("abc123", { participacao: 60, estado_civil: "casado", regime_bens: "comunhao_parcial" }),
    socio("def456", { participacao: 40, administrador: false, cpf: "111.444.777-35" }),
  ];
  assertEquals(pendenciasDoEnvio({ empresa, socios: ok }, [...docsDoSocio("abc123"), ...docsDoSocio("def456")], true, HOJE), []);
  const um = pendenciasDoEnvio({ empresa, socios: [socio("abc123")] }, docsDoSocio("abc123"), true, HOJE);
  assert(um.some((p) => p.mensagem.includes("pelo menos 2 sócios")));
});

Deno.test("anexos são cobrados por sócio e gov.br por etapa", () => {
  const dados = { empresa: empresaSlu, socios: [socio("abc123", { govbr: "" })] };
  const p = pendenciasDoEnvio(dados, [{ lado: "cliente", categoria: "socio_identidade", socio_id: "outro1" }], true, HOJE);
  assertEquals(p.filter((x) => x.etapa === "socios").map((x) => x.mensagem), [
    "Titular: anexe o RG ou a CNH.", "Titular: anexe o comprovante de residência.",
  ]);
  assertEquals(p.filter((x) => x.etapa === "govbr").length, 1);
  assertEquals(sociosSemGovbrParaAssinar({ socios: [socio("abc123", { govbr: "bronze" }), socio("def456", { govbr: "ouro" })] }), ["Ana Maria Souza"]);
});

Deno.test("nascimento futuro ou menor de 16 anos é recusado", () => {
  const futuro = pendenciasDoEnvio({ empresa: empresaSlu, socios: [socio("abc123", { nascimento: "2030-01-01" })] }, docsDoSocio("abc123"), true, HOJE);
  assert(futuro.some((p) => p.mensagem.includes("nascimento inválida")));
  const menor = pendenciasDoEnvio({ empresa: empresaSlu, socios: [socio("abc123", { nascimento: "2012-01-01" })] }, docsDoSocio("abc123"), true, HOJE);
  assert(menor.some((p) => p.mensagem.includes("menores de 16")));
});

Deno.test("conclusão exige CNPJ válido, dados e contrato social + cartão CNPJ", () => {
  const resultado = {
    razao_social: "Alfa Design LTDA", cnpj: "11.222.333/0001-81", data_abertura: "2026-09-10", inscricao_municipal: "123456",
    regime_tributario: "simples", cnae_principal: "7410-2/02", cnaes_secundarios: "6201-5/01, 6201-5/01; 123",
  };
  const semDocs = pendenciasDaConclusao(resultado, [], HOJE);
  assertEquals(semDocs, ["Anexe: Contrato social / ato constitutivo.", "Anexe: Cartão CNPJ."]);
  const docs = [{ lado: "contabilidade", categoria: "contrato_social" }, { lado: "contabilidade", categoria: "cartao_cnpj" }];
  assertEquals(pendenciasDaConclusao(resultado, docs, HOJE), []);
  assertEquals(normalizarResultado(resultado).cnaes_secundarios, ["6201501"]);
  assertEquals(formatarCNAE("7410202"), "7410-2/02");
  const ruim = pendenciasDaConclusao({ ...resultado, cnpj: "11.222.333/0001-80", data_abertura: "2027-01-01", cnae_principal: "74" }, docs, HOJE);
  assertEquals(ruim, ["CNPJ inválido.", "A data de abertura não pode ser futura.", "CNAE principal inválido (7 dígitos)."]);
  const docCliente = pendenciasDaConclusao(resultado, [{ lado: "cliente", categoria: "contrato_social" }, docs[1]], HOJE);
  assertEquals(docCliente, ["Anexe: Contrato social / ato constitutivo."]);
});

Deno.test("quem pode mudar cada etapa", () => {
  assert(podeMudarStatus("aguardando_cliente", "em_analise", "cliente"));
  assert(podeMudarStatus("pendente_cliente", "em_analise", "cliente"));
  assertEquals(podeMudarStatus("em_analise", "em_registro", "cliente"), false);
  assert(podeMudarStatus("em_analise", "pendente_cliente", "contabilidade"));
  assert(podeMudarStatus("em_analise", "em_registro", "contabilidade"));
  assert(podeMudarStatus("em_registro", "concluida", "contabilidade"));
  assertEquals(podeMudarStatus("aguardando_cliente", "concluida", "contabilidade"), false);
  assertEquals(podeMudarStatus("em_analise", "cancelada", "contabilidade"), false);
  assert(podeMudarStatus("em_analise", "cancelada", "equipe"));
  assert(podeMudarStatus("aguardando_cliente", "cancelada", "admin"));
  assertEquals(podeMudarStatus("concluida", "cancelada", "admin"), false);
  assertEquals(podeMudarStatus("em_analise", "aguardando_cliente", "equipe"), false);
});

Deno.test("arquivo: categoria do lado certo, sócio só em documento de sócio, tipo e tamanho", () => {
  const base = { mime: "application/pdf", bytes: 1000, nome: "rg.pdf" };
  assert(validarArquivoAbertura({ ...base, lado: "cliente", categoria: "socio_identidade", socio_id: "abc123" }).ok);
  assertEquals(validarArquivoAbertura({ ...base, lado: "cliente", categoria: "socio_identidade" }).ok, false);
  assertEquals(validarArquivoAbertura({ ...base, lado: "cliente", categoria: "iptu", socio_id: "abc123" }).ok, false);
  assertEquals(validarArquivoAbertura({ ...base, lado: "cliente", categoria: "cartao_cnpj" }).ok, false);
  assert(validarArquivoAbertura({ ...base, lado: "contabilidade", categoria: "cartao_cnpj" }).ok);
  assertEquals(validarArquivoAbertura({ ...base, lado: "contabilidade", categoria: "alvara", mime: "image/heic" }).erro, "Envie PDF, JPG ou PNG.");
  assertEquals(validarArquivoAbertura({ ...base, lado: "contabilidade", categoria: "alvara", bytes: 9 * 1024 * 1024 }).erro, "Arquivo acima de 8 MB.");
});
