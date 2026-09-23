type ClienteHttp = { close(): void };
type Runtime = { createHttpClient(opcoes: Record<string, unknown>): ClienteHttp };
type Buscar = (url: string, init: RequestInit & { client: ClienteHttp }) => Promise<Response>;

/**
 * Transmissor fiscal (serviço Node) — ver docs/NFSE-TRANSMISSOR.md.
 * O SEFIN Nacional recusa o handshake TLS do Deno, então quando o transmissor
 * está configurado a requisição sai por ele. O certificado mora lá: daqui vai
 * só a requisição, nunca a chave.
 */
async function viaTransmissor(url: string, init: RequestInit | undefined, unidadeId?: string): Promise<Response> {
  const base = Deno.env.get("NFSE_TRANSMISSOR_URL") || "";
  const token = Deno.env.get("NFSE_TRANSMISSOR_TOKEN") || "";
  const corpo = init?.body;
  const bytes = typeof corpo === "string"
    ? new TextEncoder().encode(corpo)
    : corpo instanceof Uint8Array ? corpo : null;
  const resp = await fetch(base, {
    method: "POST",
    headers: { "content-type": "application/json", "x-cw-token": token },
    body: JSON.stringify({
      url,
      metodo: init?.method || "GET",
      unidade_id: unidadeId,
      cabecalhos: init?.headers,
      corpo: bytes ? encodeBase64(bytes) : undefined,
    }),
    signal: init?.signal ?? null,
  });
  const dados = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(dados?.erro || "O transmissor fiscal não concluiu o envio.");
  const conteudo = decodeBase64(String(dados.corpo || ""));
  return new Response(conteudo.buffer as ArrayBuffer, {
    status: Number(dados.status) || 502,
    headers: dados.headers && typeof dados.headers === "object"
      ? Object.fromEntries(Object.entries(dados.headers).filter(([, v]) => typeof v === "string") as [string, string][])
      : undefined,
  });
}

function encodeBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function decodeBase64(txt: string): Uint8Array {
  const bin = atob(txt);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function transmissorConfigurado(): boolean {
  return Boolean(Deno.env.get("NFSE_TRANSMISSOR_URL") && (Deno.env.get("NFSE_TRANSMISSOR_TOKEN") || "").length >= 32);
}

// Não repete POST fiscal nem remove a exigência de HTTP/1.1 em caso de erro.
export async function buscarSefin(
  url: string, init: RequestInit | undefined, cert: string | undefined, key: string | undefined,
  runtime: Runtime = Deno, buscar: Buscar = fetch as Buscar, unidadeId?: string,
): Promise<Response> {
  // Caminho normal em produção: o transmissor Node. O caminho direto abaixo fica
  // para ambiente local e para o dia em que o SEFIN aceitar o TLS do Deno.
  if (transmissorConfigurado()) return await viaTransmissor(url, init, unidadeId);
  if (!cert || !key) throw new Error("Certificado A1 indisponível. Confira a configuração fiscal da unidade.");
  let client: ClienteHttp;
  try {
    client = runtime.createHttpClient({ cert, key, certChain: cert, privateKey: key, http1: true, http2: false });
  } catch {
    throw new Error("Não foi possível preparar a conexão fiscal HTTP/1.1 com certificado. Confira o certificado e a versão publicada da função.");
  }
  try {
    const resposta = await buscar(url, { ...init, client });
    // Consome antes de fechar o cliente: também funciona para o PDF do DANFSe.
    const bytes = await resposta.arrayBuffer();
    return new Response([204, 205, 304].includes(resposta.status) ? null : bytes, { status: resposta.status, statusText: resposta.statusText, headers: resposta.headers });
  } catch (e) {
    const mensagem = String((e as Error).message || e);
    // A mensagem amigável vai para a tela; a original fica em `cause` para o
    // diagnóstico mostrar o motivo real (reset, TLS, DNS) sem adivinhação.
    if (/HTTP\/1\.1|http2|HTTP\/2/i.test(mensagem)) {
      throw new Error("A conexão com a NFS-e Nacional recusou o protocolo. Confira se a função publicada usa HTTP/1.1. Consulte a situação da nota antes de tentar emitir novamente.", { cause: mensagem });
    }
    if (/connection reset|reset by peer|SendRequest|sending request|os error 104/i.test(mensagem)) {
      throw new Error("O SEFIN Nacional encerrou a conexão segura antes de confirmar a emissão. O boleto continua válido. Consulte a situação da nota antes de tentar novamente.", { cause: mensagem });
    }
    throw e;
  } finally { client.close(); }
}
