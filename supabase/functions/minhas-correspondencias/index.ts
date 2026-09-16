// ============================================================================
// Edge Function: minhas-correspondencias  (área do cliente)
//
// GET /functions/v1/minhas-correspondencias          → { correspondencias: [...] }
// GET /functions/v1/minhas-correspondencias?id=<id>  → { anexo: { nome, tipo, url } }
// (JWT do cliente; deploy --no-verify-jwt)
//
// As correspondências são registradas pela recepção no app_state (entity
// 'correspondencias'), que o cliente não lê pela RLS. Esta função lê com
// service_role e devolve só as do próprio cliente:
//   • doc.clienteId = id de um cadastro (clientes) com o e-mail do login, ou
//   • doc.clienteEmail = e-mail do login, ou
//   • registro antigo sem id/e-mail: nome igual ao do cadastro, e só quando esse
//     nome é único na unidade (evita entregar a carta de um homônimo).
// A lista não traz o arquivo; o anexo sai por id. Arquivo novo fica no bucket
// privado `correspondencias` (doc.anexo.caminho) e vai como link assinado de 10
// minutos; registro antigo com a imagem embutida (doc.anexo.url) sai como antes.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { usuarioDoReq } from "../_shared/assinaturas.ts";
import { clientesDoEmail, erroInterno, type Linha, nomesDasUnidades } from "../_shared/clienteArea.ts";

const STATUS_VALIDOS = ["aguardando", "digitalizada", "notificado", "retirada"];
const BUCKET = "correspondencias";
const VALIDADE_LINK_S = 600;

const temArquivo = (c: Linha) => Boolean(c.anexo?.caminho || c.anexo?.url);

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "GET") return json({ error: "Método não permitido" }, 405, req);

  try {
    const usuario = await usuarioDoReq(req);
    if (!usuario) return json({ error: "Entre na sua conta para ver as correspondências." }, 401, req);
    const admin = adminClient();

    const clientes = await clientesDoEmail(admin, usuario.email);
    if (!clientes.length) return json({ correspondencias: [] }, 200, req);

    const unidades = [...new Set(clientes.map((c) => c.unidade_id).filter(Boolean))];
    const ids = new Set(clientes.map((c) => c.id));
    const { data: linhas, error } = await admin.from("app_state").select("unidade_id, item_id, doc")
      .eq("entity", "correspondencias").in("unidade_id", unidades).limit(2000);
    if (error) throw new Error(`app_state: ${error.message}`);

    // Nomes únicos por unidade (para registros antigos sem vínculo por id).
    const nomesPorUnidade = new Map<string, Set<string>>();
    for (const c of clientes) {
      if (!nomesPorUnidade.has(c.unidade_id)) nomesPorUnidade.set(c.unidade_id, new Set());
      nomesPorUnidade.get(c.unidade_id)!.add(String(c.nome || "").trim().toLowerCase());
    }
    const nomeUnico = async (unidadeId: string, nome: string) => {
      const { count } = await admin.from("clientes").select("id", { count: "exact", head: true })
        .eq("unidade_id", unidadeId).ilike("nome", nome.replace(/[\\%_]/g, (x) => "\\" + x));
      return count === 1;
    };

    const minhas: Linha[] = [];
    for (const l of linhas || []) {
      const d = (l.doc || {}) as Linha;
      let dono = (d.clienteId && ids.has(d.clienteId)) || (d.clienteEmail && String(d.clienteEmail).toLowerCase() === usuario.email);
      if (!dono && !d.clienteId && !d.clienteEmail && d.cliente) {
        const nome = String(d.cliente).trim().toLowerCase();
        dono = !!nomesPorUnidade.get(l.unidade_id)?.has(nome) && await nomeUnico(l.unidade_id, String(d.cliente).trim());
      }
      if (dono) minhas.push({ ...d, _unidade: l.unidade_id, _id: l.item_id });
    }

    const url = new URL(req.url);
    const pedido = url.searchParams.get("id");
    if (pedido) {
      const c = minhas.find((m) => m._id === pedido);
      if (!c) return json({ error: "Correspondência não encontrada." }, 404, req);
      if (!temArquivo(c)) return json({ error: "Esta correspondência não tem arquivo digitalizado." }, 404, req);
      const nome = c.anexo.nome || "correspondencia";
      if (c.anexo.caminho) {
        const caminho = String(c.anexo.caminho);
        // o arquivo precisa estar na pasta da unidade da própria correspondência
        if (!caminho.startsWith(`${c._unidade}/`)) return json({ error: "Esta correspondência não tem arquivo digitalizado." }, 404, req);
        const { data: link, error: eLink } = await admin.storage.from(BUCKET).createSignedUrl(caminho, VALIDADE_LINK_S);
        if (eLink || !link?.signedUrl) throw new Error(`storage: ${eLink?.message || "sem link"}`);
        return json({ anexo: { nome, tipo: c.anexo.tipo || "", url: link.signedUrl, expira_em_s: VALIDADE_LINK_S } }, 200, req);
      }
      return json({ anexo: { nome, tipo: c.anexo.tipo || "", url: c.anexo.url } }, 200, req);
    }

    const nomes = await nomesDasUnidades(admin, unidades);
    const correspondencias = minhas.map((c) => ({
      id: c._id,
      unidade: nomes.get(c._unidade) || "",
      remetente: c.remetente || "",
      tipo: c.tipo || "",
      descricao: c.descricao || "",
      status: STATUS_VALIDOS.includes(c.status) ? c.status : "aguardando",
      urgente: !!c.urgente,
      recebido_em: typeof c.recebidoEm === "string" ? c.recebidoEm : null,
      tem_anexo: temArquivo(c),
      anexo_tipo: c.anexo?.tipo || "",
    })).sort((a, b) => String(b.recebido_em || "").localeCompare(String(a.recebido_em || "")));

    return json({ correspondencias }, 200, req);
  } catch (e) {
    return erroInterno(req, "minhas-correspondencias", e);
  }
});
