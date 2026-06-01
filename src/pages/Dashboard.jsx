import React from "react";
import {
  DollarSign, Users, CalendarDays, Coffee, TrendingUp, CircleDot,
  MapPin, ArrowUpRight, Building2, AlertCircle, Mail, DoorOpen, Target,
  Sparkles, Receipt, FileCheck, Wallet,
} from "lucide-react";
import { Card, Badge, Btn, PageHead } from "../components/ui.jsx";
import { C, serif, fmt, fmtShort } from "../lib/theme.js";
import { UNIDADES, ALERTAS } from "../lib/data.js";

const ICONS = { fatura: Receipt, corresp: Mail, sala: DoorOpen, lead: Target };

export default function Dashboard({ go }) {
  const totalReceita = UNIDADES.reduce((s, u) => s + u.receita, 0);
  const totalMembros = UNIDADES.reduce((s, u) => s + u.membros, 0);

  const stats = [
    { label: "Receita do mês", val: fmtShort(totalReceita), delta: "+12,4% no mês", icon: DollarSign, cor: C.green },
    { label: "Membros ativos", val: totalMembros, delta: "+8 novos", icon: Users, cor: C.teal },
    { label: "Reservas hoje", val: 18, delta: "5 salas em uso", icon: CalendarDays, cor: C.cafe },
    { label: "Cafeteria hoje", val: fmtShort(2840), delta: "47 pedidos", icon: Coffee, cor: C.amber },
  ];

  // Sparkline procedural (12 meses)
  const sparkData = [42, 55, 48, 67, 60, 78, 72, 88, 82, 95, 90, 100];

  return (
    <div>
      <PageHead
        title="Centro de Comando"
        sub="Operação, vendas, cafeteria, reservas e experiência do cliente em uma única visão."
        action={
          <Btn variant="teal" onClick={() => go("ia")}>
            <Sparkles size={16} /> Abrir IA
          </Btn>
        }
      />

      {/* KPIs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: 16,
          marginBottom: 22,
        }}
      >
        {stats.map((s, i) => (
          <Card key={i} className={`cw-fade cw-fade-${i + 1}`}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 13, color: C.text3, marginBottom: 8 }}>{s.label}</div>
                <div style={{ fontFamily: serif, fontSize: 28, color: C.text, lineHeight: 1 }}>{s.val}</div>
              </div>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  background: `${s.cor}16`,
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <s.icon size={20} color={s.cor} />
              </div>
            </div>
            <div
              style={{
                marginTop: 12,
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 12,
                color: s.cor,
                fontWeight: 600,
              }}
            >
              <TrendingUp size={13} /> {s.delta}
            </div>
          </Card>
        ))}
      </div>

      {/* Gráfico + Alertas inteligentes */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.6fr 1fr",
          gap: 16,
          marginBottom: 22,
        }}
        className="cw-grid-stack"
      >
        <Card className="cw-fade cw-fade-2">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18 }}>
            <div>
              <div style={{ fontFamily: serif, fontSize: 20, color: C.text }}>Receita por unidade</div>
              <div style={{ fontSize: 13, color: C.text3 }}>Últimos 12 meses</div>
            </div>
            <Badge color={C.green}>+12,4% no período</Badge>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 6,
              height: 160,
              padding: "0 4px",
            }}
          >
            {sparkData.map((h, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-end",
                  gap: 3,
                }}
              >
                <div
                  style={{
                    height: `${h}%`,
                    background: `linear-gradient(180deg,${C.cafe},${C.cafe3})`,
                    borderRadius: "4px 4px 0 0",
                    transition: "all .3s",
                  }}
                />
                <div
                  style={{
                    height: `${h * 0.6}%`,
                    background: `linear-gradient(180deg,${C.teal2},${C.teal3})`,
                    borderRadius: "0 0 4px 4px",
                    opacity: 0.9,
                  }}
                />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 20, marginTop: 14, fontSize: 12, color: C.text3 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <CircleDot size={11} color={C.cafe} /> Luxemburgo
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <CircleDot size={11} color={C.teal2} /> Estoril
            </span>
          </div>
        </Card>

        <Card className="cw-fade cw-fade-3">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontFamily: serif, fontSize: 20, color: C.text }}>Alertas inteligentes</div>
            <Badge color={C.amber}>4 ativos</Badge>
          </div>
          {ALERTAS.map((a, i) => {
            const Ic = ICONS[a.tipo] || AlertCircle;
            return (
              <div
                key={a.id}
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "11px 0",
                  borderBottom: i < ALERTAS.length - 1 ? `1px solid ${C.border2}` : "none",
                  cursor: "pointer",
                }}
                onClick={() =>
                  go(a.tipo === "fatura" ? "financeiro" : a.tipo === "corresp" ? "corresp" : a.tipo === "lead" ? "crm" : "reservas")
                }
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: `${a.cor}14`,
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <Ic size={17} color={a.cor} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, color: C.text, fontWeight: 600 }}>{a.titulo}</div>
                  <div style={{ fontSize: 12, color: C.text3, lineHeight: 1.4 }}>{a.sub}</div>
                </div>
                <ArrowUpRight size={15} color={C.text4} style={{ flexShrink: 0, marginTop: 8 }} />
              </div>
            );
          })}
        </Card>
      </div>

      {/* Unidades */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 16 }}>
        {UNIDADES.map((u, i) => (
          <Card
            key={u.id}
            className={`cw-fade cw-fade-${i + 3}`}
            style={{ cursor: "pointer" }}
            onClick={() => go("unidades")}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: `${u.cor}16`,
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <Building2 size={22} color={u.cor} />
                </div>
                <div>
                  <div style={{ fontFamily: serif, fontSize: 19, color: C.text }}>{u.nome}</div>
                  <div
                    style={{
                      fontSize: 12,
                      color: C.text3,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <MapPin size={11} /> {u.endereco}
                  </div>
                </div>
              </div>
              <ArrowUpRight size={18} color={C.text4} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8 }}>
              <span style={{ color: C.text3 }}>Ocupação</span>
              <span style={{ color: C.text, fontWeight: 600 }}>{u.ocupacao}%</span>
            </div>
            <div style={{ height: 7, background: C.cream2, borderRadius: 10, overflow: "hidden" }}>
              <div
                style={{
                  width: `${u.ocupacao}%`,
                  height: "100%",
                  background: `linear-gradient(90deg,${u.cor},${u.cor}aa)`,
                  borderRadius: 10,
                  transition: "width .6s",
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, fontSize: 13 }}>
              <div>
                <span style={{ color: C.text3 }}>Salas </span>
                <b>{u.salas}</b>
              </div>
              <div>
                <span style={{ color: C.text3 }}>Membros </span>
                <b>{u.membros}</b>
              </div>
              <div>
                <span style={{ color: C.text3 }}>Receita </span>
                <b>{fmtShort(u.receita)}</b>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
