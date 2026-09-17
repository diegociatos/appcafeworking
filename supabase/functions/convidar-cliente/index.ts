// ============================================================================
// Edge Function: convidar-cliente  (acesso ao app para cliente cadastrado pela equipe)
//
// POST /functions/v1/convidar-cliente   body: { cliente_id }
// (JWT da equipe; deploy --no-verify-jwt, o login é validado aqui)
//
// Quem pode: admin da plataforma, ou master/recepção da unidade do cliente.
//
// Com service_role, para o e-mail do cadastro:
//   1. cria o login no Auth sem senha (email_confirm = true), se ainda não existe;
//   2. cria o vínculo unidade_members com papel 'cliente', se ainda não existe
//      (e-mail que já é da equipe da unidade é recusado: não rebaixa ninguém);
//   3. gera o link de criar senha (recovery → ${APP_URL}/?acesso=novo);
//   4. manda o e-mail convite_acesso.
// Idempotente: chamar de novo não duplica nada e só gera um link novo.
// O link dá acesso à conta: vai só no e-mail. Em notificacoes fica o registro
// do envio sem o link; em audit_logs, 'cliente.acesso_enviado'.
// ============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { APP_URL, usuarioDoReq } from "../_shared/assinaturas.ts";
import { registrarAuditoria, ipDaReq } from "../_shared/audit.ts";
import { getNotifProvider, renderTemplate } from "../_shared/notify/index.ts";
import { nomeExibicaoUnidade } from "../_shared/unidadeNome.ts";

const PAPEIS_QUE_CONVIDAM = ["master", "recepcao"];
const EMAIL_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Login existente pelo e-mail (RPC da migration 20260918120000; sem ela, pagina o Auth). */
async function acharUsuario(admin: SupabaseClient, email: string): Promise<string | null> {
  const { data, error } = await admin.rpc("usuario_id_por_email", { p_email: email });
  if (!error) return (data as string | null) || null;
  for (let page = 1; page <= 20; page++) {
    const { data: lista, error: e } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (e || !lista?.users?.length) break;
    const achado = lista.users.find((u) => (u.email || "").toLowerCase() === email);
    if (achado) return achado.id;
    if (lista.users.length < 1000) break;
  }
  return null;
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405, req);

  try {
    const usuario = await usuarioDoReq(req);
    if (!usuario) return json({ error: "Entre de novo para enviar o acesso." }, 401, req);
    const body = await req.json().catch(() => null);
    const clienteId = typeof body?.cliente_id === "string" ? body.cliente_id : "";
    if (!clienteId) return json({ error: "Cliente não informado." }, 400, req);

    const admin = adminClient();
    const { data: cliente } = await admin.from("clientes")
      .select("id, unidade_id, nome, email, plano").eq("id", clienteId).maybeSingle();
    if (!cliente) return json({ error: "Cliente não encontrado." }, 404, req);

    // Permissão: admin da plataforma ou master/recepção da unidade do cliente.
    const { data: pa } = await admin.from("platform_admins").select("user_id").eq("user_id", usuario.id).maybeSingle();
    if (!pa) {
      const { data: vinculos } = await admin.from("unidade_members").select("role")
        .eq("user_id", usuario.id).eq("unidade_id", cliente.unidade_id);
      if (!(vinculos || []).some((v) => PAPEIS_QUE_CONVIDAM.includes(String(v.role)))) {
        return json({ error: "Só o master ou a recepção da unidade pode enviar o acesso ao app." }, 403, req);
      }
    }

    const email = String(cliente.email || "").trim().toLowerCase();
    if (!email) return json({ error: "Cadastre o e-mail do cliente antes de enviar o acesso.", codigo: "SEM_EMAIL" }, 400, req);
    if (!EMAIL_VALIDO.test(email)) return json({ error: "O e-mail do cadastro não parece válido. Corrija e tente de novo.", codigo: "EMAIL_INVALIDO" }, 400, req);

    const { data: unidade } = await admin.from("unidades").select("id, nome, franqueado_id").eq("id", cliente.unidade_id).maybeSingle();
    if (!unidade) return json({ error: "Unidade do cliente não encontrada." }, 404, req);

    // 1) login
    let userId = await acharUsuario(admin, email);
    let usuarioCriado = false;
    if (!userId) {
      const { data: criado, error: cErr } = await admin.auth.admin.createUser({
        email, email_confirm: true, user_metadata: { nome: cliente.nome, tipo: "cliente" },
      });
      if (cErr || !criado?.user) {
        // corrida com outro envio: o login acabou de ser criado
        userId = /already|registered|exists/i.test(cErr?.message || "") ? await acharUsuario(admin, email) : null;
        if (!userId) throw new Error(`auth.createUser: ${cErr?.message || "sem usuário"}`);
      } else {
        userId = criado.user.id;
        usuarioCriado = true;
      }
    }

    const { data: authUser } = await admin.auth.admin.getUserById(userId);
    const bloqueadoAte = authUser?.user?.banned_until ? new Date(authUser.user.banned_until).getTime() : 0;
    if (bloqueadoAte > Date.now()) {
      return json({
        error: "Este e-mail tem uma compra pelo site aguardando pagamento. O acesso é liberado sozinho quando o pagamento confirmar.",
        codigo: "LOGIN_BLOQUEADO",
      }, 409, req);
    }

    // 2) vínculo com a unidade
    const { data: vinculo } = await admin.from("unidade_members").select("role")
      .eq("user_id", userId).eq("unidade_id", cliente.unidade_id).maybeSingle();
    let vinculoCriado = false;
    if (vinculo && vinculo.role !== "cliente") {
      return json({ error: "Este e-mail é de alguém da equipe desta unidade. Use outro e-mail no cadastro do cliente.", codigo: "EMAIL_DA_EQUIPE" }, 409, req);
    }
    if (!vinculo) {
      const { error: mErr } = await admin.from("unidade_members").insert({
        user_id: userId, unidade_id: cliente.unidade_id, franqueado_id: unidade.franqueado_id ?? null, role: "cliente",
      });
      if (mErr && mErr.code !== "23505") throw new Error(`unidade_members: ${mErr.message}`);
      vinculoCriado = !mErr;
    }

    // 3) link de criar senha (primeiro acesso)
    const { data: link, error: lErr } = await admin.auth.admin.generateLink({
      type: "recovery", email, options: { redirectTo: `${APP_URL}/?acesso=novo` },
    });
    const linkSenha = link?.properties?.action_link || "";
    if (lErr || !linkSenha) throw new Error(`link de senha: ${lErr?.message || "vazio"}`);

    // 4) e-mail
    const msg = renderTemplate("convite_acesso", {
      cliente: cliente.nome, email, unidade: nomeExibicaoUnidade(unidade.nome), plano: cliente.plano, linkSenha,
    });
    let envio: { ok: boolean; providerId?: string | null; erro?: string };
    try {
      envio = await getNotifProvider("email").enviar({ ...msg, para: email });
    } catch (e) {
      envio = { ok: false, erro: (e as Error).message };
    }

    await admin.from("notificacoes").insert({
      unidade_id: cliente.unidade_id, cliente_nome: cliente.nome, destinatario: email, canal: "email",
      evento: "convite_acesso", template: "convite_acesso", dados: { cliente_id: cliente.id }, // sem o link
      status: envio.ok ? "enviado" : "erro", assunto: msg.assunto, provider_id: envio.providerId ?? null,
      sent_at: envio.ok ? new Date().toISOString() : null, erro: envio.ok ? null : envio.erro ?? null,
    });

    await registrarAuditoria(admin, {
      unidade_id: cliente.unidade_id, ator_id: usuario.id, ator_email: usuario.email,
      acao: envio.ok ? "cliente.acesso_enviado" : "cliente.acesso_falhou", entidade: "cliente", entidade_id: cliente.id,
      detalhe: { email, usuario_criado: usuarioCriado, vinculo_criado: vinculoCriado, ja_entrou: !!authUser?.user?.last_sign_in_at, erro: envio.ok ? null : envio.erro ?? null },
      ip: ipDaReq(req),
    });

    if (!envio.ok) {
      console.error("[convidar-cliente] envio", email, envio.erro);
      return json({ error: "O acesso foi liberado, mas o e-mail não saiu. Tente reenviar em instantes.", codigo: "EMAIL_FALHOU" }, 502, req);
    }
    return json({ ok: true, email, usuario_criado: usuarioCriado, vinculo_criado: vinculoCriado }, 200, req);
  } catch (e) {
    console.error("[convidar-cliente]", e);
    return json({ error: "Não foi possível enviar o acesso agora. Tente de novo em instantes." }, 500, req);
  }
});
