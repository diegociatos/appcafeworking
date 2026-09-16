// Reservar sala (cliente): escolhe a DATA (próximos 30 dias úteis), a sala, o
// horário livre e, em sala compartilhada, a base. Antes de confirmar mostra
// quantas horas o plano cobre e o valor do excedente. Confirmação na própria
// tela. "Minhas reservas" com status real e cancelamento até 24h antes.
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock, CheckCircle2, Users, XCircle } from "lucide-react";
import { Card, Badge, Btn, PageHead, Empty, ConfirmDialog } from "../../components/ui.jsx";
import { C, serif, fmt, inp } from "../../lib/theme.js";
import { clienteApi } from "../../lib/clienteApi.js";
import { emailDaSessao } from "../../lib/supabaseAuth.js";
import { mensagemDe } from "../../lib/erros.js";
import { Carregando, ErroCarga, Aviso, Titulo, CartaoRecepcao, dataHoraBR } from "./comum.jsx";

const STATUS_RESERVA = {
  confirmada: ["Confirmada", C.green],
  solicitada: ["Aguardando confirmação", C.amber],
  checkin: ["Em uso", C.teal],
  concluida: ["Concluída", C.text3],
  cancelada: ["Cancelada", C.text3],
};
const CREDITO_ROTULO = { sala_reuniao: "horas de sala de reunião", coworking: "horas de coworking" };
const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const iso = (data, hora) => new Date(`${data}T${String(hora).padStart(2, "0")}:00:00-03:00`).toISOString();
const horaDe = (hhmm) => Number(String(hhmm).split(":")[0]);

function rotuloData(d) {
  const [a, m, dia] = d.split("-").map(Number);
  const semana = DIAS_SEMANA[new Date(Date.UTC(a, m - 1, dia)).getUTCDay()];
  return { semana, dia: `${String(dia).padStart(2, "0")}/${String(m).padStart(2, "0")}` };
}

export default function Reservar({ nome }) {
  const [data, setData] = useState("");
  const [agenda, setAgenda] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [unidadeId, setUnidadeId] = useState("");
  const [salaId, setSalaId] = useState("");
  const [inicio, setInicio] = useState(null);
  const [duracaoEscolhida, setDuracao] = useState(1);
  const [baseEscolhida, setBase] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [erroReserva, setErroReserva] = useState("");
  const [confirmada, setConfirmada] = useState(null);
  const [cancelar, setCancelar] = useState(null);
  const [msgCancelamento, setMsgCancelamento] = useState("");

  const carregar = (d = data, forcar = false) => {
    setCarregando(true);
    setErro("");
    return clienteApi.agendaReservas(d, forcar)
      .then((r) => { setAgenda(r); if (!d) setData(r.data); return r; })
      .catch((e) => setErro(mensagemDe(e)))
      .finally(() => setCarregando(false));
  };
  useEffect(() => { carregar(""); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const trocarData = (d) => { setData(d); setInicio(null); setBase(null); setErroReserva(""); carregar(d); };

  const unidades = useMemo(() => agenda?.unidades || [], [agenda]);
  useEffect(() => { if (!unidadeId && unidades[0]) setUnidadeId(unidades[0].id); }, [unidades, unidadeId]);
  const salas = (agenda?.salas || []).filter((s) => !unidadeId || s.unidade_id === unidadeId);
  const sala = salas.find((s) => s.id === salaId) || null;
  const janela = agenda?.janela || { abre: "08:00", fecha: "18:00", antecedenciaMinMinutos: 30 };
  const abre = horaDe(janela.abre), fecha = horaDe(janela.fecha);

  // Intervalos ocupados da sala escolhida neste dia (ms), por base quando houver.
  const ocupados = useMemo(() => (agenda?.ocupados || [])
    .filter((o) => o.sala_id === salaId)
    .map((o) => ({ base: o.base, ini: new Date(o.start_at).getTime(), fim: new Date(o.end_at).getTime() })), [agenda, salaId]);

  const limiteAntecedencia = Date.now() + (janela.antecedenciaMinMinutos || 30) * 60_000;
  const bases = sala?.bases > 0 ? Array.from({ length: sala.bases }, (_, i) => i + 1) : [];
  const livre = (h, dur, b) => {
    const ini = new Date(iso(data, h)).getTime();
    const fim = ini + dur * 3600_000;
    if (ini < limiteAntecedencia || h + dur > fecha) return false;
    return !ocupados.some((o) => (bases.length ? o.base === b : true) && o.ini < fim && ini < o.fim);
  };
  const algumaBaseLivre = (h, dur) => (bases.length ? bases.some((b) => livre(h, dur, b)) : livre(h, dur, null));
  const horas = Array.from({ length: Math.max(0, fecha - abre) }, (_, i) => abre + i);
  const duracoesPossiveis = inicio == null ? [] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((d) => inicio + d <= fecha && algumaBaseLivre(inicio, d));

  // Duração e base valem só se ainda couberem no horário/agenda atuais.
  const duracao = duracoesPossiveis.includes(duracaoEscolhida) ? duracaoEscolhida : (duracoesPossiveis[0] || 1);
  const base = baseEscolhida && inicio != null && livre(inicio, duracao, baseEscolhida) ? baseEscolhida : null;

  const saldo = sala?.tipo_credito ? Math.max(0, Math.floor(agenda?.saldos?.[sala.unidade_id]?.[sala.tipo_credito] || 0)) : 0;
  const cobertas = Math.min(saldo, duracao);
  const excedente = duracao - cobertas;
  const valorExcedente = Math.round(excedente * (sala?.valor_hora || 0) * 100) / 100;
  const semCobertura = sala && sala.valor_hora <= 0 && excedente > 0;
  const podeConfirmar = sala && inicio != null && duracoesPossiveis.includes(duracao) && (!bases.length || (base && livre(inicio, duracao, base))) && !semCobertura && !enviando;

  const confirmar = async () => {
    if (!podeConfirmar) return;
    setEnviando(true);
    setErroReserva("");
    try {
      const r = await clienteApi.criarReserva({
        unidade_id: sala.unidade_id, sala_id: sala.id, cliente_nome: nome || emailDaSessao(), cliente_email: emailDaSessao(),
        start_at: iso(data, inicio), end_at: iso(data, inicio + duracao), base: bases.length ? base : null, origem: "app",
      });
      setConfirmada({ sala: sala.nome, base: bases.length ? base : null, start: iso(data, inicio), end: iso(data, inicio + duracao), credito: r.credito, valor: Number(r.reserva?.valor || 0) });
      setInicio(null); setBase(null);
      await carregar(data, true);
    } catch (e) {
      setErroReserva(mensagemDe(e, "Não foi possível reservar agora. Tente de novo."));
      carregar(data, true);
    } finally {
      setEnviando(false);
    }
  };

  const confirmarCancelamento = async () => {
    const r = cancelar;
    setCancelar(null);
    setMsgCancelamento("");
    try {
      const res = await clienteApi.cancelarReserva(r.id);
      setMsgCancelamento(`Reserva cancelada.${res.horas_devolvidas ? ` Devolvemos ${res.horas_devolvidas} hora${res.horas_devolvidas > 1 ? "s" : ""} ao seu plano.` : ""}`);
      carregar(data, true);
    } catch (e) {
      setMsgCancelamento(mensagemDe(e, "Não foi possível cancelar agora. Fale com a recepção."));
    }
  };

  const reservas = agenda?.reservas || [];
  const agora = Date.now();
  const futuras = reservas.filter((r) => new Date(r.end_at).getTime() > agora && r.status !== "cancelada");
  const passadas = reservas.filter((r) => !futuras.includes(r)).reverse().slice(0, 10);

  return (
    <div>
      <PageHead title="Reservar sala" sub="Escolha o dia, a sala e o horário livre. Reservas de segunda a sexta, das 8h às 18h." />
      {carregando && !agenda && <Card><Carregando /></Card>}
      {erro && <div style={{ marginBottom: 16 }}><ErroCarga mensagem={erro} onTentar={() => carregar(data, true)} /></div>}

      {confirmada && (
        <Card role="status" aria-live="polite" style={{ marginBottom: 16, borderLeft: `3px solid ${C.green}` }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <CheckCircle2 size={24} color={C.green} aria-hidden="true" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, fontSize: 14, color: C.text2, lineHeight: 1.6 }}>
              <div style={{ fontFamily: serif, fontSize: 19, color: C.text }}>Reserva confirmada</div>
              <b>{confirmada.sala}</b>{confirmada.base ? `, base ${confirmada.base}` : ""} · {dataHoraBR(confirmada.start, { weekday: "long", day: "2-digit", month: "2-digit" })}, das {dataHoraBR(confirmada.start, { hour: "2-digit", minute: "2-digit" })} às {dataHoraBR(confirmada.end, { hour: "2-digit", minute: "2-digit" })}.
              {confirmada.credito?.cobertas > 0 && <><br />Usamos {confirmada.credito.cobertas} h do seu plano.</>}
              {confirmada.valor > 0 && <><br />Excedente de {fmt(confirmada.valor)}, cobrado depois pela recepção.</>}
              <br />Enviamos a confirmação por e-mail.
            </div>
            <Btn variant="ghost" onClick={() => setConfirmada(null)} style={{ padding: "6px 12px", fontSize: 13 }}>Fechar</Btn>
          </div>
        </Card>
      )}

      {agenda && (
        <>
          {unidades.length === 0 || (agenda.salas || []).length === 0 ? (
            <div style={{ marginBottom: 16 }}>
              <CartaoRecepcao titulo="Reserve com a recepção" texto="Ainda não há salas disponíveis para reservar pelo app na sua unidade. A recepção faz a reserva para você." mensagemWhatsapp="Olá! Quero reservar uma sala no CafeWorking." />
            </div>
          ) : (
            <Card style={{ marginBottom: 16 }}>
              {unidades.length > 1 && (
                <div style={{ marginBottom: 14 }}>
                  <label htmlFor="res-unidade" style={{ fontSize: 13, fontWeight: 600, color: C.text3, display: "block", marginBottom: 6 }}>Unidade</label>
                  <select id="res-unidade" value={unidadeId} onChange={(e) => { setUnidadeId(e.target.value); setSalaId(""); setInicio(null); }} style={{ ...inp, maxWidth: 320 }}>
                    {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                  </select>
                </div>
              )}

              <Titulo id="res-dia">1. Dia</Titulo>
              <div role="group" aria-labelledby="res-dia" style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6, marginBottom: 16 }}>
                {(agenda.datas || []).map((d) => {
                  const r = rotuloData(d);
                  const sel = d === data;
                  return (
                    <button key={d} type="button" onClick={() => trocarData(d)} aria-pressed={sel} className="cw-btn"
                      style={{ minWidth: 64, padding: "8px 6px", borderRadius: 12, border: `1px solid ${sel ? C.cafe : C.border}`, background: sel ? C.cafe : C.white, color: sel ? "#fff" : C.text2, textAlign: "center", flexShrink: 0 }}>
                      <span style={{ display: "block", fontSize: 12, textTransform: "uppercase" }}>{d === agenda.hoje ? "hoje" : r.semana}</span>
                      <span style={{ display: "block", fontSize: 15, fontWeight: 600 }}>{r.dia}</span>
                    </button>
                  );
                })}
              </div>

              <Titulo id="res-sala">2. Sala</Titulo>
              <div role="group" aria-labelledby="res-sala" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: 12, marginBottom: 16 }}>
                {salas.map((s) => {
                  const sel = s.id === salaId;
                  const saldoSala = s.tipo_credito ? Math.floor(agenda.saldos?.[s.unidade_id]?.[s.tipo_credito] || 0) : 0;
                  return (
                    <button key={s.id} type="button" aria-pressed={sel} onClick={() => { setSalaId(s.id); setInicio(null); setBase(null); setErroReserva(""); }} className="cw-btn"
                      style={{ textAlign: "left", border: `2px solid ${sel ? C.cafe : C.border2}`, borderRadius: 14, overflow: "hidden", background: C.white, padding: 0 }}>
                      {s.foto
                        ? <img src={s.foto} alt="" style={{ width: "100%", height: 100, objectFit: "cover", display: "block", background: C.cream2 }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
                        : <span aria-hidden="true" style={{ height: 70, background: C.cream2, display: "grid", placeItems: "center" }}><CalendarDays size={24} color={C.gray} /></span>}
                      <span style={{ display: "block", padding: 12 }}>
                        <span style={{ display: "block", fontWeight: 600, fontSize: 15, color: C.text }}>{s.nome}</span>
                        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: C.text3 }}>
                          {s.tipo}{s.capacidade ? <> · <Users size={12} aria-hidden="true" /> {s.capacidade} lugares</> : null}{s.bases ? ` · ${s.bases} bases` : ""}
                        </span>
                        <span style={{ display: "block", fontSize: 13, color: C.cafe, fontWeight: 600, marginTop: 4 }}>
                          {s.valor_hora > 0 ? `${fmt(s.valor_hora)} por hora` : saldoSala > 0 ? "Usa as horas do plano" : "Disponível para quem tem plano com horas"}
                          {saldoSala > 0 ? ` · você tem ${saldoSala} h` : ""}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {sala && (
                <>
                  <Titulo id="res-hora">3. Horário</Titulo>
                  {carregando && <Carregando texto="Atualizando horários…" />}
                  <div role="group" aria-labelledby="res-hora" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(76px,1fr))", gap: 8, marginBottom: 12 }}>
                    {horas.map((h) => {
                      const ok = algumaBaseLivre(h, 1);
                      const sel = inicio === h;
                      return (
                        <button key={h} type="button" disabled={!ok} aria-pressed={sel} onClick={() => { setInicio(h); setErroReserva(""); }}
                          aria-label={`${String(h).padStart(2, "0")}:00${ok ? "" : ", indisponível"}`}
                          style={{ height: 44, borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: ok ? "pointer" : "not-allowed",
                            border: `1.5px solid ${sel ? C.cafe : ok ? C.border : "transparent"}`, background: sel ? C.cafe : ok ? C.white : C.cream2,
                            color: sel ? "#fff" : ok ? C.text2 : C.text4, textDecoration: ok ? "none" : "line-through" }}>
                          {String(h).padStart(2, "0")}:00
                        </button>
                      );
                    })}
                  </div>
                  {!horas.some((h) => algumaBaseLivre(h, 1)) && <Aviso cor={C.amber}>Não há horário livre nesta sala neste dia. Escolha outro dia ou outra sala.</Aviso>}

                  {inicio != null && (
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
                      <div>
                        <label htmlFor="res-duracao" style={{ fontSize: 13, fontWeight: 600, color: C.text3, display: "block", marginBottom: 6 }}>Duração</label>
                        <select id="res-duracao" value={duracao} onChange={(e) => setDuracao(Number(e.target.value))} style={{ ...inp, width: 200 }}>
                          {duracoesPossiveis.map((d) => <option key={d} value={d}>{d} hora{d > 1 ? "s" : ""} (até {String(inicio + d).padStart(2, "0")}:00)</option>)}
                        </select>
                      </div>
                    </div>
                  )}

                  {inicio != null && bases.length > 0 && (
                    <>
                      <div id="res-base" style={{ fontSize: 13, fontWeight: 600, color: C.text3, marginBottom: 6 }}>Base de trabalho</div>
                      <div role="group" aria-labelledby="res-base" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(48px,1fr))", gap: 8, marginBottom: 12 }}>
                        {bases.map((b) => {
                          const ok = livre(inicio, duracao, b);
                          const sel = base === b;
                          return (
                            <button key={b} type="button" disabled={!ok} aria-pressed={sel} onClick={() => setBase(b)} aria-label={`Base ${b}${ok ? " livre" : " ocupada"}`}
                              style={{ height: 44, borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: ok ? "pointer" : "not-allowed",
                                border: `1.5px solid ${sel ? C.cafe : ok ? C.border : "transparent"}`, background: sel ? C.cafe : ok ? C.white : C.redPale, color: sel ? "#fff" : ok ? C.text2 : C.red }}>
                              {b}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {inicio != null && (
                    <div style={{ background: C.cream, borderRadius: 12, padding: "12px 14px", fontSize: 14, color: C.text2, lineHeight: 1.6, marginBottom: 12 }}>
                      <b>{sala.nome}</b>{base ? `, base ${base}` : ""} · {rotuloData(data).dia}, das {String(inicio).padStart(2, "0")}:00 às {String(inicio + duracao).padStart(2, "0")}:00
                      {sala.tipo_credito && (
                        <div>Horas do plano: você tem {saldo} h de {CREDITO_ROTULO[sala.tipo_credito]}; esta reserva usa {cobertas} h.</div>
                      )}
                      {sala.valor_hora > 0 && (
                        <div>{excedente > 0 ? <>Excedente: {excedente} h × {fmt(sala.valor_hora)} = <b>{fmt(valorExcedente)}</b>, cobrado depois pela recepção.</> : "Sem valor a pagar."}</div>
                      )}
                      {semCobertura && <div role="alert" style={{ color: C.red }}>Seu plano não tem horas suficientes para esta sala. Diminua a duração ou fale com a recepção.</div>}
                    </div>
                  )}

                  {erroReserva && <div role="alert" style={{ fontSize: 14, color: C.red, background: C.redPale, borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>{erroReserva}</div>}
                  <Btn onClick={confirmar} disabled={!podeConfirmar} style={{ minWidth: 220 }}>
                    {enviando ? "Reservando…" : <><CheckCircle2 size={16} aria-hidden="true" /> Confirmar reserva</>}
                  </Btn>
                  {inicio != null && bases.length > 0 && !base && <div style={{ fontSize: 13, color: C.text3, marginTop: 6 }}>Escolha uma base livre para confirmar.</div>}
                </>
              )}
            </Card>
          )}

          <Card>
            <Titulo>Minhas reservas</Titulo>
            <div role="status" aria-live="polite">{msgCancelamento && <Aviso cor={/cancelada/.test(msgCancelamento) ? C.green : C.amber}>{msgCancelamento}</Aviso>}</div>
            {futuras.length === 0 && passadas.length === 0 ? (
              <Empty icon={Clock} title="Nenhuma reserva" sub="As reservas que você fizer aparecem aqui." />
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {[...futuras, ...passadas].map((r) => {
                  const [rot, cor] = STATUS_RESERVA[r.status] || [r.status, C.text3];
                  const futura = futuras.includes(r);
                  return (
                    <li key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: `1px solid ${C.border2}`, flexWrap: "wrap", opacity: futura ? 1 : 0.75 }}>
                      <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 10, background: C.cafePale, display: "grid", placeItems: "center" }}><CalendarDays size={18} color={C.cafe} /></span>
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>{r.sala}{r.base ? ` · base ${r.base}` : ""}</div>
                        <div style={{ fontSize: 13, color: C.text3 }}>
                          {dataHoraBR(r.start_at, { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })}, {dataHoraBR(r.start_at, { hour: "2-digit", minute: "2-digit" })} às {dataHoraBR(r.end_at, { hour: "2-digit", minute: "2-digit" })}
                          {r.unidade ? ` · ${r.unidade}` : ""}{r.valor > 0 ? ` · ${fmt(r.valor)}` : ""}
                        </div>
                        {futura && !r.pode_cancelar && ["confirmada", "solicitada"].includes(r.status) && (
                          <div style={{ fontSize: 12, color: C.text3 }}>Para cancelar com menos de {agenda.antecedencia_cancelamento_horas || 24} horas, fale com a recepção.</div>
                        )}
                      </div>
                      <Badge color={cor}>{rot}</Badge>
                      {futura && r.pode_cancelar && (
                        <Btn variant="ghost" onClick={() => setCancelar(r)} style={{ padding: "7px 12px", fontSize: 13, color: C.red }}>
                          <XCircle size={14} aria-hidden="true" /> Cancelar
                        </Btn>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      )}

      <ConfirmDialog
        aberto={!!cancelar}
        titulo="Cancelar esta reserva?"
        mensagem={cancelar ? `${cancelar.sala}, ${dataHoraBR(cancelar.start_at, { day: "2-digit", month: "2-digit" })} às ${dataHoraBR(cancelar.start_at, { hour: "2-digit", minute: "2-digit" })}. As horas do plano usadas voltam para o seu saldo.` : ""}
        textoConfirmar="Cancelar reserva"
        textoCancelar="Manter"
        onConfirmar={confirmarCancelamento}
        onCancelar={() => setCancelar(null)}
      />
    </div>
  );
}
