// ============================================================================
// Templates de e-mail (HTML com a marca CafeWorking).
// renderTemplate(evento, dados) → { assunto, html, texto }
// `dados` traz as variáveis (cliente, valor, vencimento, linhaDigitavel, etc.)
// ============================================================================

import type { Evento, OutboundMessage } from "./types.ts";

const MARCA = "#6E4E3B";       // café
const CREME = "#F7F4EE";
const APP_URL = Deno.env.get("APP_URL") ?? "https://app.cafeworking.com.br";

const brl = (n: number) =>
  "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
const dataBR = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "");

/** Layout base: cabeçalho com a marca + corpo + rodapé com descadastro. */
function layout(titulo: string, corpo: string, cta?: { label: string; url: string }) {
  return `<!doctype html><html><body style="margin:0;background:${CREME};font-family:Georgia,'Times New Roman',serif;color:#1F1F1C">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREME};padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid rgba(0,0,0,.06)">
        <tr><td style="background:${MARCA};padding:18px 28px;color:#fff;font-size:18px;font-weight:bold">CafeWorking</td></tr>
        <tr><td style="padding:28px">
          <h1 style="font-size:20px;margin:0 0 12px">${titulo}</h1>
          <div style="font-size:15px;line-height:1.6;color:#3D3A35">${corpo}</div>
          ${cta ? `<div style="margin:22px 0 4px"><a href="${cta.url}" style="background:${MARCA};color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:15px;display:inline-block">${cta.label}</a></div>` : ""}
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid rgba(0,0,0,.06);font-size:11px;color:#A09890">
          Você recebe este e-mail porque é cliente do coworking.
          <a href="${APP_URL}/preferencias" style="color:#A09890">Gerenciar notificações</a> ·
          <a href="${APP_URL}/descadastro" style="color:#A09890">Descadastrar</a>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

type Render = { assunto: string; html: string; texto: string };

const TEMPLATES: Record<Evento, (d: any) => Render> = {
  boleto_nova: (d) => ({
    assunto: `Nova cobrança · ${brl(d.valor)} vence ${dataBR(d.vencimento)}`,
    texto: `Olá ${d.cliente}, sua cobrança de ${brl(d.valor)} vence em ${dataBR(d.vencimento)}. Linha digitável: ${d.linhaDigitavel}`,
    html: layout(
      "Sua cobrança está disponível",
      `Olá <b>${d.cliente}</b>,<br><br>Geramos sua cobrança no valor de <b>${brl(d.valor)}</b>, com vencimento em <b>${dataBR(d.vencimento)}</b>.<br><br>
       <b>Linha digitável:</b><br><span style="font-family:monospace;font-size:13px">${d.linhaDigitavel || "—"}</span>
       ${d.pixCopiaCola ? `<br><br><b>PIX copia e cola:</b><br><span style="font-family:monospace;font-size:12px;word-break:break-all">${d.pixCopiaCola}</span>` : ""}`,
      d.pdfUrl ? { label: "Ver boleto (PDF)", url: d.pdfUrl } : { label: "Ver na minha área", url: `${APP_URL}/faturas` },
    ),
  }),
  boleto_lembrete: (d) => ({
    assunto: `Lembrete: sua cobrança vence ${dataBR(d.vencimento)}`,
    texto: `Olá ${d.cliente}, sua cobrança de ${brl(d.valor)} vence em ${dataBR(d.vencimento)}.`,
    html: layout("Lembrete de vencimento", `Olá <b>${d.cliente}</b>,<br><br>Passando para lembrar que sua cobrança de <b>${brl(d.valor)}</b> vence em <b>${dataBR(d.vencimento)}</b>.`,
      { label: "Pagar agora", url: `${APP_URL}/faturas` }),
  }),
  boleto_pago: (d) => ({
    assunto: `Pagamento confirmado · ${brl(d.valor)}`,
    texto: `Recebemos seu pagamento de ${brl(d.valor)}. Obrigado, ${d.cliente}!`,
    html: layout("Pagamento confirmado ✓", `Olá <b>${d.cliente}</b>,<br><br>Confirmamos o recebimento de <b>${brl(d.valor)}</b>. Obrigado!<br>Este e-mail serve como recibo.`),
  }),
  boleto_vencido: (d) => ({
    assunto: `Cobrança em atraso · ${brl(d.valor)}`,
    texto: `Olá ${d.cliente}, identificamos que a cobrança de ${brl(d.valor)} venceu em ${dataBR(d.vencimento)}.`,
    html: layout("Cobrança em atraso", `Olá <b>${d.cliente}</b>,<br><br>A cobrança de <b>${brl(d.valor)}</b> venceu em <b>${dataBR(d.vencimento)}</b>. Se já pagou, desconsidere.`,
      { label: "Regularizar", url: `${APP_URL}/faturas` }),
  }),
  correspondencia: (d) => ({
    assunto: `Você recebeu uma correspondência`,
    texto: `Olá ${d.cliente}, chegou uma correspondência (${d.remetente || "remetente"}) no seu endereço fiscal.`,
    html: layout("Chegou uma correspondência 📬", `Olá <b>${d.cliente}</b>,<br><br>Recebemos uma correspondência para você${d.remetente ? ` de <b>${d.remetente}</b>` : ""}${d.tipo ? ` (${d.tipo})` : ""}.<br>Você pode pedir a digitalização ou retirá-la na recepção.`,
      { label: "Ver na minha área", url: `${APP_URL}/documentos` }),
  }),
  cafe_pedido: (d) => ({
    assunto: `Pedido recebido · ${brl(d.total)}`,
    texto: `Olá ${d.cliente}, recebemos seu pedido (${brl(d.total)}). Já estamos preparando!`,
    html: layout("Pedido recebido ☕", `Olá <b>${d.cliente}</b>,<br><br>Recebemos seu pedido no valor de <b>${brl(d.total)}</b>. Já estamos preparando — avisamos quando estiver pronto!`),
  }),
  cafe_pronto: (d) => ({
    assunto: `Seu pedido está pronto ☕`,
    texto: `Olá ${d.cliente}, seu pedido está pronto para retirada.`,
    html: layout("Seu pedido está pronto", `Olá <b>${d.cliente}</b>,<br><br>Seu pedido está pronto para retirada na cafeteria. Bom apetite!`),
  }),
  reserva: (d) => ({
    assunto: `Reserva confirmada · ${d.sala || "sala"}`,
    texto: `Olá ${d.cliente}, sua reserva de ${d.sala} foi confirmada.`,
    html: layout("Reserva confirmada", `Olá <b>${d.cliente}</b>,<br><br>Sua reserva${d.sala ? ` da <b>${d.sala}</b>` : ""}${d.quando ? ` para <b>${d.quando}</b>` : ""} está confirmada.`,
      { label: "Ver reserva", url: `${APP_URL}/reservas` }),
  }),
};

export function renderTemplate(evento: Evento, dados: Record<string, unknown>): OutboundMessage & { texto: string } {
  const fn = TEMPLATES[evento];
  if (!fn) throw new Error(`Template desconhecido: ${evento}`);
  const r = fn(dados);
  return { para: String((dados as any).email || ""), nome: String((dados as any).cliente || ""), assunto: r.assunto, html: r.html, texto: r.texto };
}
