// ============================================================================
// Candidatura "Seja parceiro CafeWorking" — regras puras (sem rede e sem banco).
//
// O formulário do site chega na Edge Function parceiro-candidatura; aqui ficam
// a limpeza e a conferência dos campos, o nome da unidade que a aprovação vai
// criar e o checklist do que falta para o parceiro poder vender.
//
//   deno test supabase/functions/_shared/parceiroCandidatura_test.ts
// ============================================================================

import { documentoValido, emailValido, normalizarDocumento, somenteDigitos } from "./venda.ts";

export const SERVICOS_PARCEIRO = [
  ["endereco_fiscal", "Endereço fiscal"],
  ["sala_privativa", "Sala privativa"],
  ["escritorio_compartilhado", "Escritório compartilhado"],
  ["sala_reuniao", "Sala de reunião"],
] as const;

export type ServicoParceiro = typeof SERVICOS_PARCEIRO[number][0];

const SERVICOS = SERVICOS_PARCEIRO.map(([id]) => id) as readonly string[];
export const rotuloServico = (id: string) => SERVICOS_PARCEIRO.find(([v]) => v === id)?.[1] ?? id;

export const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE",
  "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;

export interface Candidatura {
  escritorio: string;
  tipo_pessoa: "PF" | "PJ";
  documento: string;
  responsavel: string;
  email: string;
  whatsapp: string;
  cidade: string;
  uf: string;
  endereco: string;
  servicos: string[];
  salas: number;
  observacoes: string | null;
}

export type ResultadoCandidatura =
  | { ok: true; dados: Candidatura }
  | { ok: false; erro: string };

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** "Belo Horizonte" → "Belo Horizonte" com iniciais maiúsculas e espaços normais. */
export function nomeDeCidade(valor: unknown): string {
  const bruto = texto(valor, 120).replace(/\s+/g, " ");
  if (!bruto) return "";
  const minusculas = new Set(["de", "da", "do", "das", "dos", "del", "e"]);
  return bruto
    .toLocaleLowerCase("pt-BR")
    .split(" ")
    .map((p, i) => (i > 0 && minusculas.has(p) ? p : p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1)))
    .join(" ");
}

/** Nome da unidade criada na aprovação: "CafeWorking Belo Horizonte". */
export const nomeDaUnidadeParceira = (cidade: unknown) => `CafeWorking ${nomeDeCidade(cidade) || "Unidade"}`.slice(0, 120);

/** "Belo Horizonte" + "MG" → "belo-horizonte-mg" (página do site e id da unidade). */
export function slugDaCidade(cidade: unknown, uf: unknown): string {
  const limpo = (s: unknown) =>
    String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const c = limpo(cidade);
  const u = limpo(uf);
  return [c, u].filter(Boolean).join("-");
}

/**
 * Limpa e confere o que veio do formulário. Mensagens em português, prontas para
 * a tela: quem preenche é um escritório, não um técnico.
 */
export function validarCandidatura(body: Record<string, unknown> | null | undefined): ResultadoCandidatura {
  if (!body || typeof body !== "object") return { ok: false, erro: "Preencha o formulário." };

  const escritorio = texto(body.escritorio, 200);
  if (escritorio.length < 2) return { ok: false, erro: "Informe o nome do escritório." };

  const documento = normalizarDocumento(body.documento);
  if (!documentoValido(documento)) return { ok: false, erro: "Informe um CNPJ ou CPF válido." };
  const tipo_pessoa = documento.length === 11 ? "PF" : "PJ";

  const responsavel = texto(body.responsavel, 200);
  if (responsavel.length < 3) return { ok: false, erro: "Informe o nome do responsável." };

  const email = texto(body.email, 200).toLowerCase();
  if (!emailValido(email)) return { ok: false, erro: "Informe um e-mail válido." };

  const whatsapp = texto(body.whatsapp ?? body.telefone, 30);
  if (somenteDigitos(whatsapp).length < 10) return { ok: false, erro: "Informe um WhatsApp com DDD." };

  const cidade = nomeDeCidade(body.cidade);
  if (cidade.length < 2) return { ok: false, erro: "Informe a cidade." };

  const uf = texto(body.uf, 2).toUpperCase();
  if (!(UFS as readonly string[]).includes(uf)) return { ok: false, erro: "Escolha a UF." };

  const endereco = texto(body.endereco, 300);
  if (endereco.length < 10) return { ok: false, erro: "Informe o endereço completo, com número e bairro." };

  const brutos = Array.isArray(body.servicos) ? body.servicos : [];
  const servicos = [...new Set(brutos.map((s) => String(s ?? "").trim()))].filter((s) => SERVICOS.includes(s));
  if (!servicos.length) return { ok: false, erro: "Escolha ao menos um serviço que você quer oferecer." };

  const salasBruto = Number(body.salas ?? 0);
  if (!Number.isFinite(salasBruto) || salasBruto < 0 || salasBruto > 999) {
    return { ok: false, erro: "Informe quantas salas você tem (0 a 999)." };
  }
  const salas = Math.trunc(salasBruto);

  if (body.aceite !== true && body.aceite !== "true" && body.aceite !== "on") {
    return { ok: false, erro: "Para continuar, aceite o contrato de parceria." };
  }

  const observacoes = texto(body.observacoes, 2000) || null;

  return {
    ok: true,
    dados: { escritorio, tipo_pessoa, documento, responsavel, email, whatsapp, cidade, uf, endereco, servicos, salas, observacoes },
  };
}

/** Linhas do e-mail à equipe e do resumo da tela. */
export function resumoDaCandidatura(c: Candidatura): string[] {
  return [
    `Escritório: ${c.escritorio}`,
    `${c.tipo_pessoa === "PF" ? "CPF" : "CNPJ"}: ${c.documento}`,
    `Responsável: ${c.responsavel}`,
    `E-mail: ${c.email}`,
    `WhatsApp: ${c.whatsapp}`,
    `Cidade: ${c.cidade}/${c.uf}`,
    `Endereço: ${c.endereco}`,
    `Quer oferecer: ${c.servicos.map(rotuloServico).join(", ")}`,
    `Salas disponíveis: ${c.salas}`,
    ...(c.observacoes ? [`Observações: ${c.observacoes}`] : []),
  ];
}

// ---------------------------------------------------------------------------
// Checklist da entrada (tela Parceiros e e-mail de boas-vindas)
// ---------------------------------------------------------------------------

/** Documentos do imóvel que o parceiro precisa enviar em Unidades → Documentos. */
export const KIT_ENDERECO_PARCEIRO = [
  { tipo: "iptu", titulo: "IPTU do imóvel", detalhe: "com o índice cadastral, que a abertura de empresa usa", obrigatorio: true },
  { tipo: "autorizacao_proprietario", titulo: "Autorização do proprietário", detalhe: "se o imóvel não é do parceiro", obrigatorio: true },
  { tipo: "avcb", titulo: "AVCB (Corpo de Bombeiros)", detalhe: "quando o imóvel tiver", obrigatorio: false },
] as const;

export interface EstadoParceiro {
  walletId?: string | null;
  tiposDeDocumento?: string[] | null;
  salasComFoto?: number | null;
  temContratoParceria?: boolean;
}

export interface ItemChecklist {
  id: string;
  titulo: string;
  detalhe: string;
  ok: boolean;
  trava: boolean; // impede a venda enquanto não estiver feito
}

/**
 * O que falta para o parceiro virar 'ativo' e vender. A carteira Asaas é a
 * única trava: sem ela a fase 1 já recusa a venda online.
 */
export function checklistDoParceiro(e: EstadoParceiro): ItemChecklist[] {
  const tipos = new Set((e.tiposDeDocumento || []).map((t) => String(t)));
  const itens: ItemChecklist[] = [{
    id: "wallet",
    titulo: "Carteira Asaas (walletId) em Contas",
    detalhe: "sem ela o split não sai e o parceiro não pode ficar ativo",
    ok: Boolean(String(e.walletId ?? "").trim()),
    trava: true,
  }];
  for (const d of KIT_ENDERECO_PARCEIRO) {
    itens.push({
      id: `kit_${d.tipo}`,
      titulo: `Kit do endereço: ${d.titulo}`,
      detalhe: `${d.detalhe}. Envie em Unidades → Documentos do endereço fiscal`,
      ok: tipos.has(d.tipo),
      trava: false,
    });
  }
  itens.push({
    id: "fotos",
    titulo: "Fotos das salas",
    detalhe: "o site mostra a foto no card da sala privativa",
    ok: Number(e.salasComFoto || 0) > 0,
    trava: false,
  });
  if (e.temContratoParceria === false) {
    itens.push({
      id: "contrato",
      titulo: "Publicar o contrato de parceria",
      detalhe: "nenhuma versão vigente da categoria \"parceria\" foi publicada; o aceite do parceiro não fica registrado",
      ok: false,
      trava: false,
    });
  }
  return itens;
}

/** Itens que faltam, em uma frase por linha (e-mail de boas-vindas). */
export const pendenciasDoParceiro = (itens: ItemChecklist[]) =>
  itens.filter((i) => !i.ok).map((i) => `${i.titulo} — ${i.detalhe}`);
