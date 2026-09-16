import { useState, useEffect } from "react";
import { Plus, CheckCircle2, CalendarOff, AlertCircle, Trash2, Smartphone, DollarSign, Percent, CalendarClock, TrendingUp, LayoutGrid, ChevronLeft, ChevronRight, Link2, Copy, MessageCircle } from "lucide-react";
import { Card, Badge, Btn, PageHead, Modal, Field, Empty } from "../components/ui.jsx";
import { C, serif, sans, fmt, inp } from "../lib/theme.js";
import { HORARIOS, DIAS } from "../lib/data.js";
import { getReservaStart, getReservaEnd } from "../lib/reservas.js";

const pad2 = (n) => String(n).padStart(2, "0");
const MESES_NOME = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const ATIVOS_RESERVA = new Set(["solicitada", "confirmada", "checkin"]);
const reservaAtivaLocal = (r) => !r.status || ATIVOS_RESERVA.has(r.status);
// Date do início de um bloco a partir de (segunda da semana, dia 0..6, índice de horário).
const dataDoSlot = (monday, diaIdx, horaIdx) => {
  const d = new Date(monday);
  d.setDate(monday.getDate() + diaIdx);
  const [h, m] = (HORARIOS[horaIdx] || "07:00").split(":").map(Number);
  d.setHours(h, m || 0, 0, 0);
  return d;
};
const mesmaDataDia = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// Fim de um bloco: próximo horário, ou +1h após o último (ex.: 22:00 → 23:00).
const horaFim = (inicio, dur) => {
  const h = HORARIOS[inicio + dur];
  if (h) return h;
  const ult = parseInt(HORARIOS[HORARIOS.length - 1], 10) + 1;
  return `${String(ult).padStart(2, "0")}:00`;
};
import { useStore } from "../lib/store.jsx";


export default function Reservas() {
  const { activeUnit, unidadeAtiva, salasDe, clientesDe, reservas, criarReserva, removeReserva, marcarReservasVistas, addLancamento } = useStore();
  const [diaSel, setDiaSel] = useState(0);
  const [modal, setModal] = useState(null);
  const [linkModal, setLinkModal] = useState(null); // {} = aberto
  const [detalhe, setDetalhe] = useState(null);
  const [semanaRef, setSemanaRef] = useState(() => new Date()); // data âncora (semana/mês/ano exibido)
  const [visao, setVisao] = useState("semana"); // semana | mes | ano
  const dias = DIAS;

  // Datas reais da semana EXIBIDA (segunda a domingo) para rotular cada dia e
  // filtrar as reservas pela DATA (não só pelo dia da semana).
  const p2 = (n) => String(n).padStart(2, "0");
  const hoje = new Date();
  const segIdx = (semanaRef.getDay() + 6) % 7; // 0=Seg … 6=Dom
  const inicioSemana = new Date(semanaRef); inicioSemana.setDate(semanaRef.getDate() - segIdx); inicioSemana.setHours(0, 0, 0, 0);
  const datasSemana = dias.map((_, i) => { const d = new Date(inicioSemana); d.setDate(inicioSemana.getDate() + i); return d; });
  const ehHoje = (d) => mesmaDataDia(d, hoje);
  const semanaLabel = `${p2(datasSemana[0].getDate())}/${p2(datasSemana[0].getMonth() + 1)} a ${p2(datasSemana[6].getDate())}/${p2(datasSemana[6].getMonth() + 1)}/${datasSemana[6].getFullYear()}`;
  const navegar = (delta) => setSemanaRef((s) => {
    const d = new Date(s);
    if (visao === "mes") d.setMonth(d.getMonth() + delta);
    else if (visao === "ano") d.setFullYear(d.getFullYear() + delta);
    else d.setDate(d.getDate() + delta * 7);
    return d;
  });
  const navLabel = visao === "mes" ? `${MESES_NOME[semanaRef.getMonth()]} de ${semanaRef.getFullYear()}`
    : visao === "ano" ? `${semanaRef.getFullYear()}`
    : semanaLabel;
  const dataSel = datasSemana[diaSel];

  // Ao abrir a agenda, marca as reservas novas (feitas pelo cliente) como vistas
  useEffect(() => { marcarReservasVistas(activeUnit); }, [activeUnit]); // eslint-disable-line

  const salasUnidade = salasDe(activeUnit);
  const salasReservaveis = salasUnidade.filter((s) => !s.contratada);
  const salaIds = new Set(salasUnidade.map((s) => s.id));
  // Reserva pertence a uma data da semana exibida? (usa a data real da reserva)
  const reservaNaData = (r, d) => mesmaDataDia(getReservaStart(r), d);
  const reservasDoDia = reservas.filter((r) => salaIds.has(r.sala) && reservaNaData(r, dataSel));

  // KPIs premium do dia selecionado -----------------------------------------
  const contagemDia = (i) => reservas.filter((r) => salaIds.has(r.sala) && reservaNaData(r, datasSemana[i])).length;
  // Contagens por data e por mês (para as visões Mês e Ano).
  const contagemNaData = (d) => reservas.filter((r) => salaIds.has(r.sala) && reservaNaData(r, d)).length;
  const contagemNoMes = (ano, mes) => reservas.filter((r) => salaIds.has(r.sala) && (() => { const s = getReservaStart(r); return s.getFullYear() === ano && s.getMonth() === mes; })()).length;
  // Ir para uma data específica e cair na visão semana daquele dia.
  const irParaData = (d) => { setSemanaRef(new Date(d)); setDiaSel((d.getDay() + 6) % 7); setVisao("semana"); };
  const slotsTotais = Math.max(1, salasReservaveis.length * HORARIOS.length);
  const horasOcupadas = reservasDoDia.reduce((s, r) => s + (r.dur || 1), 0);
  const ocupacaoDia = Math.round((horasOcupadas / slotsTotais) * 100);
  // Carga por horário (quantas salas ocupadas em cada faixa) → horário de pico.
  const cargaHora = HORARIOS.map((_, hi) => reservasDoDia.filter((r) => r.inicio <= hi && hi < r.inicio + r.dur).length);
  const cargaMax = Math.max(0, ...cargaHora);
  const pico = cargaMax > 0 ? HORARIOS[cargaHora.indexOf(cargaMax)] : "—";
  // Clique numa célula vazia → abre o modal já com sala + horário preenchidos.
  const abrirNovaEm = (salaId, inicio) => setModal({ sala: salaId, inicio, dia: diaSel });

  return (
    <div>
      <style>{`.cw-slot:hover{background:${C.tealPale};box-shadow:inset 0 0 0 1px ${C.tealLine};}`}</style>
      <PageHead
        title="Agenda de Salas"
        sub={`Agenda da unidade ${unidadeAtiva?.nome || ""} · disponibilidade por sala e horário.`}
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn variant="teal" onClick={() => setLinkModal({})}>
              <Link2 size={16} /> Link para o cliente reservar
            </Btn>
            <Btn variant="ghost" onClick={() => setModal({})}>
              <Plus size={16} /> Nova reserva
            </Btn>
          </div>
        }
      />
      {visao === "semana" && salasReservaveis.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 14, marginBottom: 16 }}>
          <MiniKpi label={`Ocupação · ${dias[diaSel]}`} valor={`${ocupacaoDia}%`} icon={Percent} cor={C.teal} />
          <MiniKpi label="Reservas no dia" valor={reservasDoDia.length} icon={LayoutGrid} cor={C.cafe} />
          <MiniKpi label="Horário de pico" valor={pico} sub={cargaMax > 0 ? `${cargaMax} sala${cargaMax > 1 ? "s" : ""} ocupada${cargaMax > 1 ? "s" : ""}` : "sem reservas"} icon={TrendingUp} cor={C.amber} />
          <MiniKpi label="Salas reserváveis" valor={salasReservaveis.length} icon={CalendarClock} cor={C.blue} />
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", background: C.cream, borderRadius: 10, padding: 3, gap: 2, marginRight: 2 }}>
          {[["semana", "Semana"], ["mes", "Mês"], ["ano", "Ano"]].map(([v, lb]) => (
            <button key={v} onClick={() => setVisao(v)} className="cw-btn"
              style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, border: "none", background: visao === v ? C.white : "transparent", color: visao === v ? C.teal : C.text3, boxShadow: visao === v ? "0 1px 3px rgba(0,0,0,.08)" : "none" }}>{lb}</button>
          ))}
        </div>
        <button onClick={() => navegar(-1)} className="cw-btn" title="Anterior" aria-label="Anterior"
          style={{ width: 30, height: 30, borderRadius: 9, border: `1px solid ${C.border}`, background: C.white, color: C.text2, display: "grid", placeItems: "center" }}><ChevronLeft size={16} /></button>
        <button onClick={() => navegar(1)} className="cw-btn" title="Próximo" aria-label="Próximo"
          style={{ width: 30, height: 30, borderRadius: 9, border: `1px solid ${C.border}`, background: C.white, color: C.text2, display: "grid", placeItems: "center" }}><ChevronRight size={16} /></button>
        <span style={{ fontSize: 12.5, color: C.text3, display: "flex", alignItems: "center", gap: 6 }}>
          <CalendarClock size={14} color={C.text4} /> {visao === "semana" ? "Semana de " : ""}<b style={{ color: C.text2 }}>{navLabel}</b>
        </span>
        <button onClick={() => setSemanaRef(new Date())} className="cw-btn" style={{ fontSize: 12, fontWeight: 600, color: C.teal, background: C.tealPale, borderRadius: 8, padding: "5px 10px" }}>Hoje</button>
      </div>
      {visao === "semana" && (<>
      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        {dias.map((d, i) => {
          const n = contagemDia(i);
          const ativo = diaSel === i;
          const data = datasSemana[i];
          const hojeTab = ehHoje(data);
          return (
            <button
              key={i}
              onClick={() => setDiaSel(i)}
              className="cw-btn"
              style={{
                flex: 1,
                minWidth: 90,
                padding: "9px 0",
                borderRadius: 12,
                border: `1px solid ${ativo ? C.teal : hojeTab ? C.tealLine : C.border}`,
                background: ativo ? C.teal : C.white,
                color: ativo ? "#fff" : C.text2,
                fontWeight: 600,
                fontSize: 13,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 1,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: ativo ? "rgba(255,255,255,.9)" : C.text3 }}>{d}</span>
              <span style={{ fontFamily: serif, fontSize: 18, lineHeight: 1.1, color: ativo ? "#fff" : hojeTab ? C.teal : C.text }}>
                {p2(data.getDate())}/{p2(data.getMonth() + 1)}
              </span>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: ativo ? "rgba(255,255,255,.85)" : (n > 0 || hojeTab) ? C.teal : C.text4 }}>
                {n > 0 ? `${n} reserva${n > 1 ? "s" : ""}` : hojeTab ? "hoje" : "livre"}
              </span>
            </button>
          );
        })}
      </div>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 760 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `150px repeat(${HORARIOS.length},1fr)`,
                borderBottom: `1px solid ${C.border}`,
                background: C.cream,
              }}
            >
              <div style={{ padding: "12px 14px", fontSize: 12, fontWeight: 600, color: C.text3, letterSpacing: 0.4 }}>
                SALA
              </div>
              {HORARIOS.map((h) => (
                <div
                  key={h}
                  style={{
                    padding: "12px 4px",
                    fontSize: 11,
                    color: C.text3,
                    textAlign: "center",
                    borderLeft: `1px solid ${C.border2}`,
                  }}
                >
                  {h}
                </div>
              ))}
            </div>
            {salasUnidade.map((s) => (
              <div
                key={s.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: `150px repeat(${HORARIOS.length},1fr)`,
                  borderBottom: `1px solid ${C.border2}`,
                  position: "relative",
                  minHeight: 56,
                }}
              >
                <div style={{ padding: "8px 12px", borderRight: `1px solid ${C.border2}`, display: "flex", gap: 9, alignItems: "center" }}>
                  {s.foto && (
                    <img
                      src={s.foto}
                      alt={s.nome}
                      onError={(e) => (e.currentTarget.style.display = "none")}
                      style={{ width: 34, height: 34, borderRadius: 7, objectFit: "cover", flexShrink: 0, background: C.cream2 }}
                    />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{s.nome}</div>
                    <div style={{ fontSize: 11, color: C.text3 }}>
                      {s.tipo} · {s.cap}p
                    </div>
                  </div>
                </div>
                {HORARIOS.map((_, hi) => (
                  <div
                    key={hi}
                    onClick={s.contratada ? undefined : () => abrirNovaEm(s.id, hi)}
                    title={s.contratada ? undefined : `Reservar ${s.nome} às ${HORARIOS[hi]}`}
                    className={s.contratada ? undefined : "cw-slot"}
                    style={{ borderLeft: `1px solid ${C.border2}`, cursor: s.contratada ? "default" : "pointer" }}
                  />
                ))}
                {s.contratada && (
                  <div
                    style={{
                      position: "absolute", top: 6, bottom: 6, left: 154, right: 6,
                      background: `${C.red}12`, border: `1px dashed ${C.red}66`, borderRadius: 8,
                      display: "flex", alignItems: "center", gap: 8, padding: "0 14px",
                      color: C.red, fontSize: 12, fontWeight: 600,
                    }}
                  >
                    🔒 Contratada · locação mensal{s.contratante ? ` · ${s.contratante}` : ""}
                  </div>
                )}
                {!s.contratada && reservasDoDia
                  .filter((r) => r.sala === s.id)
                  .map((r) => (
                    <div
                      key={r.id}
                      title={`${r.cliente} — clique para ver detalhes`}
                      onClick={() => setDetalhe(r)}
                      style={{
                        position: "absolute",
                        top: 6,
                        bottom: 6,
                        left: `calc(150px + (100% - 150px) / ${HORARIOS.length} * ${r.inicio})`,
                        width: `calc((100% - 150px) / ${HORARIOS.length} * ${r.dur} - 4px)`,
                        background: r.cor,
                        borderRadius: 8,
                        padding: "6px 10px",
                        color: "#fff",
                        fontSize: 12,
                        fontWeight: 600,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        overflow: "hidden",
                        cursor: "pointer",
                        boxShadow: "0 2px 8px rgba(0,0,0,.06)",
                      }}
                    >
                      <span
                        style={{
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {r.origem === "app" ? "📱 " : ""}{r.cliente}
                      </span>
                      <span style={{ fontSize: 10, opacity: 0.85 }}>
                        {HORARIOS[r.inicio]}–{horaFim(r.inicio, r.dur)}
                      </span>
                    </div>
                  ))}
              </div>
            ))}
            {salasUnidade.length === 0 && (
              <Empty
                icon={CalendarOff}
                title="Nenhuma sala nesta unidade"
                sub={`Cadastre salas da unidade ${unidadeAtiva?.nome || ""} em Unidades → Gerenciar → Salas.`}
              />
            )}
          </div>
        </div>
      </Card>
      <div style={{ marginTop: 10, fontSize: 12, color: C.text3, fontStyle: "italic" }}>
        💡 Clique numa reserva para ver detalhes, lançar valor complementar ou cancelar. 📱 = feita pelo cliente no app.
      </div>
      </>)}

      {visao === "mes" && (
        <MesGrade ano={semanaRef.getFullYear()} mes={semanaRef.getMonth()} hoje={hoje} contagemNaData={contagemNaData} onDia={irParaData} />
      )}
      {visao === "ano" && (
        <AnoGrade ano={semanaRef.getFullYear()} hoje={hoje} contagemNoMes={contagemNoMes} contagemNaData={contagemNaData}
          onMes={(m) => { setSemanaRef(new Date(semanaRef.getFullYear(), m, 1)); setVisao("mes"); }} onDia={irParaData} />
      )}

      {modal && (
        <NovaReservaModal
          salas={salasReservaveis}
          clientes={clientesDe(unidadeAtiva?.nome)}
          dias={dias}
          datasSemana={datasSemana}
          semanaInicio={inicioSemana}
          diaInicial={modal.dia ?? diaSel}
          salaInicial={modal.sala}
          inicioInicial={modal.inicio}
          reservas={reservas}
          onPedirLink={(dados) => { setModal(null); setLinkModal(dados || {}); }}
          onClose={() => setModal(null)}
          onSave={async (nr) => {
            const res = await criarReserva({ ...nr, cor: C.teal2 });
            if (!res || res.ok === false) { alert(res?.error || "Não foi possível reservar."); return; }
            setDiaSel(nr.dia);
            setModal(null);
          }}
        />
      )}

      {linkModal && (
        <LinkReservaModal
          unidade={unidadeAtiva}
          salas={salasReservaveis.filter((s) => s.reservaOnline === true && Number(s.valorHora) > 0)}
          inicial={linkModal}
          onClose={() => setLinkModal(null)}
        />
      )}

      {detalhe && (
        <Modal title="Detalhes da reserva" onClose={() => setDetalhe(null)}>
          <ReservaDetalhe
            reserva={detalhe}
            sala={salasUnidade.find((s) => s.id === detalhe.sala)}
            dias={dias}
            onComplemento={({ valor, horas }) => {
              const sala = salasUnidade.find((s) => s.id === detalhe.sala);
              const sub = sala?.tipo === "Privativa" ? "Aluguel de Salas Privativas" : "Aluguel de Sala de Reunião";
              addLancamento(activeUnit, {
                tipo: "entrada",
                descricao: `Complemento · ${sala?.nome || ""} · ${detalhe.cliente}${horas ? ` (+${horas}h)` : ""}`,
                categoria: "Receita Operacional Bruta", subcategoria: sub, valor, status: "previsto",
              });
              setDetalhe(null);
            }}
            onCancelar={() => { removeReserva(detalhe.id); setDetalhe(null); }}
          />
        </Modal>
      )}
    </div>
  );
}

// Visão MÊS — grade de calendário do mês, cada dia com a contagem de reservas.
function MesGrade({ ano, mes, hoje, contagemNaData, onDia }) {
  const DIASH = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  const primeiro = new Date(ano, mes, 1);
  const offset = (primeiro.getDay() + 6) % 7;
  const inicio = new Date(ano, mes, 1 - offset);
  const todas = Array.from({ length: 42 }, (_, i) => { const d = new Date(inicio); d.setDate(inicio.getDate() + i); return d; });
  const semanas = [];
  for (let w = 0; w < 6; w++) { const wk = todas.slice(w * 7, w * 7 + 7); if (wk.some((d) => d.getMonth() === mes)) semanas.push(wk); }
  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", background: C.cream, borderBottom: `1px solid ${C.border2}` }}>
        {DIASH.map((d) => <div key={d} style={{ padding: "10px 6px", textAlign: "center", fontSize: 11, fontWeight: 700, color: C.text3 }}>{d}</div>)}
      </div>
      {semanas.map((wk, wi) => (
        <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
          {wk.map((d, di) => {
            const inMes = d.getMonth() === mes;
            const n = inMes ? contagemNaData(d) : 0;
            const today = mesmaDataDia(d, hoje);
            return (
              <button key={di} onClick={() => onDia(d)} className="cw-btn"
                style={{ minHeight: 76, borderRight: di < 6 ? `1px solid ${C.border2}` : "none", borderTop: `1px solid ${C.border2}`,
                  background: today ? C.tealPale : C.white, opacity: inMes ? 1 : 0.4, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 5, padding: "8px 10px", cursor: "pointer", textAlign: "left" }}>
                <span style={{ fontFamily: serif, fontSize: 16, color: today ? C.teal : C.text }}>{d.getDate()}</span>
                {n > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, color: "#fff", background: C.teal, borderRadius: 8, padding: "2px 7px" }}>{n} reserva{n > 1 ? "s" : ""}</span>}
              </button>
            );
          })}
        </div>
      ))}
    </Card>
  );
}

// Visão ANO — 12 mini-calendários; clique no mês abre a visão mês, no dia abre a semana.
function AnoGrade({ ano, hoje, contagemNoMes, contagemNaData, onMes, onDia }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(232px,1fr))", gap: 14 }}>
      {MESES_NOME.map((nome, m) => {
        const total = contagemNoMes(ano, m);
        const primeiro = new Date(ano, m, 1);
        const offset = (primeiro.getDay() + 6) % 7;
        const inicio = new Date(ano, m, 1 - offset);
        const todas = Array.from({ length: 42 }, (_, i) => { const d = new Date(inicio); d.setDate(inicio.getDate() + i); return d; });
        const nSem = todas.some((d, i) => i >= 35 && d.getMonth() === m) ? 6 : 5;
        return (
          <Card key={m} style={{ padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <button onClick={() => onMes(m)} className="cw-btn" style={{ fontFamily: serif, fontSize: 15, color: C.text, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>{nome}</button>
              {total > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, color: C.teal, background: C.tealPale, borderRadius: 8, padding: "2px 7px" }}>{total}</span>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
              {["S", "T", "Q", "Q", "S", "S", "D"].map((d, i) => <div key={i} style={{ textAlign: "center", fontSize: 9, color: C.text4, fontWeight: 700 }}>{d}</div>)}
              {todas.slice(0, nSem * 7).map((d, i) => {
                const inMes = d.getMonth() === m;
                const n = inMes ? contagemNaData(d) : 0;
                const today = mesmaDataDia(d, hoje);
                return (
                  <button key={i} onClick={() => inMes && onDia(d)} disabled={!inMes} title={inMes ? `${d.getDate()}/${m + 1} · ${n} reserva(s)` : ""}
                    style={{ height: 22, borderRadius: 6, border: "none", fontSize: 10, cursor: inMes ? "pointer" : "default",
                      background: !inMes ? "transparent" : n > 0 ? C.teal : today ? C.tealPale : C.cream2,
                      color: !inMes ? "transparent" : n > 0 ? "#fff" : today ? C.teal : C.text2, fontWeight: (n > 0 || today) ? 700 : 500 }}>
                    {inMes ? d.getDate() : ""}
                  </button>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function MiniKpi({ label, valor, sub, icon: Icon, cor }) {
  return (
    <Card style={{ padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: C.text3 }}>{label}</div>
          <div style={{ fontFamily: serif, fontSize: 22, color: C.text, marginTop: 3 }}>{valor}</div>
          {sub && <div style={{ fontSize: 11, color: C.text4, marginTop: 1 }}>{sub}</div>}
        </div>
        <div style={{ width: 38, height: 38, borderRadius: 11, background: `${cor}16`, display: "grid", placeItems: "center", flexShrink: 0 }}>
          <Icon size={18} color={cor} />
        </div>
      </div>
    </Card>
  );
}

function ReservaDetalhe({ reserva, sala, dias, onComplemento, onCancelar }) {
  const dt = getReservaStart(reserva);
  const dataLabel = `${dias[reserva.dia]} ${pad2(dt.getDate())}/${pad2(dt.getMonth() + 1)}/${dt.getFullYear()}`;
  const vh = sala?.valorHora || 0;
  const [horas, setHoras] = useState(1);
  const [valor, setValor] = useState(vh);
  const setH = (h) => { const n = Math.max(0, h); setHoras(n); setValor(n * vh); };

  return (
    <>
      <div style={{ background: C.cream, borderRadius: 12, padding: 14, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontFamily: serif, fontSize: 18 }}>{reserva.cliente}</div>
          {reserva.origem === "app" && <Badge color={C.teal}><Smartphone size={11} /> Reservou pelo app</Badge>}
          {reserva.origem === "site" && <Badge color={C.teal}><Link2 size={11} /> Pagou pelo link</Badge>}
        </div>
        {reserva.observacao && <div style={{ fontSize: 13, color: C.amber, marginTop: 6 }}>{reserva.observacao}</div>}
        <div style={{ fontSize: 13, color: C.text3, marginTop: 4 }}>
          {sala?.nome}{reserva.base ? ` · Base ${reserva.base}` : ""} · {dataLabel} · {HORARIOS[reserva.inicio]}–{horaFim(reserva.inicio, reserva.dur)} ({reserva.dur}h)
        </div>
        <div style={{ fontSize: 13, color: C.text2, marginTop: 6 }}>
          Valor da reserva: <b style={{ color: C.cafe }}>{fmt(reserva.valor || 0)}</b> · já lançado no financeiro (a receber)
        </div>
      </div>

      <div style={{ background: C.tealPale, border: `1px solid ${C.tealLine}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.teal, marginBottom: 4 }}>Usou mais que o contratado?</div>
        <div style={{ fontSize: 12, color: C.teal2, marginBottom: 12 }}>Lance um valor complementar — ele entra no financeiro como a receber.</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Horas adicionais" style={{ marginBottom: 0 }}>
            <input type="number" min="0" value={horas} onChange={(e) => setH(+e.target.value)} style={inp} />
          </Field>
          <Field label="Valor complementar (R$)" style={{ marginBottom: 0 }}>
            <input type="number" min="0" step="0.01" value={valor} onChange={(e) => setValor(+e.target.value)} style={inp} />
          </Field>
        </div>
        {vh > 0 && <div style={{ fontSize: 11, color: C.teal2, marginTop: 6 }}>Sugestão: {horas}h × {fmt(vh)} = {fmt(horas * vh)}</div>}
        <Btn variant="teal" style={{ width: "100%", justifyContent: "center", marginTop: 12 }} disabled={!(valor > 0)} onClick={() => valor > 0 && onComplemento({ valor, horas })}>
          <DollarSign size={16} /> Lançar complemento no financeiro
        </Btn>
      </div>

      <Btn variant="ghost" style={{ width: "100%", justifyContent: "center", color: C.red, borderColor: C.redPale }} onClick={onCancelar}>
        <Trash2 size={16} /> Cancelar reserva
      </Btn>
    </>
  );
}

function NovaReservaModal({ salas, clientes, dias, datasSemana = [], semanaInicio, diaInicial, salaInicial, inicioInicial, reservas, onClose, onSave, onPedirLink }) {
  const [f, setF] = useState({
    sala: (salaInicial && salas.some((s) => s.id === salaInicial) ? salaInicial : salas[0]?.id) || "",
    modo: clientes.length ? "cadastrado" : "avulso",
    clienteId: clientes[0]?.id || "",
    nome: "", telefone: "", email: "", motivo: "",
    dia: diaInicial || 0, inicio: inicioInicial ?? 2, dur: 1, base: null,
  });
  const salaSel = salas.find((s) => s.id === f.sala);
  const compart = (salaSel?.bases || 0) > 0; // sala compartilhada → reserva por base
  const clienteNome = f.modo === "cadastrado" ? (clientes.find((c) => c.id === f.clienteId)?.nome || "") : f.nome.trim();
  // Datas reais do bloco escolhido (na semana exibida) → conflito por DATA/HORA.
  const startDate = dataDoSlot(semanaInicio, f.dia, f.inicio);
  const endDate = new Date(startDate); endDate.setHours(startDate.getHours() + f.dur);
  const overlaps = (r) => r.sala === f.sala && reservaAtivaLocal(r) && getReservaStart(r) < endDate && startDate < getReservaEnd(r);
  const baseOcupada = (n) => reservas.some((r) => overlaps(r) && (r.base ?? null) === n);
  const conflito = !compart ? reservas.find(overlaps) : null;
  const bases = compart ? Array.from({ length: salaSel.bases }, (_, i) => i + 1) : [];
  const livres = bases.filter((n) => !baseOcupada(n)).length;
  const baseConflito = compart && (!f.base || baseOcupada(f.base));
  const motivoOk = f.modo !== "avulso" || f.motivo.trim().length >= 5;
  const podeSalvar = clienteNome && f.sala && !conflito && !baseConflito && motivoOk;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setTempo = (patch) => setF((p) => ({ ...p, ...patch, base: null }));

  if (!salas.length) {
    return (
      <Modal onClose={onClose} title="Nova reserva">
        <div style={{ textAlign: "center", padding: "10px 4px 4px" }}>
          <CalendarOff size={34} color={C.text4} style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 14.5, fontWeight: 600, color: C.text, marginBottom: 6 }}>Nenhuma sala disponível para reserva</div>
          <div style={{ fontSize: 13, color: C.text3, marginBottom: 16 }}>
            Cadastre as salas desta unidade em <b>Unidades → Gerenciar → Salas</b> antes de criar reservas.
          </div>
          <Btn variant="ghost" onClick={onClose} style={{ justifyContent: "center" }}>Entendi</Btn>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} title="Nova reserva">
      <Field label="Sala">
        <select value={f.sala} onChange={(e) => setF({ ...f, sala: e.target.value, base: null })} style={inp}>
          {salas.map((s) => (
            <option key={s.id} value={s.id}>{s.nome} — {s.tipo}{(s.bases || 0) > 0 ? ` (${s.bases} bases)` : ""}</option>
          ))}
        </select>
      </Field>
      {salaSel?.foto && (
        <img src={salaSel.foto} alt={salaSel.nome} onError={(e) => (e.currentTarget.style.display = "none")} style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: 12, marginBottom: 14, background: C.cream2 }} />
      )}

      <Field label="Para quem é a reserva">
        <div style={{ display: "flex", gap: 8 }}>
          {[["cadastrado", "Cliente cadastrado"], ["avulso", "Não é cliente"]].map(([v, lb]) => (
            <button key={v} type="button" onClick={() => setF({ ...f, modo: v })}
              style={{ flex: 1, padding: "10px 0", borderRadius: 10, fontFamily: sans, fontSize: 13.5, fontWeight: 600, border: `1px solid ${f.modo === v ? C.teal : C.border}`, background: f.modo === v ? C.teal : C.white, color: f.modo === v ? "#fff" : C.text2 }}>
              {lb}
            </button>
          ))}
        </div>
      </Field>

      {f.modo === "cadastrado" ? (
        clientes.length > 0 ? (
          <Field label="Cliente (da base)">
            <select value={f.clienteId} onChange={set("clienteId")} style={inp}>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.plano ? ` · ${c.plano}` : ""}</option>)}
            </select>
          </Field>
        ) : (
          <div style={{ fontSize: 13, color: C.amber, marginBottom: 14 }}>Nenhum cliente cadastrado nesta unidade — use "Não é cliente".</div>
        )
      ) : (
        <>
          <div style={{ background: C.tealPale, border: `1px solid ${C.tealLine}`, borderRadius: 12, padding: "12px 14px", marginBottom: 14, fontSize: 13.5, color: C.text2, lineHeight: 1.5 }}>
            <b style={{ color: C.text }}>Prefira mandar o link.</b> O cliente escolhe o horário, informa os dados e paga por PIX ou cartão; a reserva confirma sozinha e o cadastro fica pronto.
            <div style={{ marginTop: 10 }}>
              <Btn variant="teal" onClick={() => onPedirLink?.({ sala: f.sala, telefone: f.telefone })}>
                <Link2 size={15} /> Mandar o link ao cliente
              </Btn>
            </div>
          </div>
          <Field label="Nome do cliente / empresa">
            <input value={f.nome} onChange={set("nome")} style={inp} placeholder="Nome de quem vai usar a sala" />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Telefone">
              <input value={f.telefone} onChange={set("telefone")} style={inp} placeholder="(31) 99999-9999" />
            </Field>
            <Field label="E-mail">
              <input type="email" value={f.email} onChange={set("email")} style={inp} placeholder="email@exemplo.com" />
            </Field>
          </div>
          <Field label="Por que reservar direto, sem o link? (obrigatório)">
            <input value={f.motivo} onChange={set("motivo")} maxLength={300} style={inp} placeholder="Ex.: cliente está na recepção e pagou em dinheiro" />
          </Field>
        </>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 12 }}>
        <Field label="Dia">
          <select value={f.dia} onChange={(e) => setTempo({ dia: +e.target.value })} style={inp}>
            {dias.map((d, i) => <option key={i} value={i}>{d}{datasSemana[i] ? ` · ${pad2(datasSemana[i].getDate())}/${pad2(datasSemana[i].getMonth() + 1)}` : ""}</option>)}
          </select>
        </Field>
        <Field label="Início">
          <select value={f.inicio} onChange={(e) => setTempo({ inicio: +e.target.value })} style={inp}>
            {HORARIOS.map((h, i) => <option key={i} value={i}>{h}</option>)}
          </select>
        </Field>
        <Field label="Duração">
          <select value={f.dur} onChange={(e) => setTempo({ dur: +e.target.value })} style={inp}>
            {[1, 2, 3, 4].map((d) => <option key={d} value={d}>{d}h</option>)}
          </select>
        </Field>
      </div>

      {compart && (
        <Field label={`Base de trabalho — ${livres} de ${salaSel.bases} livre${livres === 1 ? "" : "s"} neste horário`}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(46px,1fr))", gap: 8 }}>
            {bases.map((n) => {
              const ocup = baseOcupada(n); const sel = f.base === n;
              return (
                <button key={n} type="button" disabled={ocup} onClick={() => setF((p) => ({ ...p, base: n }))}
                  title={ocup ? `Base ${n} ocupada` : `Base ${n} livre`} aria-label={`Base ${n}${ocup ? " ocupada" : " livre"}`}
                  style={{ height: 44, borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: ocup ? "not-allowed" : "pointer",
                    border: `1.5px solid ${sel ? C.teal : ocup ? "transparent" : C.border}`,
                    background: sel ? C.teal : ocup ? C.redPale : C.white, color: sel ? "#fff" : ocup ? C.red : C.text2 }}>
                  {n}
                </button>
              );
            })}
          </div>
        </Field>
      )}

      {conflito ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.redPale, color: C.red, borderRadius: 10, padding: "10px 12px", fontSize: 13, marginBottom: 12 }}>
          <AlertCircle size={16} /> Conflito: <b>{salaSel?.nome}</b> já está reservada nesse horário para <b>{conflito.cliente}</b>.
        </div>
      ) : baseConflito ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.redPale, color: C.red, borderRadius: 10, padding: "10px 12px", fontSize: 13, marginBottom: 12 }}>
          <AlertCircle size={16} /> {livres === 0 ? "Todas as bases estão ocupadas nesse horário." : "Escolha uma base livre acima."}
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: C.green, marginBottom: 12 }}>
          ✓ {compart ? `Base ${f.base} livre` : "Horário livre"}: {dias[f.dia]}{datasSemana[f.dia] ? ` ${pad2(datasSemana[f.dia].getDate())}/${pad2(datasSemana[f.dia].getMonth() + 1)}` : ""} · {HORARIOS[f.inicio]}–{horaFim(f.inicio, f.dur)}
        </div>
      )}

      <Btn
        variant="teal"
        disabled={!podeSalvar}
        style={{ width: "100%", justifyContent: "center", opacity: podeSalvar ? 1 : 0.5 }}
        onClick={() => podeSalvar && onSave({ sala: f.sala, dia: f.dia, inicio: f.inicio, dur: f.dur, base: f.base, cliente: clienteNome, avulso: f.modo === "avulso", observacao: f.modo === "avulso" ? f.motivo.trim() : "", telefone: f.telefone, email: f.email, startAt: startDate.toISOString(), endAt: endDate.toISOString() })}
      >
        <CheckCircle2 size={17} /> Confirmar reserva
      </Btn>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Link de reserva para o cliente (caminho padrão da recepção)
// O cliente abre, escolhe o horário, informa os dados e paga por PIX ou cartão
// na página de reserva do site; a reserva confirma sozinha com o pagamento e o
// cadastro dele é criado em Clientes.
// ---------------------------------------------------------------------------
const SITE_RESERVA = "https://cafeworking.com.br/reservar-sala";
const dataISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export function linkDeReserva({ unidadeId, salaNome, data }) {
  const q = new URLSearchParams();
  if (unidadeId) q.set("unidade", unidadeId);
  if (salaNome) q.set("sala", salaNome);
  if (data) q.set("data", data);
  const s = q.toString();
  return s ? `${SITE_RESERVA}?${s}` : SITE_RESERVA;
}

function LinkReservaModal({ unidade, salas, inicial = {}, onClose }) {
  const [salaId, setSalaId] = useState(salas.some((s) => s.id === inicial.sala) ? inicial.sala : "");
  const [data, setData] = useState("");
  const [telefone, setTelefone] = useState(inicial.telefone || "");
  const [copiado, setCopiado] = useState(false);
  const sala = salas.find((s) => s.id === salaId);
  const link = linkDeReserva({ unidadeId: unidade?.id, salaNome: sala?.nome, data });
  const mensagem = `Olá! Para reservar ${sala ? `a sala ${sala.nome}` : "sua sala"} no CafeWorking é só abrir o link, escolher o horário, preencher seus dados e pagar por PIX ou cartão. A reserva confirma na hora do pagamento.\n\n${link}`;
  const fone = telefone.replace(/\D/g, "");
  const foneWa = fone.length >= 10 ? (fone.startsWith("55") ? fone : `55${fone}`) : "";
  const whatsapp = `https://wa.me/${foneWa}?text=${encodeURIComponent(mensagem)}`;

  const copiar = async (texto) => {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      const t = document.createElement("textarea");
      t.value = texto; document.body.appendChild(t); t.select();
      try { document.execCommand("copy"); } catch { /* sem cópia */ }
      t.remove();
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  return (
    <Modal onClose={onClose} title="Link para o cliente reservar">
      <div style={{ fontSize: 13.5, color: C.text2, lineHeight: 1.5, marginBottom: 14 }}>
        Mande este link para quem quer reservar sem ir à recepção. O cliente escolhe o horário, informa os dados e paga por PIX ou cartão.
        A reserva aparece na agenda assim que o pagamento entra, e o cadastro dele é criado em Clientes.
      </div>

      {!salas.length && (
        <div style={{ display: "flex", gap: 8, background: C.amberPale || C.cream2, color: C.amber, borderRadius: 10, padding: "10px 12px", fontSize: 13, marginBottom: 12 }}>
          <AlertCircle size={16} /> Nenhuma sala desta unidade está liberada para reserva online. Marque "Reservável por hora no site" e o valor por hora na sala.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Sala">
          <select value={salaId} onChange={(e) => setSalaId(e.target.value)} style={inp}>
            <option value="">O cliente escolhe</option>
            {salas.map((s) => <option key={s.id} value={s.id}>{s.nome} · {fmt(s.valorHora)}/h</option>)}
          </select>
        </Field>
        <Field label="Dia (opcional)">
          <input type="date" value={data} min={dataISO(new Date())} onChange={(e) => setData(e.target.value)} style={inp} />
        </Field>
      </div>

      <Field label="Link">
        <div style={{ display: "flex", gap: 8 }}>
          <input readOnly value={link} onFocus={(e) => e.target.select()} style={{ ...inp, flex: 1, fontSize: 13 }} aria-label="Link de reserva" />
          <Btn variant="ghost" onClick={() => copiar(link)}>
            {copiado ? <><CheckCircle2 size={15} /> Copiado</> : <><Copy size={15} /> Copiar</>}
          </Btn>
        </div>
      </Field>

      <Field label="WhatsApp do cliente (opcional)">
        <input value={telefone} onChange={(e) => setTelefone(e.target.value)} style={inp} placeholder="(31) 99999-9999" inputMode="tel" />
      </Field>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <a href={whatsapp} target="_blank" rel="noreferrer" className="cw-btn"
          style={{ flex: 1, display: "inline-flex", justifyContent: "center", alignItems: "center", gap: 8, padding: "11px 16px", borderRadius: 12, background: C.teal, color: "#fff", fontWeight: 600, fontSize: 14, textDecoration: "none" }}>
          <MessageCircle size={16} /> {foneWa ? "Enviar no WhatsApp" : "Abrir no WhatsApp"}
        </a>
        <Btn variant="ghost" onClick={() => copiar(mensagem)}>
          <Copy size={15} /> Copiar mensagem
        </Btn>
      </div>
      <div style={{ fontSize: 12.5, color: C.text3, marginTop: 10 }}>
        Sem o número, o WhatsApp abre para você escolher a conversa.
      </div>
    </Modal>
  );
}
