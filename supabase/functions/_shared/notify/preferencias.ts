// ============================================================================
// Preferências de e-mail do cliente (tabela preferencias_notificacao).
//
// Só os avisos opcionais respeitam a escolha do cliente. Pagamento, cobrança,
// nota fiscal, contrato, cancelamento, documentos e correspondência são
// transacionais ou oficiais e sempre saem.
// ============================================================================

import type { Evento } from "./types.ts";

// Tipo mínimo do cliente do Supabase: mantém este arquivo testável sem baixar o SDK.
// deno-lint-ignore no-explicit-any
type ClienteBanco = { from: (tabela: string) => any };

export type CategoriaOpcional = "lembretes" | "reservas" | "novidades";

/** Padrão de quem nunca escolheu nada: lembretes e reservas sim, novidades não. */
export const PREFERENCIAS_PADRAO: Record<CategoriaOpcional, boolean> = {
  lembretes: true,
  reservas: true,
  novidades: false,
};

const OPCIONAIS: Partial<Record<Evento, CategoriaOpcional>> = {
  boleto_lembrete: "lembretes",
  reserva: "reservas",
};

/** Categoria opcional do evento; null = transacional (sempre enviado). */
export function categoriaOpcional(evento: Evento): CategoriaOpcional | null {
  return OPCIONAIS[evento] ?? null;
}

/** Decide com as preferências já lidas (null = cliente nunca escolheu). */
export function deveEnviar(evento: Evento, prefs: Partial<Record<CategoriaOpcional, boolean>> | null): boolean {
  const cat = categoriaOpcional(evento);
  if (!cat) return true;
  const valor = prefs?.[cat];
  return typeof valor === "boolean" ? valor : PREFERENCIAS_PADRAO[cat];
}

/**
 * Lê a preferência no banco e decide. Falha de leitura (tabela ainda não
 * publicada, rede) cai no padrão, para não travar avisos.
 */
export async function preferenciaPermite(admin: ClienteBanco, email: string, evento: Evento): Promise<boolean> {
  if (!categoriaOpcional(evento)) return true;
  try {
    const { data, error } = await admin.from("preferencias_notificacao")
      .select("lembretes, reservas, novidades").eq("email", String(email).trim().toLowerCase()).maybeSingle();
    if (error) return deveEnviar(evento, null);
    return deveEnviar(evento, data);
  } catch (_) {
    return deveEnviar(evento, null);
  }
}
