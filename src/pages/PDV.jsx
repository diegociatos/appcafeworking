import { useState, useEffect } from "react";
import {
  Coffee, Plus, Minus, ShoppingCart, QrCode, CreditCard, Banknote,
  CheckCircle2, TrendingUp, Percent, Box, Bell, Clock, Smartphone, ArrowRight,
} from "lucide-react";
import { Card, Badge, Btn, PageHead, Empty, Modal } from "../components/ui.jsx";
import { C, serif, fmt } from "../lib/theme.js";
import { useStore } from "../lib/store.jsx";

// fluxo de status do pedido recebido do app
const PROX_STATUS = { recebido: "preparo", preparo: "pronto", pronto: "entregue" };
const STATUS_INFO = {
  recebido: { label: "Novo pedido", cor: C.blue, acao: "Aceitar e preparar" },
  preparo: { label: "Em preparo", cor: C.amber, acao: "Marcar como pronto" },
  pronto: { label: "Pronto p/ retirada", cor: C.green, acao: "Entregar" },
};

export default function PDV() {
  const { activeUnit, unidadeAtiva, produtosDe, pedidosDe, addPedido, updatePedido, estoqueBaixoDe } = useStore();
  const [cart, setCart] = useState([]);
  const [cat, setCat] = useState("Todos");
  const [pago, setPago] = useState(null);
  const [vendaOk, setVendaOk] = useState(null); // { total } após finalizar

  // KPIs reais (do banco) — zeram quando ainda não há vendas/produtos.
  const pedidosUnidade = pedidosDe(activeUnit);
  const vendasHoje = pedidosUnidade.reduce((s, p) => s + (p.total || 0), 0);
  const ticketMedio = pedidosUnidade.length ? vendasHoje / pedidosUnidade.length : 0;
  const baixo = estoqueBaixoDe ? estoqueBaixoDe(activeUnit) : [];

  const produtosUnidade = produtosDe(activeUnit).filter((p) => p.ativo !== false);
  const pedidosAtivos = pedidosDe(activeUnit).filter((p) => p.status !== "entregue");
  const novos = pedidosAtivos.filter((p) => p.status === "recebido").length;
  const cats = ["Todos", ...new Set(produtosUnidade.map((p) => p.cat))];
  const prods = cat === "Todos" ? produtosUnidade : produtosUnidade.filter((p) => p.cat === cat);

  // Trocar de unidade zera a comanda (não se mistura venda entre unidades)
  useEffect(() => {
    setCart([]);
    setPago(null);
    setCat("Todos");
  }, [activeUnit]);

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

  const finalizarVenda = () => {
    if (!pago || !cart.length) return;
    addPedido(activeUnit, {
      origem: "balcao",
      status: "entregue",
      cliente: "Balcão",
      formaPagamento: pago,
      itens: cart.map((i) => ({ nome: i.nome, preco: i.preco, q: i.q, emoji: i.emoji, cmv: i.cmv })),
      total,
      cmvTotal: totalCMV,
      hora: "agora",
      createdAt: new Date().toISOString(),
    });
    setVendaOk({ total });
    setCart([]);
    setPago(null);
  };

  return (
    <div>
      <PageHead
        title="Cafeteria · PDV"
        sub={`Cafeteria da unidade ${unidadeAtiva?.nome || ""} · gestão de margem em tempo real.`}
      />

      {/* KPIs operacionais (vindo da GPT) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        {(() => {
          const m = produtosUnidade.filter((p) => p.preco > 0).map((p) => 1 - (p.cmv || 0) / p.preco);
          const margem = m.length ? Math.round((m.reduce((a, b) => a + b, 0) / m.length) * 100) : 0;
          return [
            { l: "Vendas hoje", v: fmt(vendasHoje), s: `${pedidosUnidade.length} pedido(s)`, ic: TrendingUp, c: C.green },
            { l: "Ticket médio", v: fmt(ticketMedio), s: pedidosUnidade.length ? "por pedido" : "sem vendas", ic: Coffee, c: C.cafe },
            { l: "Margem média", v: `${margem}%`, s: `CMV estimado ${100 - margem}%`, ic: Percent, c: C.teal },
            { l: "Estoque baixo", v: String(baixo.length), s: baixo.slice(0, 3).map((x) => x.nome).join(", ") || "tudo ok", ic: Box, c: C.amber },
          ];
        })().map((k, i) => (
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

      {/* Pedidos recebidos do app (chegam na recepção) */}
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border2}`, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ position: "relative" }}>
            <Smartphone size={20} color={C.cafe} />
            {novos > 0 && <span className="cw-pulse" style={{ position: "absolute", top: -4, right: -5, width: 9, height: 9, borderRadius: "50%", background: C.red, border: "2px solid #fff" }} />}
          </div>
          <span style={{ fontFamily: serif, fontSize: 18 }}>Pedidos recebidos do app</span>
          {pedidosAtivos.length > 0 && <Badge color={C.cafe}>{pedidosAtivos.length} em aberto</Badge>}
          {novos > 0 && <Badge color={C.red} bg={C.redPale}>{novos} novo{novos > 1 ? "s" : ""}</Badge>}
        </div>
        {pedidosAtivos.length === 0 ? (
          <Empty icon={Bell} title="Nenhum pedido na fila" sub="Pedidos feitos pelos clientes no app aparecem aqui." />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 12, padding: 14 }}>
            {pedidosAtivos.map((p) => {
              const si = STATUS_INFO[p.status] || STATUS_INFO.recebido;
              return (
                <div key={p.id} style={{ border: `1px solid ${p.status === "recebido" ? si.cor : C.border2}`, borderRadius: 14, padding: 14, background: p.status === "recebido" ? `${si.cor}0d` : "#fff" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{p.cliente}</div>
                      <div style={{ fontSize: 11, color: C.text3, display: "flex", alignItems: "center", gap: 4 }}><Clock size={11} /> {p.hora} · app</div>
                    </div>
                    <Badge color={si.cor} bg={`${si.cor}1a`}>{si.label}</Badge>
                  </div>
                  <div style={{ fontSize: 13, color: C.text2, marginBottom: 10 }}>
                    {p.itens.map((i, k) => (
                      <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                        <span>{i.emoji} {i.q}× {i.nome}</span>
                        <span style={{ color: C.text3 }}>{fmt(i.preco * i.q)}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${C.border2}`, paddingTop: 10 }}>
                    <span style={{ fontFamily: serif, fontSize: 17, color: C.cafe }}>{fmt(p.total)}</span>
                    <Btn
                      onClick={() => updatePedido(p.id, { status: PROX_STATUS[p.status] })}
                      style={{ padding: "8px 12px", fontSize: 13, background: si.cor }}
                    >
                      {si.acao} <ArrowRight size={14} />
                    </Btn>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

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
          {produtosUnidade.length === 0 && (
            <Empty
              icon={Coffee}
              title="Cafeteria sem produtos"
              sub={`Cadastre os produtos da unidade ${unidadeAtiva?.nome || ""} em Unidades → Gerenciar → Cafeteria.`}
            />
          )}
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
                {p.foto ? (
                  <img
                    src={p.foto}
                    alt={p.nome}
                    onError={(e) => (e.currentTarget.style.display = "none")}
                    style={{ width: "100%", height: 92, objectFit: "cover", borderRadius: 10, marginBottom: 8, background: C.cream2 }}
                  />
                ) : (
                  <div style={{ fontSize: 32, marginBottom: 8 }}>{p.emoji}</div>
                )}
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
                  {i.foto ? (
                    <img
                      src={i.foto}
                      alt={i.nome}
                      onError={(e) => (e.currentTarget.style.display = "none")}
                      style={{ width: 30, height: 30, borderRadius: 7, objectFit: "cover", background: C.cream2 }}
                    />
                  ) : (
                    <span style={{ fontSize: 22 }}>{i.emoji}</span>
                  )}
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
                onClick={finalizarVenda}
              >
                <CheckCircle2 size={18} /> Finalizar venda
              </Btn>
            </div>
          )}
        </Card>
      </div>

      {vendaOk && (
        <Modal title="Venda registrada ✓" onClose={() => setVendaOk(null)} maxWidth={380}>
          <div style={{ textAlign: "center", padding: "6px 0" }}>
            <CheckCircle2 size={46} color={C.green} />
            <div style={{ fontFamily: serif, fontSize: 24, color: C.cafe, marginTop: 10 }}>{fmt(vendaOk.total)}</div>
            <div style={{ fontSize: 13, color: C.text3, marginTop: 4, marginBottom: 16 }}>
              Pedido de balcão lançado: estoque baixado, receita e CMV no financeiro.
            </div>
            <Btn style={{ width: "100%", justifyContent: "center" }} onClick={() => setVendaOk(null)}>Nova venda</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
