// ============================================================================
// CORS das Edge Functions — allowlist via ALLOWED_ORIGINS (CSV).
//
// O navegador faz preflight (OPTIONS) em todas as chamadas do app (POST JSON /
// headers customizados), então handleOptions é o gate real: recusa 403 origens
// fora da allowlist e ecoa a origem permitida. Requisições sem header Origin
// (server-to-server, ex.: webhooks com --no-verify-jwt) NÃO são bloqueadas.
//
// Defina em produção:
//   supabase secrets set ALLOWED_ORIGINS="https://app.cafeworking.com.br,https://appcafeworking.netlify.app,http://localhost:5173"
// ============================================================================

const BASE_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function allowlist(): string[] {
  return (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean);
}

// Resolve a origem da requisição contra a allowlist:
//   string : origem a ecoar (permitida, ou "*" no fallback sem env)
//   null   : sem header Origin → chamada não-browser (webhook/cron), liberar
//   false  : Origin presente e NÃO permitida → recusar (403)
function resolveOrigin(req: Request): string | null | false {
  const origin = req.headers.get("Origin");
  const lista = allowlist();
  if (!lista.length) {
    console.warn("[cors] ALLOWED_ORIGINS vazio — liberando '*'. Defina a allowlist em produção.");
    return "*";
  }
  if (!origin) return null;
  return lista.includes(origin) ? origin : false;
}

// Monta os headers CORS para a requisição (ecoando a origem resolvida).
export function corsHeadersFor(req: Request): Record<string, string> {
  const resolved = resolveOrigin(req);
  const h: Record<string, string> = { ...BASE_HEADERS };
  if (resolved === null) return h; // server-to-server: sem ACAO (não é browser)
  h["Access-Control-Allow-Origin"] = resolved === false ? "null" : resolved;
  if (resolved !== "*") h["Vary"] = "Origin";
  return h;
}

// Compat: alguns módulos importavam `corsHeaders` como objeto. Mantido como
// "*"+base para não quebrar imports legados; prefira corsHeadersFor(req).
export const corsHeaders: Record<string, string> = { ...BASE_HEADERS, "Access-Control-Allow-Origin": "*" };

export function json(body: unknown, status = 200, req?: Request): Response {
  // Com req, ecoa a origem resolvida; sem req, cai para "*" (resposta de body é
  // segura para requisições não-credenciadas; o gate real é o preflight).
  const h = req ? corsHeadersFor(req) : corsHeaders;
  return new Response(JSON.stringify(body), { status, headers: { ...h, "content-type": "application/json" } });
}

export function handleOptions(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;
  const resolved = resolveOrigin(req);
  if (resolved === false) {
    return new Response("origin not allowed", { status: 403, headers: BASE_HEADERS });
  }
  return new Response("ok", { headers: corsHeadersFor(req) });
}
