// ============================================================================
// Nota fiscal automática ao receber (Asaas) — regras puras, sem rede.
// Testadas em aoReceber_test.ts. A orquestração (banco, emissão, aviso à
// equipe) fica em emitirNota.ts.
//
// Quando a cobrança passa a "pago", a nota só sai sozinha se:
//   • a unidade ligou config_fiscal.emitir_ao_receber (padrão desligado);
//   • a cobrança ainda não tem nota nem tentativa (nota_id/nota_status nulos);
//   • a emissão está ativa, o ambiente é Produção e a cobrança tem CPF/CNPJ.
// O certificado é conferido na emissão (emitirNotaFiscal com exigirReal).
// ============================================================================

import { descricaoNotaCafeWorking, snapshotDaCobranca, valorNotaCafeWorking } from "../parceiros.ts";

// deno-lint-ignore no-explicit-any
type Linha = Record<string, any>;

/**
 * Cobrança de unidade parceira: a nota é da CafeWorking, só da parte dela (25%
 * do valor pago), emitida pela configuração fiscal da CafeWorking. A parte do
 * parceiro não gera nota aqui.
 */
export const cobrancaDeParceiro = (cobranca: Linha | null | undefined) => !!snapshotDaCobranca(cobranca);

export type AvaliacaoAoReceber =
  | { acao: "ignorar"; motivo: string }   // nada a fazer, sem aviso
  | { acao: "recusar"; motivo: string }   // ligado, mas não dá: avisa a equipe
  | { acao: "emitir" };

const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

export function avaliarEmissaoAoReceber(config: Linha | null | undefined, cobranca: Linha | null | undefined): AvaliacaoAoReceber {
  if (!cobranca) return { acao: "ignorar", motivo: "cobrança não encontrada" };
  if (cobranca.status !== "pago") return { acao: "ignorar", motivo: "cobrança não está paga" };
  if (cobranca.nota_id) return { acao: "ignorar", motivo: "cobrança já tem nota" };
  if (cobranca.nota_status) return { acao: "ignorar", motivo: `emissão já tratada (${cobranca.nota_status})` };
  if (!config || config.emitir_ao_receber !== true) return { acao: "ignorar", motivo: "emissão automática desligada" };

  if (!config.emissao_ativa) return { acao: "recusar", motivo: "A emissão fiscal está inativa na unidade." };
  if (config.ambiente !== "producao") {
    return { acao: "recusar", motivo: "A emissão automática só funciona com o ambiente fiscal em Produção." };
  }
  const doc = soDigitos(cobranca.cliente_documento);
  if (doc.length !== 11 && doc.length !== 14) {
    return { acao: "recusar", motivo: "A cobrança não tem CPF/CNPJ válido do cliente (tomador da nota)." };
  }
  if (!(valorDaNota(cobranca) > 0)) return { acao: "recusar", motivo: "A cobrança não tem valor pago." };
  return { acao: "emitir" };
}

/** Valor da nota = valor pago no Asaas (cai no valor da cobrança se não veio); em parceiro, a parte da CafeWorking. */
export function valorDaNota(cobranca: Linha): number {
  if (cobrancaDeParceiro(cobranca)) return valorNotaCafeWorking(cobranca);
  const pago = Number(cobranca.valor_pago);
  if (Number.isFinite(pago) && pago > 0) return Math.round(pago * 100) / 100;
  const valor = Number(cobranca.valor);
  return Number.isFinite(valor) && valor > 0 ? Math.round(valor * 100) / 100 : 0;
}

/** Descrição da nota: plano/serviço da cobrança, senão o serviço padrão da unidade. */
export function descricaoDaNota(cobranca: Linha, config: Linha | null | undefined): string {
  if (cobrancaDeParceiro(cobranca)) return descricaoNotaCafeWorking(cobranca);
  const d = String(cobranca.descricao ?? "").trim();
  return d || String(config?.descricao_servico ?? "").trim() || "Serviço";
}

/**
 * Corpo da emissão (mesmo formato do emitir-nfse) a partir da cobrança e,
 * quando houver, do cadastro do cliente (endereço do tomador). Em parceiro, a
 * unidade emitente é a da config fiscal recebida (a da CafeWorking).
 */
export function pedidoDaCobranca(cobranca: Linha, cliente: Linha | null | undefined, config: Linha | null | undefined) {
  const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  return {
    unidade_id: String(cobrancaDeParceiro(cobranca) && config?.unidade_id ? config.unidade_id : cobranca.unidade_id),
    tomador: texto(cobranca.cliente) || texto(cliente?.nome) || "Cliente",
    tomador_documento: soDigitos(cobranca.cliente_documento),
    tomador_email: texto(cobranca.cliente_email) || texto(cliente?.email),
    valor: valorDaNota(cobranca),
    descricao: descricaoDaNota(cobranca, config),
    tomador_cep: texto(cliente?.cep),
    tomador_logradouro: texto(cliente?.endereco),
    tomador_numero: texto(cliente?.numero),
    tomador_bairro: texto(cliente?.bairro),
    tomador_cidade: texto(cliente?.cidade),
    tomador_uf: texto(cliente?.uf),
    cobranca_id: String(cobranca.id),
  };
}
