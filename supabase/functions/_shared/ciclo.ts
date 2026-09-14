// ============================================================================
// Ciclo de vida da assinatura vendida pelo site: renovação, cancelamento e
// documentos. Regras puras (testadas em ciclo_test.ts), sem banco nem Asaas.
//
// Cláusulas dos contratos (v1, 14/09/2026) que estas regras cumprem:
//   6.3  aviso por e-mail pelo menos 30 dias antes da renovação do anual
//   7.2  arrependimento em até 7 dias corridos, com devolução integral
//   7.3  cancelamento a qualquer tempo com aviso prévio de 30 dias
//   7.4  multa de fidelidade / 7.5 devolução proporcional do anual → acerto
//        feito pela equipe (a função só marca que há acerto a fazer)
//   3.2–3.4 (endereço fiscal) envio e conferência de documentos
// ============================================================================

import { somarMeses } from "./venda.ts";

const DIA_MS = 86_400_000;

export const PRAZO_ARREPENDIMENTO_DIAS = 7;
export const AVISO_PREVIO_DIAS = 30;
export const AVISO_RENOVACAO_DIAS = 30;

function paraUTC(dataISO: string): number {
  const [a, m, d] = dataISO.split("-").map(Number);
  return Date.UTC(a, m - 1, d);
}

export function somarDias(dataISO: string, dias: number): string {
  return new Date(paraUTC(dataISO) + dias * DIA_MS).toISOString().slice(0, 10);
}

/** Dias corridos de `de` até `ate` (negativo se `ate` vier antes). */
export function diasEntre(de: string, ate: string): number {
  return Math.round((paraUTC(ate) - paraUTC(de)) / DIA_MS);
}

export function proximaCobranca(dataISO: string, recorrencia: string): string {
  return somarMeses(dataISO, recorrencia === "anual" ? 12 : 1);
}

export interface AssinaturaParaAviso {
  recorrencia: string;
  status: string;
  proxima_cobranca: string | null;
  aviso_renovacao_ciclo: string | null;
}

/**
 * Hora de avisar a renovação do anual: faltam de 1 a 30 dias para a cobrança e
 * este ciclo ainda não foi avisado. A janela larga cobre dias em que a rotina
 * não rodou; o registro do ciclo impede aviso repetido.
 */
export function emJanelaDeAvisoRenovacao(a: AssinaturaParaAviso, hoje: string): boolean {
  if (a.recorrencia !== "anual" || !["ativa", "inadimplente"].includes(a.status) || !a.proxima_cobranca) return false;
  if (a.aviso_renovacao_ciclo === a.proxima_cobranca) return false;
  const faltam = diasEntre(hoje, a.proxima_cobranca);
  return faltam >= 1 && faltam <= AVISO_RENOVACAO_DIAS;
}

export interface PlanoCancelamento {
  tipo: "arrependimento" | "aviso_previo";
  cancelaEm: string;
  requerAcerto: boolean;
  motivoAcerto: "fidelidade" | "anual" | null;
}

export function planoDeCancelamento(a: {
  inicio: string; hoje: string; recorrencia: string; fidelidade_ate: string | null;
}): PlanoCancelamento {
  if (diasEntre(a.inicio, a.hoje) <= PRAZO_ARREPENDIMENTO_DIAS) {
    return { tipo: "arrependimento", cancelaEm: a.hoje, requerAcerto: false, motivoAcerto: null };
  }
  const cancelaEm = somarDias(a.hoje, AVISO_PREVIO_DIAS);
  if (a.recorrencia === "anual") return { tipo: "aviso_previo", cancelaEm, requerAcerto: true, motivoAcerto: "anual" };
  if (a.fidelidade_ate && a.fidelidade_ate > cancelaEm) {
    return { tipo: "aviso_previo", cancelaEm, requerAcerto: true, motivoAcerto: "fidelidade" };
  }
  return { tipo: "aviso_previo", cancelaEm, requerAcerto: false, motivoAcerto: null };
}

/** O Asaas estorna cartão e PIX pela API; boleto precisa de devolução manual. */
export function reembolsoAutomatico(billingType: string | undefined | null): boolean {
  return billingType === "CREDIT_CARD" || billingType === "PIX";
}

// ---------------------------------------------------------------------------
// Documentos do endereço fiscal
// ---------------------------------------------------------------------------

export const TIPOS_DOCUMENTO: Record<string, string> = {
  cartao_cnpj: "Cartão CNPJ",
  ato_constitutivo: "Contrato social, requerimento de empresário ou certificado MEI",
  documento_socio: "Documento de identificação com foto dos sócios ou do titular",
  comprovante_residencia: "Comprovante de endereço residencial (empresa a abrir)",
  outro: "Outro documento",
};

export const MIMES_DOCUMENTO = ["application/pdf", "image/jpeg", "image/png"];
export const TAMANHO_MAX_DOCUMENTO = 8 * 1024 * 1024;

export function validarArquivo(f: { tipo: string; nome: string; mime: string; bytes: number }): { ok: boolean; erro?: string } {
  if (!TIPOS_DOCUMENTO[f.tipo]) return { ok: false, erro: "Tipo de documento inválido." };
  if (!MIMES_DOCUMENTO.includes(f.mime)) return { ok: false, erro: "Envie PDF, JPG ou PNG." };
  if (!(f.bytes > 0)) return { ok: false, erro: "Arquivo vazio." };
  if (f.bytes > TAMANHO_MAX_DOCUMENTO) return { ok: false, erro: "Arquivo acima de 8 MB." };
  if (!String(f.nome || "").trim()) return { ok: false, erro: "Arquivo sem nome." };
  return { ok: true };
}

/** Caminho no bucket: unidade/assinatura/uuid-nome-limpo.ext (sem barras nem ..). */
export function caminhoDocumento(unidadeId: string, assinaturaId: string, nome: string, id: string): string {
  const limpo = String(nome)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9.]+/g, "-")
    .replace(/\.{2,}/g, "")
    .replace(/^[-.]+|-+(?=\.)|[-.]+$/g, "")
    .slice(-80) || "arquivo";
  return `${unidadeId}/${assinaturaId}/${id}-${limpo}`;
}
