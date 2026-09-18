const EVENTOS = new Set(["boleto_nova", "boleto_lembrete", "boleto_pago", "boleto_vencido", "cobranca_nova", "nfse_emitida"]);
export function permiteCopiasFinanceiras(evento: string) { return EVENTOS.has(evento); }
export function normalizarCopias(principal: string, adicionais: unknown): string[] {
  if (!Array.isArray(adicionais)) return [];
  const email = principal.trim().toLowerCase();
  return [...new Set(adicionais.filter(v => typeof v === "string").map(v => v.trim().toLowerCase()))]
    .filter(v => v !== email && /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(v)).slice(0, 10);
}
