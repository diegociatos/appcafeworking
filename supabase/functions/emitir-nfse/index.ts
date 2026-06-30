// ============================================================================
// Edge Function: emitir-nfse  (genérica, agnóstica de emissor)
//
// POST /functions/v1/emitir-nfse
// body: { unidade_id, tomador, tomador_documento, tomador_email?,
//         valor, descricao?, codigo_servico?, boleto_id? }
//
// Segurança (igual ao módulo de boletos):
//  1. Lê a config fiscal com o JWT do usuário → RLS garante que ele só emite
//     por unidades das quais é membro.
//  2. Lê o certificado A1 do Vault com service_role (nunca exposto ao cliente).
//  3. Chama o NfseProvider correto (adapter) e grava a nota.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { userClient, adminClient } from "../_shared/supabaseAdmin.ts";
import { getFiscalCredentials } from "../_shared/fiscalVault.ts";
import { uploadNfseFile } from "../_shared/storage.ts";
import { getNfseProvider, FiscalError, type ConfigFiscal, type EmitirNfseInput } from "../_shared/nfse/index.ts";
import { dispatchNotificacao } from "../_shared/notify/index.ts";
import { registrarAuditoria, ipDaReq } from "../_shared/audit.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const body = await req.json();
    for (const k of ["unidade_id", "tomador", "tomador_documento", "valor"]) {
      if (body?.[k] === undefined || body?.[k] === null || body?.[k] === "") {
        return json({ error: `Campo obrigatório ausente: ${k}` }, 400);
      }
    }

    // 1) usuário autenticado
    const user = userClient(req);
    const { data: auth } = await user.auth.getUser();
    if (!auth?.user) return json({ error: "Não autenticado" }, 401);

    // 2) config fiscal da unidade (RLS garante ownership)
    const { data: config, error: cfgErr } = await user
      .from("config_fiscal")
      .select("*")
      .eq("unidade_id", body.unidade_id)
      .single<ConfigFiscal & { certificado_ref: string }>();
    if (cfgErr || !config) return json({ error: "Configuração fiscal não encontrada ou sem acesso" }, 403);
    if (!config.emissao_ativa) return json({ error: "Emissão fiscal inativa nesta unidade" }, 409);

    // 3) certificado do Vault (service_role) + provider
    const admin = adminClient();
    const creds = await getFiscalCredentials(admin, config.certificado_ref);
    const provider = getNfseProvider(config as ConfigFiscal, creds);

    // 4) próximo número de RPS (sequencial por unidade)
    const { count } = await admin
      .from("notas_fiscais")
      .select("id", { count: "exact", head: true })
      .eq("unidade_id", config.unidade_id);
    const rpsNumero = String((count ?? 0) + 1).padStart(6, "0");

    const input: EmitirNfseInput = {
      rpsNumero,
      tomador: {
        nome: body.tomador,
        documento: String(body.tomador_documento),
        email: body.tomador_email,
      },
      valor: Number(body.valor),
      descricao: body.descricao ?? config.descricao_servico,
      codigoServico: body.codigo_servico,
      boletoId: body.boleto_id ?? null,
    };
    const result = await provider.emitirNfse(input);

    // 5) grava a nota (service_role)
    const insert = {
      unidade_id: config.unidade_id,
      numero: result.numero ?? rpsNumero,
      rps_numero: rpsNumero,
      tomador: input.tomador.nome,
      tomador_documento: input.tomador.documento,
      descricao: input.descricao,
      valor: input.valor,
      iss: result.iss ?? null,
      emissor: config.emissor,
      nfse_id: result.nfseId,
      codigo_verificacao: result.codigoVerificacao ?? null,
      status: result.status,
      boleto_id: input.boletoId,
      created_by: auth.user.id,
    };
    const { data: nota, error: insErr } = await admin
      .from("notas_fiscais")
      .insert(insert)
      .select()
      .single();
    if (insErr) return json({ error: `Falha ao gravar nota: ${insErr.message}` }, 500);

    // XML → Storage (não bloqueia a resposta se falhar)
    if (result.xml) {
      const url = await uploadNfseFile(admin, `${config.unidade_id}/${nota.id}.xml`, result.xml);
      if (url) { await admin.from("notas_fiscais").update({ xml_url: url }).eq("id", nota.id); nota.xml_url = url; }
    }
    if (result.pdfUrl) {
      await admin.from("notas_fiscais").update({ pdf_url: result.pdfUrl }).eq("id", nota.id);
      nota.pdf_url = result.pdfUrl;
    }

    // Envia a nota ao e-mail do tomador (Resend) — best-effort.
    if (body.tomador_email) {
      await dispatchNotificacao(admin, {
        unidade_id: config.unidade_id, evento: "nfse_emitida", email: body.tomador_email, cliente: input.tomador.nome,
        dados: { numero: nota.numero, valor: input.valor, descricao: input.descricao, pdfUrl: nota.pdf_url || result.pdfUrl },
      });
    }

    await registrarAuditoria(admin, {
      unidade_id: config.unidade_id,
      ator_id: auth.user.id,
      ator_email: (auth.user.email || "").toLowerCase(),
      acao: "nfse.emitida",
      entidade: "nota_fiscal",
      entidade_id: nota.id,
      detalhe: {
        numero: nota.numero, rps_numero: rpsNumero, valor: input.valor,
        tomador: input.tomador.nome, tomador_documento: input.tomador.documento,
        emissor: config.emissor, status: result.status, boleto_id: input.boletoId,
      },
      ip: ipDaReq(req),
    });

    return json({ nota }, 201);
  } catch (e) {
    if (e instanceof FiscalError) {
      return json({ error: e.message, emissor: e.emissor, detail: e.detail }, e.httpStatus ?? 502);
    }
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500);
  }
});
