import { supabaseConfigured, getAccessToken } from "./supabaseAuth.js";
import { reduzir } from "./fotosSalas.js";

const URL_SUPA = import.meta.env?.VITE_SUPABASE_URL || "";
const ANON = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";
const BUCKET = "fotos-produtos";

function embutida(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(new Error("Não foi possível ler a foto."));
    leitor.readAsDataURL(arquivo);
  });
}

export async function enviarFotoProduto(unidadeId, arquivo) {
  if (!supabaseConfigured) return embutida(arquivo);
  if (!unidadeId) throw new Error("Unidade não identificada.");
  const token = await getAccessToken();
  if (!token) throw new Error("Sessão expirada. Entre de novo.");
  const blob = await reduzir(arquivo);
  const caminho = `${encodeURIComponent(unidadeId)}/${crypto.randomUUID()}.webp`;
  const resposta = await fetch(`${URL_SUPA}/storage/v1/object/${BUCKET}/${caminho}`, {
    method: "POST",
    headers: { apikey: ANON, authorization: `Bearer ${token}`, "content-type": "image/webp", "cache-control": "31536000" },
    body: blob,
  }).catch(() => null);
  if (!resposta) throw new Error("Sem conexão com o servidor. Tente de novo.");
  if (!resposta.ok) throw new Error("Não foi possível enviar a foto do produto.");
  return `${URL_SUPA}/storage/v1/object/public/${BUCKET}/${caminho}`;
}
