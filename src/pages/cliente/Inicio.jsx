// Início do cliente: plano (site ou legado), próxima fatura real, próximas
// reservas, correspondências novas, abertura da empresa esperando o cliente e o
// andamento do endereço fiscal. Cada cartão
// carrega sozinho; se um falhar, os outros continuam.
import { Briefcase, CalendarDays, Wallet, Mail, Building2, ArrowRight, CheckCircle2, AlertTriangle, ExternalLink, ScrollText } from "lucide-react";
import { aberturasApi } from "../../lib/aberturasApi.js";
import { Card, Badge, Btn, PageHead } from "../../components/ui.jsx";
import { C, serif, fmt } from "../../lib/theme.js";
import { clienteApi } from "../../lib/clienteApi.js";
import { STATUS_ASSINATURA } from "../../lib/assinaturasApi.js";
import { textoDesde } from "../../lib/unidadeNome.js";
import { Carregando, ErroCarga, Titulo, useDados, dataBR, dataHoraBR } from "./comum.jsx";

const ETAPA_FISCAL = {
  enviar_documentos: "Envie os documentos da empresa para liberarmos o endereço.",
  em_conferencia: "Estamos conferindo seus documentos (até 5 dias úteis).",
  reprovado: "Não foi possível aprovar os documentos. Veja os detalhes.",
  pagamento_pendente: "Há uma fatura em atraso. Os documentos do imóvel voltam após o pagamento.",
  preparando: "Documentos aprovados. Estamos preparando os documentos do imóvel.",
  liberado: "Os documentos do imóvel estão disponíveis.",
  legado: "Para receber os documentos do imóvel, fale com a recepção.",
};

function Atalho({ icon: Icon, titulo, sub, onClick }) {
  return (
    <button type="button" onClick={onClick} className="cw-lift cw-card cw-btn"
      style={{ textAlign: "left", background: C.white, border: `1px solid ${C.border2}`, borderRadius: 18, padding: 16, display: "block", width: "100%" }}>
      <Icon size={22} color={C.cafe} style={{ marginBottom: 10 }} aria-hidden="true" />
      <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{titulo}</div>
      {sub && <div style={{ fontSize: 13, color: C.text3, marginTop: 2 }}>{sub}</div>}
    </button>
  );
}

export default function Inicio({ go, nome }) {
  const plano = useDados((f) => clienteApi.minhaAssinatura(f));
  const faturas = useDados((f) => clienteApi.minhasFaturas(f));
  const agenda = useDados((f) => clienteApi.agendaReservas("", f));
  const corresp = useDados((f) => clienteApi.correspondencias(f));
  const kit = useDados((f) => clienteApi.kitEndereco(f));
  const abertura = useDados((f) => aberturasApi.minhas(f));

  const primeiroNome = String(plano.dados?.perfil?.nome || nome || "").trim().split(/\s+/)[0];
  const assinaturas = (plano.dados?.assinaturas || []).filter((a) => a.status !== "cancelada");
  const legados = plano.dados?.legados || [];
  const resumo = faturas.dados?.resumo;
  const proxima = resumo?.proxima;
  const agora = Date.now();
  const proximasReservas = (agenda.dados?.reservas || [])
    .filter((r) => ["confirmada", "solicitada", "checkin"].includes(r.status) && new Date(r.end_at).getTime() > agora)
    .slice(0, 3);
  const novas = (corresp.dados?.correspondencias || []).filter((c) => c.status === "notificado" || c.status === "digitalizada").length;
  const fiscal = kit.dados?.unidades?.[0];
  const aberturas = abertura.dados?.aberturas || [];
  const aberturaPendente = aberturas.find((a) => a.status === "pendente_cliente");
  const aberturaParaPreencher = aberturas.find((a) => a.status === "aguardando_cliente");

  return (
    <div>
      <PageHead title={primeiroNome ? `Olá, ${primeiroNome}` : "Início"} sub="Seu plano, faturas, reservas e correspondências em um só lugar." />
      <section className="cw-welcome" aria-label="Seu dia no CafeWorking">
        <div><span className="cw-welcome-eyebrow">SEU ESPAÇO, NO SEU TEMPO</span>
          <h2>Um bom dia começa com espaço para suas ideias.</h2>
          <p>Reserve sua próxima reunião ou conte com a nossa equipe para organizar sua visita.</p>
        </div>
        <div className="cw-welcome-actions">
          <Btn onClick={() => go("cli_reservar")}><CalendarDays size={18} aria-hidden="true" /> Reservar um espaço</Btn>
          <Btn variant="ghost" onClick={() => go("cli_contato")}>Falar com a recepção <ArrowRight size={16} aria-hidden="true" /></Btn>
        </div>
      </section>

      {novas > 0 && (
        <button type="button" onClick={() => go("cli_docs")} className="cw-btn"
          style={{ width: "100%", textAlign: "left", marginBottom: 16, background: C.amberPale, border: `1px solid ${C.amber}44`, borderRadius: 18, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
          <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 10, background: C.amber, display: "grid", placeItems: "center", flexShrink: 0 }}><Mail size={20} color="#fff" /></span>
          <span style={{ flex: 1 }}>
            <span style={{ display: "block", fontSize: 15, fontWeight: 600, color: C.text }}>Você tem {novas} correspondência{novas > 1 ? "s" : ""} nova{novas > 1 ? "s" : ""}</span>
            <span style={{ fontSize: 13, color: C.text3 }}>Ver correspondências</span>
          </span>
          <ArrowRight size={18} color={C.amber} aria-hidden="true" />
        </button>
      )}

      {(aberturaPendente || aberturaParaPreencher) && (
        <button type="button" onClick={() => go("cli_abertura")} className="cw-btn"
          style={{ width: "100%", textAlign: "left", marginBottom: 16, background: aberturaPendente ? C.redPale : C.tealPale, border: `1px solid ${aberturaPendente ? C.red : C.teal}44`, borderRadius: 18, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
          <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 10, background: aberturaPendente ? C.red : C.teal, display: "grid", placeItems: "center", flexShrink: 0 }}>
            {aberturaPendente ? <AlertTriangle size={20} color="#fff" /> : <Briefcase size={20} color="#fff" />}
          </span>
          <span style={{ flex: 1 }}>
            <span style={{ display: "block", fontSize: 15, fontWeight: 600, color: C.text }}>
              {aberturaPendente ? "A contabilidade pediu um ajuste na abertura da sua empresa" : "Preencha os dados para abrir sua empresa"}
            </span>
            <span style={{ fontSize: 13, color: C.text3 }}>
              {aberturaPendente ? "Veja o que corrigir e envie de novo" : "Dados da empresa, dos sócios e documentos. O rascunho fica salvo."}
            </span>
          </span>
          <ArrowRight size={18} color={aberturaPendente ? C.red : C.teal} aria-hidden="true" />
        </button>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }} className="cw-grid-stack">
        <Card>
          <Titulo>Meu plano</Titulo>
          {plano.carregando && !plano.dados && <Carregando />}
          {plano.erro && <ErroCarga mensagem={plano.erro} onTentar={plano.recarregar} />}
          {plano.dados && (
            <>
              {assinaturas.map((a) => {
                const st = STATUS_ASSINATURA[a.status] || { rotulo: a.status, cor: "text3" };
                return (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, background: C.cafePale, borderRadius: 14, marginBottom: 8 }}>
                    <Briefcase size={26} color={C.cafe} aria-hidden="true" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 600 }}>{a.plano_nome}</div>
                      <div style={{ fontSize: 13, color: C.text3 }}>{a.unidade ? `${a.unidade} · ` : ""}desde {dataBR(a.inicio)}</div>
                    </div>
                    <Badge color={C[st.cor]}>{st.rotulo}</Badge>
                  </div>
                );
              })}
              {legados.map((l) => (
                <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, background: C.cafePale, borderRadius: 14, marginBottom: 8 }}>
                  <Briefcase size={26} color={C.cafe} aria-hidden="true" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{l.plano}</div>
                    <div style={{ fontSize: 13, color: C.text3 }}>{l.unidade}{l.desde ? ` · cliente desde ${textoDesde(l.desde)}` : ""}</div>
                  </div>
                  <Badge color={l.situacao === "ativo" ? C.green : C.text3}>{l.situacao === "ativo" ? "Ativo" : "Inativo"}</Badge>
                </div>
              ))}
              {!assinaturas.length && !legados.length && (
                <p style={{ fontSize: 14, color: C.text3, margin: "4px 0 8px" }}>Não encontramos um plano ativo no seu cadastro. Se isso não estiver certo, fale com a recepção.</p>
              )}
              <Btn variant="ghost" onClick={() => go("cli_plano")} style={{ marginTop: 6 }}><ScrollText size={15} aria-hidden="true" /> Ver meu plano</Btn>
            </>
          )}
        </Card>

        <Card>
          <Titulo>Próxima fatura</Titulo>
          {faturas.carregando && !faturas.dados && <Carregando />}
          {faturas.erro && <ErroCarga mensagem={faturas.erro} onTentar={faturas.recarregar} />}
          {resumo && (proxima ? (
            <div style={{ textAlign: "center", padding: "6px 0" }}>
              {proxima.situacao === "vencida" && (
                <div role="alert" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.red, fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
                  <AlertTriangle size={16} aria-hidden="true" /> Fatura vencida
                </div>
              )}
              <div style={{ fontFamily: serif, fontSize: 32, color: proxima.situacao === "vencida" ? C.red : C.cafe }}>{fmt(proxima.valor)}</div>
              <div style={{ fontSize: 14, color: C.text3 }}>{proxima.descricao}{proxima.vencimento ? ` · vence em ${dataBR(proxima.vencimento)}` : ""}</div>
              {resumo.em_aberto > 1 && <div style={{ fontSize: 13, color: C.text3, marginTop: 4 }}>{resumo.em_aberto} faturas em aberto, total {fmt(resumo.valor_em_aberto)}</div>}
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 14, flexWrap: "wrap" }}>
                {proxima.pagar_url && (
                  <a href={proxima.pagar_url} target="_blank" rel="noreferrer" className="cw-btn"
                    style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 14, background: C.teal, color: "#fff", fontWeight: 600, fontSize: 14 }}>
                    <ExternalLink size={16} aria-hidden="true" /> Pagar
                  </a>
                )}
                <Btn variant="ghost" onClick={() => go("cli_faturas")}>Ver faturas</Btn>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "18px 0" }}>
              <CheckCircle2 size={32} color={C.green} aria-hidden="true" />
              <div style={{ fontSize: 15, fontWeight: 600, marginTop: 8 }}>Nenhuma fatura em aberto</div>
              <Btn variant="ghost" onClick={() => go("cli_faturas")} style={{ marginTop: 10 }}>Ver histórico</Btn>
            </div>
          ))}
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }} className="cw-grid-stack">
        <Card>
          <Titulo>Próximas reservas</Titulo>
          {agenda.carregando && !agenda.dados && <Carregando />}
          {agenda.erro && <ErroCarga mensagem={agenda.erro} onTentar={agenda.recarregar} />}
          {agenda.dados && (proximasReservas.length ? (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {proximasReservas.map((r) => (
                <li key={r.id} style={{ padding: "8px 0", borderTop: `1px solid ${C.border2}`, fontSize: 14 }}>
                  <b>{r.sala}</b>{r.base ? ` · base ${r.base}` : ""}
                  <div style={{ fontSize: 13, color: C.text3 }}>
                    {dataHoraBR(r.start_at, { weekday: "short", day: "2-digit", month: "2-digit" })}, {dataHoraBR(r.start_at, { hour: "2-digit", minute: "2-digit" })} às {dataHoraBR(r.end_at, { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ fontSize: 14, color: C.text3, margin: 0 }}>{agenda.dados.salas?.length ? "Nenhuma reserva marcada." : "Sua unidade ainda não tem salas para reservar pelo app."}</p>
          ))}
          {agenda.dados?.salas?.length > 0 && <Btn variant="ghost" onClick={() => go("cli_reservar")} style={{ marginTop: 12 }}><CalendarDays size={15} aria-hidden="true" /> Reservar sala</Btn>}
        </Card>

        {fiscal ? (
          <Card>
            <Titulo>Endereço fiscal</Titulo>
            <p style={{ fontSize: 14, color: C.text2, margin: "0 0 12px", lineHeight: 1.55 }}>{ETAPA_FISCAL[fiscal.etapa] || ""}</p>
            <Btn variant="ghost" onClick={() => go(fiscal.etapa === "enviar_documentos" ? "cli_plano" : fiscal.etapa === "pagamento_pendente" ? "cli_faturas" : "cli_fiscal")}>
              <Building2 size={15} aria-hidden="true" /> {fiscal.etapa === "enviar_documentos" ? "Enviar documentos" : fiscal.etapa === "pagamento_pendente" ? "Ver faturas" : "Ver endereço fiscal"}
            </Btn>
          </Card>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignContent: "start" }}>
            <Atalho icon={Wallet} titulo="Faturas" sub={resumo ? (resumo.em_aberto ? `${resumo.em_aberto} em aberto` : "Em dia") : ""} onClick={() => go("cli_faturas")} />
            <Atalho icon={Mail} titulo="Correspondências" sub={novas ? `${novas} nova${novas > 1 ? "s" : ""}` : ""} onClick={() => go("cli_docs")} />
          </div>
        )}
      </div>
    </div>
  );
}
