// ============================================================================
// Edge Function: definir-numeracao-nfse
//
// POST /functions/v1/definir-numeracao-nfse  body: { unidade_id, ultimo_numero }
//
// Define o último nDPS já emitido (no SEFIN, por qualquer sistema) para que a
// próxima emissão do app CONTINUE a sequência e não colida com número já usado
// (E0014). Grava em nfse_numeracao (por unidade + série); a série é a mesma
// usada na emissão (serieDps(config)). Só master/financeiro da unidade.
//
// Nunca RETROCEDE a numeração: isso reusaria números já reservados.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { userClient, adminClient } from "../_shared/supabaseAdmin.ts";
import { podeMexerNoDinheiro, recusaSemFinanceiro } from "../_shared/permissoes.ts";
import { serieDps } from "../_shared/nfse/dps.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const body = await req.json();
    if (!body?.unidade_id) return json({ error: "unidade_id é obrigatório." }, 400);
    const ultimo = Math.floor(Number(body.ultimo_numero));
    if (!Number.isFinite(ultimo) || ultimo < 1) {
      return json({ error: "Informe o número da última DPS emitida (inteiro ≥ 1)." }, 400);
    }

    const user = userClient(req);
    const { data: auth } = await user.auth.getUser();
    if (!auth?.user) return json({ error: "Não autenticado" }, 401);
    const admin = adminClient();

    if (!(await podeMexerNoDinheiro(admin, auth.user.id, body.unidade_id))) {
      return recusaSemFinanceiro("Definir a numeração da NFS-e");
    }

    // série igual à usada na emissão (nfse_numeracao é por unidade + série)
    const { data: cfg } = await admin.from("config_fiscal").select("serie_dps")
      .eq("unidade_id", body.unidade_id).maybeSingle();
    const serie = serieDps((cfg ?? {}) as Record<string, unknown>);

    const { data: atual } = await admin.from("nfse_numeracao").select("ultimo_numero")
      .eq("unidade_id", body.unidade_id).eq("serie", serie).maybeSingle();
    const atualNum = Number(atual?.ultimo_numero ?? 0);
    if (ultimo < atualNum) {
      return json({
        error: `A numeração da série ${serie} já está em ${atualNum}. Não dá para voltar para ${ultimo} (reusaria números). Informe um valor maior ou igual a ${atualNum}.`,
        atual: atualNum, serie,
      }, 409);
    }

    const { error: upErr } = await admin.from("nfse_numeracao").upsert(
      { unidade_id: body.unidade_id, serie, ultimo_numero: ultimo, updated_at: new Date().toISOString() },
      { onConflict: "unidade_id,serie" },
    );
    if (upErr) return json({ error: `Não foi possível salvar a numeração: ${upErr.message}` }, 500);

    return json({ ok: true, serie, ultimo_numero: ultimo, proximo: ultimo + 1 });
  } catch (e) {
    return json({ error: (e as Error).message ?? "Erro interno" }, 500);
  }
});
