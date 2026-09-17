// ============================================================================
// Edge Function: contas-plataforma  (admin da plataforma · tela Contas)
//
// POST /functions/v1/contas-plataforma   (JWT do admin; deploy --no-verify-jwt)
//
//   { acao: "salvar", conta_id, dados }               → { ok, conta }
//       grava em public.contas os dados editados na tela (plano, mensalidade,
//       razão social, documento...). O e-mail é o login do master e não muda aqui.
//       Também os dados da rede de parceiros (tipo, percentuais, walletId,
//       situação, e-mails de aviso). Conta que vira parceira recebe a tabela
//       nacional nas unidades pelo gatilho do banco (20260921120000).
//   { acao: "preparar_contrato", conta_id, nome, mime, bytes } → { ok, id, upload_url }
//       link de envio de uso único para o bucket privado contratos-contas
//   { acao: "confirmar_contrato", conta_id, id, nome } → { ok, conta }
//       confere no Storage tipo e tamanho reais, grava o caminho na conta e
//       apaga o contrato anterior
//   { acao: "link_contrato", conta_id }                → { ok, url, nome }
//       link assinado de 10 minutos para baixar
//   { acao: "remover_contrato", conta_id }             → { ok, conta }
//
// Só o ADMIN DA PLATAFORMA (platform_admins). Tudo auditado.
// ============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { usuarioDoReq } from "../_shared/assinaturas.ts";
import { registrarAuditoria, ipDaReq } from "../_shared/audit.ts";
import {
  BUCKET_CONTRATOS_CONTAS, caminhoContrato, camposDaConta, idDeContaValido, validarContrato,
} from "../_shared/contasPlataforma.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FALHA_ARQUIVO = "Não foi possível guardar o contrato. Tente de novo.";
const VALIDADE_LINK_S = 600;

// deno-lint-ignore no-explicit-any
type Linha = Record<string, any>;

async function carregarConta(admin: SupabaseClient, id: string): Promise<Linha | null> {
  const { data } = await admin.from("contas").select("*").eq("id", id).maybeSingle();
  return data;
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405, req);

  try {
    const usuario = await usuarioDoReq(req);
    if (!usuario) return json({ error: "Sua sessão expirou. Entre de novo." }, 401, req);
    const admin = adminClient();
    const { data: pa } = await admin.from("platform_admins").select("user_id").eq("user_id", usuario.id).maybeSingle();
    if (!pa) return json({ error: "Só o administrador da plataforma pode alterar contas." }, 403, req);

    const body = await req.json().catch(() => ({}));
    const acao = String(body?.acao || "");
    if (!idDeContaValido(body?.conta_id)) return json({ error: "Conta não encontrada." }, 400, req);
    const conta = await carregarConta(admin, body.conta_id);
    if (!conta) return json({ error: "Conta não encontrada. Recarregue a tela." }, 404, req);

    const auditar = (acaoLog: string, detalhe: Record<string, unknown>) => registrarAuditoria(admin, {
      unidade_id: null, ator_id: usuario.id, ator_email: usuario.email,
      acao: acaoLog, entidade: "conta", entidade_id: conta.id, detalhe, ip: ipDaReq(req),
    });

    // ---- salvar os dados ------------------------------------------------------
    if (acao === "salvar") {
      const r = camposDaConta(body?.dados);
      if (!r.ok) return json({ error: r.erro }, 400, req);
      if (!Object.keys(r.campos).length) return json({ ok: true, conta }, 200, req);
      const { data, error } = await admin.from("contas").update(r.campos).eq("id", conta.id).select("*").single();
      if (error) {
        console.error("[contas-plataforma] salvar", error.message);
        return json({ error: "Não foi possível salvar a conta. Tente de novo." }, 500, req);
      }
      const antes: Record<string, unknown> = {};
      for (const k of Object.keys(r.campos)) antes[k] = conta[k];
      await auditar("conta.editada", { antes, depois: r.campos });
      return json({ ok: true, conta: data }, 200, req);
    }

    // ---- 1) preparar envio direto do contrato ---------------------------------
    if (acao === "preparar_contrato") {
      const arquivo = { nome: String(body?.nome || ""), mime: String(body?.mime || ""), bytes: Number(body?.bytes || 0) };
      const v = validarContrato(arquivo);
      if (!v.ok) return json({ error: v.erro }, 400, req);
      const id = crypto.randomUUID();
      const { data, error } = await admin.storage.from(BUCKET_CONTRATOS_CONTAS).createSignedUploadUrl(caminhoContrato(conta.id, id, arquivo.nome));
      if (error || !data?.signedUrl) {
        console.error("[contas-plataforma] link de envio", error?.message);
        return json({ error: FALHA_ARQUIVO }, 500, req);
      }
      return json({ ok: true, id, upload_url: data.signedUrl }, 200, req);
    }

    // ---- 2) confirmar depois do envio -------------------------------------------
    if (acao === "confirmar_contrato") {
      const id = String(body?.id || "");
      if (!UUID.test(id)) return json({ error: "Envio inválido. Tente de novo." }, 400, req);
      const nome = String(body?.nome || "").trim().slice(0, 200);
      // O caminho é recalculado aqui: o navegador não escolhe onde o arquivo fica.
      const caminho = caminhoContrato(conta.id, id, nome);
      if (conta.contrato_path === caminho) return json({ ok: true, conta, repetido: true }, 200, req);
      const arquivoNome = caminho.slice(caminho.lastIndexOf("/") + 1);
      const { data: itens, error: lErr } = await admin.storage.from(BUCKET_CONTRATOS_CONTAS).list(conta.id, { search: id, limit: 5 });
      if (lErr) {
        console.error("[contas-plataforma] conferir envio", lErr.message);
        return json({ error: FALHA_ARQUIVO }, 500, req);
      }
      const obj = (itens || []).find((i) => i.name === arquivoNome);
      if (!obj) return json({ error: "O contrato não chegou. Envie de novo." }, 400, req);
      // deno-lint-ignore no-explicit-any
      const meta = (obj.metadata || {}) as any;
      const arquivo = { nome, mime: String(meta.mimetype || ""), bytes: Number(meta.size || 0) };
      const v = validarContrato(arquivo);
      if (!v.ok) {
        await admin.storage.from(BUCKET_CONTRATOS_CONTAS).remove([caminho]);
        return json({ error: v.erro }, 400, req);
      }
      const { data, error } = await admin.from("contas").update({
        contrato_path: caminho, contrato_nome: arquivo.nome, contrato_mime: arquivo.mime, contrato_bytes: arquivo.bytes,
        contrato_enviado_em: new Date().toISOString(),
      }).eq("id", conta.id).select("*").single();
      if (error) {
        console.error("[contas-plataforma] gravar contrato", error.message);
        await admin.storage.from(BUCKET_CONTRATOS_CONTAS).remove([caminho]);
        return json({ error: FALHA_ARQUIVO }, 500, req);
      }
      if (conta.contrato_path && conta.contrato_path !== caminho) {
        const { error: rmErr } = await admin.storage.from(BUCKET_CONTRATOS_CONTAS).remove([conta.contrato_path]);
        if (rmErr) console.error("[contas-plataforma] apagar contrato anterior", rmErr.message);
      }
      await auditar("conta.contrato_anexado", {
        nome: arquivo.nome, mime: arquivo.mime, bytes: arquivo.bytes, caminho, substituiu: conta.contrato_path || null,
      });
      return json({ ok: true, conta: data }, 200, req);
    }

    // ---- link para baixar ---------------------------------------------------------
    if (acao === "link_contrato") {
      if (!conta.contrato_path) return json({ error: "Esta conta não tem contrato anexado." }, 404, req);
      const { data, error } = await admin.storage.from(BUCKET_CONTRATOS_CONTAS)
        .createSignedUrl(conta.contrato_path, VALIDADE_LINK_S, { download: conta.contrato_nome || true });
      if (error || !data?.signedUrl) {
        console.error("[contas-plataforma] link do contrato", error?.message);
        return json({ error: "Não foi possível abrir o contrato. Tente de novo." }, 500, req);
      }
      return json({ ok: true, url: data.signedUrl, nome: conta.contrato_nome, validade_s: VALIDADE_LINK_S }, 200, req);
    }

    // ---- remover ---------------------------------------------------------------------
    if (acao === "remover_contrato") {
      if (!conta.contrato_path) return json({ ok: true, conta }, 200, req);
      const { data, error } = await admin.from("contas").update({
        contrato_path: null, contrato_nome: null, contrato_mime: null, contrato_bytes: null, contrato_enviado_em: null,
      }).eq("id", conta.id).select("*").single();
      if (error) {
        console.error("[contas-plataforma] remover contrato", error.message);
        return json({ error: "Não foi possível remover o contrato. Tente de novo." }, 500, req);
      }
      const { error: rmErr } = await admin.storage.from(BUCKET_CONTRATOS_CONTAS).remove([conta.contrato_path]);
      if (rmErr) console.error("[contas-plataforma] apagar arquivo", rmErr.message);
      await auditar("conta.contrato_removido", { nome: conta.contrato_nome, caminho: conta.contrato_path });
      return json({ ok: true, conta: data }, 200, req);
    }

    return json({ error: "Pedido inválido." }, 400, req);
  } catch (e) {
    console.error("[contas-plataforma]", e);
    return json({ error: "Não foi possível concluir agora. Tente de novo." }, 500, req);
  }
});
