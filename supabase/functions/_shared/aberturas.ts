// ============================================================================
// Abertura de empresa — operações com banco usadas pela Edge Function aberturas
// e pelo asaas-webhook (processo criado quando o pagamento é confirmado).
// Regras puras (validação, etapas) ficam em abertura.ts.
// ============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getNotifProvider, renderTemplate } from "./notify/index.ts";
import type { Evento } from "./notify/types.ts";
import { APP_URL, avisarEquipe } from "./assinaturas.ts";
import { nomeExibicaoUnidade } from "./unidadeNome.ts";
import type { PapelAbertura } from "./abertura.ts";
import { avisarParceiro, linkParceiro } from "./parceirosDb.ts";

// deno-lint-ignore no-explicit-any
export type Linha = Record<string, any>;

export const BUCKET_ABERTURA = "documentos-abertura";
export const LINK_ABERTURAS_EQUIPE = `${APP_URL.replace(/\/+$/, "")}/?p=aberturas`;

// ---------------------------------------------------------------------------
// Quem é quem
// ---------------------------------------------------------------------------

export interface Acesso {
  admin: boolean;
  /** unidade_id → papel de trabalho na unidade (clientes ficam de fora) */
  unidades: Map<string, "equipe" | "contabilidade">;
}

export async function acessoDoUsuario(admin: SupabaseClient, userId: string): Promise<Acesso> {
  const [{ data: pa }, { data: membros, error }] = await Promise.all([
    admin.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle(),
    admin.from("unidade_members").select("unidade_id, role").eq("user_id", userId),
  ]);
  if (error) throw new Error(`unidade_members: ${error.message}`);
  const unidades = new Map<string, "equipe" | "contabilidade">();
  for (const m of membros || []) {
    if (m.role === "cliente") continue;
    unidades.set(m.unidade_id, m.role === "contabilidade" ? "contabilidade" : "equipe");
  }
  return { admin: !!pa, unidades };
}

/** Papel de trabalho no processo (admin, equipe ou contabilidade da unidade); null se não trabalha nele. */
export function papelDoTime(acesso: Acesso, unidadeId: string): Exclude<PapelAbertura, "cliente"> | null {
  if (acesso.admin) return "admin";
  return acesso.unidades.get(unidadeId) ?? null;
}

export const ehDono = (a: Linha, email: string) => String(a.cliente_email || "").toLowerCase() === String(email || "").toLowerCase();

// ---------------------------------------------------------------------------
// Histórico e avisos
// ---------------------------------------------------------------------------

export async function registrarEvento(admin: SupabaseClient, a: Linha, ev: {
  tipo: string; texto?: string | null; status_de?: string | null; status_para?: string | null; interno?: boolean;
  autor_id?: string | null; autor_email?: string | null; autor_papel: PapelAbertura | "sistema";
}) {
  const { error } = await admin.from("abertura_eventos").insert({
    abertura_id: a.id, unidade_id: a.unidade_id, tipo: ev.tipo, texto: ev.texto?.slice(0, 2000) ?? null,
    status_de: ev.status_de ?? null, status_para: ev.status_para ?? null, interno: ev.interno === true,
    autor_id: ev.autor_id ?? null, autor_email: ev.autor_email ?? null, autor_papel: ev.autor_papel,
  });
  if (error) console.error(`[aberturas] evento ${ev.tipo} ${a.id}:`, error.message);
}

/** E-mail ao cliente + registro em notificacoes. Nunca lança: o e-mail não desfaz a operação. */
export async function avisarClienteAbertura(admin: SupabaseClient, a: Linha, evento: Evento, dados: Record<string, unknown>) {
  try {
    const msg = renderTemplate(evento, { cliente: a.cliente_nome, email: a.cliente_email, plano: a.plano_nome, ...dados });
    const envio = await getNotifProvider("email").enviar({ ...msg, para: a.cliente_email });
    await admin.from("notificacoes").insert({
      unidade_id: a.unidade_id, cliente_nome: a.cliente_nome, destinatario: a.cliente_email, canal: "email",
      evento, template: evento, dados: { abertura_id: a.id },
      status: envio.ok ? "enviado" : "erro", assunto: msg.assunto, provider_id: envio.providerId ?? null,
      sent_at: envio.ok ? new Date().toISOString() : null, erro: envio.ok ? null : envio.erro,
    });
  } catch (e) {
    console.error(`[aberturas] avisarCliente ${evento} ${a.id}:`, (e as Error).message);
  }
}

/**
 * Caixa fixa da contabilidade parceira, que recebe todo aviso de abertura mesmo
 * sem login vinculado (secret EMAIL_CONTABILIDADE, vários separados por vírgula).
 */
const EMAIL_CONTABILIDADE_PADRAO = "paralegal@ciatoscontabilidade.com.br";
function emailsFixosDaContabilidade(): string[] {
  const env = Deno.env.get("EMAIL_CONTABILIDADE");
  return (env ?? EMAIL_CONTABILIDADE_PADRAO).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/** E-mails da contabilidade: caixa fixa + logins de contabilidade vinculados à unidade. */
export async function emailsDaContabilidade(admin: SupabaseClient, unidadeId: string): Promise<string[]> {
  const { data } = await admin.from("unidade_members").select("user_id").eq("unidade_id", unidadeId).eq("role", "contabilidade");
  const emails: string[] = emailsFixosDaContabilidade();
  for (const m of data || []) {
    const { data: u } = await admin.auth.admin.getUserById(m.user_id);
    if (u?.user?.email) emails.push(u.user.email.toLowerCase());
  }
  return [...new Set(emails)];
}

/** Aviso à contabilidade da unidade (mesmo layout do aviso à equipe). Nunca lança. */
export async function avisarContabilidade(admin: SupabaseClient, unidadeId: string, assunto: string, linhas: string[]) {
  try {
    for (const para of await emailsDaContabilidade(admin, unidadeId)) {
      const msg = renderTemplate("aviso_equipe", { email: para, assunto, linhas, link: LINK_ABERTURAS_EQUIPE });
      await getNotifProvider("email").enviar({ ...msg, para });
    }
  } catch (e) {
    console.error("[aberturas] avisarContabilidade:", (e as Error).message);
  }
}

export async function nomeUnidade(admin: SupabaseClient, unidadeId: string): Promise<{ nome: string; endereco: string; cidade: string }> {
  const { data } = await admin.from("unidades").select("nome, endereco, cidade").eq("id", unidadeId).maybeSingle();
  return { nome: nomeExibicaoUnidade(data?.nome), endereco: data?.endereco || "", cidade: data?.cidade || "" };
}

// ---------------------------------------------------------------------------
// Criação
// ---------------------------------------------------------------------------

/**
 * Cria o processo (idempotente pela assinatura ou pelo cadastro pago) e manda o
 * e-mail "Preencha os dados". Devolve { abertura, criada }.
 */
export async function criarAbertura(admin: SupabaseClient, dados: {
  unidade_id: string; cliente_email: string; cliente_nome: string; plano_nome?: string | null;
  origem: "venda" | "equipe"; usa_endereco_unidade: boolean;
  assinatura_id?: string | null; pending_signup_id?: string | null;
  autor?: { id: string; email: string; papel: PapelAbertura } | null;
  contato?: { telefone?: string | null; documento?: string | null } | null;
}): Promise<{ abertura: Linha; criada: boolean }> {
  const linha = {
    unidade_id: dados.unidade_id, cliente_email: dados.cliente_email.trim().toLowerCase(),
    cliente_nome: String(dados.cliente_nome || "").trim().slice(0, 200) || dados.cliente_email,
    plano_nome: dados.plano_nome ?? null, origem: dados.origem, usa_endereco_unidade: dados.usa_endereco_unidade,
    assinatura_id: dados.assinatura_id ?? null, pending_signup_id: dados.pending_signup_id ?? null,
    criado_por: dados.autor?.id ?? null,
  };
  const { data, error } = await admin.from("aberturas").insert(linha).select("*").single();
  if (error) {
    if (error.code !== "23505") throw new Error(`aberturas: ${error.message}`);
    const filtros = [
      linha.assinatura_id && `assinatura_id.eq.${linha.assinatura_id}`,
      linha.pending_signup_id && `pending_signup_id.eq.${linha.pending_signup_id}`,
    ].filter(Boolean).join(",");
    const { data: existente } = filtros
      ? await admin.from("aberturas").select("*").or(filtros).limit(1).maybeSingle()
      : { data: null };
    if (!existente) throw new Error(`aberturas: ${error.message}`);
    return { abertura: existente, criada: false };
  }

  await registrarEvento(admin, data, {
    tipo: "criada", status_para: data.status,
    texto: dados.origem === "venda" ? "Processo aberto com a confirmação do pagamento." : "Processo aberto pela equipe.",
    autor_id: dados.autor?.id, autor_email: dados.autor?.email, autor_papel: dados.autor?.papel ?? "sistema",
  });
  const unidade = await nomeUnidade(admin, data.unidade_id);
  await avisarClienteAbertura(admin, data, "abertura_preencher", { unidade: unidade.nome, usaEnderecoUnidade: data.usa_endereco_unidade });
  await avisarContabilidade(admin, data.unidade_id, `Nova abertura de empresa: ${data.cliente_nome}`, [
    dados.origem === "venda" ? "Uma nova abertura de empresa foi contratada e paga." : "A equipe do CafeWorking abriu um novo processo de abertura de empresa.",
    "",
    `Cliente: ${data.cliente_nome}`,
    `E-mail: ${data.cliente_email}`,
    ...(dados.contato?.telefone ? [`Telefone: ${dados.contato.telefone}`] : []),
    ...(dados.contato?.documento ? [`CPF/CNPJ: ${dados.contato.documento}`] : []),
    ...(data.plano_nome ? [`Plano: ${data.plano_nome}`] : []),
    `Unidade: ${unidade.nome}`,
    data.usa_endereco_unidade
      ? "Endereço da empresa: endereço fiscal do CafeWorking (IPTU e índice cadastral vêm do kit da unidade)."
      : "Endereço da empresa: endereço próprio do cliente (ele anexa o IPTU do local).",
    "",
    "Próximos passos:",
    "1. Entre no sistema pelo botão abaixo com o seu login de Contabilidade e abra o menu Abertura de empresas.",
    "2. O cliente já recebeu o pedido para preencher os dados e anexar os documentos. Você recebe outro e-mail quando ele enviar.",
    "3. Se ainda não tiver login, peça à equipe do CafeWorking (atendimento@cafeworking.com.br).",
  ]);
  // Unidade parceira: o parceiro acompanha a abertura (nunca lança; conta própria não recebe)
  await avisarParceiro(admin, data.unidade_id, `Abertura de empresa: ${data.cliente_nome}`, [
    dados.origem === "venda" ? "Uma abertura de empresa foi contratada e paga na sua unidade." : "Um processo de abertura de empresa foi aberto na sua unidade.",
    `Cliente: ${data.cliente_nome}`,
    `E-mail: ${data.cliente_email}`,
    ...(dados.contato?.telefone ? [`Telefone: ${dados.contato.telefone}`] : []),
    ...(dados.contato?.documento ? [`CPF/CNPJ: ${dados.contato.documento}`] : []),
    ...(data.plano_nome ? [`Plano: ${data.plano_nome}`] : []),
    data.usa_endereco_unidade
      ? "Endereço da empresa: o endereço fiscal da sua unidade (a contabilidade usa o IPTU e o índice cadastral do kit da unidade)."
      : "Endereço da empresa: endereço próprio do cliente.",
  ], linkParceiro("aberturas"));
  return { abertura: data, criada: true };
}

/**
 * Chamada pelo asaas-webhook na ativação de uma venda com abertura. Nunca lança:
 * a ativação do plano não pode falhar por causa do processo; se der errado, a
 * equipe é avisada para abrir o processo manualmente em Aberturas.
 */
export async function criarAberturaDaVenda(admin: SupabaseClient, ps: Linha, assinatura: Linha | null) {
  try {
    await criarAbertura(admin, {
      unidade_id: ps.unidade_id, cliente_email: ps.email, cliente_nome: ps.nome, plano_nome: ps.plano_nome,
      origem: "venda", usa_endereco_unidade: ps.categoria === "endereco_fiscal",
      assinatura_id: assinatura?.id ?? null, pending_signup_id: ps.id,
      contato: { telefone: ps.telefone ?? null, documento: ps.documento ?? null },
    });
  } catch (e) {
    console.error(`[aberturas] criar da venda ${ps.id}:`, (e as Error).message);
    await avisarEquipe(`Abertura de empresa não foi criada: ${ps.plano_nome}`, [
      `Cliente: ${ps.nome} (${ps.email})`,
      "O pagamento foi confirmado, mas o processo de abertura não foi criado automaticamente.",
      "Abra o processo em Aberturas > Novo processo.",
    ], LINK_ABERTURAS_EQUIPE);
  }
}
