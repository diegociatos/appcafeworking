import { adminClient } from "../_shared/supabaseAdmin.ts";

const pixel = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="), (c) => c.charCodeAt(0));
const html = (titulo: string, texto: string) => `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${titulo}</title><body style="margin:0;background:#f7f4ee;font-family:Georgia,serif;color:#292520"><main style="max-width:520px;margin:60px auto;background:#fff;border:1px solid #e5ded4;border-radius:18px;padding:34px;text-align:center"><div style="font-size:22px;font-weight:700;color:#6e4e3b">CafeWorking</div><h1 style="font-size:24px">${titulo}</h1><p style="font:16px/1.6 Arial,sans-serif;color:#5d554d">${texto}</p></main></body></html>`;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";
  const evento = url.searchParams.get("evento") === "confirmar" ? "confirmar" : "abrir";
  if (!/^[0-9a-f-]{36}$/i.test(token)) return new Response("Link inválido", { status: 400 });

  const admin = adminClient();
  const agora = new Date().toISOString();
  const patch = evento === "confirmar" ? { confirmed_at: agora, opened_at: agora } : { opened_at: agora };
  const { data, error } = await admin.from("notificacoes").update(patch).eq("tracking_token", token).select("id").maybeSingle();

  if (evento === "abrir") return new Response(pixel, { status: 200, headers: { "content-type": "image/gif", "cache-control": "no-store, max-age=0" } });
  if (error || !data) return new Response(html("Não foi possível confirmar", "Este link não é mais válido. Fale com a equipe do CafeWorking."), { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
  return new Response(html("Recebimento confirmado", "Obrigado. Registramos que você recebeu e visualizou esta cobrança."), { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
});
