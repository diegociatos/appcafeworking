// ============================================================================
// Edge Function: emitir-nfse  (genérica, agnóstica de emissor)
//
// POST /functions/v1/emitir-nfse
// body: { unidade_id, tomador, tomador_documento, tomador_email?,
//         valor, descricao?, codigo_servico?, boleto_id?, cobranca_id? }
//
// Segurança:
//  1. Só admin da plataforma ou master/financeiro da unidade emitem (403 para
//     recepção e contabilidade).
//  2. Lê o certificado A1 do Vault com service_role (nunca exposto ao cliente).
//  3. Sem certificado: em PRODUÇÃO recusa ("Configure o certificado digital…");
//     em homologação grava a nota como "simulada" (sem valor fiscal, sem e-mail).
//  4. O nDPS é reservado no banco (proximo_numero_dps: sem corrida entre duas
//     emissões simultâneas) e gravado com unique (unidade, série, número).
//  5. Com cobranca_id: a cobrança tem que ser da unidade e não ter nota valendo
//     (409 NOTA_JA_EMITIDA), inclusive a automática do asaas-webhook.
//  6. Chama o NfseProvider correto (adapter) e grava a nota.
// A emissão em si mora em _shared/nfse/emitirNota.ts (mesma do webhook).
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { userClient, adminClient } from "../_shared/supabaseAdmin.ts";
import { ipDaReq } from "../_shared/audit.ts";
import { podeMexerNoDinheiro, recusaSemFinanceiro } from "../_shared/permissoes.ts";
import { emitirNotaFiscal } from "../_shared/nfse/emitirNota.ts";

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

    // 1) usuário autenticado + papel do financeiro
    const user = userClient(req);
    const { data: auth } = await user.auth.getUser();
    if (!auth?.user) return json({ error: "Não autenticado" }, 401);
    const admin = adminClient();
    if (!(await podeMexerNoDinheiro(admin, auth.user.id, body.unidade_id))) {
      return recusaSemFinanceiro("Emitir nota fiscal");
    }

    const r = await emitirNotaFiscal(admin, {
      unidade_id: body.unidade_id,
      tomador: body.tomador,
      tomador_documento: String(body.tomador_documento),
      tomador_email: body.tomador_email,
      valor: body.valor,
      descricao: body.descricao,
      codigo_servico: body.codigo_servico,
      boleto_id: body.boleto_id ?? null,
      cobranca_id: body.cobranca_id ?? null,
      tomador_cep: body.tomador_cep,
      tomador_logradouro: body.tomador_logradouro,
      tomador_numero: body.tomador_numero,
      tomador_bairro: body.tomador_bairro,
      tomador_cidade: body.tomador_cidade,
      tomador_uf: body.tomador_uf,
    }, {
      id: auth.user.id,
      email: (auth.user.email || "").toLowerCase(),
      ip: ipDaReq(req),
      origem: "equipe",
    });

    if (!r.ok) {
      const { status, error, codigo, emissor, detail } = r;
      return json({ error, ...(codigo ? { codigo } : {}), ...(emissor ? { emissor, detail } : {}) }, status);
    }
    return json({ nota: r.nota }, 201);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500);
  }
});
