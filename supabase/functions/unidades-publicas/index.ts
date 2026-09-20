// ============================================================================
// Edge Function: unidades-publicas  (lista pública p/ o autocadastro)
//
// GET/POST /functions/v1/unidades-publicas   (deploy com --no-verify-jwt)
// Devolve apenas o necessário para o cliente escolher cidade + unidade:
//   [{ id, nome, cidade, endereco }] — e, na unidade parceira já publicada,
// os campos do perfil aprovado (bairro, horários, fotos, serviços). Nunca sai
// daqui nada de empresa, responsável, documento ou financeiro do parceiro.
// Unidade de conta própria não depende de perfil: aparece por estar ativa.
// O endereço entra porque as páginas por cidade do site (fase 3 da rede de
// parceiros) mostram onde fica a unidade; é o mesmo endereço que já aparece nas
// páginas das unidades.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { perfisPublicados, unidadesPublicaveis } from "../_shared/parceirosDb.ts";

const texto = (v: unknown) => (typeof v === "string" ? v : "");
const lista = (v: unknown) => (Array.isArray(v) ? v : []);

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const admin = adminClient();
    const { data, error } = await admin
      .from("unidades")
      .select("id, nome, cidade, endereco, franqueado_id")
      .order("cidade", { ascending: true })
      .order("nome", { ascending: true });
    if (error) return json({ error: error.message }, 500);

    // Quem é parceira: só essas dependem de perfil publicado. Falha na leitura
    // das contas não pode esvaziar o seletor — sem a lista, todas contam como
    // próprias e o site segue como antes da rede de parceiros.
    const { data: contasParceiras, error: cpErr } = await admin.from("contas").select("id").eq("tipo", "parceiro");
    if (cpErr) console.error(`[parceiro] contas parceiras indisponíveis (${cpErr.message}); seletor segue sem a régua da rede.`);
    const contaParceira = new Set((contasParceiras || []).map((c) => c.id));
    const ehParceira = (id: string) => contaParceira.has((data || []).find((u) => u.id === id)?.franqueado_id);

    const publicaveis = await unidadesPublicaveis(admin, (data || []).map((u) => u.id), ehParceira);
    const perfilPorUnidade = await perfisPublicados(admin);

    // Só unidades com cidade definida entram no seletor.
    const unidades = (data || []).filter((u) => publicaveis.has(u.id)).map((u) => {
      const perfil = perfilPorUnidade.get(u.id);
      return {
        id: u.id, nome: u.nome, cidade: u.cidade || "Outra", endereco: u.endereco || "",
        // Allowlist pública: nunca publicar empresa/documento/responsável/financeiro.
        ...(perfil ? {
          publicacao_aprovada: true,
          bairro: texto(perfil.bairro),
          descricao: texto(perfil.caracteristicas),
          horarios: texto(perfil.horarios),
          acessibilidade: texto(perfil.acessibilidade),
          estacionamento: texto(perfil.estacionamento),
          comodidades: texto(perfil.comodidades),
          servicos: lista(perfil.servicos),
          fotos: lista(perfil.fotos),
        } : {}),
      };
    });
    return json({ unidades }, 200);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500);
  }
});
