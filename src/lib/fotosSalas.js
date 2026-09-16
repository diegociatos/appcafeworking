// ============================================================================
// fotosSalas — fotos das salas no Storage público (bucket fotos-salas).
// As fotos aparecem no site, então vão como arquivo (URL pública), não como
// imagem embutida no cadastro. Antes de enviar, reduz para no máximo 1600 px
// em WebP: foto de celular cai de ~4 MB para ~200 KB.
// Sem Supabase (modo demonstração), devolve a imagem embutida como antes.
// ============================================================================

import { supabaseConfigured, getAccessToken } from "./supabaseAuth.js";

const URL_SUPA = import.meta.env?.VITE_SUPABASE_URL || "";
const ANON = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";
const BUCKET = "fotos-salas";
const LADO_MAX = 1600;

function carregarImagem(arquivo) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Arquivo não é uma imagem válida.")); };
    img.src = url;
  });
}

/** Reduz a imagem (File ou Blob) para no máximo 1600 px em WebP. Usada também nas correspondências. */
export async function reduzir(arquivo) {
  const img = await carregarImagem(arquivo);
  const escala = Math.min(1, LADO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * escala);
  canvas.height = Math.round(img.naturalHeight * escala);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob(
    (b) => (b ? resolve(b) : reject(new Error("Não foi possível preparar a foto."))), "image/webp", 0.82,
  ));
}

function embutida(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    leitor.readAsDataURL(arquivo);
  });
}

/** Envia a foto e devolve o endereço público. */
export async function enviarFotoSala(unidadeId, arquivo) {
  if (!supabaseConfigured) return embutida(arquivo);
  if (!unidadeId) throw new Error("Unidade não identificada.");
  const token = await getAccessToken();
  if (!token) throw new Error("Sessão expirada. Entre de novo.");
  const blob = await reduzir(arquivo);
  const caminho = `${encodeURIComponent(unidadeId)}/${crypto.randomUUID()}.webp`;
  const res = await fetch(`${URL_SUPA}/storage/v1/object/${BUCKET}/${caminho}`, {
    method: "POST",
    headers: { apikey: ANON, authorization: `Bearer ${token}`, "content-type": "image/webp", "cache-control": "31536000" },
    body: blob,
  }).catch(() => null);
  if (!res) throw new Error("Sem conexão com o servidor. Tente de novo.");
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(res.status === 403 || res.status === 400 ? "Sem permissão para enviar fotos desta unidade." : d.message || `Falha no envio (${res.status})`);
  }
  return `${URL_SUPA}/storage/v1/object/public/${BUCKET}/${caminho}`;
}
