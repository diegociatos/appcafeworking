import React, { useState } from "react";
import { Bot, Sparkles, Send, Zap, BookOpen, Settings2 } from "lucide-react";
import { Card, Btn, PageHead } from "../components/ui.jsx";
import { C, serif, sans } from "../lib/theme.js";
import { IA_PROMPTS } from "../lib/data.js";

const RESPOSTAS_SIMULADAS = {
  "Quais salas estão livres amanhã às 14h?":
    "Amanhã às 14h estão livres: Sala Master (Luxemburgo · 12 pessoas), Sala Vidro 2 (Estoril · 4 pessoas). Quer que eu reserve uma delas?",
  "Qual lead está mais perto de fechar?":
    "Bruno Lima (Sala Privativa · R$ 2.890/mês) está com 65% de probabilidade. Visita marcada para esta semana. Recomendo enviar a proposta hoje.",
  "Chegou correspondência para Mendes Advocacia?":
    "Sim. Chegou hoje 09:18: Notificação da Receita Federal — marcada como urgente. Carla Mendes já foi notificada por WhatsApp.",
  "Quais clientes estão inadimplentes?":
    "1 cliente: Consultoria RM — R$ 2.890 vencidos há 3 dias. Posso disparar lembrete automático ou gerar nova cobrança via Asaas.",
  "Resumo financeiro da semana":
    "Receita: R$ 5.408 (5 faturas pagas). MRR atual: R$ 184.500. Em aberto: R$ 780. Inadimplência: R$ 2.890.",
  "Qual é o produto mais vendido na cafeteria hoje?":
    "Cappuccino — 18 vendas hoje (R$ 216). Próximos: Espresso (12) e Pão de Queijo (10). Estoque de leite está baixo.",
};

export default function IA() {
  const [pergunta, setPergunta] = useState("");
  const [conversa, setConversa] = useState([
    {
      de: "ia",
      txt: "Olá! Sou a IA do CafeWorking. Posso te ajudar com reservas, leads, correspondências, financeiro e cafeteria. O que precisa?",
    },
  ]);

  const enviar = (texto) => {
    const q = texto || pergunta;
    if (!q.trim()) return;
    const resposta =
      RESPOSTAS_SIMULADAS[q] ||
      "Entendi sua pergunta. No app final, vou estar conectada ao Supabase e responder com dados reais em tempo real.";
    setConversa((c) => [...c, { de: "user", txt: q }, { de: "ia", txt: resposta }]);
    setPergunta("");
  };

  return (
    <div>
      <PageHead
        title="IA CafeWorking"
        sub="Assistente para recepção, comercial e clientes — pergunta sobre reservas, leads, correspondências e finanças."
        action={
          <Btn>
            <Settings2 size={16} /> Treinar IA
          </Btn>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 16 }} className="cw-grid-stack">
        {/* Comandos prontos */}
        <Card>
          <div style={{ fontFamily: serif, fontSize: 19, marginBottom: 14 }}>Perguntas frequentes</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {IA_PROMPTS.map((q, i) => (
              <button
                key={i}
                className="cw-lift cw-btn"
                onClick={() => enviar(q)}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: 12,
                  background: C.cream,
                  border: `1px solid ${C.border2}`,
                  borderRadius: 12,
                  textAlign: "left",
                  fontSize: 13,
                  color: C.text2,
                  fontFamily: sans,
                }}
              >
                <Sparkles size={14} color={C.teal} style={{ marginTop: 2, flexShrink: 0 }} />
                <span>{q}</span>
              </button>
            ))}
          </div>

          <div style={{ marginTop: 18, padding: 14, background: C.tealPale, borderRadius: 12, display: "flex", gap: 10 }}>
            <Zap size={18} color={C.teal} style={{ flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: C.teal2, lineHeight: 1.5 }}>
              <b>Em breve:</b> integração com Botpress e WhatsApp para atendimento 24/7 aos clientes.
            </div>
          </div>
        </Card>

        {/* Chat com a IA */}
        <Card style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 480 }}>
          <div
            style={{
              padding: "14px 20px",
              borderBottom: `1px solid ${C.border2}`,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: `linear-gradient(135deg, ${C.teal}, ${C.cafe})`,
                display: "grid",
                placeItems: "center",
              }}
            >
              <Bot size={18} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Assistente CafeWorking</div>
              <div style={{ fontSize: 12, color: C.green }}>● Online · respondendo em tempo real</div>
            </div>
          </div>
          <div
            style={{
              flex: 1,
              padding: 20,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              background: C.cream,
            }}
          >
            {conversa.map((m, i) => (
              <div
                key={i}
                className="cw-fade"
                style={{
                  alignSelf: m.de === "user" ? "flex-end" : "flex-start",
                  maxWidth: "78%",
                  background: m.de === "user" ? C.teal : "#fff",
                  color: m.de === "user" ? "#fff" : C.text,
                  padding: "12px 16px",
                  borderRadius:
                    m.de === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                  fontSize: 14,
                  lineHeight: 1.5,
                  boxShadow: "0 1px 3px rgba(0,0,0,.04)",
                }}
              >
                {m.de === "ia" && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginBottom: 4,
                      fontSize: 11,
                      color: C.teal,
                      fontWeight: 700,
                      letterSpacing: 0.4,
                    }}
                  >
                    <Sparkles size={11} /> IA
                  </div>
                )}
                {m.txt}
              </div>
            ))}
          </div>
          <div
            style={{
              padding: 14,
              borderTop: `1px solid ${C.border2}`,
              display: "flex",
              gap: 10,
              alignItems: "center",
            }}
          >
            <input
              value={pergunta}
              onChange={(e) => setPergunta(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && enviar()}
              placeholder="Pergunte algo ao CafeWorking..."
              style={{
                flex: 1,
                border: `1px solid ${C.border}`,
                borderRadius: 22,
                padding: "11px 18px",
                fontFamily: sans,
                fontSize: 14,
                outline: "none",
              }}
            />
            <button
              onClick={() => enviar()}
              className="cw-btn"
              style={{
                width: 42,
                height: 42,
                borderRadius: "50%",
                background: C.teal,
                color: "#fff",
                display: "grid",
                placeItems: "center",
              }}
            >
              <Send size={18} />
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
