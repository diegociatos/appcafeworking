// ============================================================================
// Direitos do plano do cliente (descontoSala, descontoCafe, cafeIncluso…).
//
// Os direitos são cadastrados em Planos (src/pages/Planos.jsx) e viajam em dois
// lugares no banco:
//   • assinaturas.direitos — cópia gravada na venda pelo site/app (fonte 1ª);
//   • app_state (entity 'planos') — o catálogo da unidade, casado com o plano
//     do cadastro do cliente pelo NOME (clientes.plano), que é o vínculo que o
//     app usa desde sempre (Clientes.jsx → CreditosCliente).
//
// A parte pura (percentuais) é testada em direitosPlano_test.ts; a leitura no
// banco usa só select, nunca lança e cai em 0 quando não acha nada — desconto é
// benefício, jamais pode derrubar uma reserva.
// ============================================================================

import { percentualValido } from "./reservaCliente.ts";

// Tipo mínimo do cliente do Supabase: mantém o arquivo testável sem o SDK.
// deno-lint-ignore no-explicit-any
export type ClienteBanco = { from: (tabela: string) => any };

// deno-lint-ignore no-explicit-any
export type Direitos = Record<string, any> | null | undefined;

/** Desconto de sala do plano, em % (0 quando não houver). */
export function percentualDescontoSala(direitos: Direitos): number {
  return percentualValido(direitos?.descontoSala);
}

/** Desconto de cafeteria do plano, em % (0 quando não houver). */
export function percentualDescontoCafe(direitos: Direitos): number {
  return percentualValido(direitos?.descontoCafe);
}

/** O plano dá um café por dia sem custo? */
export function temCafeIncluso(direitos: Direitos): boolean {
  return direitos?.cafeIncluso === true;
}

/** O maior desconto entre os direitos encontrados (cliente com mais de um plano). */
export function maiorDescontoSala(lista: Direitos[]): number {
  return lista.reduce((maior: number, d) => Math.max(maior, percentualDescontoSala(d)), 0);
}

/**
 * Direitos valendo para o cliente na unidade. Procura na ordem:
 *   1. assinatura ativa/inadimplente com o e-mail do cliente na unidade;
 *   2. plano do cadastro (clientes.plano) casado pelo nome com o catálogo da
 *      unidade em app_state.
 * Devolve [] quando não achar. Nunca lança.
 */
export async function direitosDoCliente(
  admin: ClienteBanco, unidadeId: string, email?: string | null, clienteId?: string | null,
): Promise<Direitos[]> {
  const alvo = String(email || "").trim().toLowerCase();
  const achados: Direitos[] = [];
  try {
    if (alvo) {
      const { data } = await admin.from("assinaturas").select("direitos")
        .eq("unidade_id", unidadeId).eq("cliente_email", alvo).in("status", ["ativa", "inadimplente"]);
      for (const a of data || []) if (a?.direitos) achados.push(a.direitos);
    }
    if (achados.length) return achados;

    // Plano do cadastro (cliente antigo, sem assinatura pelo site).
    let plano = "";
    if (clienteId) {
      const { data } = await admin.from("clientes").select("plano").eq("id", clienteId).maybeSingle();
      plano = String(data?.plano || "").trim();
    }
    if (!plano && alvo) {
      const { data } = await admin.from("clientes").select("plano")
        .eq("unidade_id", unidadeId).eq("email", alvo).limit(1).maybeSingle();
      plano = String(data?.plano || "").trim();
    }
    if (!plano) return achados;

    const { data: docs } = await admin.from("app_state").select("doc")
      .eq("unidade_id", unidadeId).eq("entity", "planos");
    for (const linha of docs || []) {
      const doc = linha?.doc;
      if (doc && String(doc.nome || "").trim() === plano && doc.direitos) achados.push(doc.direitos);
    }
  } catch (e) {
    console.error("[direitosPlano] leitura falhou (segue sem desconto):", (e as Error).message);
  }
  return achados;
}

/** Desconto de sala do cliente na unidade, em % (0 quando não houver). */
export async function descontoSalaDoCliente(
  admin: ClienteBanco, unidadeId: string, email?: string | null, clienteId?: string | null,
): Promise<number> {
  return maiorDescontoSala(await direitosDoCliente(admin, unidadeId, email, clienteId));
}
