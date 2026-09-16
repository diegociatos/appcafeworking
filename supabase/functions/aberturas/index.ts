// ============================================================================
// Edge Function: aberturas  (abertura de empresa: cliente, contabilidade, equipe)
//
// Deploy com --no-verify-jwt: a autenticação é feita aqui (usuarioDoReq) e cada
// ação confere o papel na unidade do processo.
//
// GET  ?minhas=1                         → processos do cliente logado
// GET  [?unidade_id=&status=]            → processos das unidades em que o usuário
//                                          é equipe ou contabilidade (admin: todas)
// GET  ?id=<uuid>[&como=cliente]         → detalhe com documentos (links de 10 min),
//                                          histórico e kit da unidade
//
// POST { acao, id, ... }
//   cliente (dono, só com o processo com ele: aguardando_cliente/pendente_cliente)
//     salvar_rascunho { dados }
//     enviar          { dados? }            valida em _shared/abertura.ts → em_analise
//   cliente e contabilidade/equipe
//     url_upload       { lado, categoria, socio_id?, nome, mime, bytes } → { doc_id, upload_url }
//     confirmar_upload { lado, categoria, socio_id?, nome, doc_id }      confere o arquivo real
//     remover_documento { doc_id }          só quem enviou, com o processo aberto
//   contabilidade, equipe e admin da unidade
//     pedir_correcao  { texto }              → pendente_cliente + e-mail ao cliente
//     mudar_status    { status: em_registro | em_analise | cancelada, texto? }
//                                           (cancelada só equipe/admin, com motivo)
//     salvar_resultado { resultado }        rascunho dos dados da empresa aberta
//     concluir        { resultado }         valida dados + contrato social e cartão CNPJ
//   equipe e admin
//     criar { unidade_id, cliente_email, usa_endereco_unidade }  processo manual
//
// Tabelas só com select pela RLS; toda escrita passa por aqui (service_role).
// ============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { avisarEquipe, usuarioDoReq } from "../_shared/assinaturas.ts";
import { erroInterno } from "../_shared/clienteArea.ts";
import { caminhoDocumento } from "../_shared/ciclo.ts";
import { hojeBRT } from "../_shared/venda.ts";
import { padraoEmail } from "../_shared/reservaCliente.ts";
import { ipDaReq, registrarAuditoria } from "../_shared/audit.ts";
import { getNotifProvider, renderTemplate } from "../_shared/notify/index.ts";
import {
  type DocAbertura, DOCS_CONTABILIDADE, formatarCNPJ, normalizarDados, normalizarResultado, type PapelAbertura,
  pendenciasDaConclusao, pendenciasDoEnvio, podeMudarStatus, STATUS_ABERTURA, STATUS_EDITAVEL_CLIENTE, STATUS_EM_ANDAMENTO,
  validarArquivoAbertura,
} from "../_shared/abertura.ts";
import {
  type Acesso, acessoDoUsuario, avisarClienteAbertura, avisarContabilidade, BUCKET_ABERTURA, criarAbertura, ehDono, emailsDaContabilidade,
  LINK_ABERTURAS_EQUIPE, type Linha, nomeUnidade, papelDoTime, registrarEvento,
} from "../_shared/aberturas.ts";

/**
 * E-mail de teste para a contabilidade da unidade (caixa fixa + logins de
 * contabilidade), para confirmar que o aviso chega. Só equipe ou admin.
 * Devolve o resultado do envio por destinatário.
 */
async function testarEmailContabilidade(req: Request, admin: SupabaseClient, usuario: { id: string; email: string }, body: Linha, ac: Acesso) {
  const unidadeId = String(body?.unidade_id || "");
  if (papelDoTime(ac, unidadeId) === null || papelDoTime(ac, unidadeId) === "contabilidade") {
    return json({ error: "Só a equipe da unidade pode testar este aviso." }, 403, req);
  }
  const unidade = await nomeUnidade(admin, unidadeId);
  const resultados: { para: string; ok: boolean; erro?: string }[] = [];
  for (const para of await emailsDaContabilidade(admin, unidadeId)) {
    const msg = renderTemplate("aviso_equipe", {
      email: para,
      assunto: "Teste de aviso de abertura de empresa (pode ignorar)",
      linhas: [
        "Este é um e-mail de teste do sistema do CafeWorking.",
        `A cada nova abertura de empresa contratada na unidade ${unidade.nome}, você recebe um aviso como este, com os dados do cliente.`,
        "Para acompanhar os processos, entre no sistema pelo botão abaixo com o seu login de Contabilidade e abra o menu Abertura de empresas.",
        "Se este e-mail chegou no spam, marque como \"não é spam\" para os próximos avisos chegarem na caixa de entrada.",
      ],
      link: LINK_ABERTURAS_EQUIPE,
    });
    const envio = await getNotifProvider("email").enviar({ ...msg, para });
    resultados.push({ para, ok: envio.ok, ...(envio.ok ? {} : { erro: envio.erro }) });
  }
  await registrarAuditoria(admin, {
    acao: "abertura.testar_email_contabilidade", unidade_id: unidadeId, ator_id: usuario.id, ator_email: usuario.email,
    entidade: "unidade", entidade_id: unidadeId, detalhe: { resultados }, ip: ipDaReq(req),
  });
  return json({ ok: resultados.length > 0 && resultados.every((r) => r.ok), resultados }, 200, req);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALIDADE_LINK_S = 600;
const MAX_DOCUMENTOS = 60;
const MAX_JSON_DADOS = 60_000;
const FALHA_ARQUIVO = "Não foi possível guardar o arquivo. Tente de novo.";
const NAO_ENCONTRADO = "Processo de abertura não encontrado.";
const COM_CONTABILIDADE = "Os dados já foram enviados para a contabilidade. Se precisar mudar algo, fale com a recepção.";

const ROTULO_STATUS: Record<string, string> = {
  aguardando_cliente: "Aguardando os dados do cliente",
  em_analise: "Em análise pela contabilidade",
  pendente_cliente: "Correção pedida ao cliente",
  em_registro: "Em registro na Junta Comercial / Redesim",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

type Usuario = { id: string; email: string };

async function carregar(admin: SupabaseClient, id: unknown): Promise<Linha | null> {
  if (typeof id !== "string" || !UUID.test(id)) return null;
  const { data } = await admin.from("aberturas").select("*").eq("id", id).maybeSingle();
  return data;
}

async function documentosDe(admin: SupabaseClient, aberturaId: string): Promise<Linha[]> {
  const { data, error } = await admin.from("abertura_documentos")
    .select("id, lado, categoria, socio_id, nome_arquivo, mime, bytes, storage_path, enviado_por, enviado_papel, created_at")
    .eq("abertura_id", aberturaId).order("created_at");
  if (error) throw new Error(`abertura_documentos: ${error.message}`);
  return data || [];
}

async function comLinks(admin: SupabaseClient, bucket: string, docs: Linha[]): Promise<Linha[]> {
  if (!docs.length) return [];
  const { data: links, error } = await admin.storage.from(bucket).createSignedUrls(docs.map((d) => d.storage_path), VALIDADE_LINK_S);
  if (error) throw new Error(`links ${bucket}: ${error.message}`);
  const porCaminho = new Map((links || []).map((l) => [l.path, l.signedUrl]));
  return docs.map(({ storage_path, ...d }) => ({ ...d, url: porCaminho.get(storage_path) || null }));
}

function auditar(admin: SupabaseClient, req: Request, u: Usuario, a: Linha, acao: string, detalhe: Record<string, unknown> = {}) {
  return registrarAuditoria(admin, {
    unidade_id: a.unidade_id, ator_id: u.id, ator_email: u.email, acao: `abertura.${acao}`,
    entidade: "abertura", entidade_id: a.id, detalhe, ip: ipDaReq(req),
  });
}

/** Troca de etapa só se ninguém mexeu no meio do caminho (status ainda é o lido). */
async function atualizarSeStatus(admin: SupabaseClient, a: Linha, patch: Record<string, unknown>): Promise<Linha | null> {
  const { data, error } = await admin.from("aberturas").update(patch).eq("id", a.id).eq("status", a.status).select("*");
  if (error) throw new Error(`aberturas: ${error.message}`);
  return data?.[0] ?? null;
}

const textoDe = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim().slice(0, max) : "");

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

async function listar(req: Request, admin: SupabaseClient, u: Usuario, acesso: () => Promise<Acesso>) {
  const params = new URL(req.url).searchParams;
  const colunas = "id, unidade_id, cliente_nome, cliente_email, plano_nome, origem, usa_endereco_unidade, status, pendencia, " +
    "enviado_em, concluido_em, cancelado_em, created_at, updated_at, tipo_empresa:dados->empresa->>tipo, " +
    "razao_social:resultado->>razao_social, cnpj:resultado->>cnpj";

  if (params.get("minhas") === "1") {
    const { data, error } = await admin.from("aberturas")
      .select("id, unidade_id, plano_nome, usa_endereco_unidade, status, pendencia, enviado_em, concluido_em, created_at, updated_at, razao_social:resultado->>razao_social")
      .eq("cliente_email", u.email).order("created_at", { ascending: false });
    if (error) throw new Error(`aberturas: ${error.message}`);
    return json({ aberturas: data || [], papel: "cliente" }, 200, req);
  }

  const ac = await acesso();
  const unidadeId = params.get("unidade_id") || "";
  const status = params.get("status") || "";
  let unidades: string[] | null;
  if (ac.admin) unidades = unidadeId ? [unidadeId] : null;
  else {
    unidades = [...ac.unidades.keys()].filter((id) => !unidadeId || id === unidadeId);
    if (!unidades.length) return json({ error: "Acesso só da equipe ou da contabilidade da unidade." }, 403, req);
  }

  let q = admin.from("aberturas").select(colunas).order("updated_at", { ascending: false }).limit(500);
  if (unidades) q = q.in("unidade_id", unidades);
  if (status && (STATUS_ABERTURA as readonly string[]).includes(status)) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new Error(`aberturas: ${error.message}`);

  const ids = [...new Set((data || []).map((a: Linha) => a.unidade_id))];
  const nomes = new Map<string, string>();
  for (const id of ids) nomes.set(id, (await nomeUnidade(admin, id)).nome);

  const papeis = unidades ? unidades.map((id) => papelDoTime(ac, id)) : ["admin"];
  const papel = ac.admin ? "admin" : papeis.includes("equipe") ? "equipe" : "contabilidade";
  return json({
    aberturas: (data || []).map((a: Linha) => ({ ...a, unidade: nomes.get(a.unidade_id) || "" })),
    papel,
  }, 200, req);
}

async function detalhe(req: Request, admin: SupabaseClient, u: Usuario, a: Linha, papelTime: string | null, dono: boolean) {
  const comoCliente = dono && (!papelTime || new URL(req.url).searchParams.get("como") === "cliente");
  const visao: PapelAbertura = comoCliente ? "cliente" : (papelTime as PapelAbertura);

  const [docs, { data: eventos, error: eErr }, unidade] = await Promise.all([
    documentosDe(admin, a.id),
    admin.from("abertura_eventos").select("id, tipo, status_de, status_para, texto, interno, autor_papel, autor_email, created_at")
      .eq("abertura_id", a.id).order("created_at"),
    nomeUnidade(admin, a.unidade_id),
  ]);
  if (eErr) throw new Error(`abertura_eventos: ${eErr.message}`);

  // Anexos da contabilidade só aparecem ao cliente com o processo concluído.
  const visiveis = visao === "cliente" ? docs.filter((d) => d.lado === "cliente" || a.status === "concluida") : docs;
  const documentos = (await comLinks(admin, BUCKET_ABERTURA, visiveis)).map((d) => {
    const { enviado_por, ...resto } = d;
    return { ...resto, meu: enviado_por === u.id };
  });

  let kit: Linha[] = [];
  if (a.usa_endereco_unidade) {
    const { data: kitDocs } = await admin.from("unidade_documentos")
      .select("id, tipo, titulo, numero, validade, storage_path, created_at")
      .eq("unidade_id", a.unidade_id).in("tipo", ["iptu", "avcb", "habite_se", "alvara"])
      .order("tipo").order("created_at", { ascending: false });
    kit = await comLinks(admin, "documentos-unidade", kitDocs || []);
  }

  const abertura = visao === "cliente"
    ? {
      id: a.id, cliente_nome: a.cliente_nome, cliente_email: a.cliente_email, plano_nome: a.plano_nome,
      usa_endereco_unidade: a.usa_endereco_unidade, status: a.status, dados: a.dados, pendencia: a.pendencia,
      resultado: a.status === "concluida" ? a.resultado : {}, enviado_em: a.enviado_em, concluido_em: a.concluido_em,
      cancelado_em: a.cancelado_em, created_at: a.created_at, updated_at: a.updated_at,
    }
    : a;

  const historico = (eventos || [])
    .filter((e) => visao !== "cliente" || !e.interno)
    .map((e) => (visao === "cliente" ? { ...e, autor_email: null } : e));

  return json({
    abertura, documentos, eventos: historico, kit, unidade, papel: visao, hoje: hojeBRT(),
    validade_link_minutos: VALIDADE_LINK_S / 60,
  }, 200, req);
}

// ---------------------------------------------------------------------------
// Documentos
// ---------------------------------------------------------------------------

/** Confere se quem chama pode mexer nos anexos daquele lado; devolve a mensagem de recusa ou null. */
function recusaDocumento(a: Linha, lado: string, dono: boolean, papelTime: string | null): string | null {
  if (lado === "cliente") {
    if (!dono) return NAO_ENCONTRADO;
    if (!STATUS_EDITAVEL_CLIENTE.includes(a.status)) return COM_CONTABILIDADE;
    return null;
  }
  if (lado === "contabilidade") {
    if (!papelTime) return NAO_ENCONTRADO;
    if (!STATUS_EM_ANDAMENTO.includes(a.status)) return "Este processo está encerrado.";
    return null;
  }
  return "Tipo de documento inválido.";
}

function socioExiste(a: Linha, socioId: unknown): boolean {
  return !socioId || (Array.isArray(a.dados?.socios) && a.dados.socios.some((s: Linha) => s?.id === socioId));
}

async function urlUpload(req: Request, admin: SupabaseClient, a: Linha, body: Linha, dono: boolean, papelTime: string | null) {
  const lado = String(body.lado || "");
  const recusa = recusaDocumento(a, lado, dono, papelTime);
  if (recusa) return json({ error: recusa }, recusa === NAO_ENCONTRADO ? 404 : 409, req);
  const arquivo = {
    lado, categoria: String(body.categoria || ""), socio_id: body.socio_id ? String(body.socio_id) : null,
    nome: String(body.nome || ""), mime: String(body.mime || ""), bytes: Number(body.bytes || 0),
  };
  const v = validarArquivoAbertura(arquivo);
  if (!v.ok) return json({ error: v.erro }, 400, req);
  if (!socioExiste(a, arquivo.socio_id)) return json({ error: "Salve os dados do sócio antes de anexar." }, 409, req);
  const { count } = await admin.from("abertura_documentos").select("id", { count: "exact", head: true }).eq("abertura_id", a.id);
  if ((count || 0) >= MAX_DOCUMENTOS) return json({ error: "Limite de anexos atingido. Remova algum antes de enviar outro." }, 409, req);

  const docId = crypto.randomUUID();
  const caminho = caminhoDocumento(a.unidade_id, a.id, arquivo.nome, docId);
  const { data, error } = await admin.storage.from(BUCKET_ABERTURA).createSignedUploadUrl(caminho);
  if (error || !data?.signedUrl) {
    console.error("[aberturas] link de envio", error?.message);
    return json({ error: FALHA_ARQUIVO }, 500, req);
  }
  return json({ ok: true, doc_id: docId, upload_url: data.signedUrl }, 200, req);
}

async function confirmarUpload(
  req: Request, admin: SupabaseClient, u: Usuario, a: Linha, body: Linha, dono: boolean, papelTime: string | null,
) {
  const lado = String(body.lado || "");
  const recusa = recusaDocumento(a, lado, dono, papelTime);
  if (recusa) return json({ error: recusa }, recusa === NAO_ENCONTRADO ? 404 : 409, req);
  const docId = String(body.doc_id || "");
  if (!UUID.test(docId)) return json({ error: "Envio inválido. Tente de novo." }, 400, req);
  const nome = String(body.nome || "");
  const categoria = String(body.categoria || "");
  const socioId = body.socio_id ? String(body.socio_id) : null;

  // O caminho é recalculado aqui: o navegador não escolhe onde o arquivo fica.
  const caminho = caminhoDocumento(a.unidade_id, a.id, nome, docId);
  const pasta = caminho.slice(0, caminho.lastIndexOf("/"));
  const arquivoNome = caminho.slice(caminho.lastIndexOf("/") + 1);
  const { data: itens, error: lErr } = await admin.storage.from(BUCKET_ABERTURA).list(pasta, { search: docId, limit: 5 });
  if (lErr) {
    console.error("[aberturas] conferir envio", lErr.message);
    return json({ error: FALHA_ARQUIVO }, 500, req);
  }
  const obj = (itens || []).find((i) => i.name === arquivoNome);
  if (!obj) return json({ error: "O arquivo não chegou. Envie de novo." }, 400, req);
  const { data: jaTem } = await admin.from("abertura_documentos").select("id").eq("id", docId).maybeSingle();
  if (jaTem) return json({ ok: true, repetido: true }, 200, req);

  // deno-lint-ignore no-explicit-any
  const meta = (obj.metadata || {}) as any;
  const arquivo = { lado, categoria, socio_id: socioId, nome, mime: String(meta.mimetype || ""), bytes: Number(meta.size || 0) };
  const v = validarArquivoAbertura(arquivo);
  if (!v.ok || !socioExiste(a, socioId)) {
    await admin.storage.from(BUCKET_ABERTURA).remove([caminho]);
    return json({ error: v.erro || "Salve os dados do sócio antes de anexar." }, 400, req);
  }

  const papel = lado === "cliente" ? "cliente" : papelTime;
  const { data: doc, error } = await admin.from("abertura_documentos").insert({
    id: docId, abertura_id: a.id, unidade_id: a.unidade_id, lado, categoria, socio_id: socioId,
    nome_arquivo: nome.slice(0, 200), mime: arquivo.mime, bytes: arquivo.bytes, storage_path: caminho,
    enviado_por: u.id, enviado_papel: papel,
  }).select("id, lado, categoria, socio_id, nome_arquivo, mime, bytes, enviado_papel, created_at").single();
  if (error) {
    await admin.storage.from(BUCKET_ABERTURA).remove([caminho]);
    throw new Error(`abertura_documentos: ${error.message}`);
  }

  if (lado === "contabilidade") {
    await registrarEvento(admin, a, {
      tipo: "documento", interno: true, texto: `Anexou: ${DOCS_CONTABILIDADE[categoria]} (${doc.nome_arquivo}).`,
      autor_id: u.id, autor_email: u.email, autor_papel: papel as PapelAbertura,
    });
  }
  await auditar(admin, req, u, a, "documento_enviado", { documento_id: docId, lado, categoria, socio_id: socioId });
  return json({ ok: true, documento: { ...doc, meu: true } }, 201, req);
}

async function removerDocumento(
  req: Request, admin: SupabaseClient, u: Usuario, a: Linha, body: Linha, dono: boolean, papelTime: string | null,
) {
  const docId = String(body.doc_id || "");
  if (!UUID.test(docId)) return json({ error: "Documento não encontrado." }, 404, req);
  const { data: doc } = await admin.from("abertura_documentos").select("*").eq("id", docId).eq("abertura_id", a.id).maybeSingle();
  if (!doc) return json({ error: "Documento não encontrado." }, 404, req);
  const recusa = recusaDocumento(a, doc.lado, dono, papelTime);
  if (recusa) return json({ error: recusa }, recusa === NAO_ENCONTRADO ? 404 : 409, req);
  if (doc.enviado_por !== u.id) return json({ error: "Só quem enviou o arquivo pode removê-lo." }, 403, req);

  const { error: sErr } = await admin.storage.from(BUCKET_ABERTURA).remove([doc.storage_path]);
  if (sErr) console.error("[aberturas] remover arquivo", sErr.message);
  const { error } = await admin.from("abertura_documentos").delete().eq("id", doc.id);
  if (error) throw new Error(`abertura_documentos: ${error.message}`);

  if (doc.lado === "contabilidade") {
    await registrarEvento(admin, a, {
      tipo: "documento", interno: true, texto: `Removeu: ${DOCS_CONTABILIDADE[doc.categoria]} (${doc.nome_arquivo}).`,
      autor_id: u.id, autor_email: u.email, autor_papel: papelTime as PapelAbertura,
    });
  }
  await auditar(admin, req, u, a, "documento_removido", { documento_id: doc.id, lado: doc.lado, categoria: doc.categoria });
  return json({ ok: true }, 200, req);
}

/** Anexos de sócio que ficaram sem sócio (sócio removido do formulário). */
async function limparAnexosOrfaos(admin: SupabaseClient, a: Linha, socioIds: string[]) {
  const { data } = await admin.from("abertura_documentos").select("id, storage_path, socio_id")
    .eq("abertura_id", a.id).eq("lado", "cliente").not("socio_id", "is", null);
  const orfaos = (data || []).filter((d) => !socioIds.includes(d.socio_id));
  if (!orfaos.length) return;
  await admin.storage.from(BUCKET_ABERTURA).remove(orfaos.map((d) => d.storage_path));
  await admin.from("abertura_documentos").delete().in("id", orfaos.map((d) => d.id));
}

// ---------------------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------------------

async function salvarDados(admin: SupabaseClient, a: Linha, bruto: unknown): Promise<Linha | "grande" | "mudou"> {
  if (JSON.stringify(bruto ?? {}).length > MAX_JSON_DADOS) return "grande";
  const dados = normalizarDados(bruto);
  const { data, error } = await admin.from("aberturas").update({ dados }).eq("id", a.id)
    .in("status", STATUS_EDITAVEL_CLIENTE).select("*");
  if (error) throw new Error(`aberturas: ${error.message}`);
  if (!data?.length) return "mudou";
  await limparAnexosOrfaos(admin, a, dados.socios.map((s) => s.id));
  return data[0];
}

async function salvarRascunho(req: Request, admin: SupabaseClient, a: Linha, body: Linha, dono: boolean) {
  if (!dono) return json({ error: NAO_ENCONTRADO }, 404, req);
  if (!STATUS_EDITAVEL_CLIENTE.includes(a.status)) return json({ error: COM_CONTABILIDADE }, 409, req);
  const r = await salvarDados(admin, a, body.dados);
  if (r === "grande") return json({ error: "Texto longo demais. Resuma as atividades e tente de novo." }, 413, req);
  if (r === "mudou") return json({ error: COM_CONTABILIDADE }, 409, req);
  return json({ ok: true, dados: r.dados, updated_at: r.updated_at }, 200, req);
}

async function enviar(req: Request, admin: SupabaseClient, u: Usuario, a0: Linha, body: Linha, dono: boolean) {
  if (!dono) return json({ error: NAO_ENCONTRADO }, 404, req);
  if (!STATUS_EDITAVEL_CLIENTE.includes(a0.status)) return json({ error: COM_CONTABILIDADE }, 409, req);
  let a = a0;
  if (body.dados !== undefined) {
    const r = await salvarDados(admin, a0, body.dados);
    if (r === "grande") return json({ error: "Texto longo demais. Resuma as atividades e tente de novo." }, 413, req);
    if (r === "mudou") return json({ error: COM_CONTABILIDADE }, 409, req);
    a = r;
  }

  const docs = await documentosDe(admin, a.id);
  const pendencias = pendenciasDoEnvio(a.dados, docs as DocAbertura[], a.usa_endereco_unidade, hojeBRT());
  if (pendencias.length) {
    return json({ error: "Ainda faltam informações. Confira a lista e tente de novo.", pendencias }, 422, req);
  }

  const reenvio = a.status === "pendente_cliente";
  const novo = await atualizarSeStatus(admin, a, { status: "em_analise", enviado_em: new Date().toISOString(), pendencia: null });
  if (!novo) return json({ error: COM_CONTABILIDADE }, 409, req);

  await registrarEvento(admin, novo, {
    tipo: "enviada", status_de: a.status, status_para: "em_analise",
    texto: reenvio ? "Correção enviada para a contabilidade." : "Dados enviados para a contabilidade.",
    autor_id: u.id, autor_email: u.email, autor_papel: "cliente",
  });
  const unidade = await nomeUnidade(admin, a.unidade_id);
  const linhas = [
    `Cliente: ${a.cliente_nome} (${a.cliente_email})`,
    `Unidade: ${unidade.nome}${a.usa_endereco_unidade ? " (empresa no endereço fiscal da unidade)" : " (endereço próprio)"}`,
    `Tipo: ${a.dados?.empresa?.tipo || "não informado"} · sócios: ${(a.dados?.socios || []).length}`,
    "Confira em Aberturas no app.",
  ];
  const assunto = `${reenvio ? "Correção recebida" : "Dados para abertura recebidos"}: ${a.cliente_nome}`;
  await avisarEquipe(assunto, linhas, LINK_ABERTURAS_EQUIPE);
  await avisarContabilidade(admin, a.unidade_id, assunto, linhas);
  await auditar(admin, req, u, a, "enviada", { reenvio });
  return json({ ok: true, status: "em_analise" }, 200, req);
}

// ---------------------------------------------------------------------------
// Contabilidade e equipe
// ---------------------------------------------------------------------------

async function pedirCorrecao(req: Request, admin: SupabaseClient, u: Usuario, a: Linha, body: Linha, papel: PapelAbertura) {
  if (!podeMudarStatus(a.status, "pendente_cliente", papel)) {
    return json({ error: "Só dá para pedir correção com o processo em análise ou em registro." }, 409, req);
  }
  const texto = textoDe(body.texto, 2000);
  if (texto.length < 10) return json({ error: "Explique ao cliente o que precisa ser corrigido (pelo menos 10 caracteres)." }, 400, req);
  const novo = await atualizarSeStatus(admin, a, { status: "pendente_cliente", pendencia: texto });
  if (!novo) return json({ error: "O processo mudou enquanto você editava. Atualize a tela." }, 409, req);
  await registrarEvento(admin, novo, {
    tipo: "correcao_pedida", status_de: a.status, status_para: "pendente_cliente", texto,
    autor_id: u.id, autor_email: u.email, autor_papel: papel,
  });
  await avisarClienteAbertura(admin, novo, "abertura_pendencia", { pendencia: texto });
  await auditar(admin, req, u, a, "correcao_pedida", { texto });
  return json({ ok: true, status: "pendente_cliente" }, 200, req);
}

async function mudarStatus(req: Request, admin: SupabaseClient, u: Usuario, a: Linha, body: Linha, papel: PapelAbertura) {
  const para = String(body.status || "");
  if (!["em_registro", "em_analise", "cancelada"].includes(para)) return json({ error: "Etapa inválida." }, 400, req);
  if (!podeMudarStatus(a.status, para, papel)) {
    const msg = para === "cancelada" && papel === "contabilidade"
      ? "Só a equipe do CafeWorking pode cancelar o processo."
      : `Não dá para passar de "${ROTULO_STATUS[a.status]}" para "${ROTULO_STATUS[para]}".`;
    return json({ error: msg }, papel === "contabilidade" && para === "cancelada" ? 403 : 409, req);
  }
  const texto = textoDe(body.texto, 2000);
  if (para === "cancelada" && texto.length < 5) return json({ error: "Informe o motivo do cancelamento." }, 400, req);

  const patch: Record<string, unknown> = { status: para };
  if (para === "cancelada") patch.cancelado_em = new Date().toISOString();
  const novo = await atualizarSeStatus(admin, a, patch);
  if (!novo) return json({ error: "O processo mudou enquanto você editava. Atualize a tela." }, 409, req);

  const padrao: Record<string, string> = {
    em_registro: "Pedido protocolado na Junta Comercial / Redesim.",
    em_analise: "Processo voltou para análise.",
    cancelada: "Processo cancelado.",
  };
  await registrarEvento(admin, novo, {
    tipo: para === "cancelada" ? "cancelada" : "status", status_de: a.status, status_para: para,
    texto: texto ? (para === "cancelada" ? `Processo cancelado. Motivo: ${texto}` : texto) : padrao[para],
    autor_id: u.id, autor_email: u.email, autor_papel: papel,
  });
  if (para === "cancelada") {
    await avisarEquipe(`Abertura cancelada: ${a.cliente_nome}`, [`Cliente: ${a.cliente_nome} (${a.cliente_email})`, `Motivo: ${texto}`, `Por: ${u.email}`], LINK_ABERTURAS_EQUIPE);
  }
  await auditar(admin, req, u, a, para === "cancelada" ? "cancelada" : "status", { de: a.status, para, texto: texto || null });
  return json({ ok: true, status: para }, 200, req);
}

async function salvarResultado(req: Request, admin: SupabaseClient, u: Usuario, a: Linha, body: Linha) {
  if (!["em_analise", "pendente_cliente", "em_registro"].includes(a.status)) {
    return json({ error: "Registre os dados da empresa com o processo em análise ou em registro." }, 409, req);
  }
  const resultado = normalizarResultado(body.resultado);
  const { data, error } = await admin.from("aberturas").update({ resultado }).eq("id", a.id).eq("status", a.status).select("resultado, updated_at");
  if (error) throw new Error(`aberturas: ${error.message}`);
  if (!data?.length) return json({ error: "O processo mudou enquanto você editava. Atualize a tela." }, 409, req);
  await auditar(admin, req, u, a, "resultado_salvo", {});
  return json({ ok: true, resultado: data[0].resultado, updated_at: data[0].updated_at }, 200, req);
}

async function concluir(req: Request, admin: SupabaseClient, u: Usuario, a: Linha, body: Linha, papel: PapelAbertura) {
  if (!podeMudarStatus(a.status, "concluida", papel)) {
    return json({ error: "Só dá para concluir com o processo em análise ou em registro." }, 409, req);
  }
  const resultado = normalizarResultado(body.resultado ?? a.resultado);
  const docs = await documentosDe(admin, a.id);
  const pendencias = pendenciasDaConclusao(resultado, docs as DocAbertura[], hojeBRT());
  if (pendencias.length) {
    return json({ error: "Faltam dados para concluir. Confira a lista.", pendencias: pendencias.map((mensagem) => ({ etapa: "resultado", mensagem })) }, 422, req);
  }

  const novo = await atualizarSeStatus(admin, a, { status: "concluida", resultado, concluido_em: new Date().toISOString(), pendencia: null });
  if (!novo) return json({ error: "O processo mudou enquanto você editava. Atualize a tela." }, 409, req);

  const cnpj = formatarCNPJ(resultado.cnpj);
  await registrarEvento(admin, novo, {
    tipo: "concluida", status_de: a.status, status_para: "concluida",
    texto: `Empresa aberta: ${resultado.razao_social}, CNPJ ${cnpj}.`,
    autor_id: u.id, autor_email: u.email, autor_papel: papel,
  });

  // Cadastro do cliente na unidade: preenche o documento só se estiver vazio.
  try {
    const { data: clientes } = await admin.from("clientes").select("id, documento")
      .eq("unidade_id", a.unidade_id).ilike("email", padraoEmail(a.cliente_email));
    const vazios = (clientes || []).filter((c) => !String(c.documento || "").trim()).map((c) => c.id);
    if (vazios.length) await admin.from("clientes").update({ documento: cnpj }).in("id", vazios);
  } catch (e) {
    console.error("[aberturas] documento do cliente", (e as Error).message);
  }

  await avisarClienteAbertura(admin, novo, "abertura_concluida", { razaoSocial: resultado.razao_social, cnpj });
  await avisarEquipe(`Empresa aberta: ${resultado.razao_social}`, [
    `Cliente: ${a.cliente_nome} (${a.cliente_email})`, `CNPJ: ${cnpj}`,
    `Regime: ${resultado.regime_tributario}`, `Concluído por: ${u.email}`,
  ], LINK_ABERTURAS_EQUIPE);
  await auditar(admin, req, u, a, "concluida", { cnpj: resultado.cnpj });
  return json({ ok: true, status: "concluida" }, 200, req);
}

async function criar(req: Request, admin: SupabaseClient, u: Usuario, body: Linha, ac: Acesso) {
  const unidadeId = String(body.unidade_id || "");
  const papel = papelDoTime(ac, unidadeId);
  if (papel !== "equipe" && papel !== "admin") return json({ error: "Só a equipe da unidade abre processos manualmente." }, 403, req);
  const email = String(body.cliente_email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Escolha um cliente com e-mail cadastrado." }, 400, req);

  const { data: cliente } = await admin.from("clientes").select("id, nome, plano")
    .eq("unidade_id", unidadeId).ilike("email", padraoEmail(email)).limit(1).maybeSingle();
  if (!cliente) return json({ error: "Cliente não encontrado nesta unidade." }, 404, req);
  const { data: aberto } = await admin.from("aberturas").select("id").eq("unidade_id", unidadeId).eq("cliente_email", email)
    .in("status", STATUS_EM_ANDAMENTO).limit(1).maybeSingle();
  if (aberto) return json({ error: "Este cliente já tem um processo de abertura em andamento." }, 409, req);

  const { abertura } = await criarAbertura(admin, {
    unidade_id: unidadeId, cliente_email: email, cliente_nome: cliente.nome || email, plano_nome: cliente.plano || null,
    origem: "equipe", usa_endereco_unidade: body.usa_endereco_unidade === true,
    autor: { id: u.id, email: u.email, papel },
  });
  await auditar(admin, req, u, abertura, "criada", { cliente_email: email, usa_endereco_unidade: abertura.usa_endereco_unidade });
  return json({ ok: true, abertura }, 201, req);
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "Método não permitido" }, 405, req);

  try {
    const usuario = await usuarioDoReq(req);
    if (!usuario) return json({ error: "Entre na sua conta para continuar." }, 401, req);
    const admin = adminClient();
    let cacheAcesso: Acesso | null = null;
    const acesso = async () => (cacheAcesso ??= await acessoDoUsuario(admin, usuario.id));

    if (req.method === "GET") {
      const id = new URL(req.url).searchParams.get("id");
      if (!id) return await listar(req, admin, usuario, acesso);
      const a = await carregar(admin, id);
      if (!a) return json({ error: NAO_ENCONTRADO }, 404, req);
      const papelTime = papelDoTime(await acesso(), a.unidade_id);
      const dono = ehDono(a, usuario.email);
      if (!papelTime && !dono) return json({ error: NAO_ENCONTRADO }, 404, req);
      return await detalhe(req, admin, usuario, a, papelTime, dono);
    }

    const body = await req.json().catch(() => ({}));
    const acao = String(body?.acao || "");
    if (acao === "criar") return await criar(req, admin, usuario, body, await acesso());
    if (acao === "testar_email_contabilidade") return await testarEmailContabilidade(req, admin, usuario, body, await acesso());

    const a = await carregar(admin, body?.id);
    if (!a) return json({ error: NAO_ENCONTRADO }, 404, req);
    const dono = ehDono(a, usuario.email);
    const papelTime = papelDoTime(await acesso(), a.unidade_id);
    if (!dono && !papelTime) return json({ error: NAO_ENCONTRADO }, 404, req);

    switch (acao) {
      case "salvar_rascunho": return await salvarRascunho(req, admin, a, body, dono);
      case "enviar": return await enviar(req, admin, usuario, a, body, dono);
      case "url_upload": return await urlUpload(req, admin, a, body, dono, papelTime);
      case "confirmar_upload": return await confirmarUpload(req, admin, usuario, a, body, dono, papelTime);
      case "remover_documento": return await removerDocumento(req, admin, usuario, a, body, dono, papelTime);
    }

    if (!papelTime) return json({ error: "Acesso só da contabilidade ou da equipe da unidade." }, 403, req);
    switch (acao) {
      case "pedir_correcao": return await pedirCorrecao(req, admin, usuario, a, body, papelTime);
      case "mudar_status": return await mudarStatus(req, admin, usuario, a, body, papelTime);
      case "salvar_resultado": return await salvarResultado(req, admin, usuario, a, body);
      case "concluir": return await concluir(req, admin, usuario, a, body, papelTime);
    }
    return json({ error: "Ação inválida." }, 400, req);
  } catch (e) {
    return erroInterno(req, "aberturas", e);
  }
});
