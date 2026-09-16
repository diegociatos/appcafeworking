// ============================================================================
// Abertura de empresa — regras puras (testadas em abertura_test.ts), sem banco.
//
// Usado pela Edge Function aberturas (validação no servidor) e também pelo app
// (src/lib/aberturasApi.js importa este arquivo), para o cliente ver na tela de
// revisão exatamente as mesmas pendências que o servidor vai cobrar no envio.
// Por isso: nada de Deno.*, nada de import.
//
// Formato de `aberturas.dados`:
//   empresa: { tipo, nomes[3], nome_fantasia, atividades, capital_social,
//              atuacao[], faturamento_mensal }
//   socios:  [{ id, nome, cpf, rg, rg_orgao, nascimento, estado_civil,
//              regime_bens, profissao, endereco{...}, email, telefone,
//              participacao, administrador, govbr }]
//   local:   { cep, logradouro, numero, complemento, bairro, cidade, uf,
//              indice_cadastral, area_m2, tipo_imovel, imovel_de_socio }
// ============================================================================

// deno-lint-ignore no-explicit-any
type Obj = Record<string, any>;

// ---------------------------------------------------------------------------
// Etapas do processo
// ---------------------------------------------------------------------------

export const STATUS_ABERTURA = ["aguardando_cliente", "em_analise", "pendente_cliente", "em_registro", "concluida", "cancelada"] as const;
export type StatusAbertura = typeof STATUS_ABERTURA[number];
export type PapelAbertura = "cliente" | "contabilidade" | "equipe" | "admin";

/** O cliente só mexe nos dados enquanto o processo está com ele. */
export const STATUS_EDITAVEL_CLIENTE = ["aguardando_cliente", "pendente_cliente"];
/** A contabilidade anexa e registra resultado enquanto o processo está aberto. */
export const STATUS_EM_ANDAMENTO = ["aguardando_cliente", "em_analise", "pendente_cliente", "em_registro"];

/**
 * Mudança de etapa permitida para o papel. Envio do cliente e conclusão têm
 * ações próprias (com validação); aqui ficam as regras de quem pode o quê.
 */
export function podeMudarStatus(de: string, para: string, papel: PapelAbertura): boolean {
  const time = papel === "contabilidade" || papel === "equipe" || papel === "admin";
  switch (para) {
    case "em_analise":
      return (papel === "cliente" && STATUS_EDITAVEL_CLIENTE.includes(de)) || (time && de === "em_registro");
    case "pendente_cliente":
      return time && (de === "em_analise" || de === "em_registro");
    case "em_registro":
      return time && (de === "em_analise" || de === "pendente_cliente");
    case "concluida":
      return time && (de === "em_analise" || de === "em_registro");
    case "cancelada":
      return (papel === "equipe" || papel === "admin") && STATUS_EM_ANDAMENTO.includes(de);
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Listas de escolha
// ---------------------------------------------------------------------------

export const TIPOS_EMPRESA: Record<string, string> = {
  mei: "MEI (microempreendedor individual)",
  ei: "Empresário individual",
  slu: "LTDA unipessoal (SLU)",
  ltda: "LTDA com sócios",
};

export const ATUACAO: Record<string, string> = {
  fixo: "Estabelecimento fixo",
  internet: "Pela internet",
  fora: "Fora do estabelecimento (em casa do cliente, porta a porta, eventos)",
};

export const ESTADOS_CIVIS: Record<string, string> = {
  solteiro: "Solteiro(a)",
  casado: "Casado(a)",
  uniao_estavel: "União estável",
  divorciado: "Divorciado(a)",
  separado: "Separado(a) judicialmente",
  viuvo: "Viúvo(a)",
};

export const REGIMES_BENS: Record<string, string> = {
  comunhao_parcial: "Comunhão parcial de bens",
  comunhao_universal: "Comunhão universal de bens",
  separacao_total: "Separação total (convencional) de bens",
  separacao_obrigatoria: "Separação obrigatória de bens",
  participacao_final: "Participação final nos aquestos",
};

export const NIVEIS_GOVBR: Record<string, string> = {
  bronze: "Bronze",
  prata: "Prata",
  ouro: "Ouro",
  nao_sei: "Não sei",
};

export const TIPOS_IMOVEL: Record<string, string> = { comercial: "Comercial", residencial: "Residencial" };

export const REGIMES_TRIBUTARIOS: Record<string, string> = {
  mei: "MEI (Simei)",
  simples: "Simples Nacional",
  presumido: "Lucro presumido",
  real: "Lucro real",
};

export const UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"];

// ---------------------------------------------------------------------------
// Documentos
// ---------------------------------------------------------------------------

export const DOCS_CLIENTE: Record<string, string> = {
  socio_identidade: "RG ou CNH",
  socio_residencia: "Comprovante de residência",
  iptu: "IPTU do imóvel",
  avcb: "AVCB (auto de vistoria do Corpo de Bombeiros)",
  autorizacao_proprietario: "Autorização do proprietário do imóvel",
  outro_cliente: "Outro documento",
};

export const DOCS_CONTABILIDADE: Record<string, string> = {
  contrato_social: "Contrato social / ato constitutivo",
  cartao_cnpj: "Cartão CNPJ",
  inscricao_municipal: "Comprovante de inscrição municipal",
  alvara: "Alvará de funcionamento",
  outro: "Outro documento",
};

export const DOCS_OBRIGATORIOS_CONCLUSAO = ["contrato_social", "cartao_cnpj"];
export const MIMES_ABERTURA = ["application/pdf", "image/jpeg", "image/png"];
export const TAMANHO_MAX_ABERTURA = 8 * 1024 * 1024;

export interface DocAbertura { lado: string; categoria: string; socio_id?: string | null }

export function validarArquivoAbertura(f: { lado: string; categoria: string; socio_id?: string | null; mime: string; bytes: number; nome: string }): { ok: boolean; erro?: string } {
  const lista = f.lado === "cliente" ? DOCS_CLIENTE : f.lado === "contabilidade" ? DOCS_CONTABILIDADE : null;
  if (!lista || !lista[f.categoria]) return { ok: false, erro: "Tipo de documento inválido." };
  const deSocio = f.categoria === "socio_identidade" || f.categoria === "socio_residencia";
  if (deSocio !== !!f.socio_id) return { ok: false, erro: deSocio ? "Indique de qual sócio é o documento." : "Este documento não é de um sócio." };
  if (f.socio_id && !ID_SOCIO.test(f.socio_id)) return { ok: false, erro: "Sócio inválido." };
  if (!MIMES_ABERTURA.includes(f.mime)) return { ok: false, erro: "Envie PDF, JPG ou PNG." };
  if (!(f.bytes > 0)) return { ok: false, erro: "Arquivo vazio." };
  if (f.bytes > TAMANHO_MAX_ABERTURA) return { ok: false, erro: "Arquivo acima de 8 MB." };
  if (!String(f.nome || "").trim()) return { ok: false, erro: "Arquivo sem nome." };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Documentos de pessoa e empresa
// ---------------------------------------------------------------------------

export const somenteDigitos = (v: unknown) => String(v ?? "").replace(/\D+/g, "");

export function cpfValido(valor: unknown): boolean {
  const c = somenteDigitos(valor);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (base: string, pesoInicial: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(c.slice(0, 9), 10) === Number(c[9]) && dv(c.slice(0, 10), 11) === Number(c[10]);
}

export function cnpjValido(valor: unknown): boolean {
  const c = somenteDigitos(valor);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = base.split("").reduce((s, d, i) => s + Number(d) * pesos[i], 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(c.slice(0, 12)) === Number(c[12]) && dv(c.slice(0, 13)) === Number(c[13]);
}

export const formatarCPF = (v: unknown) => somenteDigitos(v).replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
export const formatarCNPJ = (v: unknown) => somenteDigitos(v).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
export const formatarCEP = (v: unknown) => somenteDigitos(v).replace(/^(\d{5})(\d{3})$/, "$1-$2");

/** CNAE com 7 dígitos (0000-0/00). Devolve só os dígitos ou null. */
export function cnaeNormalizado(valor: unknown): string | null {
  const d = somenteDigitos(valor);
  return d.length === 7 ? d : null;
}
export const formatarCNAE = (v: unknown) => somenteDigitos(v).replace(/^(\d{4})(\d)(\d{2})$/, "$1-$2/$3");

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
function dataValida(v: unknown): boolean {
  if (typeof v !== "string" || !DATA_ISO.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ID_SOCIO = /^[a-z0-9]{6,24}$/;

// ---------------------------------------------------------------------------
// Normalização do rascunho (o que o navegador manda nunca é gravado cru)
// ---------------------------------------------------------------------------

const txt = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const textoLongo = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim().slice(0, max) : "");
const escolha = (v: unknown, lista: Record<string, string>) => (typeof v === "string" && lista[v] ? v : "");
function numero(v: unknown, max: number): number | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  // "1.500,50" (digitado em português) ou "1500.5" (campo numérico do navegador)
  const n = typeof v === "number" ? v : Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 100) / 100 : null;
}
const booleano = (v: unknown) => (v === true ? true : v === false ? false : null);

function endereco(e: unknown) {
  const o = (e && typeof e === "object" ? e : {}) as Obj;
  return {
    cep: somenteDigitos(o.cep).slice(0, 8),
    logradouro: txt(o.logradouro, 200),
    numero: txt(o.numero, 20),
    complemento: txt(o.complemento, 100),
    bairro: txt(o.bairro, 100),
    cidade: txt(o.cidade, 100),
    uf: UFS.includes(String(o.uf || "").toUpperCase()) ? String(o.uf).toUpperCase() : "",
  };
}

export const MAX_SOCIOS = 10;

export function normalizarDados(bruto: unknown) {
  const d = (bruto && typeof bruto === "object" ? bruto : {}) as Obj;
  const e = (d.empresa && typeof d.empresa === "object" ? d.empresa : {}) as Obj;
  const l = (d.local && typeof d.local === "object" ? d.local : {}) as Obj;
  const nomes = Array.isArray(e.nomes) ? e.nomes : [];
  const vistos = new Set<string>();
  const socios = (Array.isArray(d.socios) ? d.socios : []).slice(0, MAX_SOCIOS).map((s: unknown) => {
    const o = (s && typeof s === "object" ? s : {}) as Obj;
    return {
      id: typeof o.id === "string" && ID_SOCIO.test(o.id) ? o.id : "",
      nome: txt(o.nome, 200),
      cpf: somenteDigitos(o.cpf).slice(0, 11),
      rg: txt(o.rg, 30),
      rg_orgao: txt(o.rg_orgao, 30),
      nascimento: dataValida(o.nascimento) ? String(o.nascimento) : "",
      estado_civil: escolha(o.estado_civil, ESTADOS_CIVIS),
      regime_bens: escolha(o.regime_bens, REGIMES_BENS),
      profissao: txt(o.profissao, 100),
      endereco: endereco(o.endereco),
      email: txt(o.email, 200).toLowerCase(),
      telefone: somenteDigitos(o.telefone).slice(0, 13),
      participacao: numero(o.participacao, 100),
      administrador: o.administrador === true,
      govbr: escolha(o.govbr, NIVEIS_GOVBR),
    };
  }).filter((s: Obj) => {
    // sem id estável o anexo não tem a quem pertencer; id repetido é descartado
    if (!s.id || vistos.has(s.id)) return false;
    vistos.add(s.id);
    return true;
  });

  return {
    empresa: {
      tipo: escolha(e.tipo, TIPOS_EMPRESA),
      nomes: [0, 1, 2].map((i) => txt(nomes[i], 150)),
      nome_fantasia: txt(e.nome_fantasia, 150),
      atividades: textoLongo(e.atividades, 3000),
      capital_social: numero(e.capital_social, 1e11),
      atuacao: Array.isArray(e.atuacao) ? Object.keys(ATUACAO).filter((k) => e.atuacao.includes(k)) : [],
      faturamento_mensal: numero(e.faturamento_mensal, 1e10),
    },
    socios,
    local: {
      ...endereco(l),
      indice_cadastral: txt(l.indice_cadastral, 60),
      area_m2: numero(l.area_m2, 1e7),
      tipo_imovel: escolha(l.tipo_imovel, TIPOS_IMOVEL),
      imovel_de_socio: booleano(l.imovel_de_socio),
    },
  };
}

export type DadosAbertura = ReturnType<typeof normalizarDados>;

// ---------------------------------------------------------------------------
// Validação do envio para a contabilidade
// ---------------------------------------------------------------------------

export type EtapaFormulario = "empresa" | "socios" | "local" | "govbr";
export interface Pendencia { etapa: EtapaFormulario; mensagem: string }

/** Quantos sócios o tipo de empresa aceita. */
export function limiteSocios(tipo: string): { min: number; max: number } {
  if (tipo === "mei" || tipo === "ei" || tipo === "slu") return { min: 1, max: 1 };
  if (tipo === "ltda") return { min: 2, max: MAX_SOCIOS };
  return { min: 1, max: MAX_SOCIOS };
}

function idade(nascimento: string, hoje: string): number {
  const [a, m, d] = nascimento.split("-").map(Number);
  const [ha, hm, hd] = hoje.split("-").map(Number);
  return ha - a - (hm < m || (hm === m && hd < d) ? 1 : 0);
}

function enderecoCompleto(e: Obj): boolean {
  return e.cep?.length === 8 && !!e.logradouro && !!e.numero && !!e.bairro && !!e.cidade && !!e.uf;
}

/**
 * Tudo o que falta para enviar. Lista vazia = pode enviar.
 * `hoje` em AAAA-MM-DD (fuso de Brasília, calculado por quem chama).
 */
export function pendenciasDoEnvio(bruto: unknown, docs: DocAbertura[], usaEnderecoUnidade: boolean, hoje: string): Pendencia[] {
  const d = normalizarDados(bruto);
  const p: Pendencia[] = [];
  const add = (etapa: EtapaFormulario, mensagem: string) => p.push({ etapa, mensagem });
  const e = d.empresa;
  const temDoc = (categoria: string, socioId?: string) =>
    docs.some((x) => x.lado === "cliente" && x.categoria === categoria && (socioId ? x.socio_id === socioId : true));

  // ---- Empresa
  if (!e.tipo) add("empresa", "Escolha o tipo de empresa.");
  if (e.tipo === "mei") {
    if (!e.nome_fantasia) add("empresa", "Informe o nome fantasia do MEI.");
  } else {
    const preenchidos = e.nomes.filter(Boolean);
    if (preenchidos.length < 3) add("empresa", "Informe 3 opções de nome para a empresa, em ordem de preferência.");
    else if (new Set(preenchidos.map((n) => n.toLowerCase())).size < 3) add("empresa", "As 3 opções de nome precisam ser diferentes.");
  }
  if (e.atividades.length < 10) add("empresa", "Descreva as atividades da empresa.");
  if (e.tipo && e.tipo !== "mei" && !(Number(e.capital_social) > 0)) add("empresa", "Informe o capital social.");
  if (!e.atuacao.length) add("empresa", "Marque pelo menos uma forma de atuação.");

  // ---- Sócios
  const lim = limiteSocios(e.tipo);
  if (d.socios.length < lim.min) {
    add("socios", lim.min === 1 ? "Cadastre o titular da empresa." : "LTDA com sócios precisa de pelo menos 2 sócios.");
  } else if (d.socios.length > lim.max) {
    add("socios", `${TIPOS_EMPRESA[e.tipo] || "Este tipo de empresa"} tem um único titular. Remova os sócios a mais.`);
  }
  const cpfs = new Set<string>();
  d.socios.forEach((s, i) => {
    const quem = d.socios.length > 1 ? `Sócio ${i + 1}${s.nome ? ` (${s.nome.split(" ")[0]})` : ""}` : "Titular";
    const falta = (campo: string) => add("socios", `${quem}: ${campo}.`);
    if (s.nome.split(" ").filter(Boolean).length < 2) falta("informe o nome completo");
    if (!cpfValido(s.cpf)) falta("CPF inválido");
    else if (cpfs.has(s.cpf)) falta("CPF repetido em outro sócio");
    else cpfs.add(s.cpf);
    if (!s.rg || !s.rg_orgao) falta("informe o RG e o órgão emissor");
    if (!s.nascimento) falta("informe a data de nascimento");
    else if (s.nascimento > hoje || idade(s.nascimento, hoje) > 120) falta("data de nascimento inválida");
    else if (idade(s.nascimento, hoje) < 16) falta("menores de 16 anos não podem ser sócios");
    if (!s.estado_civil) falta("informe o estado civil");
    if ((s.estado_civil === "casado" || s.estado_civil === "uniao_estavel") && !s.regime_bens) falta("informe o regime de bens");
    if (!s.profissao) falta("informe a profissão");
    if (!enderecoCompleto(s.endereco)) falta("complete o endereço residencial com CEP");
    if (!EMAIL.test(s.email)) falta("e-mail inválido");
    if (s.telefone.length < 10) falta("telefone com DDD");
    if (!temDoc("socio_identidade", s.id)) falta("anexe o RG ou a CNH");
    if (!temDoc("socio_residencia", s.id)) falta("anexe o comprovante de residência");
  });
  if (d.socios.length > 1) {
    const soma = Math.round(d.socios.reduce((t, s) => t + Number(s.participacao || 0), 0) * 100) / 100;
    if (d.socios.some((s) => !(Number(s.participacao) > 0))) add("socios", "Informe a participação de cada sócio.");
    else if (soma !== 100) add("socios", `A soma das participações precisa dar 100% (hoje dá ${String(soma).replace(".", ",")}%).`);
  }
  if (d.socios.length && !d.socios.some((s) => s.administrador)) add("socios", "Indique quem vai administrar a empresa.");

  // ---- Local
  if (!usaEnderecoUnidade) {
    const l = d.local;
    if (!enderecoCompleto(l)) add("local", "Complete o endereço da empresa com CEP.");
    if (!l.indice_cadastral) add("local", "Informe o índice cadastral do IPTU.");
    if (!(Number(l.area_m2) > 0)) add("local", "Informe a área utilizada em m².");
    if (!l.tipo_imovel) add("local", "Diga se o imóvel é residencial ou comercial.");
    if (l.imovel_de_socio === null) add("local", "Diga se o imóvel é de um dos sócios.");
    if (!temDoc("iptu")) add("local", "Anexe o IPTU do imóvel.");
    if (l.imovel_de_socio === false && !temDoc("autorizacao_proprietario")) add("local", "Anexe a autorização do proprietário do imóvel.");
  }

  // ---- gov.br
  d.socios.forEach((s, i) => {
    if (!s.govbr) add("govbr", `${d.socios.length > 1 ? `Sócio ${i + 1}` : "Titular"}: informe o nível da conta gov.br.`);
  });

  return p;
}

/** Sócios com conta gov.br que não assina (bronze ou não sabe). */
export function sociosSemGovbrParaAssinar(bruto: unknown): string[] {
  return normalizarDados(bruto).socios.filter((s) => s.govbr === "bronze" || s.govbr === "nao_sei").map((s) => s.nome || "Sócio");
}

// ---------------------------------------------------------------------------
// Resultado registrado pela contabilidade
// ---------------------------------------------------------------------------

export function normalizarResultado(bruto: unknown) {
  const r = (bruto && typeof bruto === "object" ? bruto : {}) as Obj;
  const secundarios = Array.isArray(r.cnaes_secundarios)
    ? r.cnaes_secundarios
    : typeof r.cnaes_secundarios === "string" ? r.cnaes_secundarios.split(/[\s,;]+/) : [];
  return {
    razao_social: txt(r.razao_social, 200),
    cnpj: somenteDigitos(r.cnpj).slice(0, 14),
    data_abertura: dataValida(r.data_abertura) ? String(r.data_abertura) : "",
    nire: txt(r.nire, 30),
    inscricao_municipal: txt(r.inscricao_municipal, 30),
    inscricao_estadual: txt(r.inscricao_estadual, 30),
    regime_tributario: escolha(r.regime_tributario, REGIMES_TRIBUTARIOS),
    cnae_principal: somenteDigitos(r.cnae_principal).slice(0, 7),
    cnaes_secundarios: [...new Set(secundarios.map((c: unknown) => somenteDigitos(c)).filter((c: string) => c.length === 7))].slice(0, 99),
    observacoes: textoLongo(r.observacoes, 2000),
  };
}

export type ResultadoAbertura = ReturnType<typeof normalizarResultado>;

/** O que falta para concluir o processo. Lista vazia = pode concluir. */
export function pendenciasDaConclusao(bruto: unknown, docs: DocAbertura[], hoje: string): string[] {
  const r = normalizarResultado(bruto);
  const p: string[] = [];
  if (r.razao_social.length < 3) p.push("Informe a razão social.");
  if (!cnpjValido(r.cnpj)) p.push("CNPJ inválido.");
  if (!r.data_abertura) p.push("Informe a data de abertura.");
  else if (r.data_abertura > hoje) p.push("A data de abertura não pode ser futura.");
  if (!r.inscricao_municipal) p.push("Informe a inscrição municipal.");
  if (!r.regime_tributario) p.push("Escolha o regime tributário.");
  if (!cnaeNormalizado(r.cnae_principal)) p.push("CNAE principal inválido (7 dígitos).");
  for (const categoria of DOCS_OBRIGATORIOS_CONCLUSAO) {
    if (!docs.some((d) => d.lado === "contabilidade" && d.categoria === categoria)) {
      p.push(`Anexe: ${DOCS_CONTABILIDADE[categoria]}.`);
    }
  }
  return p;
}
