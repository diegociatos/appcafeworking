import React, { useState, useEffect } from "react";
import {
  LayoutDashboard, KanbanSquare, Building2, CalendarDays, Mail, Coffee,
  Users, Wallet, Mic2, MessageSquare, UserCircle, Settings,
  Search, Bell, Menu, X, ChevronDown, Check, Store, Eye, LogOut, ShieldCheck, Package, Home, FileText, Barcode, Boxes, Landmark,
} from "lucide-react";
import { C, sans, serif } from "./lib/theme.js";
import { useStore, PERFIS } from "./lib/store.jsx";
import Logo from "./components/Logo.jsx";
import Login from "./pages/Login.jsx";
import { supabaseConfigured, getSession, onAuthChange, signOut } from "./lib/supabaseAuth.js";
import { fetchMemberships, fetchTenant, fetchAppState, fetchBoletosDb, fetchNotasDb, fetchConfigFiscalDb, fetchIsPlatformAdmin } from "./lib/supabaseDb.js";

import Dashboard from "./pages/Dashboard.jsx";
import CRM from "./pages/CRM.jsx";
import Unidades from "./pages/Unidades.jsx";
import Franqueados from "./pages/Franqueados.jsx";
import Reservas from "./pages/Reservas.jsx";
import Correspondencias from "./pages/Correspondencias.jsx";
import PDV from "./pages/PDV.jsx";
import Clientes from "./pages/Clientes.jsx";
import Financeiro, { FIN_GRUPOS } from "./pages/Financeiro.jsx";
import Boletos from "./pages/Boletos.jsx";
import NotaFiscal from "./pages/NotaFiscal.jsx";
import Cobrancas from "./pages/Cobrancas.jsx";
import { CreditCard } from "lucide-react";
import Estoque from "./pages/Estoque.jsx";
import Patrimonio from "./pages/Patrimonio.jsx";
import Eventos from "./pages/Eventos.jsx";
import Chat from "./pages/Chat.jsx";
import AreaCliente from "./pages/AreaCliente.jsx";
import Equipe from "./pages/Equipe.jsx";
import Catalogo from "./pages/Catalogo.jsx";
import Configuracoes from "./pages/Configuracoes.jsx";

const NAV = [
  { id: "dash", label: "Dashboard", icon: LayoutDashboard, group: "principal" },
  { id: "franqueados", label: "Contas", icon: Store, group: "comercial" },
  { id: "crm", label: "CRM · Leads", icon: KanbanSquare, group: "comercial" },
  { id: "unidades", label: "Unidades", icon: Building2, group: "gestao" },
  { id: "equipe", label: "Equipe", icon: ShieldCheck, group: "gestao" },
  { id: "patrimonio", label: "Patrimônio", icon: Landmark, group: "gestao" },
  { id: "reservas", label: "Reservas", icon: CalendarDays, group: "operacao" },
  { id: "corresp", label: "Correspondências", icon: Mail, group: "operacao" },
  { id: "pdv", label: "Cafeteria · PDV", icon: Coffee, group: "operacao" },
  { id: "catalogo", label: "Produtos e Serviços", icon: Package, group: "operacao" },
  { id: "estoque", label: "Estoque", icon: Boxes, group: "operacao" },
  { id: "eventos", label: "Eventos", icon: Mic2, group: "operacao" },
  { id: "clientes", label: "Clientes", icon: Users, group: "relacionamento" },
  { id: "chat", label: "Chat", icon: MessageSquare, group: "relacionamento", badge: 3 },
  { id: "financeiro", label: "Financeiro", icon: Wallet, group: "financeiro" },
  { id: "boletos", label: "Boletos", icon: Barcode, group: "financeiro" },
  { id: "cobrancas", label: "Cobranças (cartão/PIX)", icon: CreditCard, group: "financeiro" },
  { id: "notafiscal", label: "Notas Fiscais", icon: FileText, group: "financeiro" },
  { id: "area", label: "Área Cliente", icon: UserCircle, group: "preview" },
];

// Ordem e rótulo dos assuntos no sidebar (cabeçalhos). Grupos vazios são ocultados.
const NAV_GRUPOS = [
  { id: "principal", label: "" },
  { id: "comercial", label: "Comercial" },
  { id: "gestao", label: "Gestão" },
  { id: "operacao", label: "Operação" },
  { id: "relacionamento", label: "Relacionamento" },
  { id: "financeiro", label: "Financeiro" },
  { id: "preview", label: "Visualização" },
];

const PAGES = {
  dash: Dashboard, franqueados: Franqueados, crm: CRM, unidades: Unidades,
  reservas: Reservas, corresp: Correspondencias, pdv: PDV, clientes: Clientes,
  financeiro: Financeiro, boletos: Boletos, cobrancas: Cobrancas, notafiscal: NotaFiscal, estoque: Estoque, patrimonio: Patrimonio, eventos: Eventos, chat: Chat,
  area: AreaCliente, equipe: Equipe, catalogo: Catalogo, config: Configuracoes,
  cli_inicio: AreaCliente, cli_reservar: AreaCliente, cli_cafe: AreaCliente,
  cli_faturas: AreaCliente, cli_docs: AreaCliente, cli_fiscal: AreaCliente, cli_chat: AreaCliente, cli_notif: AreaCliente,
};

export default function App() {
  const { viewAs, franqueadoAtivo, perfil, setPerfil, activeUnit, pedidosDe, unidades, clientes, correspondenciasDe, conversasDe, reservas, meuPerfil, contratosVencendoDe, notificacaoPrefs, aplicarSessaoUsuario, hydrateFromDb, hydrateOperacional, estoqueBaixoDe } = useStore();
  const [page, setPage] = useState("dash");
  const [finTab, setFinTab] = useState("visao");
  const [finOpen, setFinOpen] = useState(true); // submenu Financeiro recolhível
  const [mobOpen, setMobOpen] = useState(false);
  const [session, setSession] = useState(getSession());
  useEffect(() => onAuthChange(setSession), []);

  const cfg = PERFIS[perfil] || PERFIS.franqueador;
  const ehFranqueador = perfil === "franqueador";
  const allowed = cfg.modules; // null = vê todos os módulos

  // Ao trocar de perfil, abre a página inicial daquele perfil
  useEffect(() => {
    setPage(cfg.landing);
  }, [perfil]); // eslint-disable-line react-hooks/exhaustive-deps

  // No login real: carrega contas/unidades/equipe do banco e define o perfil/
  // unidade do usuário a partir dos vínculos (unidade_members).
  useEffect(() => {
    if (!(supabaseConfigured && session)) return;
    let vivo = true;
    fetchTenant().then((dados) => { if (vivo) hydrateFromDb(dados); });
    Promise.all([fetchMemberships(), fetchIsPlatformAdmin()])
      .then(([membros, isAdmin]) => { if (vivo) aplicarSessaoUsuario(membros, isAdmin); });
    // Estado operacional (salas, reservas, financeiro, estoque…) + tabelas próprias.
    Promise.all([fetchAppState(), fetchBoletosDb(), fetchNotasDb(), fetchConfigFiscalDb()])
      .then(([appState, boletos, notas, config]) => {
        if (vivo) hydrateOperacional({ appState, boletos, notas, config });
      });
    return () => { vivo = false; };
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  const autenticadoReal = supabaseConfigured && !!session;

  // Com Supabase configurado, exige login. Sem configurar (demo), libera direto.
  if (supabaseConfigured && !session) return <Login />;

  // No perfil cliente, a navegação do portal vai toda para o sidebar
  const cliRef = clientes[0] || {};
  const cliUnitId = unidades.find((u) => u.nome === cliRef.unidade)?.id;
  const corrNovasCli = correspondenciasDe(cliUnitId || "").filter((c) => c.cliente === cliRef.nome && c.status === "notificado").length;
  const novoDocs = (cliRef.docs || []).filter((d) => d.status === "novo").length + corrNovasCli;
  const CLIENT_NAV = [
    { id: "cli_inicio", label: "Início", icon: Home },
    { id: "cli_reservar", label: "Reservar sala", icon: CalendarDays },
    { id: "cli_cafe", label: "Cafeteria", icon: Coffee },
    { id: "cli_faturas", label: "Faturas", icon: Wallet },
    { id: "cli_docs", label: "Documentos", icon: FileText, badge: novoDocs || undefined },
    ...(cliRef.fiscal ? [{ id: "cli_fiscal", label: "Endereço fiscal", icon: Building2 }] : []),
    { id: "cli_chat", label: "Falar com recepção", icon: MessageSquare },
    { id: "cli_notif", label: "Notificações", icon: Bell },
  ];

  let nav;
  if (perfil === "cliente") {
    nav = CLIENT_NAV;
  } else {
    nav = NAV.filter((n) => !(viewAs && n.id === "franqueados"));
    if (allowed) nav = nav.filter((n) => allowed.includes(n.id));
  }

  // Sidebar organizado por assunto. No portal do cliente fica sem cabeçalhos.
  const navGrupos =
    perfil === "cliente"
      ? [{ id: "_cli", label: "", itens: nav }]
      : NAV_GRUPOS.map((g) => ({ ...g, itens: nav.filter((n) => n.group === g.id) })).filter((g) => g.itens.length);

  // Notifica a recepção de pedidos novos da cafeteria + mensagens não lidas
  const pedidosNovos = pedidosDe(activeUnit).filter((p) => p.status === "recebido").length;
  const chatUnread = conversasDe(activeUnit).reduce((s, c) => s + (c.unread || 0), 0);
  const reservasNovas = reservas.filter((r) => r.unidadeId === activeUnit && r.origem === "app" && !r.vista).length;
  const correspNovas = correspondenciasDe(activeUnit).filter((c) => c.status === "aguardando").length;
  const contratosRenovar = contratosVencendoDe(activeUnit).length;
  const estoqueBaixo = estoqueBaixoDe(activeUnit).length;
  // A coluna "Push" das preferências da equipe controla os contadores no app.
  const pushOn = (ev) => notificacaoPrefs?.[`${ev}.push`] !== false;

  // Página atual precisa ser permitida no perfil
  const pageAllowed = !allowed || allowed.includes(page) || page === "config";
  const pageId = pageAllowed ? page : cfg.landing;
  const Page = PAGES[pageId] || Dashboard;

  // Identidade exibida no rodapé da sidebar
  const identidade = {
    franqueador: { nome: "Administrador", papel: "Plataforma CafeWorking" },
    master: { nome: franqueadoAtivo?.nome || "Master", papel: "Coworking (master)" },
    recepcao: { nome: "Recepção", papel: "Operador de recepção" },
    financeiro: { nome: "Financeiro", papel: "Contas a receber" },
    cliente: { nome: "Cliente", papel: "Membro" },
  }[perfil] || { nome: "Administrador", papel: "Plataforma" };

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
          width: 244,
          background: "#fff",
          borderRight: `1px solid ${C.border2}`,
          padding: "16px 12px",
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
        <div style={{ padding: "2px 6px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Logo size={32} />
          <button
            onClick={() => setMobOpen(false)}
            style={{ display: "none", color: C.text3 }}
            className="cw-mob-close"
          >
            <X size={20} />
          </button>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", flex: 1, overflowY: "auto" }}>
          {navGrupos.map((grupo, gi) => (
            <div key={grupo.id} style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: gi === 0 ? 0 : 4 }}>
              {grupo.label && (
                <div style={{ fontSize: 9.5, fontWeight: 700, color: C.text4, letterSpacing: 0.8, padding: "10px 12px 4px" }}>
                  {grupo.label.toUpperCase()}
                </div>
              )}
              {grupo.itens.map((n) => {
                const badge = n.id === "pdv" ? (pushOn("pedido") ? pedidosNovos : 0)
                  : n.id === "chat" ? (pushOn("chat") ? chatUnread : 0)
                  : n.id === "reservas" ? (pushOn("reserva") ? reservasNovas : 0)
                  : n.id === "corresp" ? (pushOn("corresp") ? correspNovas : 0)
                  : n.id === "estoque" ? estoqueBaixo
                  : n.id === "financeiro" ? contratosRenovar : n.badge;
                return (
            <React.Fragment key={n.id}>
            <button
              className={`cw-nav-btn ${pageId === n.id ? "active" : ""}`}
              onClick={() => {
                if (n.id === "financeiro" && pageId === "financeiro") {
                  setFinOpen((o) => !o); // já está no Financeiro → recolhe/expande
                  return;
                }
                if (n.id === "financeiro") setFinOpen(true);
                setPage(n.id);
                setMobOpen(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                padding: "7px 11px",
                borderRadius: 9,
                fontFamily: sans,
                fontSize: 13.5,
                fontWeight: pageId === n.id ? 600 : 500,
                background: pageId === n.id ? C.cafe : "transparent",
                color: pageId === n.id ? "#fff" : C.text2,
                transition: "all .15s",
                textAlign: "left",
                width: "100%",
              }}
            >
              <n.icon size={17} style={{ flexShrink: 0, opacity: pageId === n.id ? 1 : 0.8 }} />
              <span style={{ flex: 1 }}>{n.label}</span>
              {n.id === "financeiro" && (
                <ChevronDown size={15} style={{ transform: (pageId === "financeiro" && finOpen) ? "rotate(180deg)" : "none", transition: "transform .15s", opacity: 0.8 }} />
              )}
              {badge > 0 && (
                <span
                  className="cw-pulse"
                  style={{
                    background: pageId === n.id ? "rgba(255,255,255,.25)" : C.cafe,
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
                  {badge}
                </span>
              )}
            </button>
            {n.id === "financeiro" && pageId === "financeiro" && finOpen && (
              <div style={{ margin: "1px 0 4px 13px", paddingLeft: 8, borderLeft: `1px solid ${C.border2}` }}>
                {FIN_GRUPOS.map((g) => (
                  <div key={g.titulo} style={{ marginBottom: 1 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: C.text4, letterSpacing: 0.7, padding: "7px 10px 3px" }}>
                      {g.titulo.toUpperCase()}
                    </div>
                    {g.itens.map((s) => {
                      const ativo = finTab === s.id;
                      return (
                        <button
                          key={s.id}
                          className="cw-nav-btn"
                          onClick={() => { setFinTab(s.id); setPage("financeiro"); setMobOpen(false); }}
                          style={{
                            display: "flex", alignItems: "center", gap: 9, width: "100%",
                            padding: "6px 10px", borderRadius: 8, marginBottom: 1,
                            fontFamily: sans, fontSize: 12.5, fontWeight: ativo ? 600 : 500, textAlign: "left",
                            background: ativo ? C.cafePale : "transparent",
                            color: ativo ? C.cafe : C.text3,
                          }}
                        >
                          <s.icon size={14} style={{ flexShrink: 0, opacity: ativo ? 1 : 0.75 }} />
                          <span>{s.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
            </React.Fragment>
                );
              })}
            </div>
          ))}
        </nav>

        <div style={{ borderTop: `1px solid ${C.border2}`, paddingTop: 8, marginTop: 8 }}>
          {(ehFranqueador || perfil === "master") && (
            <button
              onClick={() => setPage("config")}
              className={`cw-nav-btn ${pageId === "config" ? "active" : ""}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                padding: "7px 11px",
                borderRadius: 9,
                fontSize: 13.5,
                color: pageId === "config" ? "#fff" : C.text2,
                background: pageId === "config" ? C.cafe : "transparent",
                width: "100%",
                fontWeight: 500,
              }}
            >
              <Settings size={17} style={{ opacity: pageId === "config" ? 1 : 0.8 }} /> Configurações
            </button>
          )}
          {(() => {
            const ehCliente = perfil === "cliente";
            const footNome = ehCliente ? identidade.nome : (meuPerfil.nome || identidade.nome);
            const footPapel = ehCliente ? identidade.papel : (meuPerfil.cargo || identidade.papel);
            const footFoto = ehCliente ? "" : meuPerfil.foto;
            const podeConfig = ehFranqueador || perfil === "master";
            return (
              <div
                onClick={podeConfig ? () => { setPage("config"); setMobOpen(false); } : undefined}
                title={podeConfig ? "Editar meu perfil" : undefined}
                className={podeConfig ? "cw-nav-btn" : ""}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 11px",
                  marginTop: 2,
                  borderRadius: 12,
                  cursor: podeConfig ? "pointer" : "default",
                }}
              >
                {footFoto ? (
                  <img
                    src={footFoto}
                    alt={footNome}
                    style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                  />
                ) : (
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: cfg.cor,
                      color: "#fff",
                      display: "grid",
                      placeItems: "center",
                      fontFamily: serif,
                      flexShrink: 0,
                    }}
                  >
                    {footNome.charAt(0)}
                  </div>
                )}
                <div style={{ fontSize: 13, minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{footNome}</div>
                  <div style={{ color: C.text3, fontSize: 11 }}>{footPapel}</div>
                </div>
                {supabaseConfigured && session && (
                  <button
                    onClick={(e) => { e.stopPropagation(); signOut(); }}
                    title="Sair"
                    className="cw-btn"
                    style={{ color: C.text3, padding: 6, flexShrink: 0 }}
                  >
                    <LogOut size={17} />
                  </button>
                )}
              </div>
            );
          })()}
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
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
            {/* "Ver como" é ferramenta de demonstração — escondida no login real */}
            {!autenticadoReal && <PerfilSwitcher />}
            {perfil !== "cliente" && perfil !== "franqueador" && <UnitSwitcher />}
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
          </div>
        </header>
        {!ehFranqueador && !autenticadoReal && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 28px",
              background: cfg.cor,
              color: "#fff",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            <Eye size={16} />
            <span style={{ flex: 1 }}>
              Pré-visualizando como <b>{cfg.label}</b>
              {perfil === "master" && franqueadoAtivo ? ` — ${franqueadoAtivo.nome}` : ""}. O menu mostra só o que esse perfil acessa.
            </span>
            <button
              onClick={() => setPerfil("franqueador")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(255,255,255,.18)",
                color: "#fff",
                padding: "6px 12px",
                borderRadius: 9,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <LogOut size={14} /> Voltar à plataforma
            </button>
          </div>
        )}
        <main
          className="cw-content"
          style={{ padding: 28, flex: 1, maxWidth: 1320, width: "100%" }}
        >
          <Page go={setPage} section={pageId} finTab={finTab} setFinTab={setFinTab} />
        </main>
      </div>
    </div>
  );
}

function UnitSwitcher() {
  const { unidadesVisiveis, activeUnit, setActiveUnit, unidadeAtiva } = useStore();
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className="cw-btn"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          background: "#fff",
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: "8px 12px",
          fontFamily: sans,
          fontSize: 13,
          fontWeight: 600,
          color: C.text,
        }}
      >
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: unidadeAtiva?.cor || C.cafe,
            flexShrink: 0,
          }}
        />
        <span style={{ maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {unidadeAtiva?.nome || "Unidade"}
        </span>
        <ChevronDown size={15} color={C.text3} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 230,
            background: "#fff",
            border: `1px solid ${C.border2}`,
            borderRadius: 14,
            boxShadow: "0 16px 40px rgba(31,31,28,.14)",
            padding: 6,
            zIndex: 60,
          }}
        >
          <div style={{ fontSize: 11, color: C.text4, fontWeight: 600, padding: "6px 10px 8px", letterSpacing: 0.4 }}>
            UNIDADE ATIVA
          </div>
          {unidadesVisiveis.map((u) => (
            <button
              key={u.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setActiveUnit(u.id);
                setOpen(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: "9px 10px",
                borderRadius: 10,
                background: u.id === activeUnit ? C.cream2 : "transparent",
                textAlign: "left",
                fontFamily: sans,
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: u.cor, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{u.nome}</div>
                <div style={{ fontSize: 11, color: C.text3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {u.endereco}
                </div>
              </div>
              {u.id === activeUnit && <Check size={16} color={C.cafe} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PerfilSwitcher() {
  const { perfil, setPerfil } = useStore();
  const [open, setOpen] = useState(false);
  const cfg = PERFIS[perfil] || PERFIS.franqueador;
  const franqueador = perfil === "franqueador";

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className="cw-btn"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: franqueador ? "#fff" : cfg.cor,
          border: `1px solid ${franqueador ? C.border : cfg.cor}`,
          borderRadius: 12,
          padding: "8px 12px",
          fontFamily: sans,
          fontSize: 13,
          fontWeight: 600,
          color: franqueador ? C.text : "#fff",
        }}
      >
        <Eye size={14} />
        <span style={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          Ver como: {cfg.label}
        </span>
        <ChevronDown size={15} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 230,
            background: "#fff",
            border: `1px solid ${C.border2}`,
            borderRadius: 14,
            boxShadow: "0 16px 40px rgba(31,31,28,.14)",
            padding: 6,
            zIndex: 60,
          }}
        >
          <div style={{ fontSize: 11, color: C.text4, fontWeight: 600, padding: "6px 10px 8px", letterSpacing: 0.4 }}>
            VISUALIZAR PAINEL COMO
          </div>
          {Object.entries(PERFIS).map(([id, p]) => (
            <button
              key={id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setPerfil(id);
                setOpen(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: "9px 10px",
                borderRadius: 10,
                background: id === perfil ? C.cream2 : "transparent",
                textAlign: "left",
                fontFamily: sans,
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: p.cor, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.text }}>{p.label}</span>
              {id === perfil && <Check size={16} color={C.cafe} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
