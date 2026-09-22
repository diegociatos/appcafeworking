import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { EmailProvider } from "./EmailProvider.ts";

Deno.test("Resend recebe o PDF como anexo base64", async () => {
  const original = globalThis.fetch;
  let corpo: Record<string, unknown> = {};
  globalThis.fetch = async (_url, init) => {
    corpo = JSON.parse(String(init?.body));
    return Response.json({ id: "email-1" });
  };
  try {
    const resultado = await new EmailProvider("chave-teste", "CafeWorking <teste@example.com>").enviar({
      para: "cliente@example.com", assunto: "Boleto", html: "<p>Boleto</p>",
      anexos: [{ nome: "boleto.pdf", contentType: "application/pdf", contentBase64: "JVBERg==" }],
    });
    assertEquals(resultado.ok, true);
    assertEquals(corpo.attachments, [{ filename: "boleto.pdf", content: "JVBERg==" }]);
  } finally { globalThis.fetch = original; }
});
