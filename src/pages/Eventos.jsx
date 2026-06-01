import React from "react";
import {
  Plus, Calendar, MapPin, Presentation, GraduationCap, Sparkles,
  Mic2, Ticket,
} from "lucide-react";
import { Card, Badge, Btn, PageHead } from "../components/ui.jsx";
import { C, serif } from "../lib/theme.js";
import { EVENTOS } from "../lib/data.js";

const TIPO_ICONE = {
  Workshop: GraduationCap,
  Networking: Sparkles,
  Treinamento: Presentation,
  Evento: Mic2,
};

const TIPO_COR = {
  Workshop: C.cafe,
  Networking: C.teal,
  Treinamento: C.amber,
  Evento: C.teal2,
};

export default function Eventos() {
  return (
    <div>
      <PageHead
        title="Eventos & Auditório"
        sub="Workshops, treinamentos e networking — venda, inscritos, certificados e QR Code de acesso."
        action={
          <Btn variant="teal">
            <Plus size={16} /> Novo evento
          </Btn>
        }
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
          gap: 16,
        }}
      >
        {EVENTOS.map((e, i) => {
          const lotado = e.inscritos >= e.cap;
          const Ic = TIPO_ICONE[e.tipo];
          const cor = TIPO_COR[e.tipo];
          return (
            <Card key={e.id} className={`cw-fade cw-fade-${i + 1}`}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 14,
                }}
              >
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 12,
                    background: `${cor}16`,
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <Ic size={22} color={cor} />
                </div>
                <Badge color={cor}>{e.tipo}</Badge>
              </div>
              <div style={{ fontFamily: serif, fontSize: 20, color: C.text, lineHeight: 1.2 }}>
                {e.nome}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: C.text3,
                  marginTop: 6,
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Calendar size={13} /> {e.data} · {e.hora}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <MapPin size={13} /> {e.sala} · {e.unidade}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Presentation size={13} /> Formato {e.formato}
                </span>
              </div>
              <div style={{ marginTop: 14 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 12,
                    marginBottom: 6,
                  }}
                >
                  <span style={{ color: C.text3 }}>
                    <Ticket size={12} style={{ verticalAlign: -1, marginRight: 4 }} />
                    {e.inscritos}/{e.cap} inscritos
                  </span>
                  <span style={{ color: lotado ? C.red : C.green, fontWeight: 600 }}>
                    {lotado ? "Lotado" : `${e.cap - e.inscritos} vagas`}
                  </span>
                </div>
                <div style={{ height: 6, background: C.cream2, borderRadius: 10, overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${(e.inscritos / e.cap) * 100}%`,
                      height: "100%",
                      background: lotado
                        ? C.red
                        : `linear-gradient(90deg,${cor},${cor}aa)`,
                      borderRadius: 10,
                      transition: "width .6s",
                    }}
                  />
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
