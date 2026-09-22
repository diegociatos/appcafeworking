// ============================================================================
// Emissão de NFS-e compartilhada: a Edge Function emitir-nfse (ação da equipe)
// e o asaas-webhook (nota automática ao receber) usam o mesmo caminho.
//
// emitirNotaFiscal(admin, pedido, ator, opcoes)
//   1. config fiscal da unidade (existe e emissão ativa);
//   2. certificado do Vault → real, simulada ou recusada (exigirReal recusa a
//      simulada: a nota automática nunca é de teste);
//   3. cobrança (opcional): tem que ser da mesma unidade e não ter nota valendo
//      — conferido ANTES de transmitir, para não gerar nota fiscal duplicada;
//   4. nDPS reservado no banco (proximo_numero_dps), provider, grava a nota;
//   5. XML no Storage, e-mail ao tomador (só real em Produção), auditoria.
// Devolve { ok:false, status, error } nas recusas; só lança erro inesperado.
// A permissão de quem pede (master/financeiro) é conferida por quem chama.
//
// emitirNotaAoReceber(admin, paymentId): chamada pelo webhook. Nunca lança.
// ============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getFiscalCredentials } from "../fiscalVault.ts";
import { uploadNfseFile } from "../storage.ts";
import { dispatchNotificacao } from "../notify/index.ts";
import { registrarAuditoria } from "../audit.ts";
import { avisarEquipe } from "../assinaturas.ts";
import { getNfseProvider, FiscalError, type ConfigFiscal, type EmitirNfseInput } from "./index.ts";
import { modoEmissao, serieDps, MSG_SEM_CERTIFICADO } from "./dps.ts";
import { avaliarEmissaoAoReceber, cobrancaDeParceiro, descricaoDaNota, pedidoDaCobranca, valorDaNota } from "./aoReceber.ts";
import { MSG_SEM_UNIDADE_FISCAL, unidadeFiscalPlataforma } from "../parceirosDb.ts";

// deno-lint-ignore no-explicit-any
type Linha = Record<string, any>;

const APP_URL = Deno.env.get("APP_URL") ?? "https://app.cafeworking.com.br";

export interface PedidoNota {
  unidade_id: string;
  tomador: string;
  tomador_documento: string;
  tomador_email?: string | null;
  valor: number | string;
  descricao?: string | null;
  codigo_servico?: string;
  boleto_id?: string | null;
  cobranca_id?: string | null;
  tomador_cep?: string;
  tomador_logradouro?: string;
  tomador_numero?: string;
  tomador_bairro?: string;
  tomador_cidade?: string;
  tomador_uf?: string;
}

export interface AtorNota {
  id: string | null;
  email: string;
  ip?: string | null;
  origem?: string;        // "equipe" | "asaas-webhook"
}

export type ResultadoNota =
  | { ok: true; nota: Linha; simulada: boolean }
  | { ok: false; status: number; error: string; codigo?: string; emissor?: string; detail?: unknown };

const recusa = (status: number, error: string, extra: Partial<Extract<ResultadoNota, { ok: false }>> = {}): ResultadoNota =>
  ({ ok: false, status, error, ...extra });

export async function emitirNotaFiscal(
  admin: SupabaseClient, pedidoOriginal: PedidoNota, ator: AtorNota, opcoes: { exigirReal?: boolean } = {},
): Promise<ResultadoNota> {
  let pedido = pedidoOriginal;
  const cobrancaId = pedido.cobranca_id ? String(pedido.cobranca_id) : null;

  // 0) cobrança de unidade parceira: a nota é da CafeWorking, só da parte dela,
  //    pela config fiscal da CafeWorking (nunca pela do parceiro)
  let cobParceiro: Linha | null = null;
  if (cobrancaId) {
    const { data: c, error: cErr } = await admin.from("cobrancas").select("*").eq("id", cobrancaId).maybeSingle();
    if (cErr) return recusa(500, `Falha ao ler a cobrança: ${cErr.message}`);
    if (c && cobrancaDeParceiro(c)) {
      const fiscal = unidadeFiscalPlataforma();
      if (!fiscal) return recusa(412, MSG_SEM_UNIDADE_FISCAL, { codigo: "SEM_UNIDADE_FISCAL_PLATAFORMA" });
      if (pedido.unidade_id !== c.unidade_id && pedido.unidade_id !== fiscal) return recusa(400, "Cobrança não encontrada nesta unidade.");
      cobParceiro = c;
      pedido = { ...pedido, unidade_id: fiscal, valor: valorDaNota(c), descricao: descricaoDaNota(c, null) };
      if (!(Number(pedido.valor) > 0)) return recusa(400, "A parte da CafeWorking nesta cobrança é zero.");
    }
  }

  // 1) config fiscal da unidade
  const { data: config, error: cfgErr } = await admin
    .from("config_fiscal").select("*").eq("unidade_id", pedido.unidade_id)
    .maybeSingle<ConfigFiscal & { certificado_ref: string }>();
  if (cfgErr) return recusa(500, `Falha ao ler a configuração fiscal: ${cfgErr.message}`);
  if (!config) return recusa(404, "Configuração fiscal da unidade não encontrada. Preencha a aba Configuração fiscal.");
  if (!config.emissao_ativa) return recusa(409, "Emissão fiscal inativa nesta unidade");

  // 2) certificado do Vault (service_role): real, simulada ou recusada
  const creds = await getFiscalCredentials(admin, config.certificado_ref);
  const modo = modoEmissao(config.ambiente, creds);
  if (modo.tipo === "recusada") return recusa(412, modo.motivo, { codigo: "SEM_CERTIFICADO" });
  const simulada = modo.tipo === "simulada";
  if (simulada && opcoes.exigirReal) return recusa(412, MSG_SEM_CERTIFICADO, { codigo: "SEM_CERTIFICADO" });

  // 3) cobrança vinculada: mesma unidade (ou parceira, emitida pela CafeWorking) e ainda sem nota valendo
  if (cobrancaId) {
    const { data: cob, error: cobErr } = await admin
      .from("cobrancas").select("id, unidade_id, nota_id").eq("id", cobrancaId).maybeSingle();
    if (cobErr) return recusa(500, `Falha ao ler a cobrança: ${cobErr.message}`);
    if (!cob || (cob.unidade_id !== config.unidade_id && !cobParceiro)) return recusa(400, "Cobrança não encontrada nesta unidade.");
    const { data: existentes, error: nfErr } = await admin
      .from("notas_fiscais").select("id").eq("cobranca_id", cobrancaId).in("status", ["processando", "autorizada"]).limit(1);
    if (nfErr) return recusa(500, `Falha ao conferir notas da cobrança: ${nfErr.message}`);
    if ((existentes || []).length) {
      return recusa(409, "Esta cobrança já tem nota fiscal emitida.", { codigo: "NOTA_JA_EMITIDA" });
    }
  }

  const provider = getNfseProvider(config as ConfigFiscal, creds);

  // 4) número da DPS reservado no banco (a simulada não consome número)
  const serie = serieDps(config as unknown as Record<string, unknown>);
  let numeroDps: number | null = null;
  let rpsNumero: string;
  if (simulada) {
    rpsNumero = String(Date.now());
  } else {
    const { data: reservado, error: numErr } = await admin.rpc("proximo_numero_dps", {
      p_unidade_id: config.unidade_id, p_serie: serie,
    });
    if (numErr || !reservado) {
      return recusa(500, `Não foi possível reservar o número da DPS: ${numErr?.message ?? "sem retorno"}`);
    }
    numeroDps = Number(reservado);
    rpsNumero = String(numeroDps);
  }

  const input: EmitirNfseInput = {
    rpsNumero,
    tomador: {
      nome: pedido.tomador,
      documento: String(pedido.tomador_documento),
      email: pedido.tomador_email ?? undefined,
      cep: pedido.tomador_cep || undefined,
      logradouro: pedido.tomador_logradouro || undefined,
      numero: pedido.tomador_numero || undefined,
      bairro: pedido.tomador_bairro || undefined,
      municipio: pedido.tomador_cidade || undefined,
      uf: pedido.tomador_uf || undefined,
    },
    valor: Number(pedido.valor),
    descricao: pedido.descricao ?? config.descricao_servico,
    codigoServico: pedido.codigo_servico,
    boletoId: pedido.boleto_id ?? null,
  };

  let result;
  try {
    result = await provider.emitirNfse(input);
  } catch (e) {
    if (e instanceof FiscalError) {
      return recusa(e.httpStatus ?? 502, e.message, { emissor: e.emissor, detail: e.detail });
    }
    throw e;
  }
  // Defesa: nunca grava simulação como nota de verdade.
  const status = simulada ? "simulada" : result.status;

  // 5) grava a nota (service_role)
  const insert: Record<string, unknown> = {
    unidade_id: config.unidade_id,
    numero: result.numero ?? rpsNumero,
    rps_numero: rpsNumero,
    serie_dps: simulada ? null : serie,
    numero_dps: numeroDps,
    tomador: input.tomador.nome,
    tomador_documento: input.tomador.documento,
    descricao: input.descricao,
    valor: input.valor,
    iss: result.iss ?? null,
    emissor: config.emissor,
    nfse_id: result.nfseId,
    codigo_verificacao: result.codigoVerificacao ?? null,
    status,
    boleto_id: input.boletoId,
    created_by: ator.id,
  };
  // Só manda a coluna quando há cobrança: a função segue funcionando antes da migration 20260918120000.
  if (cobrancaId) insert.cobranca_id = cobrancaId;
  const { data: nota, error: insErr } = await admin.from("notas_fiscais").insert(insert).select().single();
  if (insErr) {
    if (insErr.code === "23505" && cobrancaId) {
      return recusa(409, "Esta cobrança já tem nota fiscal emitida.", { codigo: "NOTA_JA_EMITIDA" });
    }
    return recusa(500, `Falha ao gravar nota: ${insErr.message}`);
  }

  // XML → Storage (não bloqueia a resposta se falhar)
  if (result.xml) {
    const url = await uploadNfseFile(admin, `${config.unidade_id}/${nota.id}.xml`, result.xml);
    if (url) { await admin.from("notas_fiscais").update({ xml_url: url }).eq("id", nota.id); nota.xml_url = url; }
  }
  if (result.pdfUrl || result.pdfBase64) {
    const pdfUrl = result.pdfBase64
      ? await uploadNfseFile(admin, `${config.unidade_id}/${nota.id}.pdf`, result.pdfBase64, "application/pdf")
      : null;
    nota.pdf_url = pdfUrl || result.pdfUrl;
    await admin.from("notas_fiscais").update({ pdf_url: nota.pdf_url }).eq("id", nota.id);
  }
  // A cobrança passa a apontar para a nota (a simulada não conta: não impede a real).
  if (cobrancaId && !simulada) {
    const { error } = await admin.from("cobrancas").update({ nota_id: nota.id }).eq("id", cobrancaId).is("nota_id", null);
    if (error) console.error(`[nfse] vincular nota ${nota.id} à cobrança ${cobrancaId}:`, error.message);
  }

  // Envia a nota ao e-mail do tomador (Resend) — best-effort. Só nota real de
  // produção: simulada e produção restrita não têm valor fiscal.
  if (pedido.tomador_email && !simulada && config.ambiente === "producao") {
    await dispatchNotificacao(admin, {
      unidade_id: config.unidade_id, evento: "nfse_emitida", email: pedido.tomador_email, cliente: input.tomador.nome,
      dados: { numero: nota.numero, valor: input.valor, descricao: input.descricao, pdfUrl: nota.pdf_url || result.pdfUrl },
    });
  }

  await registrarAuditoria(admin, {
    unidade_id: config.unidade_id,
    ator_id: ator.id,
    ator_email: ator.email,
    acao: simulada ? "nfse.simulada" : "nfse.emitida",
    entidade: "nota_fiscal",
    entidade_id: nota.id,
    detalhe: {
      numero: nota.numero, rps_numero: rpsNumero, serie_dps: insert.serie_dps, numero_dps: numeroDps,
      valor: input.valor, tomador: input.tomador.nome, tomador_documento: input.tomador.documento,
      emissor: config.emissor, ambiente: config.ambiente, status, boleto_id: input.boletoId,
      cobranca_id: cobrancaId, origem: ator.origem ?? "equipe",
    },
    ip: ator.ip ?? null,
  });

  return { ok: true, nota, simulada };
}

// ---------------------------------------------------------------------------
// Nota automática ao receber (asaas-webhook)
// ---------------------------------------------------------------------------

/**
 * Emite a NFS-e da cobrança paga quando a unidade ligou "emitir ao receber".
 * Idempotente por cobrança (reivindica nota_status null → emitindo). Nunca
 * lança: qualquer falha vira nota_status 'erro' + aviso à equipe com o motivo.
 * Devolve um rótulo curto para o log/resposta do webhook.
 */
export async function emitirNotaAoReceber(admin: SupabaseClient, paymentId: string): Promise<string> {
  let cobranca: Linha | null = null;
  let reivindicada = false;

  const falhar = async (motivo: string) => {
    if (cobranca && reivindicada) {
      const { error } = await admin.from("cobrancas")
        .update({ nota_status: "erro", nota_erro: motivo.slice(0, 500) })
        .eq("id", cobranca.id).eq("nota_status", "emitindo");
      if (error) console.error(`[nota ao receber] marcar erro ${cobranca.id}:`, error.message);
    }
    await avisarEquipe(`Nota fiscal automática NÃO emitida: ${cobranca?.cliente || "cliente"}`, [
      `Motivo: ${motivo}`,
      `Cobrança: ${cobranca?.descricao || "—"} · R$ ${Number(cobranca?.valor_pago ?? cobranca?.valor ?? 0).toFixed(2)}`,
      `Cliente: ${cobranca?.cliente || "—"} (${cobranca?.cliente_documento || "sem CPF/CNPJ"})`,
      `Pagamento Asaas: ${paymentId}`,
      "O pagamento foi confirmado normalmente. Confira e emita a nota em Notas Fiscais ou na cobrança.",
    ], `${APP_URL}/?p=cobrancas`);
    return "nota_erro";
  };

  try {
    const { data: cob, error: cobErr } = await admin.from("cobrancas").select("*").eq("asaas_payment_id", paymentId).maybeSingle();
    if (cobErr) throw new Error(`cobrancas: ${cobErr.message}`);
    if (!cob) return "nota_sem_cobranca";
    cobranca = cob;

    // Unidade parceira: vale a config fiscal (e o "emitir ao receber") da CafeWorking.
    const parceiro = cobrancaDeParceiro(cob);
    const unidadeEmitente = parceiro ? unidadeFiscalPlataforma() : cob.unidade_id;
    let config: Linha | null = null;
    if (unidadeEmitente) {
      const { data, error: cfgErr } = await admin.from("config_fiscal").select("*").eq("unidade_id", unidadeEmitente).maybeSingle();
      if (cfgErr) throw new Error(`config_fiscal: ${cfgErr.message}`);
      config = data;
    }

    let avaliacao = avaliarEmissaoAoReceber(config, cob);
    if (parceiro && !unidadeEmitente && cob.status === "pago" && !cob.nota_id && !cob.nota_status) {
      avaliacao = { acao: "recusar", motivo: MSG_SEM_UNIDADE_FISCAL };
    }
    if (avaliacao.acao === "ignorar") return "nota_ignorada";

    // Só uma entrega do webhook passa daqui para a mesma cobrança.
    const { data: claim, error: claimErr } = await admin.from("cobrancas")
      .update({ nota_status: "emitindo", nota_erro: null })
      .eq("id", cob.id).is("nota_status", null).is("nota_id", null).select("id");
    if (claimErr) throw new Error(`reivindicar cobrança: ${claimErr.message}`);
    if (!claim?.length) return "nota_ja_tratada";
    reivindicada = true;

    if (avaliacao.acao === "recusar") return await falhar(avaliacao.motivo);

    const doc = String(cob.cliente_documento || "").replace(/\D/g, "");
    const { data: clientes } = await admin.from("clientes")
      .select("nome, email, documento, cep, endereco, numero, bairro, cidade, uf")
      .eq("unidade_id", cob.unidade_id).in("documento", [...new Set([doc, String(cob.cliente_documento || "")])].filter(Boolean))
      .limit(1);

    const r = await emitirNotaFiscal(
      admin, pedidoDaCobranca(cob, clientes?.[0] ?? null, config),
      { id: null, email: "asaas-webhook", origem: "asaas-webhook" }, { exigirReal: true },
    );
    if (!r.ok) return await falhar(r.error);

    const { error: fimErr } = await admin.from("cobrancas")
      .update({ nota_status: "emitida", nota_id: r.nota.id, nota_erro: null }).eq("id", cob.id);
    if (fimErr) console.error(`[nota ao receber] marcar emitida ${cob.id}:`, fimErr.message);
    return "nota_emitida";
  } catch (e) {
    console.error(`[nota ao receber] ${paymentId}:`, (e as Error)?.message ?? e);
    try {
      return await falhar((e as Error)?.message || "erro inesperado");
    } catch (e2) {
      console.error(`[nota ao receber] aviso à equipe ${paymentId}:`, (e2 as Error)?.message ?? e2);
      return "nota_erro";
    }
  }
}
