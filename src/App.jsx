import React, { useState } from "react";
import {
  LayoutDashboard, KanbanSquare, Building2, CalendarDays, Mail, Coffee,
  Users, Wallet, Mic2, MessageSquare, UserCircle, Sparkles, Settings,
  Search, Bell, Wifi, Menu, X,
} from "lucide-react";
import { C, sans, serif } from "./lib/theme.js";
import { Badge } from "./components/ui.jsx";
import Logo from "./components/Logo.jsx";

import Dashboard from "./pages/Dashboard.jsx";
import CRM from "./pages/CRM.jsx";
import Unidades from "./pages/Unidades.jsx";
import Reservas from "./pages/Reservas.jsx";
import Correspondencias from "./pages/Correspondencias.jsx";
import PDV from "./pages/PDV.jsx";
import Clientes from "./pages/Clientes.jsx";
import Financeiro from "./pages/Financeiro.jsx";
import Eventos from "./pages/Eventos.jsx";
import Chat from "./pages/Chat.jsx";
import AreaCliente from "./pages/AreaCliente.jsx";
import IA from "./pages/IA.jsx";
import Configuracoes from "./pages/Configuracoes.jsx";

const NAV = [
  { id: "dash", label: "Dashboard", icon: LayoutDashboard, group: "principal" },
  { id: "crm", label: "CRM · Leads", icon: KanbanSquare, group: "comercial" },
  { id: "unidades", label: "Unidades", icon: Building2, group: "principal" },
  { id: "reservas", label: "Reservas", icon: CalendarDays, group: "operacao" },
  { id: "corresp", label: "Correspondências", icon: Mail, group: "operacao" },
  { id: "pdv", label: "Cafeteria · PDV", icon: Coffee, group: "operacao" },
  { id: "clientes", label: "Clientes", icon: Users, group: "relacionamento" },
  { id: "chat", label: "Chat", icon: MessageSquare, group: "relacionamento", badge: 3 },
  { id: "financeiro", label: "Financeiro", icon: Wallet, group: "financeiro" },
  { id: "eventos", label: "Eventos", icon: Mic2, group: "operacao" },
  { id: "area", label: "Área Cliente", icon: UserCircle, group: "preview" },
  { id: "ia", label: "IA CafeWorking", icon: Sparkles, group: "preview" },
];

const PAGES = {
  dash: Dashboard, crm: CRM, unidades: Unidades, reservas: Reservas,
  corresp: Correspondencias, pdv: PDV, clientes: Clientes,
  financeiro: Financeiro, eventos: Eventos, chat: Chat,
  area: AreaCliente, ia: IA, config: Configuracoes,
};

export default function App() {
  const [page, setPage] = useState("dash");
  const [mobOpen, setMobOpen] = useState(false);
  const Page = PAGES[page] || Dashboard;

  return (
    <div
      style={{
        fontFamily: sans,
        background: C.cream,
        minHeight: "100vh",
        color: C.text,
        display: "flex",
      }}
    >
      <style>{`
        @media (max-width: 1050px) {
          .cw-sidebar { transform: translateX(-100%); position: fixed; z-index: 50; }
          .cw-sidebar.open { transform: translateX(0); }
          .cw-burger { display: flex !important; }
          .cw-grid-stack { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 760px) {
          .cw-search-wrap { display: none !important; }
          .cw-chat-grid { grid-template-columns: 1fr !important; height: auto !important; }
          .cw-content { padding: 18px !important; }
        }
        .cw-nav-btn:hover { background: ${C.cream2}; }
        .cw-nav-btn.active:hover { background: ${C.cafe}; }
      `}</style>

      {/* Sidebar */}
      <aside
        className={`cw-sidebar ${mobOpen ? "open" : ""}`}
        style={{
          width: 268,
          background: "#fff",
          borderRight: `1px solid ${C.border2}`,
          padding: "26px 16px",
          display: "flex",
          flexDirection: "column",
          position: "sticky",
          top: 0,
          height: "100vh",
          flexShrink: 0,
          transition: "transform .25s ease",
          left: 0,
        }}
      >
        <div style={{ padding: "0 6px 22px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Logo size={36} />
          <button
            onClick={() => setMobOpen(false)}
            style={{ display: "none", color: C.text3 }}
            className="cw-mob-close"
          >
            <X size={20} />
          </button>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, overflowY: "auto" }}>
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`cw-nav-btn ${page === n.id ? "active" : ""}`}
              onClick={() => {
                setPage(n.id);
                setMobOpen(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "11px 14px",
                borderRadius: 12,
                fontFamily: sans,
                fontSize: 14,
                fontWeight: 500,
                background: page === n.id ? C.cafe : "transparent",
                color: page === n.id ? "#fff" : C.text2,
                transition: "all .15s",
                textAlign: "left",
                width: "100%",
              }}
            >
              <n.icon size={18} />
              <span style={{ flex: 1 }}>{n.label}</span>
              {n.badge && (
                <span
                  className="cw-pulse"
                  style={{
                    background: page === n.id ? "rgba(255,255,255,.25)" : C.cafe,
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 700,
                    minWidth: 19,
                    height: 19,
                    borderRadius: 10,
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  {n.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div style={{ borderTop: `1px solid ${C.border2}`, paddingTop: 14, marginTop: 14 }}>
          <button
            onClick={() => setPage("config")}
            className={`cw-nav-btn ${page === "config" ? "active" : ""}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              borderRadius: 12,
              fontSize: 14,
              color: page === "config" ? "#fff" : C.text2,
              background: page === "config" ? C.cafe : "transparent",
              width: "100%",
              fontWeight: 500,
            }}
          >
            <Settings size={18} /> Configurações
          </button>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 14px",
              marginTop: 4,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: C.teal,
                color: "#fff",
                display: "grid",
                placeItems: "center",
                fontFamily: serif,
              }}
            >
              A
            </div>
            <div style={{ fontSize: 13 }}>
              <div style={{ fontWeight: 600 }}>Admin Ciatos</div>
              <div style={{ color: C.text3, fontSize: 11 }}>Gestor</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Overlay mobile */}
      {mobOpen && (
        <div
          onClick={() => setMobOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(31,31,28,.4)",
            zIndex: 40,
          }}
        />
      )}

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header
          style={{
            height: 68,
            background: "rgba(247,244,238,.85)",
            backdropFilter: "blur(10px)",
            borderBottom: `1px solid ${C.border2}`,
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "0 28px",
            position: "sticky",
            top: 0,
            zIndex: 20,
          }}
        >
          <button
            className="cw-burger"
            onClick={() => setMobOpen(true)}
            style={{ display: "none", color: C.text2 }}
            aria-label="Menu"
          >
            <Menu size={22} />
          </button>
          <div
            className="cw-search-wrap"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "#fff",
              border: `1px solid ${C.border2}`,
              borderRadius: 12,
              padding: "9px 14px",
              width: 360,
              maxWidth: "40vw",
            }}
          >
            <Search size={17} color={C.text4} />
            <input
              placeholder="Buscar clientes, salas, pedidos, leads..."
              style={{
                border: "none",
                outline: "none",
                fontSize: 14,
                flex: 1,
                background: "transparent",
                color: C.text,
              }}
            />
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
            <button style={{ position: "relative", color: C.text2 }} aria-label="Notificações">
              <Bell size={21} />
              <span
                className="cw-pulse"
                style={{
                  position: "absolute",
                  top: -2,
                  right: -2,
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  background: C.cafe,
                  border: "2px solid #fff",
                }}
              />
            </button>
            <Badge color={C.teal}>
              <Wifi size={11} style={{ marginRight: 4, verticalAlign: -1 }} />2 unidades online
            </Badge>
          </div>
        </header>
        <main
          className="cw-content"
          style={{ padding: 28, flex: 1, maxWidth: 1320, width: "100%" }}
        >
          <Page go={setPage} />
        </main>
      </div>
    </div>
  );
}
