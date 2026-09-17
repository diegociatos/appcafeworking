// ============================================================================
// Edge Function: parceiro-candidatura  ("Seja parceiro CafeWorking", no site)
//
// POST /functions/v1/parceiro-candidatura   (deploy --no-verify-jwt)
// body: { escritorio, documento, responsavel, email, whatsapp, cidade, uf,
//         endereco, servicos[], salas, observacoes?, aceite, aceite_modelo?,
//         aceite_hash?, pagina?, turnstile }
//
// Grava em parceiro_candidaturas (situação 'nova') e avisa a equipe com os
// dados e o link da tela Parceiros. Protegida pelo Turnstile, como a
// reservar-sala-online e a iniciar-assinatura. Não cria conta, unidade nem
// login: isso é da aprovar-parceiro, depois que o Diego aprova.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { ipDaReq } from "../_shared/audit.ts";
import { verificarTurnstile } from "../_shared/turnstile.ts";
import { APP_URL, avisarEquipe } from "../_shared/assinaturas.ts";
import { contratoParceriaVigente } from "../_shared/contratos.ts";
import { nomeDaUnidadeParceira, resumoDaCandidatura, validarCandidatura } from "../_shared/parceiroCandidatura.ts";

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405, req);

  try {
    const body = await req.json().catch(() => ({}));
    const robo = await verificarTurnstile(body?.turnstile, ipDaReq(req));
    if (!robo.ok) {
      return json({ error: "Não foi possível confirmar que você não é um robô. Recarregue a página." }, 403, req);
    }

    const r = validarCandidatura(body);
    if (!r.ok) return json({ error: r.erro }, 400, req);
    const c = r.dados;

    const admin = adminClient();

    // O aceite que veio do site só vale se apontar para a versão vigente do
    // contrato de parceria. Sem contrato publicado, guarda-se só o rótulo.
    let aceiteModelo: string | null = null;
    let aceiteHash: string | null = null;
    let aceiteTexto = "Aceitou o texto mostrado na página Seja parceiro";
    try {
      const vigente = await contratoParceriaVigente(admin);
      const modelo = texto(body?.aceite_modelo, 64);
      if (vigente && UUID.test(modelo) && modelo === vigente.id && texto(body?.aceite_hash, 100) === vigente.hash) {
        aceiteModelo = vigente.id;
        aceiteHash = vigente.hash;
        aceiteTexto = `${vigente.titulo} (versão ${vigente.versao})`;
      } else if (vigente) {
        aceiteTexto = `Aceitou na página; o texto mudou desde então (vigente: versão ${vigente.versao})`;
      } else {
        aceiteTexto = "Aceitou o resumo da parceria (contrato de parceria ainda não publicado)";
      }
    } catch (e) {
      console.error("[parceiro-candidatura] contrato vigente:", (e as Error).message);
    }

    const { data, error } = await admin.from("parceiro_candidaturas").insert({
      ...c,
      aceite_texto: aceiteTexto,
      aceite_modelo: aceiteModelo,
      aceite_hash: aceiteHash,
      pagina: texto(body?.pagina, 200) || null,
      ip: ipDaReq(req),
      user_agent: (req.headers.get("user-agent") || "").slice(0, 500) || null,
    }).select("id").single();

    if (error) {
      // índice parceiro_candidaturas_documento_aberta_uk: já existe pedido aberto
      if (error.code === "23505") {
        return json({
          error: "Já recebemos um pedido com este CNPJ/CPF e estamos analisando. Em breve falamos com você.",
          codigo: "JA_ENVIADO",
        }, 409, req);
      }
      console.error("[parceiro-candidatura] gravar", error.message);
      return json({ error: "Não foi possível registrar o pedido agora. Tente de novo em instantes." }, 500, req);
    }

    await avisarEquipe(`Novo candidato a parceiro: ${c.escritorio} (${c.cidade}/${c.uf})`, [
      ...resumoDaCandidatura(c),
      `Unidade que será criada na aprovação: ${nomeDaUnidadeParceira(c.cidade)}`,
      `Aceite: ${aceiteTexto}`,
      "Abra a tela Parceiros para aprovar ou recusar.",
    ], `${APP_URL}/?p=parceiros`);

    return json({ ok: true, id: data.id }, 201, req);
  } catch (e) {
    console.error("[parceiro-candidatura]", e);
    return json({ error: "Não foi possível registrar o pedido agora. Tente de novo em instantes." }, 500, req);
  }
});
