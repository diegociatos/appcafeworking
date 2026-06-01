import React from "react";
import {
  Eye, Briefcase, CalendarDays, Coffee, CreditCard, FileText,
  Download, Mail, MessageSquare, Wallet, Sparkles,
} from "lucide-react";
import { Card, Badge, Btn, PageHead } from "../components/ui.jsx";
import { C, serif, fmt } from "../lib/theme.js";
import { CLIENTES } from "../lib/data.js";

export default function AreaCliente() {
  const cli = CLIENTES[0];
  return (
    <div>
      <PageHead
        title="Área do Cliente"
        sub="Pré-visualização da experiência que o membro acessa pelo portal."
      />
      <div
        style={{
          background: C.teal,
          borderRadius: 18,
          padding: "12px 18px",
          marginBottom: 18,
          display: "flex",
          alignItems: "center",
          gap: 10,
          color: "#fff",
          fontSize: 13,
        }}
      >
        <Eye size={16} /> Você está vendo o painel{" "}
        <b style={{ marginLeft: 4 }}>como o cliente {cli.nome} enxerga</b>. No app final, ele faz
        login e acessa só os próprios dados.
      </div>

      {/* Cards principais */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }} className="cw-grid-stack">
        <Card className="cw-fade cw-fade-1">
          <div style={{ fontFamily: serif, fontSize: 19, marginBottom: 14 }}>Meu plano</div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: 16,
              background: C.cafePale,
              borderRadius: 14,
            }}
          >
            <Briefcase size={28} color={C.cafe} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{cli.plano}</div>
              <div style={{ fontSize: 13, color: C.text3 }}>
                {cli.unidade} · ativo desde {cli.desde}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Btn variant="ghost" style={{ flex: 1, justifyContent: "center", minWidth: 130 }}>
              <CalendarDays size={15} /> Reservar sala
            </Btn>
            <Btn variant="ghost" style={{ flex: 1, justifyContent: "center", minWidth: 130 }}>
              <Coffee size={15} /> Pedir café
            </Btn>
          </div>
        </Card>

        <Card className="cw-fade cw-fade-2">
          <div style={{ fontFamily: serif, fontSize: 19, marginBottom: 14 }}>Próxima fatura</div>
          <div style={{ textAlign: "center", padding: "10px 0" }}>
            <div style={{ fontFamily: serif, fontSize: 34, color: C.cafe }}>{fmt(2890)}</div>
            <div style={{ fontSize: 13, color: C.text3 }}>vence em 05/06/2026</div>
            <Btn variant="teal" style={{ marginTop: 14, justifyContent: "center", width: "100%" }}>
              <CreditCard size={16} /> Pagar agora (Pix)
            </Btn>
          </div>
        </Card>
      </div>

      {/* Atalhos */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        {[
          [CalendarDays, "Minhas reservas", "Agenda e histórico"],
          [Mail, "Correspondências", "Fotos e comprovantes"],
          [Wallet, "Faturas", "Pix, boleto e cartão"],
          [Coffee, "Pedir café", "Retirada ou entrega"],
          [MessageSquare, "Chat recepção", "Atendimento rápido"],
          [Sparkles, "Benefícios Ciatos", "Contabilidade, jurídico, banco"],
        ].map(([Ic, t, s], i) => (
          <Card key={i} className="cw-lift" style={{ cursor: "pointer", padding: 16, textAlign: "left" }}>
            <Ic size={22} color={C.cafe} style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{t}</div>
            <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>{s}</div>
          </Card>
        ))}
      </div>

      {/* Correspondências */}
      <Card>
        <div style={{ fontFamily: serif, fontSize: 19, marginBottom: 14 }}>
          Minhas correspondências (endereço fiscal)
        </div>
        {cli.docs.map((d, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 0",
              borderBottom: i < cli.docs.length - 1 ? `1px solid ${C.border2}` : "none",
            }}
          >
            <FileText size={18} color={C.teal} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{d.nome}</div>
              <div style={{ fontSize: 12, color: C.text3 }}>
                {d.tipo} · {d.data}
              </div>
            </div>
            {d.status === "novo" && (
              <Badge color={C.amber} bg={C.amberPale}>
                Novo
              </Badge>
            )}
            <button style={{ color: C.text4, padding: 6 }}>
              <Download size={17} />
            </button>
          </div>
        ))}
      </Card>
    </div>
  );
}
