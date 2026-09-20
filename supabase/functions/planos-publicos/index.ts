// ============================================================================
// Edge Function: planos-publicos  (catálogo público: autocadastro e site)
//
// GET/POST /functions/v1/planos-publicos   (deploy --no-verify-jwt)
//
//   ?unidade_id=...        planos ativos de uma unidade (autocadastro do app;
//                          sem os "sob consulta", que não se compram sozinhos)
//   (sem unidade_id)       todas as unidades — só com site=1
//   &site=1                só o publicado no site, com categoria e preço (ou sob consulta)
//   &categoria=...         filtra por categoria (endereco_fiscal, coworking, sala_privativa, sala_hora)
//
// Resposta: { planos: PlanoPublico[], unidades?: {id,nome,cidade}[] }. Os planos
// vêm do app_state (entity 'planos'); o desconto do anual, do doc 'configVenda'
// de cada unidade. Unidade de conta parceira: só a tabela nacional, com o
// desconto padrão, e nada enquanto o parceiro não puder vender.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { categoriaValida, DESCONTO_ANUAL_PADRAO, descontoAnualValido } from "../_shared/venda.ts";
import { ordenarPlanos, planoPublico, visivelNoSite } from "../_shared/catalogo.ts";
import { salasDoPlano } from "../_shared/disponibilidade.ts";
import { type RegraVenda, regraDeVenda } from "../_shared/parceiros.ts";
import { perfisPublicados, unidadesPublicaveis } from "../_shared/parceirosDb.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const url = new URL(req.url);
    let unidadeId = url.searchParams.get("unidade_id") || "";
    let soSite = url.searchParams.get("site") === "1";
    let categoria = url.searchParams.get("categoria") || "";
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      unidadeId = unidadeId || body?.unidade_id || "";
      soSite = soSite || body?.site === true || body?.site === "1";
      categoria = categoria || body?.categoria || "";
    }
    if (categoria && !categoriaValida(categoria)) return json({ error: "Categoria inválida." }, 400, req);

    // Sem unidade só faz sentido para a vitrine do site.
    if (!unidadeId && !soSite) return json({ error: "unidade_id é obrigatório." }, 400, req);

    const admin = adminClient();
    let consulta = admin.from("app_state").select("unidade_id, entity, doc").in("entity", ["planos", "configVenda"]);
    if (unidadeId) consulta = consulta.eq("unidade_id", unidadeId);
    const { data, error } = await consulta;
    if (error) return json({ error: error.message }, 500, req);

    // Unidades de conta parceira: só a tabela nacional (doc.modelo), desconto
    // anual padrão, e só quando o parceiro pode vender (ativo e com carteira).
    let consultaUnidades = admin.from("unidades").select("id, franqueado_id");
    if (unidadeId) consultaUnidades = consultaUnidades.eq("id", unidadeId);
    const [{ data: unidadesConta, error: ucErr }, { data: contasParceiras, error: cpErr }] = await Promise.all([
      consultaUnidades,
      admin.from("contas").select("id, tipo, parceiro_percentual, garantia_percentual, asaas_wallet_id, parceiro_status").eq("tipo", "parceiro"),
    ]);
    if (ucErr || cpErr) return json({ error: (ucErr || cpErr)!.message }, 500, req);
    const parceiraPorId = new Map((contasParceiras || []).map((c) => [c.id, c]));
    const regraPorUnidade = new Map<string, RegraVenda>();
    for (const u of unidadesConta || []) {
      const conta = parceiraPorId.get(u.franqueado_id);
      if (conta) regraPorUnidade.set(u.id, regraDeVenda(conta));
    }

    // Régua da rede (perfil publicado, carteira, documentos). Unidade própria
    // nunca depende disso; e se a régua falhar, o catálogo das próprias continua
    // de pé — foi o que derrubou o catálogo em 26/09.
    const publicaveis = await unidadesPublicaveis(
      admin,
      (unidadesConta || []).map((u) => u.id),
      (id) => regraPorUnidade.has(id),
    );
    const perfis = await perfisPublicados(admin);
    const servicosAprovados = (unidade: string): string[] => {
      const lista = perfis.get(unidade)?.servicos;
      return Array.isArray(lista) ? lista.map((s) => String(s)) : [];
    };

    const vendivel = (unidade: string, doc: Record<string, unknown>) => {
      if (!publicaveis.has(unidade)) return false;
      const regra = regraPorUnidade.get(unidade);
      return !regra || (regra.parceiro && regra.ok && doc.modelo === true);
    };

    const descontoPorUnidade = new Map<string, number>();
    for (const r of data || []) {
      if (r.entity === "configVenda" && !regraPorUnidade.has(r.unidade_id)) {
        descontoPorUnidade.set(r.unidade_id, descontoAnualValido(r.doc?.descontoAnualPct));
      }
    }

    const planos = (data || [])
      .filter((r) => r.entity === "planos" && r.doc && r.doc.ativo !== false && vendivel(r.unidade_id, r.doc))
      .map((r) => planoPublico(r.doc, r.unidade_id, descontoPorUnidade.get(r.unidade_id) ?? DESCONTO_ANUAL_PADRAO))
      // parceira só vende a categoria que a CafeWorking aprovou no perfil
      .filter((p) => !regraPorUnidade.has(p.unidade_id) || servicosAprovados(p.unidade_id).includes(String(p.categoria ?? "")))
      .filter((p) => (soSite ? visivelNoSite(p) : !p.sobConsulta))
      .filter((p) => !categoria || p.categoria === categoria)
      .sort(ordenarPlanos);

    // sala privativa: cada sala do tamanho, com fotos e se está ocupada
    await Promise.all(planos.filter((p) => p.categoria === "sala_privativa" && p.capacidade).map(async (p) => {
      p.salas = await salasDoPlano(admin, p.unidade_id, p.capacidade!, p.id);
      p.disponiveis = p.salas.filter((s) => !s.ocupada).length;
    }));

    if (unidadeId) return json({ planos }, 200, req);

    const idsComPlano = new Set(planos.map((p) => p.unidade_id));
    const { data: unidades, error: uErr } = await admin
      .from("unidades")
      .select("id, nome, cidade")
      .order("nome", { ascending: true });
    if (uErr) return json({ error: uErr.message }, 500, req);

    return json({
      unidades: (unidades || []).filter((u) => idsComPlano.has(u.id)),
      planos,
    }, 200, req);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500, req);
  }
});
