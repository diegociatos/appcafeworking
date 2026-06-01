import React, { useState, useRef, useEffect } from "react";
import { Send, Paperclip } from "lucide-react";
import { Card, PageHead } from "../components/ui.jsx";
import { C, serif, sans } from "../lib/theme.js";
import { CHATS_INIT } from "../lib/data.js";

export default function Chat() {
  const [chats, setChats] = useState(CHATS_INIT);
  const [sel, setSel] = useState(CHATS_INIT[0].id);
  const [txt, setTxt] = useState("");
  const endRef = useRef(null);
  const atual = chats.find((c) => c.id === sel);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sel, chats]);

  const enviar = () => {
    if (!txt.trim()) return;
    setChats((cs) =>
      cs.map((c) =>
        c.id === sel ? { ...c, msgs: [...c.msgs, { de: "adm", txt, h: "Agora" }] } : c
      )
    );
    setTxt("");
  };

  return (
    <div>
      <PageHead title="Chat com clientes" sub="Central de atendimento da recepção, com integração futura ao WhatsApp." />
      <Card
        style={{
          padding: 0,
          overflow: "hidden",
          display: "grid",
          gridTemplateColumns: "280px 1fr",
          height: 560,
        }}
        className="cw-chat-grid"
      >
        {/* Lista */}
        <div style={{ borderRight: `1px solid ${C.border2}`, overflowY: "auto", background: C.cream }}>
          {chats.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setSel(c.id);
                setChats((cs) =>
                  cs.map((x) => (x.id === c.id ? { ...x, unread: 0 } : x))
                );
              }}
              style={{
                width: "100%",
                textAlign: "left",
                padding: 16,
                borderBottom: `1px solid ${C.border2}`,
                background: sel === c.id ? "#fff" : "transparent",
                display: "flex",
                gap: 12,
                alignItems: "center",
                fontFamily: sans,
              }}
            >
              <div style={{ position: "relative" }}>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: "50%",
                    background: `${C.cafe}20`,
                    display: "grid",
                    placeItems: "center",
                    fontFamily: serif,
                    fontSize: 17,
                    color: C.cafe,
                  }}
                >
                  {c.cliente[0]}
                </div>
                {c.online && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: 0,
                      right: 0,
                      width: 11,
                      height: 11,
                      borderRadius: "50%",
                      background: C.green,
                      border: "2px solid #fff",
                    }}
                  />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{c.cliente}</div>
                <div
                  style={{
                    fontSize: 12,
                    color: C.text3,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {c.msgs[c.msgs.length - 1]?.txt}
                </div>
              </div>
              {c.unread > 0 && (
                <span
                  className="cw-pulse"
                  style={{
                    background: C.cafe,
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 700,
                    minWidth: 20,
                    height: 20,
                    borderRadius: 10,
                    display: "grid",
                    placeItems: "center",
                    padding: "0 6px",
                  }}
                >
                  {c.unread}
                </span>
              )}
            </button>
          ))}
        </div>
        {/* Conversa */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              padding: "14px 20px",
              borderBottom: `1px solid ${C.border2}`,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: "50%",
                background: `${C.cafe}20`,
                display: "grid",
                placeItems: "center",
                fontFamily: serif,
                color: C.cafe,
              }}
            >
              {atual.cliente[0]}
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{atual.cliente}</div>
              <div
                style={{ fontSize: 12, color: atual.online ? C.green : C.text3 }}
              >
                {atual.online ? "● Online" : "Offline"} · {atual.empresa}
              </div>
            </div>
          </div>
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 20,
              background: C.cream,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {atual.msgs.map((m, i) => (
              <div
                key={i}
                className="cw-fade"
                style={{ alignSelf: m.de === "adm" ? "flex-end" : "flex-start", maxWidth: "72%" }}
              >
                <div
                  style={{
                    background: m.de === "adm" ? C.teal : "#fff",
                    color: m.de === "adm" ? "#fff" : C.text,
                    padding: "10px 14px",
                    borderRadius:
                      m.de === "adm" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                    fontSize: 14,
                    boxShadow: "0 1px 3px rgba(0,0,0,.05)",
                  }}
                >
                  {m.txt}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: C.text4,
                    marginTop: 3,
                    textAlign: m.de === "adm" ? "right" : "left",
                  }}
                >
                  {m.h}
                </div>
              </div>
            ))}
            <div ref={endRef} />
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
            <button style={{ color: C.text4 }} aria-label="Anexar">
              <Paperclip size={20} />
            </button>
            <input
              value={txt}
              onChange={(e) => setTxt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && enviar()}
              placeholder="Escreva uma mensagem..."
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
              onClick={enviar}
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
        </div>
      </Card>
    </div>
  );
}
