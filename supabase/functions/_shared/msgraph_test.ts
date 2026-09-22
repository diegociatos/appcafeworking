import { assert, assertEquals, assertRejects, assertStringIncludes } from "jsr:@std/assert@1";
import {
  type ArmazemEmail, assinarState, type ConfigMs365, ErroMicrosoft, montarSendMail, REF_CLIENT_SECRET,
  REF_REFRESH_TOKEN, renovarAccessToken, SCOPE, segredoDoState, STATE_VALIDADE_MS, statusPublico,
  urlAutorizacao, usarMicrosoft, validarDadosApp, verificarState,
} from "./msgraph.ts";

const CFG: ConfigMs365 = {
  tenant_id: "11111111-2222-3333-4444-555555555555",
  client_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  tem_secret: true, conectado: true, conta_email: "diego@grupociatos.com.br",
  envia_como: "envio@grupociatos.com.br", ativo: true,
};

function armazemFalso(segredos: Record<string, string> = {}, cfg: ConfigMs365 | null = CFG) {
  const gravados: Array<[string, string]> = [];
  let config = cfg;
  const a: ArmazemEmail & { gravados: typeof gravados; leituras: number } = {
    gravados,
    leituras: 0,
    lerConfig() { a.leituras++; return Promise.resolve(config); },
    salvarConfig(p) { config = { ...(config ?? {}), ...p }; return Promise.resolve(config); },
    lerSegredo(ref) { return Promise.resolve(segredos[ref] ?? null); },
    gravarSegredo(ref, v) { gravados.push([ref, v]); segredos[ref] = v; return Promise.resolve(); },
    apagarSegredo(ref) { delete segredos[ref]; return Promise.resolve(); },
  };
  return a;
}

Deno.test("sendMail: corpo com from = envia_como, replyTo e HTML", () => {
  const c = montarSendMail({ para: "cliente@x.com", assunto: "Olá", html: "<b>oi</b>", replyTo: "atendimento@cafeworking.com.br" }, "envio@grupociatos.com.br");
  assertEquals(c, {
    message: {
      subject: "Olá",
      body: { contentType: "HTML", content: "<b>oi</b>" },
      toRecipients: [{ emailAddress: { address: "cliente@x.com" } }],
      replyTo: [{ emailAddress: { address: "atendimento@cafeworking.com.br" } }],
      from: { emailAddress: { address: "envio@grupociatos.com.br" } },
    },
    saveToSentItems: true,
  });
});

Deno.test("sendMail: inclui PDF como fileAttachment", () => {
  const corpo = montarSendMail({
    para: "cliente@example.com", assunto: "Boleto", html: "<b>Olá</b>",
    anexos: [{ nome: "boleto.pdf", contentType: "application/pdf", contentBase64: "JVBERg==" }],
  });
  assertEquals(corpo.message.attachments, [{
    "@odata.type": "#microsoft.graph.fileAttachment", name: "boleto.pdf",
    contentType: "application/pdf", contentBytes: "JVBERg==",
  }]);
});

Deno.test("sendMail: sem envia_como não manda from (sai pela própria conta)", () => {
  const c = montarSendMail({ para: ["a@x.com", ""], assunto: "A", html: "h" });
  assertEquals(c.message.from, undefined);
  assertEquals(c.message.replyTo, undefined);
  assertEquals(c.message.toRecipients.length, 1);
});

Deno.test("state: assinado confere; adulterado, expirado ou com outro segredo não", async () => {
  const s = await assinarState({ u: "user-1" }, "segredo");
  assertEquals(await verificarState(s, "segredo"), { u: "user-1" });
  assertEquals(await verificarState(s, "outro"), null);
  const [p, sig] = s.split(".");
  const falso = btoa(JSON.stringify({ u: "intruso", exp: Date.now() + 1000, n: "x" })).replace(/=+$/, "");
  assertEquals(await verificarState(`${falso}.${sig}`, "segredo"), null);
  assertEquals(await verificarState(`${p}.${sig}x`, "segredo"), null);
  assertEquals(await verificarState(s, "segredo", Date.now() + STATE_VALIDADE_MS + 1000), null);
  assertEquals(await verificarState("", "segredo"), null);
});

Deno.test("state: segredo próprio tem prioridade; sem nenhum, erro", () => {
  assertEquals(segredoDoState((k) => ({ MS_STATE_SECRET: "proprio", SUPABASE_SERVICE_ROLE_KEY: "sr" } as Record<string, string>)[k]), "proprio");
  assertStringIncludes(segredoDoState((k) => (k === "SUPABASE_SERVICE_ROLE_KEY" ? "sr" : undefined)), "sr");
  let erro = false;
  try { segredoDoState(() => undefined); } catch { erro = true; }
  assert(erro);
});

Deno.test("URL de autorização leva escopo, redirect e state", () => {
  const u = new URL(urlAutorizacao(CFG, "https://proj.supabase.co/functions/v1/email-ms365-callback", "st"));
  assertEquals(u.origin + u.pathname, `https://login.microsoftonline.com/${CFG.tenant_id}/oauth2/v2.0/authorize`);
  assertEquals(u.searchParams.get("scope"), SCOPE);
  assertEquals(u.searchParams.get("client_id"), CFG.client_id);
  assertEquals(u.searchParams.get("redirect_uri"), "https://proj.supabase.co/functions/v1/email-ms365-callback");
  assertEquals(u.searchParams.get("state"), "st");
  assertEquals(u.searchParams.get("response_type"), "code");
});

Deno.test("validarDadosApp", () => {
  assert(validarDadosApp({ tenant_id: CFG.tenant_id, client_id: CFG.client_id, envia_como: " Envio@GrupoCiatos.com.br " }).ok);
  assert(validarDadosApp({ tenant_id: "grupociatos.onmicrosoft.com", client_id: CFG.client_id }).ok);
  assertEquals(validarDadosApp({ tenant_id: "", client_id: CFG.client_id }).ok, false);
  assertEquals(validarDadosApp({ tenant_id: CFG.tenant_id, client_id: "abc" }).ok, false);
  assertEquals(validarDadosApp({ tenant_id: CFG.tenant_id, client_id: CFG.client_id, envia_como: "nao-e-email" }).ok, false);
});

Deno.test("statusPublico não expõe segredo e usarMicrosoft exige conectado + ativo", () => {
  const s = statusPublico(CFG);
  assertEquals(s.appConfigurado, true);
  // mesmo que algo indevido parasse na config, a visão pública só copia campos conhecidos
  const sujo = statusPublico({ ...CFG, client_secret: "SEGREDO-X", refresh_token: "TOKEN-Y" } as ConfigMs365);
  assertEquals(/SEGREDO-X|TOKEN-Y/.test(JSON.stringify(sujo)), false);
  assertEquals(usarMicrosoft(CFG), true);
  assertEquals(usarMicrosoft({ ...CFG, ativo: false }), false);
  assertEquals(usarMicrosoft({ ...CFG, conectado: false }), false);
  assertEquals(usarMicrosoft(null), false);
});

function fetchToken(resposta: Record<string, unknown>, status = 200) {
  const chamadas: Array<{ url: string; body: URLSearchParams }> = [];
  const f = ((url: string, init: RequestInit) => {
    chamadas.push({ url, body: new URLSearchParams(String(init.body)) });
    return Promise.resolve(new Response(JSON.stringify(resposta), { status }));
  }) as unknown as typeof fetch;
  return { f, chamadas };
}

Deno.test("renovação: regrava o refresh token quando a Microsoft manda um novo", async () => {
  const arm = armazemFalso({ [REF_REFRESH_TOKEN]: "rt-velho", [REF_CLIENT_SECRET]: "sec" });
  const { f, chamadas } = fetchToken({ access_token: "at-1", refresh_token: "rt-novo", expires_in: 3600 });
  const r = await renovarAccessToken(arm, CFG, f);
  assertEquals(r.token, "at-1");
  assert(r.expiraEm > Date.now());
  assertEquals(arm.gravados, [[REF_REFRESH_TOKEN, "rt-novo"]]);
  assertEquals(chamadas[0].url, `https://login.microsoftonline.com/${CFG.tenant_id}/oauth2/v2.0/token`);
  assertEquals(chamadas[0].body.get("grant_type"), "refresh_token");
  assertEquals(chamadas[0].body.get("refresh_token"), "rt-velho");
  assertEquals(chamadas[0].body.get("client_secret"), "sec");
  assertEquals(chamadas[0].body.get("scope"), SCOPE);
});

Deno.test("renovação: mesmo refresh token (ou nenhum) não regrava", async () => {
  const arm = armazemFalso({ [REF_REFRESH_TOKEN]: "rt", [REF_CLIENT_SECRET]: "sec" });
  await renovarAccessToken(arm, CFG, fetchToken({ access_token: "a", refresh_token: "rt" }).f);
  await renovarAccessToken(arm, CFG, fetchToken({ access_token: "a" }).f);
  assertEquals(arm.gravados, []);
});

Deno.test("renovação: token inválido vira 'Microsoft <status>: <mensagem>'", async () => {
  const arm = armazemFalso({ [REF_REFRESH_TOKEN]: "rt", [REF_CLIENT_SECRET]: "sec" });
  const { f } = fetchToken({ error: "invalid_grant", error_description: "AADSTS70000: token expirado\r\nTrace ID: x" }, 400);
  const e = await assertRejects(() => renovarAccessToken(arm, CFG, f), ErroMicrosoft);
  assertEquals(e.message, "Microsoft 400: AADSTS70000: token expirado");
});

Deno.test("renovação: sem conta conectada avisa em português", async () => {
  const arm = armazemFalso({ [REF_CLIENT_SECRET]: "sec" });
  await assertRejects(() => renovarAccessToken(arm, CFG, fetchToken({}).f), Error, "Nenhuma conta Microsoft conectada");
});
