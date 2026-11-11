// ============================================================================
// Gestão de impressões — regras puras (sem rede e sem banco).
//
// Fase 1: o cliente envia um documento pelo portal; a contagem é por FOLHA
// (frente-e-verso = 1 folha por 2 páginas), a franquia varia por plano
// (direitos.impressaoMensal, em folhas) e o excedente vale R$ 1,50 por folha,
// faturado no fechamento do mês. Nada aqui bloqueia a impressão.
//
//   deno test supabase/functions/_shared/impressao_test.ts
// ============================================================================

/** Bucket privado dos arquivos a imprimir. Caminho <unidade_id>/<job_id>.<ext>. */
export const BUCKET_IMPRESSOES = "impressoes";
/** Preço do excedente, por folha acima da franquia do plano. */
export const PRECO_FOLHA_EXCEDENTE = 1.5;
/** Limites de sanidade do envio pelo portal. */
export const MAX_PAGINAS = 500;
export const MAX_COPIAS = 50;

// deno-lint-ignore no-explicit-any
type Linha = Record<string, any>;

/**
 * Folhas de um trabalho. Frente-e-verso junta 2 páginas numa folha (arredonda
 * para cima: 3 páginas em duplex = 2 folhas). Multiplica pelas cópias.
 *   folhas = ceil(paginas / (duplex ? 2 : 1)) × copias
 */
export function folhasDe(paginas: unknown, copias: unknown, duplex: unknown): number {
  const p = Math.max(1, Math.floor(Number(paginas) || 1));
  const c = Math.max(1, Math.floor(Number(copias) || 1));
  const porCopia = Math.ceil(p / (duplex ? 2 : 1));
  return porCopia * c;
}

/** Valor do excedente (R$) dado o total de folhas do mês e a franquia do plano. */
export function valorExcedente(folhasMes: unknown, franquia: unknown): number {
  const total = Math.max(0, Math.floor(Number(folhasMes) || 0));
  const fr = Math.max(0, Math.floor(Number(franquia) || 0));
  const excedente = Math.max(0, total - fr);
  return Math.round(excedente * PRECO_FOLHA_EXCEDENTE * 100) / 100;
}

/** Franquia de impressão (folhas/mês) a partir de uma lista de direitos de plano. */
export function franquiaImpressao(direitos: Array<Linha | null | undefined>): number {
  return (direitos || []).reduce((maior, d) => Math.max(maior, Math.max(0, Math.floor(Number(d?.impressaoMensal) || 0))), 0);
}

/** Competência "AAAA-MM" no fuso de Brasília. */
export function competenciaBRT(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit",
  }).format(agora); // ex.: "2026-11"
}

export type ResultadoEnvio = { ok: true } | { ok: false; erro: string };

/** Valida o envio do portal. Mensagens em pt-BR (a tela mostra direto). */
export function validarEnvio(e: Linha | null | undefined): ResultadoEnvio {
  const nome = String(e?.documento_nome || "").trim();
  if (!nome) return { ok: false, erro: "Dê um nome ao documento." };
  const p = Math.floor(Number(e?.paginas));
  if (!Number.isFinite(p) || p < 1 || p > MAX_PAGINAS) {
    return { ok: false, erro: `Informe o número de páginas (1 a ${MAX_PAGINAS}).` };
  }
  const c = Math.floor(Number(e?.copias));
  if (!Number.isFinite(c) || c < 1 || c > MAX_COPIAS) {
    return { ok: false, erro: `Número de cópias de 1 a ${MAX_COPIAS}.` };
  }
  if (typeof e?.arquivo !== "string" || e.arquivo.length < 16) {
    return { ok: false, erro: "Anexe o arquivo para imprimir." };
  }
  return { ok: true };
}

/** Extensão (minúscula, sem ponto) do nome do arquivo; "pdf" como padrão. */
export function extDe(nome: unknown): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec(String(nome || ""));
  return m ? m[1].toLowerCase() : "pdf";
}

const MIME: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  txt: "text/plain", doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
/** Content-type a partir da extensão (octet-stream quando não reconhecido). */
export function contentTypeDe(nome: unknown): string {
  return MIME[extDe(nome)] || "application/octet-stream";
}

/** base64 (com ou sem prefixo data:) → bytes. */
export function base64ParaBytes(b64: string): Uint8Array {
  const limpo = String(b64 || "").replace(/^data:[^;,]*;base64,/, "").replace(/^data:[^,]*,/, "");
  const bin = atob(limpo);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
