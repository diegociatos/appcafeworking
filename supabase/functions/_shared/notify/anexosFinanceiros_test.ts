import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { anexosFinanceiros } from "./anexosFinanceiros.ts";

Deno.test("anexa o PDF do boleto somente a partir de host financeiro permitido", async () => {
  const pdf = new TextEncoder().encode("%PDF-1.4\nconteudo");
  const fetchOk = async () => new Response(pdf, { headers: { "content-type": "application/pdf" } });
  const anexos = await anexosFinanceiros("boleto_nova", { pdfUrl: "https://projeto.supabase.co/storage/v1/object/sign/boleto" }, fetchOk as typeof fetch);
  assertEquals(anexos[0]?.nome, "boleto.pdf");
  assertEquals(atob(anexos[0]?.contentBase64 || "").startsWith("%PDF-"), true);
  assertEquals(await anexosFinanceiros("boleto_nova", { pdfUrl: "https://malicioso.example/arquivo.pdf" }, fetchOk as typeof fetch), []);
});

Deno.test("nomeia o anexo da nota e ignora conteúdo que não é PDF", async () => {
  const pdf = async () => new Response(new TextEncoder().encode("%PDF-1.4"), { headers: { "content-type": "application/pdf" } });
  const nota = await anexosFinanceiros("nfse_emitida", { numero: "123/2026", pdfUrl: "https://x.supabase.co/n.pdf" }, pdf as typeof fetch);
  assertEquals(nota[0]?.nome, "nota-fiscal-1232026.pdf");
  const html = async () => new Response("<html>", { headers: { "content-type": "text/html" } });
  assertEquals(await anexosFinanceiros("nfse_emitida", { pdfUrl: "https://x.supabase.co/n.pdf" }, html as typeof fetch), []);
});
