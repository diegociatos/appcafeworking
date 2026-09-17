// ============================================================================
// Edge Function: rotina-diaria  (pg_cron às 8h de Brasília, ver migration
// 20260915120000_assinaturas_ciclo.sql)
//
// POST /functions/v1/rotina-diaria   (deploy --no-verify-jwt)
// Cabeçalho x-rotina-token = secret ROTINA_DIARIA_TOKEN (cópia no Vault).
//
// 1. Avisa por e-mail a renovação do plano anual 30 dias antes (contrato 6.3)
// 2. Encerra no Asaas os cancelamentos cujo aviso prévio terminou (7.3)
// 3. Libera horários de sala segurados e não pagos
// 4. Avisa o parceiro e a CafeWorking da correspondência que passou de 1 dia
//    útil sem o cliente ser notificado (docs/PARCEIROS.md, fase 3)
// Idempotente: rodar duas vezes no mesmo dia não repete aviso nem encerramento.
// ============================================================================

import { json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { hojeBRT } from "../_shared/venda.ts";
import { credenciaisAsaas } from "../_shared/asaas.ts";
import { emJanelaDeAvisoRenovacao, somarDias } from "../_shared/ciclo.ts";
import { APP_URL, avisarCliente, avisarEquipe, encerrarAssinaturaAsaas, nomeDaUnidade } from "../_shared/assinaturas.ts";
import { liberarSala } from "../_shared/disponibilidade.ts";
import { avisarParceiro, linkParceiro } from "../_shared/parceirosDb.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  const esperado = Deno.env.get("ROTINA_DIARIA_TOKEN") || "";
  if (!esperado) return json({ error: "ROTINA_DIARIA_TOKEN não configurado" }, 503);
  if (req.headers.get("x-rotina-token") !== esperado) return json({ error: "token inválido" }, 401);

  const admin = adminClient();
  const hoje = hojeBRT();
  const resumo = { avisos_renovacao: 0, encerradas: 0, reservas_liberadas: 0, correspondencias_atrasadas: 0, erros: [] as string[] };

  // 1) aviso de renovação do anual
  try {
    const { data } = await admin.from("assinaturas").select("*")
      .eq("recorrencia", "anual").in("status", ["ativa", "inadimplente"])
      .gte("proxima_cobranca", somarDias(hoje, 1)).lte("proxima_cobranca", somarDias(hoje, 30));
    for (const a of data || []) {
      if (!emJanelaDeAvisoRenovacao(a, hoje)) continue;
      // marca antes de enviar: se duas rotinas rodarem juntas, só uma avisa
      const { data: marcada } = await admin.from("assinaturas")
        .update({ aviso_renovacao_ciclo: a.proxima_cobranca })
        .eq("id", a.id).or(`aviso_renovacao_ciclo.is.null,aviso_renovacao_ciclo.neq.${a.proxima_cobranca}`)
        .select("id");
      if (!marcada?.length) continue;
      await avisarCliente(admin, a, "renovacao_anual", {
        unidade: await nomeDaUnidade(admin, a.unidade_id), valor: Number(a.valor), data: a.proxima_cobranca,
      });
      resumo.avisos_renovacao++;
    }
  } catch (e) {
    resumo.erros.push(`avisos: ${(e as Error).message}`);
  }

  // 2) cancelamentos com aviso prévio vencido
  try {
    const { data } = await admin.from("assinaturas").select("*").eq("status", "cancelando").lte("cancela_em", hoje);
    for (const a of data || []) {
      try {
        const cred = await credenciaisAsaas(admin, a.unidade_id);
        await encerrarAssinaturaAsaas(cred, a.asaas_subscription_id);
        const { data: fechada } = await admin.from("assinaturas")
          .update({ status: "cancelada", cancelada_em: new Date().toISOString() })
          .eq("id", a.id).eq("status", "cancelando").select("id");
        if (!fechada?.length) continue;
        await liberarSala(admin, a);
        await avisarCliente(admin, a, "cancelamento_confirmado", {
          tipo: "encerramento", cancelaEm: a.cancela_em, reembolso: "nenhum", requerAcerto: false, categoria: a.categoria,
        });
        if (a.requer_acerto && !a.acerto_resolvido_em) {
          await avisarEquipe(`Plano encerrado com acerto pendente: ${a.plano_nome}`, [
            `Cliente: ${a.cliente_nome} (${a.cliente_email})`, `Motivo do acerto: ${a.motivo_acerto}`,
          ], APP_URL);
        }
        resumo.encerradas++;
      } catch (e) {
        resumo.erros.push(`encerrar ${a.id}: ${(e as Error).message}`);
      }
    }
  } catch (e) {
    resumo.erros.push(`encerramentos: ${(e as Error).message}`);
  }

  // 3) reservas seguradas sem pagamento
  try {
    const { data } = await admin.rpc("liberar_reservas_expiradas");
    resumo.reservas_liberadas = Number(data || 0);
  } catch (e) {
    resumo.erros.push(`reservas: ${(e as Error).message}`);
  }

  // 4) correspondência de unidade parceira fora do prazo de 1 dia útil
  //    parceiro_alertas guarda o que já saiu: um aviso por correspondência.
  try {
    const { data, error } = await admin.rpc("correspondencias_fora_prazo", { p_unidade_id: null });
    if (error) throw new Error(error.message);
    const atrasadas = (data || []) as {
      conta_id: string; unidade_id: string; unidade: string; item_id: string;
      cliente: string; remetente: string; recebido_em: string; prazo_em: string; dias: number;
    }[];
    for (const c of atrasadas) {
      // marca antes de avisar: duas rotinas juntas não mandam o mesmo e-mail duas vezes
      const { error: iErr } = await admin.from("parceiro_alertas").insert({
        conta_id: c.conta_id, unidade_id: c.unidade_id, tipo: "correspondencia_atrasada", referencia: c.item_id,
        detalhe: `${c.cliente} · ${c.remetente} · recebida em ${c.recebido_em}, prazo ${c.prazo_em}`,
      });
      if (iErr) {
        if (iErr.code === "23505") continue; // já avisado
        throw new Error(`parceiro_alertas: ${iErr.message}`);
      }
      const linhas = [
        `Cliente: ${c.cliente}`,
        `Remetente: ${c.remetente}`,
        `Recebida em ${c.recebido_em}; o aviso ao cliente vencia em ${c.prazo_em}.`,
        c.dias > 0 ? `Está ${c.dias} dia(s) além do prazo.` : "Venceu hoje.",
        "Abra Correspondências, confira o e-mail do cliente e clique em Notificar cliente.",
      ];
      await avisarParceiro(admin, c.unidade_id, `Correspondência fora do prazo em ${c.unidade}`, linhas, linkParceiro("corresp"));
      await avisarEquipe(`Parceiro fora do prazo de correspondência: ${c.unidade}`, [...linhas, `Unidade: ${c.unidade_id}`], `${APP_URL}/?p=parceiros`);
      resumo.correspondencias_atrasadas++;
    }
  } catch (e) {
    resumo.erros.push(`correspondências: ${(e as Error).message}`);
  }

  if (resumo.erros.length) await avisarEquipe("Rotina diária com erros", resumo.erros);
  console.log("rotina-diaria", JSON.stringify(resumo));
  return json({ ok: resumo.erros.length === 0, ...resumo }, 200);
});
