// ============================================================================
// Edge Function: unidades-publicas  (lista pública p/ o autocadastro)
//
// GET/POST /functions/v1/unidades-publicas   (deploy com --no-verify-jwt)
// Devolve apenas o necessário para o cliente escolher cidade + unidade:
//   [{ id, nome, cidade, endereco }]
// O endereço entra porque as páginas por cidade do site (fase 3 da rede de
// parceiros) mostram onde fica a unidade; é o mesmo endereço que já aparece nas
// páginas das unidades.
// ============================================================================

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const admin = adminClient();
    const { data, error } = await admin
      .from("unidades")
      .select("id, nome, cidade, endereco")
      .order("cidade", { ascending: true })
      .order("nome", { ascending: true });
    if (error) return json({ error: error.message }, 500);
    const publicaveis = new Set<string>();
    const { data: perfis, error: pErr } = await admin.from('parceiro_unidade_perfis').select('unidade_id,dados').eq('status','publicado');
    if (pErr) throw new Error('Não foi possível conferir os perfis publicados.');
    const perfilPorUnidade = new Map((perfis || []).map((p) => [p.unidade_id, p.dados]));
    await Promise.all((data || []).map(async (u) => {
      const { data: ok, error } = await admin.rpc('unidade_publicavel', { p_unidade: u.id });
      if (error) throw new Error('Não foi possível conferir a publicação das unidades.');
      if (ok === true) publicaveis.add(u.id);
    }));
    // Só unidades com cidade definida entram no seletor.
    const unidades = (data || []).filter((u) => publicaveis.has(u.id)).map((u) => ({
      id: u.id, nome: u.nome, cidade: u.cidade || "Outra", endereco: u.endereco || "",
      // Allowlist pública: nunca publicar empresa/documento/responsável/financeiro.
      ...(perfilPorUnidade.has(u.id) ? {
        publicacao_aprovada: true,
        bairro: perfilPorUnidade.get(u.id)?.bairro || '',
        descricao: perfilPorUnidade.get(u.id)?.caracteristicas || '',
        horarios: perfilPorUnidade.get(u.id)?.horarios || '',
        acessibilidade: perfilPorUnidade.get(u.id)?.acessibilidade || '',
        estacionamento: perfilPorUnidade.get(u.id)?.estacionamento || '',
        comodidades: perfilPorUnidade.get(u.id)?.comodidades || '',
        servicos: perfilPorUnidade.get(u.id)?.servicos || [],
        fotos: perfilPorUnidade.get(u.id)?.fotos || [],
      } : {}),
    }));
    return json({ unidades }, 200);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500);
  }
});
