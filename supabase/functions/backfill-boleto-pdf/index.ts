// ============================================================================
// Edge Function: backfill-boleto-pdf  (ferramenta de operação, one-off)
//
// POST /functions/v1/backfill-boleto-pdf?limite=30   header: x-backfill-token
//
// Boletos emitidos ANTES do bucket "boletos" existir ficaram sem pdf_url (o
// upload falhava com "Bucket not found"). Agora que o bucket existe, esta função
// busca o PDF de cada boleto ativo sem pdf_url no banco (Inter etc.) e grava no
// Storage, preenchendo pdf_url. Idempotente: quem já tem pdf_url some do filtro.
//
// Protegida por token interno (BACKFILL_TOKEN). Deploy com --no-verify-jwt.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { getBankCredentials } from "../_shared/vault.ts";
import { uploadBoletoPdf } from "../_shared/storage.ts";
import { getProvider, type BankAccount } from "../_shared/banks/index.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405, req);

  const esperado = Deno.env.get("BACKFILL_TOKEN") || "";
  if (!esperado || req.headers.get("x-backfill-token") !== esperado) {
    return json({ error: "Não autorizado" }, 401, req);
  }

  const limite = Math.min(60, Math.max(1, Number(new URL(req.url).searchParams.get("limite") || 30)));
  const admin = adminClient();

  const { data: boletos, error } = await admin
    .from("boletos")
    .select("id, unidade_id, banco_boleto_id, bank_account_id")
    .is("pdf_url", null)
    .in("status", ["registrado", "emitido"])
    .not("banco_boleto_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) return json({ error: error.message }, 500, req);

  // Cache de provider + banco por conta bancária (evita reabrir mTLS a cada boleto).
  // deno-lint-ignore no-explicit-any
  const contas = new Map<string, { prov: any; banco: string }>();
  async function contaDe(bankAccountId: string) {
    if (contas.has(bankAccountId)) return contas.get(bankAccountId)!;
    const { data: acc } = await admin.from("bank_accounts").select("*").eq("id", bankAccountId)
      .single<BankAccount & { credenciais_ref: string }>();
    if (!acc) throw new Error("conta não encontrada");
    const creds = await getBankCredentials(admin, acc.credenciais_ref);
    const prov = getProvider(acc as BankAccount, creds);
    const entry = { prov, banco: acc.banco };
    contas.set(bankAccountId, entry);
    return entry;
  }

  let gravados = 0, semPdf = 0, erros = 0;
  for (const b of boletos || []) {
    try {
      const { prov, banco } = await contaDe(b.bank_account_id);
      if (typeof prov.buscarBoletoPdf !== "function") { erros++; continue; }
      const pdfBase64 = await prov.buscarBoletoPdf(b.banco_boleto_id);
      if (!pdfBase64) { semPdf++; continue; }
      const url = await uploadBoletoPdf(admin, `${b.unidade_id}/${banco}/${b.id}.pdf`, pdfBase64);
      if (!url) { erros++; continue; }
      await admin.from("boletos").update({ pdf_url: url }).eq("id", b.id);
      gravados++;
    } catch (e) {
      console.error(`[backfill] boleto ${b.id}:`, (e as Error).message);
      erros++;
    }
  }

  const { count: restantes } = await admin
    .from("boletos").select("id", { count: "exact", head: true })
    .is("pdf_url", null).in("status", ["registrado", "emitido"]).not("banco_boleto_id", "is", null);

  return json({ processados: boletos?.length || 0, gravados, semPdf, erros, restantes: restantes || 0 }, 200, req);
});
