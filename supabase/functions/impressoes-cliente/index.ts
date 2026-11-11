// ============================================================================
// Edge Function: impressoes-cliente  (área do cliente · Impressões)
//
// GET  /functions/v1/impressoes-cliente
//      → { competencia, franquia, consumidas, saldo, excedente, preco_folha,
//          unidades, jobs }
// POST /functions/v1/impressoes-cliente
//      { unidade_id?, documento_nome, paginas, copias, duplex, arquivo(base64) }
//      → { ok, job_id, folhas }
// (JWT do cliente; deploy --no-verify-jwt — a função valida o login no código.)
//
// O cliente envia o documento, que vai para o bucket privado 'impressoes' e
// entra na fila (status 'fila'). A impressão e a contagem real vêm depois (Fase
// 2, agente local). Contagem por FOLHA; franquia por plano (direitos.
// impressaoMensal); excedente a R$ 1,50/folha no fechamento. Nada bloqueia.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { usuarioDoReq } from "../_shared/assinaturas.ts";
import { clientesDoEmail, erroInterno, nomesDasUnidades, unidadesDoCliente } from "../_shared/clienteArea.ts";
import { padraoEmail } from "../_shared/reservaCliente.ts";
import { direitosDoCliente } from "../_shared/direitosPlano.ts";
import { registrarAuditoria, ipDaReq } from "../_shared/audit.ts";
import {
  base64ParaBytes, BUCKET_IMPRESSOES, competenciaBRT, contentTypeDe, extDe,
  folhasDe, franquiaImpressao, PRECO_FOLHA_EXCEDENTE, validarEnvio,
} from "../_shared/impressao.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const usuario = await usuarioDoReq(req);
    if (!usuario) return json({ error: "Entre na sua conta para imprimir." }, 401, req);
    const admin = adminClient();

    const unidades = await unidadesDoCliente(admin, usuario.id);
    const emailPadrao = padraoEmail(usuario.email);
    const cadastros = await clientesDoEmail(admin, usuario.email);
    const porUnidade = new Map<string, { id: string; nome: string }>();
    for (const c of cadastros) if (!porUnidade.has(c.unidade_id)) porUnidade.set(c.unidade_id, { id: c.id, nome: c.nome });

    // ---- POST: enviar documento --------------------------------------------
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const v = validarEnvio(body);
      if (!v.ok) return json({ error: v.erro }, 400, req);

      const unidadeId = String(body.unidade_id || (unidades.length === 1 ? unidades[0] : "")).trim();
      if (!unidadeId || !unidades.includes(unidadeId)) {
        return json({ error: "Escolha a unidade onde quer imprimir." }, 400, req);
      }
      const duplex = body.duplex !== false; // padrão frente-e-verso
      const folhas = folhasDe(body.paginas, body.copias, duplex);
      const cad = porUnidade.get(unidadeId) || null;

      // Impressora ativa da unidade (pode não haver ainda — o trabalho fica na fila).
      const { data: imp } = await admin.from("impressoras")
        .select("id").eq("unidade_id", unidadeId).eq("ativo", true).order("created_at").limit(1).maybeSingle();

      const jobId = crypto.randomUUID();
      const path = `${unidadeId}/${jobId}.${extDe(body.documento_nome)}`;
      const bytes = base64ParaBytes(body.arquivo);
      const up = await admin.storage.from(BUCKET_IMPRESSOES).upload(path, bytes, {
        contentType: contentTypeDe(body.documento_nome), upsert: true,
      });
      if (up.error) return erroInterno(req, "impressoes-cliente upload", up.error, "Não foi possível enviar o arquivo. Tente de novo.");

      const { error } = await admin.from("impressao_jobs").insert({
        id: jobId, unidade_id: unidadeId, cliente_id: cad?.id ?? null, cliente_email: usuario.email,
        cliente_nome: cad?.nome ?? null, impressora_id: imp?.id ?? null,
        documento_nome: String(body.documento_nome).trim(), storage_path: path,
        paginas: Math.floor(Number(body.paginas)), copias: Math.floor(Number(body.copias)),
        duplex, folhas, status: "fila", origem: "portal",
      });
      if (error) {
        await admin.storage.from(BUCKET_IMPRESSOES).remove([path]).catch(() => {});
        throw new Error(`insert job: ${error.message}`);
      }

      await registrarAuditoria(admin, {
        unidade_id: unidadeId, ator_id: usuario.id, ator_email: usuario.email,
        acao: "impressao.enviada", entidade: "impressao_job", entidade_id: jobId,
        detalhe: { documento_nome: body.documento_nome, folhas, copias: body.copias, duplex }, ip: ipDaReq(req),
      });
      return json({ ok: true, job_id: jobId, folhas }, 200, req);
    }
    if (req.method !== "GET") return json({ error: "Método não permitido" }, 405, req);

    // ---- GET: saldo da franquia + meus trabalhos ---------------------------
    const competencia = competenciaBRT();
    const [consumosR, jobsR, nomes] = await Promise.all([
      admin.from("consumos_impressao").select("unidade_id, folhas")
        .ilike("cliente_email", emailPadrao).eq("competencia", competencia),
      admin.from("impressao_jobs")
        .select("id, unidade_id, documento_nome, paginas, copias, duplex, folhas, folhas_impressas, status, origem, criado_em, impresso_em")
        .ilike("cliente_email", emailPadrao).order("criado_em", { ascending: false }).limit(50),
      nomesDasUnidades(admin, unidades),
    ]);
    for (const r of [consumosR, jobsR]) if (r.error) throw new Error(r.error.message);

    const consumoPorUnidade: Record<string, number> = {};
    for (const c of consumosR.data || []) consumoPorUnidade[c.unidade_id] = (consumoPorUnidade[c.unidade_id] || 0) + Number(c.folhas || 0);

    let franquia = 0;
    for (const u of unidades) {
      const cad = porUnidade.get(u);
      franquia += franquiaImpressao(await direitosDoCliente(admin, u, usuario.email, cad?.id ?? null));
    }
    const consumidas = Object.values(consumoPorUnidade).reduce((a, b) => a + b, 0);
    const excedente = Math.max(0, consumidas - franquia);

    return json({
      competencia, franquia, consumidas, saldo: franquia - consumidas, excedente,
      preco_folha: PRECO_FOLHA_EXCEDENTE,
      unidades: unidades.map((id) => ({ id, nome: nomes.get(id) || "" })),
      jobs: (jobsR.data || []).map((j) => ({
        id: j.id, unidade: nomes.get(j.unidade_id) || "", documento_nome: j.documento_nome,
        paginas: j.paginas, copias: j.copias, duplex: j.duplex, folhas: j.folhas,
        folhas_impressas: j.folhas_impressas, status: j.status, origem: j.origem,
        criado_em: j.criado_em, impresso_em: j.impresso_em,
      })),
    }, 200, req);
  } catch (e) {
    return erroInterno(req, "impressoes-cliente", e);
  }
});
