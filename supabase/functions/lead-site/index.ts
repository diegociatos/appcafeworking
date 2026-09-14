// ============================================================================
// Edge Function: lead-site  ("Pedir proposta" dos planos sob consulta)
//
// POST /functions/v1/lead-site   (deploy --no-verify-jwt)
// body: { unidade_id, plano_id?, nome, email, telefone, empresa?, mensagem?, pagina?, turnstile }
//
// Grava o lead no CRM do app (app_state entity 'leads', etapa "novo", origem
// "Site") e avisa a equipe por e-mail. Protegido pelo Turnstile.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { ipDaReq } from "../_shared/audit.ts";
import { verificarTurnstile } from "../_shared/turnstile.ts";
import { emailValido, hojeBRT } from "../_shared/venda.ts";
import { APP_URL, avisarEquipe } from "../_shared/assinaturas.ts";

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405, req);

  try {
    const body = await req.json().catch(() => ({}));
    const robo = await verificarTurnstile(body?.turnstile, ipDaReq(req));
    if (!robo.ok) return json({ error: "Não foi possível confirmar que você não é um robô. Recarregue a página." }, 403, req);

    const nome = texto(body?.nome, 120);
    const email = texto(body?.email, 120).toLowerCase();
    const telefone = texto(body?.telefone, 30);
    const empresa = texto(body?.empresa, 120);
    const mensagem = texto(body?.mensagem, 1500);
    const pagina = texto(body?.pagina, 200);
    if (nome.length < 3) return json({ error: "Informe seu nome." }, 400, req);
    if (!emailValido(email)) return json({ error: "Informe um e-mail válido." }, 400, req);
    if (telefone.replace(/\D/g, "").length < 10) return json({ error: "Informe um telefone com DDD." }, 400, req);

    const admin = adminClient();
    const { data: unidade } = await admin.from("unidades").select("id, nome").eq("id", texto(body?.unidade_id, 80)).maybeSingle();
    if (!unidade) return json({ error: "Unidade inválida." }, 404, req);

    let plano: { id: string; nome: string; preco?: number } | null = null;
    if (body?.plano_id) {
      const { data } = await admin.from("app_state").select("doc")
        .eq("entity", "planos").eq("unidade_id", unidade.id).eq("item_id", texto(body.plano_id, 80)).maybeSingle();
      if (data?.doc?.ativo !== false) plano = data?.doc || null;
    }

    const hoje = hojeBRT();
    const [, mes, dia] = hoje.split("-");
    const id = `l_site_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const lead = {
      id, unidadeId: unidade.id, nome, empresa, tel: telefone, email,
      origem: "Site", interesse: plano?.nome || "Proposta pelo site", etapa: "novo",
      valor: Number(plano?.preco || 0), prob: 20,
      obs: [mensagem, `Pedido pelo site em ${dia}/${mes}${pagina ? ` (${pagina})` : ""}.`].filter(Boolean).join("\n"),
      desde: `${dia}/${mes}`,
    };

    const { error } = await admin.from("app_state").insert({ unidade_id: unidade.id, entity: "leads", item_id: id, doc: lead });
    if (error) return json({ error: `Não foi possível registrar o pedido: ${error.message}` }, 500, req);

    await avisarEquipe(`Novo pedido de proposta: ${lead.interesse}`, [
      `Nome: ${nome}${empresa ? ` · ${empresa}` : ""}`, `E-mail: ${email}`, `Telefone: ${telefone}`,
      `Unidade: ${unidade.nome}`, ...(mensagem ? [`Mensagem: ${mensagem}`] : []),
      "O lead já está no CRM, na etapa Novo Lead.",
    ], APP_URL);

    return json({ ok: true }, 201, req);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500, req);
  }
});
