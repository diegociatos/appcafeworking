// ============================================================================
// Templates de e-mail (HTML com a marca CafeWorking).
// renderTemplate(evento, dados) → { assunto, html, texto }
// `dados` traz as variáveis (cliente, valor, vencimento, linhaDigitavel, etc.)
//
// Todo texto que vem de cadastro ou formulário passa por esc(): nome, remetente,
// descrição e plano não podem virar HTML. Links apontam para telas que existem
// no app (?p=faturas, ?p=reservas, ?p=correspondencias, ?p=notificacoes...).
// ============================================================================

import type { Evento, OutboundMessage } from "./types.ts";

const MARCA = "#6E4E3B";       // café
const CREME = "#F7F4EE";
const APP_URL = (Deno.env.get("APP_URL") ?? "https://app.cafeworking.com.br").replace(/\/+$/, "");

const brl = (n: number) =>
  "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
const dataBR = (iso: string) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");
/** Texto vindo de formulário público (nome, plano) não pode virar HTML. */
const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Link para uma tela da área do cliente (abre depois do login, se preciso). */
export const linkApp = (tela?: string) => (tela ? `${APP_URL}/?p=${encodeURIComponent(tela)}` : `${APP_URL}/`);

/** Layout base: cabeçalho com a marca + corpo + rodapé com as preferências de e-mail. */
function layout(titulo: string, corpo: string, cta?: { label: string; url: string }) {
  return `<!doctype html><html><body style="margin:0;background:${CREME};font-family:Georgia,'Times New Roman',serif;color:#1F1F1C">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREME};padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid rgba(0,0,0,.06)">
        <tr><td style="background:${MARCA};padding:18px 28px;color:#fff;font-size:18px;font-weight:bold">CafeWorking</td></tr>
        <tr><td style="padding:28px">
          <h1 style="font-size:20px;margin:0 0 12px">${titulo}</h1>
          <div style="font-size:15px;line-height:1.6;color:#3D3A35">${corpo}</div>
          ${cta ? `<div style="margin:22px 0 4px"><a href="${esc(cta.url)}" style="background:${MARCA};color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:15px;display:inline-block">${cta.label}</a></div>` : ""}
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid rgba(0,0,0,.06);font-size:12px;color:#7A726B">
          Você recebe este e-mail porque é cliente do CafeWorking.
          <a href="${esc(linkApp("notificacoes"))}" style="color:#7A726B">Escolher quais e-mails receber</a>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

type Render = { assunto: string; html: string; texto: string };

// deno-lint-ignore no-explicit-any
const TEMPLATES: Record<Evento, (d: any) => Render> = {
  boleto_nova: (d) => ({
    assunto: `Nova cobrança · ${brl(d.valor)} vence ${dataBR(d.vencimento)}`,
    texto: `Olá ${d.cliente}, sua cobrança de ${brl(d.valor)} vence em ${dataBR(d.vencimento)}.${d.linhaDigitavel ? ` Linha digitável: ${d.linhaDigitavel}.` : ""} Veja em ${linkApp("faturas")}`,
    html: layout(
      "Sua cobrança está disponível",
      `Olá <b>${esc(d.cliente)}</b>,<br><br>Geramos sua cobrança no valor de <b>${brl(d.valor)}</b>, com vencimento em <b>${dataBR(d.vencimento)}</b>.
       ${d.linhaDigitavel ? `<br><br><b>Linha digitável:</b><br><span style="font-family:monospace;font-size:13px">${esc(d.linhaDigitavel)}</span>` : ""}
       ${d.pixCopiaCola ? `<br><br><b>PIX copia e cola:</b><br><span style="font-family:monospace;font-size:12px;word-break:break-all">${esc(d.pixCopiaCola)}</span>` : ""}`,
      d.pdfUrl ? { label: "Ver boleto (PDF)", url: d.pdfUrl } : { label: "Ver minhas faturas", url: linkApp("faturas") },
    ),
  }),
  boleto_lembrete: (d) => ({
    assunto: `Lembrete: sua cobrança vence ${dataBR(d.vencimento)}`,
    texto: `Olá ${d.cliente}, sua cobrança de ${brl(d.valor)} vence em ${dataBR(d.vencimento)}. Veja em ${linkApp("faturas")}`,
    html: layout("Lembrete de vencimento", `Olá <b>${esc(d.cliente)}</b>,<br><br>Passando para lembrar que sua cobrança de <b>${brl(d.valor)}</b> vence em <b>${dataBR(d.vencimento)}</b>.`,
      { label: "Ver minhas faturas", url: linkApp("faturas") }),
  }),
  boleto_pago: (d) => ({
    assunto: `Pagamento confirmado · ${brl(d.valor)}`,
    texto: `Recebemos seu pagamento de ${brl(d.valor)}. Obrigado, ${d.cliente}!`,
    html: layout("Pagamento confirmado", `Olá <b>${esc(d.cliente)}</b>,<br><br>Confirmamos o recebimento de <b>${brl(d.valor)}</b>. Obrigado!<br>Este e-mail serve como recibo.`,
      { label: "Ver minhas faturas", url: linkApp("faturas") }),
  }),
  boleto_vencido: (d) => ({
    assunto: `Cobrança em atraso · ${brl(d.valor)}`,
    texto: `Olá ${d.cliente}, a cobrança de ${brl(d.valor)} venceu em ${dataBR(d.vencimento)}. Veja em ${linkApp("faturas")}`,
    html: layout("Cobrança em atraso", `Olá <b>${esc(d.cliente)}</b>,<br><br>A cobrança de <b>${brl(d.valor)}</b> venceu em <b>${dataBR(d.vencimento)}</b>. Se já pagou, desconsidere.`,
      { label: "Ver minhas faturas", url: linkApp("faturas") }),
  }),
  cobranca_nova: (d) => ({
    assunto: `Sua cobrança · ${brl(d.valor)}${d.vencimento ? ` vence ${dataBR(d.vencimento)}` : ""}`,
    texto: `Olá ${d.cliente}, sua cobrança de ${brl(d.valor)} está disponível. Pague por cartão, PIX ou boleto: ${d.invoiceUrl || d.pdfUrl || linkApp("faturas")}`,
    html: layout(
      "Sua cobrança está disponível",
      `Olá <b>${esc(d.cliente)}</b>,<br><br>${d.descricao ? `${esc(d.descricao)}<br><br>` : ""}Valor: <b>${brl(d.valor)}</b>${d.vencimento ? ` · vence em <b>${dataBR(d.vencimento)}</b>` : ""}.<br><br>
       Você pode pagar por <b>cartão de crédito, PIX ou boleto</b> no botão abaixo.
       ${d.pixCopiaCola ? `<br><br><b>PIX copia e cola:</b><br><span style="font-family:monospace;font-size:12px;word-break:break-all">${esc(d.pixCopiaCola)}</span>` : ""}`,
      d.invoiceUrl ? { label: "Pagar agora", url: d.invoiceUrl }
        : d.pdfUrl ? { label: "Ver boleto (PDF)", url: d.pdfUrl }
        : { label: "Ver minhas faturas", url: linkApp("faturas") },
    ),
  }),
  nfse_emitida: (d) => ({
    assunto: `Sua nota fiscal${d.numero ? ` nº ${d.numero}` : ""} · ${brl(d.valor)}`,
    texto: `Olá ${d.cliente}, sua NFS-e${d.numero ? ` nº ${d.numero}` : ""} de ${brl(d.valor)} foi emitida.${d.pdfUrl ? ` PDF: ${d.pdfUrl}` : ""}`,
    html: layout(
      "Sua nota fiscal foi emitida",
      `Olá <b>${esc(d.cliente)}</b>,<br><br>Emitimos a sua <b>NFS-e${d.numero ? ` nº ${esc(d.numero)}` : ""}</b> no valor de <b>${brl(d.valor)}</b>${d.descricao ? ` referente a ${esc(d.descricao)}` : ""}.`,
      d.pdfUrl ? { label: "Baixar nota (PDF)", url: d.pdfUrl } : { label: "Ver minhas faturas", url: linkApp("faturas") },
    ),
  }),
  correspondencia: (d) => ({
    assunto: "Você recebeu uma correspondência",
    texto: `Olá ${d.cliente}, chegou uma correspondência${d.remetente ? ` de ${d.remetente}` : ""} para você no CafeWorking. Veja em ${linkApp("correspondencias")}`,
    html: layout(
      "Chegou uma correspondência",
      `Olá <b>${esc(d.cliente)}</b>,<br><br>Recebemos uma correspondência para você${d.remetente ? ` de <b>${esc(d.remetente)}</b>` : ""}${d.tipo ? ` (${esc(d.tipo)})` : ""}.<br><br>Veja os detalhes na área do cliente. Para retirar o original, procure a recepção.`,
      { label: "Ver correspondências", url: linkApp("correspondencias") },
    ),
  }),
  cafe_pedido: (d) => ({
    assunto: `Pedido recebido · ${brl(d.total)}`,
    texto: `Olá ${d.cliente}, recebemos seu pedido (${brl(d.total)}). Já estamos preparando.`,
    html: layout("Pedido recebido", `Olá <b>${esc(d.cliente)}</b>,<br><br>Recebemos seu pedido no valor de <b>${brl(d.total)}</b>. Já estamos preparando e avisamos quando estiver pronto.`),
  }),
  cafe_pronto: (d) => ({
    assunto: "Seu pedido está pronto",
    texto: `Olá ${d.cliente}, seu pedido está pronto para retirada.`,
    html: layout("Seu pedido está pronto", `Olá <b>${esc(d.cliente)}</b>,<br><br>Seu pedido está pronto para retirada na cafeteria. Bom apetite!`),
  }),
  reserva: (d) => ({
    assunto: `Reserva confirmada · ${d.sala || "sala"}`,
    texto: `Olá ${d.cliente}, sua reserva${d.sala ? ` da ${d.sala}` : ""}${d.quando ? ` para ${d.quando}` : ""} está confirmada. Veja em ${linkApp("reservas")}`,
    html: layout(
      "Reserva confirmada",
      `Olá <b>${esc(d.cliente)}</b>,<br><br>Sua reserva${d.sala ? ` da <b>${esc(d.sala)}</b>` : ""}${d.quando ? ` para <b>${esc(d.quando)}</b>` : ""} está confirmada.<br><br>Chegue alguns minutos antes e procure a recepção. Você pode cancelar pela área do cliente até 24 horas antes do início; depois disso, fale com a recepção.`,
      { label: "Ver minhas reservas", url: linkApp("reservas") },
    ),
  }),
  assinatura_ativa: (d) => ({
    assunto: `${d.plano} ativo no CafeWorking`,
    texto: `Olá ${d.cliente}, seu plano ${d.plano}${d.unidade ? ` na unidade ${d.unidade}` : ""} está ativo. ${d.linkSenha ? `Crie sua senha: ${d.linkSenha}` : `Entre em ${linkApp("plano")}`}`,
    html: layout(
      `Seu plano ${esc(d.plano)} está ativo`,
      `Olá <b>${esc(d.cliente)}</b>,<br><br>Pagamento confirmado. O plano <b>${esc(d.plano)}</b>${d.unidade ? ` na unidade <b>${esc(d.unidade)}</b>` : ""} já está ativo.<br><br>
       ${d.linkSenha ? "O próximo passo é criar sua senha para entrar na área do cliente. O link vale por tempo limitado." : "Entre na área do cliente com seu e-mail e senha."}
       ${d.abertura ? "<br><br><b>Abertura da empresa:</b> depois de entrar, preencha em <b>Abertura da empresa</b> os dados dos sócios e das atividades e anexe os documentos. A Ciatos Contabilidade confere e acompanha o registro. As taxas dos órgãos oficiais (Junta Comercial, prefeitura) são pagas à parte." : ""}
       ${d.certificado ? "<br><br><b>Certificado digital:</b> o e-CNPJ A1 é emitido assim que o CNPJ estiver ativo. Vamos agendar a validação com você." : ""}
       ${d.categoria === "endereco_fiscal" ? (d.abertura
         ? "<br><br>Se a empresa já existe, envie na área do cliente o cartão CNPJ e o documento dos sócios. Se ainda vamos abri-la, envie o documento com foto e o comprovante de endereço dos futuros sócios."
         : "<br><br>Na área do cliente, envie o cartão CNPJ e o documento dos sócios. Assim que conferirmos, liberamos na mesma área os documentos do imóvel para registrar o endereço.") : ""}`,
      d.linkSenha ? { label: "Criar minha senha", url: d.linkSenha } : { label: "Entrar na área do cliente", url: linkApp("plano") },
    ),
  }),
  renovacao_anual: (d) => ({
    assunto: `Seu plano ${d.plano} renova em ${dataBR(d.data)}`,
    texto: `Olá ${d.cliente}, seu plano anual ${d.plano} renova em ${dataBR(d.data)}, com cobrança de ${brl(d.valor)}. Para não renovar, cancele antes dessa data em ${linkApp("plano")}.`,
    html: layout(
      "Seu plano anual vai renovar",
      `Olá <b>${esc(d.cliente)}</b>,<br><br>O plano anual <b>${esc(d.plano)}</b>${d.unidade ? ` na unidade <b>${esc(d.unidade)}</b>` : ""} renova em <b>${dataBR(d.data)}</b>, com a cobrança de <b>${brl(d.valor)}</b> por mais 12 meses.<br><br>
       Não precisa fazer nada para continuar. Se não quiser renovar, cancele a renovação na área do cliente até essa data, sem nenhum custo.`,
      { label: "Gerenciar meu plano", url: linkApp("plano") },
    ),
  }),
  cancelamento_confirmado: (d) => {
    const imediato = d.tipo !== "aviso_previo";
    const fiscal = d.categoria === "endereco_fiscal";
    const reembolso = d.reembolso === "automatico"
      ? "A devolução integral já foi solicitada à operadora de pagamento e aparece em até 10 dias úteis (no cartão, pode sair na próxima fatura)."
      : d.reembolso === "manual"
      ? "A devolução integral será feita pela nossa equipe em até 10 dias úteis. Vamos entrar em contato para combinar a conta de destino."
      : "";
    return {
      assunto: imediato ? `Cancelamento do plano ${d.plano} confirmado` : `Cancelamento do plano ${d.plano} agendado para ${dataBR(d.cancelaEm)}`,
      texto: `Olá ${d.cliente}, ${imediato ? `o plano ${d.plano} foi cancelado.` : `o plano ${d.plano} será encerrado em ${dataBR(d.cancelaEm)}.`}`,
      html: layout(
        imediato ? "Plano cancelado" : "Cancelamento agendado",
        `Olá <b>${esc(d.cliente)}</b>,<br><br>
         ${imediato
           ? `O plano <b>${esc(d.plano)}</b> foi cancelado${d.tipo === "arrependimento" ? " dentro do prazo de arrependimento de 7 dias" : ""}.`
           : `Recebemos o pedido de cancelamento do plano <b>${esc(d.plano)}</b>. Pelo aviso prévio de 30 dias, o plano segue ativo até <b>${dataBR(d.cancelaEm)}</b> e é encerrado nessa data.`}
         ${reembolso ? `<br><br>${reembolso}` : ""}
         ${d.requerAcerto ? "<br><br>Seu plano tem valores a acertar no cancelamento (fidelidade ou plano anual), como previsto no contrato. Nossa equipe vai enviar o cálculo do acerto antes do encerramento." : ""}
         ${fiscal ? "<br><br><b>Importante:</b> em até 30 dias do encerramento, altere o endereço da sua empresa na Receita Federal, na Junta Comercial e na Prefeitura, e envie o comprovante para nós." : ""}`,
        { label: "Ver na área do cliente", url: linkApp("plano") },
      ),
    };
  },
  documentos_aprovados: (d) => ({
    assunto: `Documentos aprovados · ${d.plano}`,
    texto: `Olá ${d.cliente}, conferimos seus documentos. Os documentos do imóvel para registrar o endereço ficam na área do cliente, em Endereço fiscal: ${linkApp("fiscal")}`,
    html: layout(
      "Documentos aprovados",
      `Olá <b>${esc(d.cliente)}</b>,<br><br>Conferimos seus documentos do plano <b>${esc(d.plano)}</b>. Está tudo certo.<br><br>
       Os documentos do imóvel para registrar o endereço (como IPTU e declaração de anuência) ficam na área do cliente, em <b>Endereço fiscal</b>. Se algum ainda não aparecer lá, nossa equipe está preparando e avisa você.<br><br>
       Depois do registro nos órgãos, envie o comprovante para concluirmos o seu cadastro.`,
      { label: "Ver documentos do imóvel", url: linkApp("fiscal") },
    ),
  }),
  documentos_reprovados: (d) => ({
    assunto: `Não foi possível aprovar o endereço fiscal · ${d.plano}`,
    texto: `Olá ${d.cliente}, não foi possível aprovar seus documentos. O plano foi cancelado e o valor pago será devolvido.`,
    html: layout(
      "Não foi possível aprovar",
      `Olá <b>${esc(d.cliente)}</b>,<br><br>Conferimos os documentos do plano <b>${esc(d.plano)}</b> e não foi possível aprovar a contratação.
       ${d.parecer ? `<br><br><b>Motivo:</b> ${esc(d.parecer)}` : ""}
       <br><br>Como previsto no contrato, o plano foi cancelado e o valor pago será devolvido integralmente em até 10 dias úteis${d.reembolso === "manual" ? ". Nossa equipe vai entrar em contato para combinar a devolução" : ", pela mesma forma de pagamento"}.
       <br><br>Se quiser conversar sobre outra solução, responda este e-mail.`,
    ),
  }),
  abertura_preencher: (d) => ({
    assunto: "Preencha os dados para abrir sua empresa",
    texto: `Olá ${d.cliente}, para começarmos a abertura da sua empresa, preencha os dados e anexe os documentos na área do cliente: ${linkApp("abertura")}`,
    html: layout(
      "Vamos abrir a sua empresa",
      `Olá <b>${esc(d.cliente)}</b>,<br><br>Para começarmos a abertura da sua empresa${d.plano ? ` (plano <b>${esc(d.plano)}</b>)` : ""}, preencha na área do cliente:
       <ul style="margin:10px 0;padding-left:20px">
         <li>tipo de empresa, opções de nome e atividades;</li>
         <li>dados e documentos de cada sócio (RG ou CNH e comprovante de residência);</li>
         ${d.usaEnderecoUnidade
           ? `<li>nada sobre o endereço: a empresa vai usar o endereço fiscal do CafeWorking${d.unidade ? ` ${esc(d.unidade)}` : ""}, e nós já enviamos o IPTU;</li>`
           : "<li>endereço da empresa, com o IPTU do imóvel;</li>"}
         <li>o nível da conta gov.br de cada sócio (prata ou ouro para assinar).</li>
       </ul>
       O que você preencher fica salvo; dá para continuar depois. Quando enviar, a Ciatos Contabilidade confere e acompanha o registro. As taxas dos órgãos oficiais são pagas à parte.`,
      { label: "Preencher os dados", url: linkApp("abertura") },
    ),
  }),
  abertura_pendencia: (d) => ({
    assunto: "Abertura da empresa: precisamos de um ajuste",
    texto: `Olá ${d.cliente}, a contabilidade pediu um ajuste nos dados da abertura da sua empresa: ${d.pendencia}. Corrija e reenvie em ${linkApp("abertura")}`,
    html: layout(
      "Precisamos de um ajuste",
      `Olá <b>${esc(d.cliente)}</b>,<br><br>A contabilidade conferiu os dados da abertura da sua empresa e pediu um ajuste:
       <div style="margin:12px 0;padding:12px 14px;background:${CREME};border-left:3px solid ${MARCA};border-radius:8px;white-space:pre-wrap">${esc(d.pendencia)}</div>
       Corrija na área do cliente e clique em <b>Enviar para a contabilidade</b> de novo. O processo continua assim que recebermos.`,
      { label: "Corrigir e reenviar", url: linkApp("abertura") },
    ),
  }),
  abertura_concluida: (d) => ({
    assunto: `Sua empresa está aberta${d.razaoSocial ? ` · ${d.razaoSocial}` : ""}`,
    texto: `Olá ${d.cliente}, a abertura foi concluída: ${d.razaoSocial || "sua empresa"}${d.cnpj ? `, CNPJ ${d.cnpj}` : ""}. Os documentos estão na área do cliente: ${linkApp("abertura")}`,
    html: layout(
      "Sua empresa está aberta",
      `Olá <b>${esc(d.cliente)}</b>,<br><br>A abertura foi concluída.
       ${d.razaoSocial ? `<br><br><b>${esc(d.razaoSocial)}</b>` : ""}${d.cnpj ? `<br>CNPJ ${esc(d.cnpj)}` : ""}
       <br><br>Na área do cliente estão os dados da empresa e os documentos para baixar (contrato social e cartão CNPJ, entre outros).`,
      { label: "Ver minha empresa", url: linkApp("abertura") },
    ),
  }),
  // Cliente cadastrado pela equipe (sem compra pelo site) ganha acesso ao app.
  convite_acesso: (d) => ({
    assunto: "Seu acesso ao app do CafeWorking",
    texto: `Olá ${d.cliente}, agora você acompanha o CafeWorking${d.unidade ? ` ${d.unidade}` : ""} pelo app: plano, faturas, reservas de sala e correspondências. ${d.linkSenha ? `Crie sua senha: ${d.linkSenha}` : `Entre em ${linkApp()}`} (o login é o e-mail ${d.email}).`,
    html: layout(
      "Seu acesso ao app está pronto",
      `Olá <b>${esc(d.cliente)}</b>,<br><br>Você já é cliente do CafeWorking${d.unidade ? ` <b>${esc(d.unidade)}</b>` : ""}, e agora pode acompanhar tudo pelo app, do celular ou do computador, quando quiser:
       <ul style="margin:10px 0;padding-left:20px">
         <li><b>Seu plano</b>: o que está contratado e o que ele inclui;</li>
         <li><b>Faturas</b>: cobranças, pagamentos e notas fiscais;</li>
         <li><b>Reservas</b>: agende a sala de reunião e veja as horas do seu plano;</li>
         <li><b>Correspondências</b>: o que chegou para você, com aviso por e-mail e o arquivo digitalizado quando houver.</li>
       </ul>
       ${d.linkSenha ? "Para entrar, crie sua senha no botão abaixo. Por segurança, o link vale por tempo limitado." : "Entre com seu e-mail e senha."}
       O seu login é o e-mail <b>${esc(d.email)}</b>. Se o link vencer, é só clicar em <b>Esqueci minha senha</b> na tela de entrada.<br><br>
       Qualquer dúvida, a recepção continua à disposição.`,
      d.linkSenha ? { label: "Criar minha senha", url: d.linkSenha } : { label: "Entrar no app", url: linkApp() },
    ),
  }),
  aviso_equipe: (d) => ({
    assunto: `[CafeWorking] ${d.assunto}`,
    texto: [d.assunto, ...((d.linhas as string[]) || [])].join("\n"),
    html: layout(
      esc(d.assunto),
      ((d.linhas as string[]) || []).map((l) => esc(l)).join("<br>"),
      d.link ? { label: "Abrir no app", url: d.link } : undefined,
    ),
  }),
};

export function renderTemplate(evento: Evento, dados: Record<string, unknown>): OutboundMessage & { texto: string } {
  const fn = TEMPLATES[evento];
  if (!fn) throw new Error(`Template desconhecido: ${evento}`);
  const r = fn(dados);
  // deno-lint-ignore no-explicit-any
  return { para: String((dados as any).email || ""), nome: String((dados as any).cliente || ""), assunto: r.assunto, html: r.html, texto: r.texto };
}
