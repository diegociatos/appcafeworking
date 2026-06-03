// ============================================================================
// Edge Function: emitir-boleto  (genérica, agnóstica de banco)
//
// POST /functions/v1/emitir-boleto
// body: { bank_account_id, sacado, sacado_documento, sacado_email?,
//         valor, vencimento, instrucoes?, multaPercent?, moraPercent?,
//         descontoValor? }
//
// Segurança:
//  1. Lê a conta bancária com o JWT do usuário → RLS garante que ele só
//     emite por contas da própria unidade.
//  2. Lê as credenciais do Vault com service_role (nunca expostas ao cliente).
//  3. Chama o BankProvider correto (adapter) e grava o boleto.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { userClient, adminClient } from "../_shared/supabaseAdmin.ts";
import { getBankCredentials } from "../_shared/vault.ts";
import { uploadBoletoPdf } from "../_shared/storage.ts";
import { getProvider, BankError, type BankAccount, type EmitirBoletoInput } from "../_shared/banks/index.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const body = await req.json();
    const required = ["bank_account_id", "sacado", "sacado_documento", "valor", "vencimento"];
    for (const k of required) {
      if (!body?.[k]) return json({ error: `Campo obrigatório ausente: ${k}` }, 400);
    }

    // 1) usuário autenticado
    const user = userClient(req);
    const { data: auth } = await user.auth.getUser();
    if (!auth?.user) return json({ error: "Não autenticado" }, 401);

    // 2) conta bancária (RLS garante ownership da unidade)
    const { data: account, error: accErr } = await user
      .from("bank_accounts")
      .select("*")
      .eq("id", body.bank_account_id)
      .single<BankAccount & { credenciais_ref: string }>();
    if (accErr || !account) return json({ error: "Conta bancária não encontrada ou sem acesso" }, 403);

    // 3) credenciais do Vault (service_role) + provider
    const admin = adminClient();
    const creds = await getBankCredentials(admin, account.credenciais_ref);
    const provider = getProvider(account as BankAccount, creds);

    // 4) emissão
    const seuNumero = `CW${Date.now().toString(36).toUpperCase()}`;
    const input: EmitirBoletoInput = {
      seuNumero,
      valor: Number(body.valor),
      vencimento: body.vencimento,
      pagador: { nome: body.sacado, documento: String(body.sacado_documento), email: body.sacado_email },
      instrucoes: body.instrucoes,
      multaPercent: body.multaPercent,
      moraPercent: body.moraPercent,
      descontoValor: body.descontoValor,
    };
    const result = await provider.emitirBoleto(input);

    // 5) cria a linha do boleto (service_role) e sobe o PDF
    const insert = {
      bank_account_id: account.id,
      unidade_id: account.unidade_id,
      sacado: input.pagador.nome,
      sacado_documento: input.pagador.documento,
      sacado_email: input.pagador.email ?? null,
      valor: input.valor,
      vencimento: input.vencimento,
      instrucoes: input.instrucoes ?? null,
      seu_numero: seuNumero,
      nosso_numero: result.nossoNumero ?? null,
      linha_digitavel: result.linhaDigitavel ?? null,
      codigo_barras: result.codigoBarras ?? null,
      pix_copia_cola: result.pixCopiaCola ?? null,
      pix_txid: result.pixTxid ?? null,
      banco_boleto_id: result.bancoBoletoId,
      status: result.status === "erro" ? "erro" : result.status,
      created_by: auth.user.id,
    };

    const { data: boleto, error: insErr } = await admin
      .from("boletos")
      .insert(insert)
      .select()
      .single();
    if (insErr) return json({ error: `Falha ao gravar boleto: ${insErr.message}` }, 500);

    // PDF → Storage (não bloqueia a resposta se falhar)
    if (result.pdfBase64) {
      const path = `${account.unidade_id}/${account.banco}/${boleto.id}.pdf`;
      const url = await uploadBoletoPdf(admin, path, result.pdfBase64);
      if (url) {
        await admin.from("boletos").update({ pdf_url: url }).eq("id", boleto.id);
        boleto.pdf_url = url;
      }
    }

    return json({ boleto }, 201);
  } catch (e) {
    if (e instanceof BankError) {
      return json({ error: e.message, banco: e.banco, detail: e.detail }, e.httpStatus ?? 502);
    }
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500);
  }
});
