import { Clock, ArrowRight, MapPin, MessageSquare, Bell } from "lucide-react";
import { Badge, PageHead, Empty } from "../components/ui.jsx";
import { C, serif } from "../lib/theme.js";
import { useStore } from "../lib/store.jsx";

// Fluxo de preparo na cozinha. Mesma sequência de status do PDV.
const PROX = { recebido: "preparo", preparo: "pronto", pronto: "entregue" };
const COLUNAS = [
  { id: "recebido", label: "Novos", cor: C.blue, acao: "Iniciar preparo" },
  { id: "preparo", label: "Em preparo", cor: C.amber, acao: "Marcar pronto" },
  { id: "pronto", label: "Prontos p/ entrega", cor: C.green, acao: "Entregar" },
];

export default function KDS() {
  const { activeUnit, unidadeAtiva, pedidosDe, updatePedido } = useStore();
  const ativos = pedidosDe(activeUnit).filter((p) => p.status !== "entregue");

  return (
    <div>
      <PageHead
        title="Cozinha · KDS"
        sub={`Painel de preparo da cafeteria${unidadeAtiva?.nome ? ` — ${unidadeAtiva.nome}` : ""}. Avance cada pedido conforme prepara e entrega.`}
      />

      {ativos.length === 0 ? (
        <Empty icon={Bell} title="Sem pedidos na cozinha" sub="Pedidos do app e do balcão (PDV) aparecem aqui assim que entram." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16, alignItems: "start" }}>
          {COLUNAS.map((col) => {
            const fila = ativos.filter((p) => p.status === col.id);
            return (
              <div key={col.id} style={{ background: C.surface || "#fafafa", border: `1px solid ${C.border2}`, borderRadius: 16, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: `2px solid ${col.cor}`, background: `${col.cor}10` }}>
                  <span style={{ fontFamily: serif, fontSize: 17, color: C.text }}>{col.label}</span>
                  <Badge color={col.cor} bg={`${col.cor}1a`}>{fila.length}</Badge>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 14, minHeight: 80 }}>
                  {fila.length === 0 ? (
                    <div style={{ fontSize: 12.5, color: C.text4, textAlign: "center", padding: "18px 0" }}>—</div>
                  ) : (
                    fila.map((p) => {
                      const novo = p.status === "recebido";
                      return (
                        <div key={p.id} style={{ border: `1px solid ${novo ? col.cor : C.border2}`, borderRadius: 14, padding: 14, background: "#fff", boxShadow: novo ? `0 0 0 3px ${col.cor}14` : "none" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                            <div style={{ fontSize: 15, fontWeight: 700 }}>{p.cliente || "Balcão"}</div>
                            <span style={{ fontSize: 11, color: C.text3, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
                              <Clock size={11} /> {p.hora || "agora"}{p.origem ? ` · ${p.origem}` : ""}
                            </span>
                          </div>

                          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                            {(p.itens || []).map((i, k) => (
                              <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15 }}>
                                <span style={{ fontFamily: serif, fontSize: 16, color: col.cor, minWidth: 26 }}>{i.q || 1}×</span>
                                <span style={{ fontWeight: 600 }}>{i.emoji ? `${i.emoji} ` : ""}{i.nome}</span>
                              </div>
                            ))}
                          </div>

                          {(p.entregaLocal === "sala" || p.observacao) && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                              {p.entregaLocal === "sala" && (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: C.teal, background: C.tealPale || `${C.teal}14`, padding: "4px 8px", borderRadius: 8 }}>
                                  <MapPin size={12} /> Levar na {p.salaNome || "sala"}
                                </span>
                              )}
                              {p.observacao && (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: C.amber, background: C.amberPale || `${C.amber}14`, padding: "4px 8px", borderRadius: 8 }}>
                                  <MessageSquare size={12} /> {p.observacao}
                                </span>
                              )}
                            </div>
                          )}

                          <button
                            onClick={() => updatePedido(p.id, { status: PROX[p.status] })}
                            className="cw-btn"
                            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "11px 0", borderRadius: 11, border: "none", background: col.cor, color: "#fff", fontWeight: 700, fontSize: 14 }}
                          >
                            {col.acao} <ArrowRight size={15} />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
