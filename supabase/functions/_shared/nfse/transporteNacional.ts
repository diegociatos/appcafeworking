type ClienteHttp = { close(): void };
type Runtime = { createHttpClient(opcoes: Record<string, unknown>): ClienteHttp };
type Buscar = (url: string, init: RequestInit & { client: ClienteHttp }) => Promise<Response>;

// Não repete POST fiscal nem remove a exigência de HTTP/1.1 em caso de erro.
export async function buscarSefin(
  url: string, init: RequestInit | undefined, cert: string | undefined, key: string | undefined,
  runtime: Runtime = Deno, buscar: Buscar = fetch as Buscar,
): Promise<Response> {
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
    if (/HTTP\/1\.1|http2|HTTP\/2/i.test(String((e as Error).message))) {
      throw new Error("A conexão com a NFS-e Nacional recusou o protocolo. Confira se a função publicada usa HTTP/1.1. Consulte a situação da nota antes de tentar emitir novamente.");
    }
    throw e;
  } finally { client.close(); }
}
