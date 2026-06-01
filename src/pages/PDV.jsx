import React, { useState } from "react";
import {
  Coffee, Plus, Minus, ShoppingCart, QrCode, CreditCard, Banknote,
  CheckCircle2, TrendingUp, Percent, Box,
} from "lucide-react";
import { Card, Badge, Btn, PageHead, Empty } from "../components/ui.jsx";
import { C, serif, fmt } from "../lib/theme.js";
import { PRODUTOS } from "../lib/data.js";

export default function PDV() {
  const [cart, setCart] = useState([]);
  const [cat, setCat] = useState("Todos");
  const [pago, setPago] = useState(null);
  const cats = ["Todos", ...new Set(PRODUTOS.map((p) => p.cat))];
  const prods = cat === "Todos" ? PRODUTOS : PRODUTOS.filter((p) => p.cat === cat);

  const add = (p) =>
    setCart((c) => {
      const f = c.find((i) => i.id === p.id);
      return f ? c.map((i) => (i.id === p.id ? { ...i, q: i.q + 1 } : i)) : [...c, { ...p, q: 1 }];
    });
  const sub = (id) =>
    setCart((c) => c.map((i) => (i.id === id ? { ...i, q: i.q - 1 } : i)).filter((i) => i.q > 0));

  const total = cart.reduce((s, i) => s + i.preco * i.q, 0);
  const totalCMV = cart.reduce((s, i) => s + i.cmv * i.q, 0);
  const margem = total > 0 ? ((total - totalCMV) / total) * 100 : 0;

  return (
    <div>
      <PageHead title="Cafeteria · PDV" sub="Ponto de venda da cafeteria, com gestão de margem em tempo real." />

      {/* KPIs operacionais (vindo da GPT) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        {[
          { l: "Vendas hoje", v: fmt(2840), s: "47 pedidos", ic: TrendingUp, c: C.green },
          { l: "Ticket médio", v: fmt(60.42), s: "+R$ 4,20 vs ontem", ic: Coffee, c: C.cafe },
          { l: "Margem média", v: "69%", s: "CMV estimado 31%", ic: Percent, c: C.teal },
          { l: "Estoque baixo", v: "2", s: "Leite, copos 200ml", ic: Box, c: C.amber },
        ].map((k, i) => (
          <Card key={i} className={`cw-fade cw-fade-${i + 1}`} style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 12, color: C.text3 }}>{k.l}</div>
                <div style={{ fontFamily: serif, fontSize: 22, color: C.text, marginTop: 4 }}>{k.v}</div>
                <div style={{ fontSize: 11, color: C.text3, marginTop: 4 }}>{k.s}</div>
              </div>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: `${k.c}14`,
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <k.ic size={17} color={k.c} />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16 }} className="cw-grid-stack">
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {cats.map((c) => (
              <button
                key={c}
                className="cw-btn"
                onClick={() => setCat(c)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 20,
                  fontSize: 13,
                  fontWeight: 600,
                  border: `1px solid ${cat === c ? C.cafe : C.border}`,
                  background: cat === c ? C.cafe : C.white,
                  color: cat === c ? "#fff" : C.text2,
                }}
              >
                {c}
              </button>
            ))}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))",
              gap: 12,
            }}
          >
            {prods.map((p) => (
              <button
                key={p.id}
                className="cw-lift cw-btn"
                onClick={() => add(p)}
                style={{
                  background: C.white,
                  border: `1px solid ${C.border2}`,
                  borderRadius: 16,
                  padding: 16,
                  textAlign: "left",
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 8 }}>{p.emoji}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{p.nome}</div>
                <div style={{ fontSize: 12, color: C.text3, marginBottom: 6 }}>{p.cat}</div>
                <div style={{ fontFamily: serif, fontSize: 17, color: C.cafe }}>{fmt(p.preco)}</div>
              </button>
            ))}
          </div>
        </div>

        <Card style={{ position: "sticky", top: 90, alignSelf: "start", padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "18px 20px",
              borderBottom: `1px solid ${C.border2}`,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <ShoppingCart size={18} color={C.cafe} />
            <span style={{ fontFamily: serif, fontSize: 19 }}>Comanda</span>
            {cart.length > 0 && (
              <Badge color={C.cafe}>{cart.reduce((s, i) => s + i.q, 0)} itens</Badge>
            )}
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto", padding: cart.length ? 12 : 0 }}>
            {cart.length === 0 ? (
              <Empty icon={Coffee} title="Comanda vazia" sub="Toque nos produtos para adicionar" />
            ) : (
              cart.map((i) => (
                <div
                  key={i.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 8px",
                    borderBottom: `1px solid ${C.border2}`,
                  }}
                >
                  <span style={{ fontSize: 22 }}>{i.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{i.nome}</div>
                    <div style={{ fontSize: 12, color: C.text3 }}>{fmt(i.preco)}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      onClick={() => sub(i.id)}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 8,
                        background: C.cream2,
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      <Minus size={14} />
                    </button>
                    <span style={{ width: 18, textAlign: "center", fontWeight: 600 }}>{i.q}</span>
                    <button
                      onClick={() => add(i)}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 8,
                        background: C.cafePale,
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      <Plus size={14} color={C.cafe} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          {cart.length > 0 && (
            <div style={{ padding: 18, background: C.cream, borderTop: `1px solid ${C.border2}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.text3, marginBottom: 4 }}>
                <span>Margem nesta venda</span>
                <span style={{ color: C.green, fontWeight: 700 }}>{margem.toFixed(0)}%</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
                <span style={{ fontSize: 15, color: C.text3 }}>Total</span>
                <span style={{ fontFamily: serif, fontSize: 26, color: C.cafe }}>{fmt(total)}</span>
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                {[
                  [QrCode, "Pix"],
                  [CreditCard, "Cartão"],
                  [Banknote, "Dinheiro"],
                ].map(([Ic, l]) => (
                  <button
                    key={l}
                    onClick={() => setPago(l)}
                    style={{
                      flex: 1,
                      padding: "10px 0",
                      borderRadius: 10,
                      border: `1px solid ${pago === l ? C.cafe : C.border}`,
                      background: pago === l ? C.cafePale : C.white,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 12,
                      color: pago === l ? C.cafe : C.text2,
                      fontWeight: 600,
                    }}
                  >
                    <Ic size={18} /> {l}
                  </button>
                ))}
              </div>
              <Btn
                style={{
                  width: "100%",
                  justifyContent: "center",
                  padding: "14px",
                  opacity: pago ? 1 : 0.5,
                }}
                disabled={!pago}
                onClick={() => {
                  if (pago) {
                    setCart([]);
                    setPago(null);
                  }
                }}
              >
                <CheckCircle2 size={18} /> Finalizar venda
              </Btn>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
