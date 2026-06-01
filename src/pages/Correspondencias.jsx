import React, { useState } from "react";
import {
  Plus, PackageCheck, Eye, Send, MessageCircle, Mail,
  AlertCircle, Camera, Filter,
} from "lucide-react";
import { Card, Badge, Btn, PageHead } from "../components/ui.jsx";
import { C, serif } from "../lib/theme.js";
import { CORRESP_INIT } from "../lib/data.js";

const STATUS_COLOR = {
  aguardando: { c: C.amber, bg: C.amberPale, l: "Aguardando retirada" },
  digitalizada: { c: C.blue, bg: C.bluePale, l: "Digitalizada" },
  notificado: { c: C.teal, bg: C.tealPale, l: "Notificado" },
  retirada: { c: C.green, bg: C.greenPale, l: "Retirada" },
};

export default function Correspondencias() {
  const [filtro, setFiltro] = useState("todas");
  const [corresp, setCorresp] = useState(CORRESP_INIT);
  const filtrada = filtro === "urgente" ? corresp.filter((c) => c.urgente) : corresp;

  const notificar = (id) => {
    setCorresp((cs) =>
      cs.map((c) => (c.id === id ? { ...c, status: "notificado", urgente: false } : c))
    );
  };

  return (
    <div>
      <PageHead
        title="Correspondências"
        sub="O coração do serviço de endereço fiscal: foto, histórico, notificação por WhatsApp e comprovante de retirada."
        action={
          <Btn>
            <Plus size={16} /> Registrar recebimento
          </Btn>
        }
      />

      {/* Resumo */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
          gap: 12,
          marginBottom: 18,
        }}
      >
        {[
          { l: "Recebidas hoje", v: 3, c: C.cafe },
          { l: "Aguardando retirada", v: corresp.filter((c) => c.status === "aguardando").length, c: C.amber },
          { l: "Urgentes", v: corresp.filter((c) => c.urgente).length, c: C.red },
          { l: "Tempo médio retirada", v: "2,4d", c: C.teal },
        ].map((k, i) => (
          <Card key={i} className={`cw-fade cw-fade-${i + 1}`} style={{ padding: 16 }}>
            <div style={{ fontSize: 12, color: C.text3 }}>{k.l}</div>
            <div
              style={{
                fontFamily: serif,
                fontSize: 26,
                color: k.c,
                marginTop: 4,
                lineHeight: 1,
              }}
            >
              {k.v}
            </div>
          </Card>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[
          ["todas", "Todas"],
          ["urgente", "Urgentes"],
        ].map(([id, l]) => (
          <button
            key={id}
            onClick={() => setFiltro(id)}
            className="cw-btn"
            style={{
              padding: "8px 16px",
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 600,
              border: `1px solid ${filtro === id ? C.cafe : C.border}`,
              background: filtro === id ? C.cafe : C.white,
              color: filtro === id ? "#fff" : C.text2,
            }}
          >
            <Filter size={13} style={{ verticalAlign: -2, marginRight: 5 }} /> {l}
          </button>
        ))}
      </div>

      {/* Lista de correspondências */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 16 }}>
        {filtrada.map((c) => {
          const s = STATUS_COLOR[c.status];
          return (
            <Card key={c.id}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: c.urgente ? C.redPale : C.cafePale,
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <PackageCheck size={22} color={c.urgente ? C.red : C.cafe} />
                </div>
                {c.urgente && (
                  <Badge color={C.red} bg={C.redPale}>
                    <AlertCircle size={11} /> Urgente
                  </Badge>
                )}
              </div>
              <div style={{ fontFamily: serif, fontSize: 18, color: C.text, lineHeight: 1.2 }}>
                {c.cliente}
              </div>
              <div style={{ fontSize: 13, color: C.text3, marginTop: 4 }}>
                <b style={{ color: C.text2 }}>{c.remetente}</b> · {c.tipo}
              </div>
              <div style={{ fontSize: 12, color: C.text4, marginTop: 4 }}>Recebida {c.recebido}</div>

              <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                <Btn variant="ghost" style={{ flex: 1, justifyContent: "center", padding: "9px 10px", fontSize: 12 }}>
                  <Camera size={14} /> Ver foto
                </Btn>
                {c.status !== "notificado" && c.status !== "retirada" && (
                  <Btn
                    variant="teal"
                    style={{ flex: 1, justifyContent: "center", padding: "9px 10px", fontSize: 12 }}
                    onClick={() => notificar(c.id)}
                  >
                    <MessageCircle size={14} /> Notificar
                  </Btn>
                )}
              </div>
              <div style={{ marginTop: 12 }}>
                <Badge color={s.c} bg={s.bg}>
                  {s.l}
                </Badge>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
