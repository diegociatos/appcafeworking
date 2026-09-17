import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { CACHE_MS, EmailRoteador, limparCacheEmail } from "./EmailRoteador.ts";
import { MicrosoftGraphEmailProvider } from "./MicrosoftGraphEmailProvider.ts";
import type { NotificationProvider } from "./NotificationProvider.ts";
import { type ArmazemEmail, type ConfigMs365, REF_CLIENT_SECRET, REF_REFRESH_TOKEN } from "../msgraph.ts";

function armazemFalso(segredos: Record<string, string>, cfg: ConfigMs365 | null) {
  const gravados: Array<[string, string]> = [];
  const a: ArmazemEmail & { gravados: typeof gravados; leituras: number } = {
    gravados,
    leituras: 0,
    lerConfig() { a.leituras++; return Promise.resolve(cfg); },
    salvarConfig(p) { cfg = { ...(cfg ?? {}), ...p }; return Promise.resolve(cfg); },
    lerSegredo(ref) { return Promise.resolve(segredos[ref] ?? null); },
    gravarSegredo(ref, v) { gravados.push([ref, v]); segredos[ref] = v; return Promise.resolve(); },
    apagarSegredo(ref) { delete segredos[ref]; return Promise.resolve(); },
  };
  return a;
}

const CFG: ConfigMs365 = {
  tenant_id: "11111111-2222-3333-4444-555555555555",
  client_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  tem_secret: true, conectado: true, conta_email: "diego@grupociatos.com.br",
  conectado_em: "2026-09-17T12:00:00Z", envia_como: "envio@grupociatos.com.br", ativo: true,
};

function falso(nome: string, log: string[], ok = true): NotificationProvider {
  return { canal: "email", enviar: () => { log.push(nome); return Promise.resolve(ok ? { ok: true, providerId: nome } : { ok: false, erro: `${nome} falhou` }); } };
}

Deno.test("roteador: Microsoft conectada e ativa → Microsoft", async () => {
  limparCacheEmail();
  const log: string[] = [];
  const r = new EmailRoteador({ armazem: () => armazemFalso({}, CFG), resend: () => falso("resend", log), microsoft: () => falso("ms", log) });
  const res = await r.enviar({ para: "a@x.com", assunto: "s", html: "h" });
  assertEquals(log, ["ms"]);
  assertEquals(res.ok, true);
});

Deno.test("roteador: desativada, desconectada, sem tabela ou erro de leitura → Resend", async () => {
  const casos: Array<ConfigMs365 | null | "erro"> = [{ ...CFG, ativo: false }, { ...CFG, conectado: false }, null, "erro"];
  for (const cfg of casos) {
    limparCacheEmail();
    const log: string[] = [];
    const arm = armazemFalso({}, cfg === "erro" ? CFG : cfg);
    if (cfg === "erro") arm.lerConfig = () => Promise.reject(new Error("falha de rede"));
    const r = new EmailRoteador({ armazem: () => arm, resend: () => falso("resend", log), microsoft: () => falso("ms", log) });
    await r.enviar({ para: "a@x.com", assunto: "s", html: "h" });
    assertEquals(log, ["resend"], `caso ${JSON.stringify(cfg)}`);
  }
});

Deno.test("roteador: falha da Microsoft NÃO cai para o Resend", async () => {
  limparCacheEmail();
  const log: string[] = [];
  const r = new EmailRoteador({ armazem: () => armazemFalso({}, CFG), resend: () => falso("resend", log), microsoft: () => falso("ms", log, false) });
  const res = await r.enviar({ para: "a@x.com", assunto: "s", html: "h" });
  assertEquals(log, ["ms"]);
  assertEquals(res, { ok: false, erro: "ms falhou" });
});

Deno.test("roteador: decide uma vez (cache curto) e relê depois do prazo", async () => {
  limparCacheEmail();
  let agora = 1_000_000;
  const arm = armazemFalso({}, CFG);
  const log: string[] = [];
  const deps = { armazem: () => arm, resend: () => falso("resend", log), microsoft: () => falso("ms", log), agora: () => agora };
  for (let i = 0; i < 5; i++) await new EmailRoteador(deps).enviar({ para: "a@x.com", assunto: "s", html: "h" });
  assertEquals(arm.leituras, 1);
  agora += CACHE_MS + 1;
  await new EmailRoteador(deps).enviar({ para: "a@x.com", assunto: "s", html: "h" });
  assertEquals(arm.leituras, 2);
  limparCacheEmail();
});

function fetchGraph(opts: { tokenStatus?: number; sendStatus?: number; sendErro?: string } = {}) {
  const chamadas: Array<{ url: string; init: RequestInit }> = [];
  const f = ((url: string, init: RequestInit) => {
    chamadas.push({ url, init });
    if (url.includes("/oauth2/v2.0/token")) {
      return Promise.resolve(opts.tokenStatus && opts.tokenStatus >= 400
        ? new Response(JSON.stringify({ error: "invalid_grant", error_description: "AADSTS700082: refresh token expirou" }), { status: opts.tokenStatus })
        : new Response(JSON.stringify({ access_token: "at-1", refresh_token: "rt-2", expires_in: 3600 }), { status: 200 }));
    }
    const st = opts.sendStatus ?? 202;
    return Promise.resolve(st >= 400
      ? new Response(JSON.stringify({ error: { code: "ErrorSendAsDenied", message: opts.sendErro ?? "sem permissão" } }), { status: st })
      : new Response(null, { status: st }));
  }) as unknown as typeof fetch;
  return { f, chamadas };
}

Deno.test("Microsoft: renova o token uma vez, reaproveita e envia por /me/sendMail", async () => {
  limparCacheEmail();
  const arm = armazemFalso({ [REF_REFRESH_TOKEN]: "rt-1", [REF_CLIENT_SECRET]: "sec" }, CFG);
  const { f, chamadas } = fetchGraph();
  const p = new MicrosoftGraphEmailProvider(arm, CFG, f, "");
  const r1 = await p.enviar({ para: "cliente@x.com", assunto: "Oi", html: "<p>1</p>" });
  const r2 = await new MicrosoftGraphEmailProvider(arm, CFG, f, "").enviar({ para: "outro@x.com", assunto: "Oi", html: "<p>2</p>" });
  assertEquals(r1, { ok: true, providerId: null });
  assertEquals(r2.ok, true);
  assertEquals(chamadas.filter((c) => c.url.includes("/token")).length, 1);
  const envios = chamadas.filter((c) => c.url === "https://graph.microsoft.com/v1.0/me/sendMail");
  assertEquals(envios.length, 2);
  assertEquals((envios[0].init.headers as Record<string, string>).authorization, "Bearer at-1");
  const corpo = JSON.parse(String(envios[0].init.body));
  assertEquals(corpo.message.from, { emailAddress: { address: "envio@grupociatos.com.br" } });
  assertEquals(corpo.message.toRecipients, [{ emailAddress: { address: "cliente@x.com" } }]);
  assertEquals(arm.gravados, [[REF_REFRESH_TOKEN, "rt-2"]]);
  limparCacheEmail();
});

Deno.test("Microsoft: token inválido devolve erro (sem lançar)", async () => {
  limparCacheEmail();
  const arm = armazemFalso({ [REF_REFRESH_TOKEN]: "rt-1", [REF_CLIENT_SECRET]: "sec" }, CFG);
  const r = await new MicrosoftGraphEmailProvider(arm, CFG, fetchGraph({ tokenStatus: 400 }).f, "").enviar({ para: "a@x.com", assunto: "s", html: "h" });
  assertEquals(r.ok, false);
  assertEquals(r.erro, "Microsoft 400: AADSTS700082: refresh token expirou");
});

Deno.test("Microsoft: recusa do Graph vira 'Microsoft <status>: <mensagem>'", async () => {
  limparCacheEmail();
  const arm = armazemFalso({ [REF_REFRESH_TOKEN]: "rt-1", [REF_CLIENT_SECRET]: "sec" }, CFG);
  const r = await new MicrosoftGraphEmailProvider(arm, CFG, fetchGraph({ sendStatus: 403, sendErro: "Access is denied" }).f, "").enviar({ para: "a@x.com", assunto: "s", html: "h" });
  assertEquals(r, { ok: false, erro: "Microsoft 403: Access is denied" });
  limparCacheEmail();
});

Deno.test("Microsoft: 401 do Graph descarta o token em cache", async () => {
  limparCacheEmail();
  const arm = armazemFalso({ [REF_REFRESH_TOKEN]: "rt-1", [REF_CLIENT_SECRET]: "sec" }, CFG);
  const g401 = fetchGraph({ sendStatus: 401, sendErro: "token recusado" });
  const r = await new MicrosoftGraphEmailProvider(arm, CFG, g401.f, "").enviar({ para: "a@x.com", assunto: "s", html: "h" });
  assertStringIncludes(r.erro ?? "", "Microsoft 401");
  const ok = fetchGraph();
  await new MicrosoftGraphEmailProvider(arm, CFG, ok.f, "").enviar({ para: "a@x.com", assunto: "s", html: "h" });
  assert(ok.chamadas.some((c) => c.url.includes("/token")), "deveria renovar de novo após 401");
  limparCacheEmail();
});
