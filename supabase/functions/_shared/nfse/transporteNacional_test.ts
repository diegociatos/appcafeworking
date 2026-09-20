import { buscarSefin } from "./transporteNacional.ts";
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
Deno.test("SEFIN usa HTTP/1.1, preserva resposta e fecha cliente", async () => {
  let fechado = false;
  const runtime = { createHttpClient(o: Record<string, unknown>) { assertEquals(o.http2, false); assertEquals(o.http1, true); assertEquals(o.cert, "cert"); return { close() { fechado = true; } }; } };
  const r = await buscarSefin("https://fiscal.invalid", { method: "POST" }, "cert", "key", runtime, async () => new Response('{"ok":true}', { status: 201 }));
  assertEquals(r.status, 201); assertEquals(await r.json(), { ok: true }); assertEquals(fechado, true);
});
Deno.test("SEFIN não reenvia emissão nem cai para HTTP/2", async () => {
  let chamadas = 0, fechamentos = 0;
  const runtime = { createHttpClient() { return { close() { fechamentos++; } }; } };
  await assertRejects(() => buscarSefin("https://fiscal.invalid", { method: "POST" }, "cert", "key", runtime, () => { chamadas++; throw new Error("endpoint requires HTTP/1.1"); }), Error, "Consulte a situação");
  assertEquals(chamadas, 1); assertEquals(fechamentos, 1);
});
Deno.test("certificado ausente ou runtime incompatível não faz requisição sem mTLS", async () => {
  let tentativas = 0;
  const runtime = { createHttpClient() { tentativas++; throw new Error("unsupported"); } };
  await assertRejects(() => buscarSefin("https://fiscal.invalid", {}, undefined, undefined, runtime), Error, "Certificado");
  assertEquals(tentativas, 0);
  await assertRejects(() => buscarSefin("https://fiscal.invalid", {}, "cert", "key", runtime), Error, "HTTP/1.1");
  assertEquals(tentativas, 1);
});
