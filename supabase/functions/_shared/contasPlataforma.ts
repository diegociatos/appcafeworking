// ============================================================================
// Contas da plataforma (coworkings que assinam o CafeWorking) — regras puras.
//
// Usadas por criar-coworking e contas-plataforma; testadas em
// contasPlataforma_test.ts sem banco. Só o admin da plataforma chega aqui
// (as funções conferem platform_admins antes).
// ============================================================================

export const BUCKET_CONTRATOS_CONTAS = "contratos-contas";
export const MIMES_CONTRATO = ["application/pdf", "image/jpeg", "image/png"];
/** Mesmo teto do bucket (file_size_limit). */
export const TAMANHO_MAX_CONTRATO = 10 * 1024 * 1024;

export type CamposConta = {
  nome?: string;
  master?: string | null;
  documento?: string | null;
  telefone?: string | null;
  plano?: string | null;
  mensalidade?: number;
  tipo_pessoa?: "PF" | "PJ" | null;
  nome_fantasia?: string | null;
  responsavel?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  observacoes?: string | null;
};

const texto = (v: unknown, max: number): string | null => {
  const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
  return s ? s.slice(0, max) : null;
};

/**
 * Campos editáveis da conta, vindos da tela (camelCase). Só entra o que veio no
 * objeto; e-mail (login do master) e id não são editáveis por aqui.
 */
export function camposDaConta(d: Record<string, unknown> | null | undefined): { ok: true; campos: CamposConta } | { ok: false; erro: string } {
  if (!d || typeof d !== "object") return { ok: false, erro: "Dados da conta inválidos." };
  const c: CamposConta = {};
  const tem = (k: string) => Object.prototype.hasOwnProperty.call(d, k);

  if (tem("nome")) {
    const nome = texto(d.nome, 200);
    if (!nome) return { ok: false, erro: "Informe a razão social ou o nome." };
    c.nome = nome;
  }
  if (tem("master")) c.master = texto(d.master, 200);
  if (tem("documento")) c.documento = texto(d.documento, 30);
  if (tem("telefone")) c.telefone = texto(d.telefone, 40);
  if (tem("plano")) c.plano = texto(d.plano, 60);
  if (tem("mensalidade")) {
    const n = Number(d.mensalidade);
    if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return { ok: false, erro: "Mensalidade inválida." };
    c.mensalidade = Math.round(n * 100) / 100;
  }
  if (tem("tipoPessoa")) {
    const t = String(d.tipoPessoa || "").toUpperCase();
    c.tipo_pessoa = t === "PF" || t === "PJ" ? t : null;
  }
  if (tem("nomeFantasia")) c.nome_fantasia = texto(d.nomeFantasia, 200);
  if (tem("responsavel")) c.responsavel = texto(d.responsavel, 200);
  if (tem("endereco")) c.endereco = texto(d.endereco, 300);
  if (tem("cidade")) c.cidade = texto(d.cidade, 120);
  if (tem("observacoes")) c.observacoes = texto(d.observacoes, 2000);
  return { ok: true, campos: c };
}

export function validarContrato(f: { nome: string; mime: string; bytes: number }): { ok: boolean; erro?: string } {
  if (!MIMES_CONTRATO.includes(f.mime)) return { ok: false, erro: "Envie o contrato em PDF, JPG ou PNG." };
  if (!(f.bytes > 0)) return { ok: false, erro: "Arquivo vazio." };
  if (f.bytes > TAMANHO_MAX_CONTRATO) return { ok: false, erro: "Contrato acima de 10 MB. Envie um PDF menor." };
  if (!String(f.nome || "").trim()) return { ok: false, erro: "Arquivo sem nome." };
  return { ok: true };
}

/** Caminho no bucket: <conta>/<uuid>-<nome-limpo> (sem barras nem ..). */
export function caminhoContrato(contaId: string, id: string, nome: string): string {
  const limpo = String(nome)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9.]+/g, "-")
    .replace(/\.{2,}/g, "")
    .replace(/^[-.]+|-+(?=\.)|[-.]+$/g, "")
    .slice(-80) || "contrato";
  return `${contaId}/${id}-${limpo}`;
}

/** Id de conta aceito (o criar-coworking gera fr_<slug>_<sufixo>; o seed usa fr_ciatos). */
export const idDeContaValido = (id: unknown): id is string =>
  typeof id === "string" && /^[A-Za-z0-9_-]{1,60}$/.test(id);
