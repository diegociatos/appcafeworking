// ============================================================================
// Cloudflare Turnstile — anti-robô dos endpoints públicos que gastam recurso
// (criam login, cobrança no Asaas ou seguram horário de sala).
//
// Secret: TURNSTILE_SECRET_KEY. Sem o secret a verificação fica desligada e só
// registra aviso no log — serve para desenvolvimento, NÃO para produção.
// Com o secret configurado a verificação é fail-closed: se o Cloudflare não
// responder, a requisição é recusada.
// ============================================================================

export async function verificarTurnstile(
  token: unknown,
  ip: string | null,
): Promise<{ ok: boolean; ignorado?: boolean; motivo?: string }> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY") || "";
  if (!secret) {
    console.warn("[turnstile] TURNSTILE_SECRET_KEY ausente — verificação DESLIGADA");
    return { ok: true, ignorado: true };
  }
  if (typeof token !== "string" || !token) return { ok: false, motivo: "token ausente" };

  const form = new URLSearchParams({ secret, response: token });
  if (ip) form.set("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (data?.success) return { ok: true };
    return { ok: false, motivo: (data?.["error-codes"] || []).join(",") || "falhou" };
  } catch (_) {
    return { ok: false, motivo: "verificação indisponível" };
  }
}
