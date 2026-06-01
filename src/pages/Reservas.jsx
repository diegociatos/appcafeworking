import React, { useState } from "react";
import { Plus, CheckCircle2 } from "lucide-react";
import { Card, Btn, PageHead, Modal, Field } from "../components/ui.jsx";
import { C, serif, inp } from "../lib/theme.js";
import { SALAS, HORARIOS, RESERVAS_INIT } from "../lib/data.js";

export default function Reservas() {
  const [reservas, setReservas] = useState(RESERVAS_INIT);
  const [diaSel, setDiaSel] = useState(0);
  const [modal, setModal] = useState(null);
  const dias = ["Seg 26", "Ter 27", "Qua 28", "Qui 29", "Sex 30"];
  const reservasDoDia = reservas.filter((r) => r.dia === diaSel);

  return (
    <div>
      <PageHead
        title="Reserva de Salas"
        sub="Agenda visual por sala, com bloqueios e disponibilidade em tempo real."
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
                gridTemplateColumns: "150px repeat(10,1fr)",
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
            {SALAS.map((s) => (
              <div
                key={s.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "150px repeat(10,1fr)",
                  borderBottom: `1px solid ${C.border2}`,
                  position: "relative",
                  minHeight: 56,
                }}
              >
                <div style={{ padding: "10px 14px", borderRight: `1px solid ${C.border2}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{s.nome}</div>
                  <div style={{ fontSize: 11, color: C.text3 }}>
                    {s.unidade} · {s.cap}p
                  </div>
                </div>
                {HORARIOS.map((_, hi) => (
                  <div key={hi} style={{ borderLeft: `1px solid ${C.border2}` }} />
                ))}
                {reservasDoDia
                  .filter((r) => r.sala === s.id)
                  .map((r) => (
                    <div
                      key={r.id}
                      title={r.cliente}
                      style={{
                        position: "absolute",
                        top: 6,
                        bottom: 6,
                        left: `calc(150px + (100% - 150px) / 10 * ${r.inicio})`,
                        width: `calc((100% - 150px) / 10 * ${r.dur} - 4px)`,
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
                        {r.cliente}
                      </span>
                      <span style={{ fontSize: 10, opacity: 0.85 }}>
                        {HORARIOS[r.inicio]}–{HORARIOS[r.inicio + r.dur] || "18:00"}
                      </span>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </div>
      </Card>
      {modal && (
        <NovaReservaModal
          onClose={() => setModal(null)}
          onSave={(nr) => {
            setReservas((rs) => [
              ...rs,
              { ...nr, id: "r" + Date.now(), dia: diaSel, cor: C.teal2 },
            ]);
            setModal(null);
          }}
        />
      )}
    </div>
  );
}

function NovaReservaModal({ onClose, onSave }) {
  const [f, setF] = useState({ sala: SALAS[0].id, cliente: "", inicio: 2, dur: 1 });
  return (
    <Modal onClose={onClose} title="Nova reserva">
      <Field label="Sala">
        <select value={f.sala} onChange={(e) => setF({ ...f, sala: e.target.value })} style={inp}>
          {SALAS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nome} — {s.unidade}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Cliente / Empresa">
        <input
          value={f.cliente}
          onChange={(e) => setF({ ...f, cliente: e.target.value })}
          placeholder="Ex: Ciatos Log"
          style={inp}
        />
      </Field>
      <div style={{ display: "flex", gap: 12 }}>
        <Field label="Início" style={{ flex: 1 }}>
          <select value={f.inicio} onChange={(e) => setF({ ...f, inicio: +e.target.value })} style={inp}>
            {HORARIOS.map((h, i) => (
              <option key={i} value={i}>
                {h}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Duração" style={{ flex: 1 }}>
          <select value={f.dur} onChange={(e) => setF({ ...f, dur: +e.target.value })} style={inp}>
            {[1, 2, 3, 4].map((d) => (
              <option key={d} value={d}>
                {d}h
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Btn
        variant="teal"
        style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
        onClick={() => f.cliente && onSave(f)}
      >
        <CheckCircle2 size={17} /> Confirmar reserva
      </Btn>
    </Modal>
  );
}
