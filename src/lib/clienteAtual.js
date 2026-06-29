// ============================================================================
// getClienteAtualSeguro — identifica com segurança o cliente do portal.
//
// Modo REAL: encontra o cliente pelo e-mail do usuário autenticado. NUNCA usa
// fallback para clientes[0] (evita vazar dados do primeiro cliente da unidade).
// Modo DEMO / preview de staff: pode cair no primeiro cliente (sem login real).
// Retorna o cliente, ou null quando não há vínculo seguro em modo real.
// ============================================================================

export function getClienteAtualSeguro({ email, clientes = [], demo = false }) {
  const mail = (email || "").toLowerCase();
  const porEmail = mail ? clientes.find((c) => (c.email || "").toLowerCase() === mail) : null;
  if (porEmail) return porEmail;
  if (demo) return clientes[0] || null; // demo/preview: sem login real, usa o primeiro
  return null; // real: sem vínculo seguro → não expõe dados de outro cliente
}
