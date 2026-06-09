import React, { useState, useEffect } from "react";
import { Plus, CheckCircle2, CalendarOff, AlertCircle, Trash2, X, Smartphone, DollarSign } from "lucide-react";
import { Card, Badge, Btn, PageHead, Modal, Field, Empty } from "../components/ui.jsx";
import { C, serif, sans, fmt, inp } from "../lib/theme.js";
import { HORARIOS, DIAS } from "../lib/data.js";

// Fim de um bloco: próximo horário, ou +1h após o último (ex.: 22:00 → 23:00).
const horaFim = (inicio, dur) => {
  const h = HORARIOS[inicio + dur];
  if (h) return h;
  const ult = parseInt(HORARIOS[HORARIOS.length - 1], 10) + 1;
  return `${String(ult).padStart(2, "0")}:00`;
};
import { useStore } from "../lib/store.jsx";


export default function Reservas() {
  const { activeUnit, unidadeAtiva, salasDe, clientesDe, reservas, addReserva, removeReserva, marcarReservasVistas, addLancamento } = useStore();
  const [diaSel, setDiaSel] = useState(0);
  const [modal, setModal] = useState(null);
  const [detalhe, setDetalhe] = useState(null);
  const dias = DIAS;

  // Ao abrir a agenda, marca as reservas novas (feitas pelo cliente) como vistas
  useEffect(() => { marcarReservasVistas(activeUnit); }, [activeUnit]); // eslint-disable-line

  const salasUnidade = salasDe(activeUnit);
  const salasReservaveis = salasUnidade.filter((s) => !s.contratada);
  const salaIds = new Set(salasUnidade.map((s) => s.id));
  const reservasDoDia = reservas.filter((r) => r.dia === diaSel && salaIds.has(r.sala));

  return (
    <div>
      <PageHead
        title="Agenda de Salas"
        sub={`Agenda da unidade ${unidadeAtiva?.nome || ""} · disponibilidade por sala e horário.`}
        action={
          <Btn variant="teal" onClick={() => setModal({})}>
            <Plus size={16} /> Nova reserva
          </Btn>
        }
      />
      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        {dias.map((d, i) => (
          <button
            key={i}
            onClick={() => setDiaSel(i)}
            className="cw-btn"
            style={{
              flex: 1,
              minWidth: 90,
              padding: "12px 0",
              borderRadius: 12,
              border: `1px solid ${diaSel === i ? C.teal : C.border}`,
              background: diaSel === i ? C.teal : C.white,
              color: diaSel === i ? "#fff" : C.text2,
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            {d}
          </button>
        ))}
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
                  <div key={hi} style={{ borderLeft: `1px solid ${C.border2}` }} />
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

      {modal && (
        <NovaReservaModal
          salas={salasReservaveis}
          clientes={clientesDe(unidadeAtiva?.nome)}
          dias={dias}
          diaInicial={diaSel}
          reservas={reservas}
          onClose={() => setModal(null)}
          onSave={(nr) => {
            addReserva({ ...nr, cor: C.teal2 });
            setDiaSel(nr.dia);
            setModal(null);
          }}
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

function ReservaDetalhe({ reserva, sala, dias, onComplemento, onCancelar }) {
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
        </div>
        <div style={{ fontSize: 13, color: C.text3, marginTop: 4 }}>
          {sala?.nome} · {dias[reserva.dia]} · {HORARIOS[reserva.inicio]}–{horaFim(reserva.inicio, reserva.dur)} ({reserva.dur}h)
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

function NovaReservaModal({ salas, clientes, dias, diaInicial, reservas, onClose, onSave }) {
  const [f, setF] = useState({
    sala: salas[0]?.id || "",
    modo: clientes.length ? "cadastrado" : "avulso",
    clienteId: clientes[0]?.id || "",
    nome: "", telefone: "", email: "",
    dia: diaInicial || 0, inicio: 2, dur: 1,
  });
  const salaSel = salas.find((s) => s.id === f.sala);
  const clienteNome = f.modo === "cadastrado" ? (clientes.find((c) => c.id === f.clienteId)?.nome || "") : f.nome.trim();
  const conflito = reservas.find(
    (r) => r.sala === f.sala && r.dia === f.dia && f.inicio < r.inicio + r.dur && r.inicio < f.inicio + f.dur
  );
  const podeSalvar = clienteNome && f.sala && !conflito;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

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
        <select value={f.sala} onChange={(e) => setF({ ...f, sala: e.target.value })} style={inp}>
          {salas.map((s) => (
            <option key={s.id} value={s.id}>{s.nome} — {s.tipo}</option>
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
        </>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 12 }}>
        <Field label="Dia">
          <select value={f.dia} onChange={(e) => setF({ ...f, dia: +e.target.value })} style={inp}>
            {dias.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </Field>
        <Field label="Início">
          <select value={f.inicio} onChange={(e) => setF({ ...f, inicio: +e.target.value })} style={inp}>
            {HORARIOS.map((h, i) => <option key={i} value={i}>{h}</option>)}
          </select>
        </Field>
        <Field label="Duração">
          <select value={f.dur} onChange={(e) => setF({ ...f, dur: +e.target.value })} style={inp}>
            {[1, 2, 3, 4].map((d) => <option key={d} value={d}>{d}h</option>)}
          </select>
        </Field>
      </div>

      {conflito ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.redPale, color: C.red, borderRadius: 10, padding: "10px 12px", fontSize: 13, marginBottom: 12 }}>
          <AlertCircle size={16} /> Conflito: <b>{salaSel?.nome}</b> já está reservada nesse horário para <b>{conflito.cliente}</b>.
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: C.green, marginBottom: 12 }}>
          ✓ Horário livre: {HORARIOS[f.inicio]}–{horaFim(f.inicio, f.dur)} · {dias[f.dia]}
        </div>
      )}

      <Btn
        variant="teal"
        disabled={!podeSalvar}
        style={{ width: "100%", justifyContent: "center", opacity: podeSalvar ? 1 : 0.5 }}
        onClick={() => podeSalvar && onSave({ sala: f.sala, dia: f.dia, inicio: f.inicio, dur: f.dur, cliente: clienteNome, avulso: f.modo === "avulso", telefone: f.telefone, email: f.email })}
      >
        <CheckCircle2 size={17} /> Confirmar reserva
      </Btn>
    </Modal>
  );
}
