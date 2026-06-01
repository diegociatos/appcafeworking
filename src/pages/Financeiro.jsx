import React from "react";
import {
  Plus, Wallet, Clock, TrendingDown, Receipt, ShieldCheck, Zap,
  MoreVertical, CreditCard,
} from "lucide-react";
import { Card, Badge, Btn, PageHead } from "../components/ui.jsx";
import { C, serif, fmt } from "../lib/theme.js";
import { FATURAS } from "../lib/data.js";

export default function Financeiro() {
  const recebido = FATURAS.filter((f) => f.status === "pago").reduce((s, f) => s + f.valor, 0);
  const aberto = FATURAS.filter((f) => f.status === "aberto").reduce((s, f) => s + f.valor, 0);
  const vencido = FATURAS.filter((f) => f.status === "vencido").reduce((s, f) => s + f.valor, 0);
  const mrr = 184500; // soma de mensalidades recorrentes

  const cards = [
    { label: "Recebido no mês", val: fmt(recebido), icon: Wallet, cor: C.green, sub: "Pagamentos confirmados" },
    { label: "Em aberto", val: fmt(aberto), icon: Clock, cor: C.amber, sub: "Aguardando vencimento" },
    { label: "Inadimplência", val: fmt(vencido), icon: TrendingDown, cor: C.red, sub: "Acionar cobrança" },
    { label: "MRR (recorrente)", val: fmt(mrr), icon: ShieldCheck, cor: C.teal, sub: "Receita previsível" },
  ];
  const sc = {
    pago: [C.green, C.greenPale, "Pago"],
    aberto: [C.amber, C.amberPale, "Em aberto"],
    vencido: [C.red, C.redPale, "Vencido"],
  };

  return (
    <div>
      <PageHead
        title="Financeiro"
        sub="Cobranças, recorrência, inadimplência e integração futura com Asaas (Pix/boleto/cartão)."
        action={
          <Btn>
            <CreditCard size={16} /> Gerar cobrança
          </Btn>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
          gap: 16,
          marginBottom: 22,
        }}
      >
        {cards.map((c, i) => (
          <Card key={i} className={`cw-fade cw-fade-${i + 1}`}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 13, color: C.text3, marginBottom: 8 }}>{c.label}</div>
                <div style={{ fontFamily: serif, fontSize: 24, color: C.text, lineHeight: 1 }}>
                  {c.val}
                </div>
                <div style={{ fontSize: 11, color: C.text3, marginTop: 6 }}>{c.sub}</div>
              </div>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  background: `${c.cor}16`,
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <c.icon size={20} color={c.cor} />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Automações futuras */}
      <Card style={{ marginBottom: 22, background: C.tealPale, border: `1px solid ${C.tealLine}` }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: C.teal,
              display: "grid",
              placeItems: "center",
            }}
          >
            <Zap size={22} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: serif, fontSize: 18, color: C.teal }}>
              4 automações de cobrança ativas
            </div>
            <div style={{ fontSize: 13, color: C.teal2 }}>
              Pix, boleto, lembrete de vencimento por e-mail e WhatsApp · integração Asaas (planejada)
            </div>
          </div>
          <Btn variant="teal" style={{ background: C.teal }}>
            Configurar
          </Btn>
        </div>
      </Card>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            padding: "16px 20px",
            borderBottom: `1px solid ${C.border2}`,
            fontFamily: serif,
            fontSize: 19,
          }}
        >
          Faturas recentes
        </div>
        {FATURAS.map((f, i) => (
          <div
            key={f.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: 16,
              borderBottom: i < FATURAS.length - 1 ? `1px solid ${C.border2}` : "none",
            }}
          >
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 11,
                background: C.cafePale,
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <Receipt size={19} color={C.cafe} />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{f.cliente}</div>
              <div style={{ fontSize: 12, color: C.text3 }}>
                {f.plano} · vence {f.venc}
              </div>
            </div>
            <div style={{ fontFamily: serif, fontSize: 18, color: C.text }}>{fmt(f.valor)}</div>
            <Badge color={sc[f.status][0]} bg={sc[f.status][1]}>
              {sc[f.status][2]}
            </Badge>
            <button style={{ color: C.text4, padding: 6 }}>
              <MoreVertical size={18} />
            </button>
          </div>
        ))}
      </Card>
    </div>
  );
}
