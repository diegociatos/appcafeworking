// ============================================================================
// Montagem de HTML a partir de dados (impressão, janelas avulsas).
//
// Todo texto que vem de cadastro, formulário ou banco passa por esc() antes de
// entrar numa string HTML: nome do cliente, descrição, forma de pagamento e
// nome da unidade não podem virar tag nem script (a janela de impressão abre na
// mesma origem do app e teria acesso à sessão).
// ============================================================================

const TROCAS = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escapa & < > " ' para uso em texto e em atributo entre aspas. */
export const esc = (valor) => String(valor ?? "").replace(/[&<>"']/g, (c) => TROCAS[c]);

/**
 * URL de arquivo que pode ser aberta ou baixada: https/http, blob ou data: de
 * imagem/PDF. Qualquer outra coisa (javascript:, data:text/html...) vira null —
 * anexo antigo gravado no app_state pode trazer qualquer texto.
 */
export function urlSegura(url) {
  const u = String(url ?? "").trim();
  if (/^https?:\/\//i.test(u) || /^blob:/i.test(u)) return u;
  if (/^data:(image\/(png|jpe?g|webp|gif)|application\/pdf)[;,]/i.test(u)) return u;
  return null;
}
