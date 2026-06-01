import React, { useState } from "react";
import {
  Globe, Users, Lock, Palette, Plus, Save, Upload, Zap,
  Database, CreditCard as CardIcon, MessageSquare, CalendarClock, Workflow,
} from "lucide-react";
import { Card, Badge, Btn, PageHead, Field } from "../components/ui.jsx";
import { C, serif, inp } from "../lib/theme.js";
import Logo from "../components/Logo.jsx";

const ABAS = [
  { id: "geral", label: "Geral", icon: Globe },
  { id: "equipe", label: "Equipe", icon: Users },
  { id: "integracoes", label: "Integrações", icon: Zap },
  { id: "seguranca", label: "Segurança", icon: Lock },
  { id: "marca", label: "Marca", icon: Palette },
];

const EQUIPE = [
  { nome: "Admin Grupo Ciatos", papel: "Gestor", email: "admin@ciatos.com.br", cor: C.teal },
  { nome: "Recepção Luxemburgo", papel: "Operador", email: "recepcao.lux@cafeworking.com.br", cor: C.cafe },
  { nome: "Recepção Estoril", papel: "Operador", email: "recepcao.est@cafeworking.com.br", cor: C.cafe2 },
  { nome: "Financeiro Ciatos", papel: "Financeiro", email: "financeiro@ciatos.com.br", cor: C.amber },
];

const INTEGRACOES = [
  { nome: "Supabase", desc: "Banco de dados, autenticação e permissões", icon: Database, cor: "#3ECF8E", status: "planejado" },
  { nome: "Asaas", desc: "Pagamentos (Pix, boleto, cartão recorrente)", icon: CardIcon, cor: "#2563EB", status: "planejado" },
  { nome: "Botpress + WhatsApp", desc: "Atendimento e captação 24/7", icon: MessageSquare, cor: "#25D366", status: "planejado" },
  { nome: "Microsoft Bookings", desc: "Sincronização de agenda de salas", icon: CalendarClock, cor: "#5B5FC7", status: "planejado" },
  { nome: "Make / Power Automate", desc: "Automações entre módulos", icon: Workflow, cor: "#F90", status: "planejado" },
  { nome: "Ecossistema Ciatos", desc: "Contabilidade, Jurídico e Banco", icon: Zap, cor: C.cafe, status: "conectado" },
];

export default function Configuracoes() {
  const [aba, setAba] = useState("geral");

  return (
    <div>
      <PageHead title="Configurações" sub="Preferências do sistema, equipe, integrações e marca." />
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {ABAS.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className="cw-btn"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "10px 16px",
              borderRadius: 12,
              fontWeight: 600,
              fontSize: 14,
              border: `1px solid ${aba === a.id ? C.cafe : C.border}`,
              background: aba === a.id ? C.cafe : C.white,
              color: aba === a.id ? "#fff" : C.text2,
            }}
          >
            <a.icon size={16} /> {a.label}
          </button>
        ))}
      </div>

      {aba === "geral" && (
        <Card style={{ maxWidth: 560 }}>
          <Field label="Nome do negócio">
            <input defaultValue="CafeWorking · Grupo Ciatos" style={inp} />
          </Field>
          <Field label="CNPJ">
            <input defaultValue="20.351.761/0001-03" style={inp} />
          </Field>
          <Field label="E-mail de atendimento">
            <input defaultValue="atendimento@cafeworking.com.br" style={inp} />
          </Field>
          <Field label="WhatsApp">
            <input defaultValue="(31) 99712-9789" style={inp} />
          </Field>
          <Field label="Fuso · Moeda">
            <input defaultValue="America/Sao_Paulo · BRL (R$)" style={inp} />
          </Field>
          <Btn style={{ marginTop: 6 }}>
            <Save size={16} /> Salvar alterações
          </Btn>
        </Card>
      )}

      {aba === "equipe" && (
        <Card style={{ padding: 0, overflow: "hidden", maxWidth: 640 }}>
          <div
            style={{
              padding: "14px 20px",
              borderBottom: `1px solid ${C.border2}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontFamily: serif, fontSize: 18 }}>Membros da equipe</span>
            <Btn style={{ padding: "8px 14px", fontSize: 13 }}>
              <Plus size={15} /> Convidar
            </Btn>
          </div>
          {EQUIPE.map((m, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: 16,
                borderBottom: i < EQUIPE.length - 1 ? `1px solid ${C.border2}` : "none",
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: m.cor,
                  color: "#fff",
                  display: "grid",
                  placeItems: "center",
                  fontFamily: serif,
                }}
              >
                {m.nome[0]}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{m.nome}</div>
                <div style={{ fontSize: 12, color: C.text3 }}>{m.email}</div>
              </div>
              <Badge color={m.papel === "Gestor" ? C.teal : m.papel === "Financeiro" ? C.amber : C.cafe}>
                {m.papel}
              </Badge>
            </div>
          ))}
        </Card>
      )}

      {aba === "integracoes" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
            gap: 14,
          }}
        >
          {INTEGRACOES.map((I, i) => (
            <Card key={i} className={`cw-fade cw-fade-${(i % 4) + 1}`}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: `${I.cor}1a`,
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <I.icon size={22} color={I.cor} />
                </div>
                <Badge
                  color={I.status === "conectado" ? C.green : C.amber}
                  bg={I.status === "conectado" ? C.greenPale : C.amberPale}
                >
                  {I.status === "conectado" ? "Conectado" : "Planejado"}
                </Badge>
              </div>
              <div style={{ fontFamily: serif, fontSize: 18, color: C.text }}>{I.nome}</div>
              <div style={{ fontSize: 13, color: C.text3, marginTop: 4 }}>{I.desc}</div>
              <Btn variant="ghost" style={{ marginTop: 14, width: "100%", justifyContent: "center" }}>
                {I.status === "conectado" ? "Gerenciar" : "Configurar"}
              </Btn>
            </Card>
          ))}
        </div>
      )}

      {aba === "seguranca" && (
        <Card style={{ maxWidth: 560 }}>
          {[
            ["Autenticação em dois fatores", "Proteja o acesso ao painel", true],
            ["Registro de atividades", "Auditoria de ações da equipe", true],
            ["Sessão expira em 30 min", "Logout automático por inatividade", false],
            ["Confirmação para ações sensíveis", "Excluir cliente, gerar cobrança, etc.", true],
          ].map(([t, s, on], i, arr) => (
            <Toggle key={i} title={t} sub={s} initial={on} last={i === arr.length - 1} />
          ))}
        </Card>
      )}

      {aba === "marca" && (
        <Card style={{ maxWidth: 560 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Cores da marca</div>
          <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
            {[
              ["Café", C.cafe],
              ["Teal", C.teal],
              ["Creme", C.cream],
              ["Texto", C.text],
            ].map(([l, c]) => (
              <div key={l} style={{ textAlign: "center" }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 12,
                    background: c,
                    border: `1px solid ${C.border}`,
                  }}
                />
                <div style={{ fontSize: 12, color: C.text3, marginTop: 6 }}>{l}</div>
                <div style={{ fontSize: 10, color: C.text4, fontFamily: "monospace" }}>{c}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Logomarca</div>
          <div
            style={{
              padding: 24,
              border: `2px dashed ${C.border}`,
              borderRadius: 14,
              textAlign: "center",
            }}
          >
            <Logo size={42} showSub={false} />
            <Btn variant="ghost" style={{ marginTop: 14 }}>
              <Upload size={15} /> Trocar logo
            </Btn>
          </div>
        </Card>
      )}
    </div>
  );
}

function Toggle({ title, sub, initial, last }) {
  const [on, setOn] = useState(initial);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 0",
        borderBottom: last ? "none" : `1px solid ${C.border2}`,
      }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 12, color: C.text3 }}>{sub}</div>
      </div>
      <button
        onClick={() => setOn(!on)}
        style={{
          width: 44,
          height: 26,
          borderRadius: 20,
          background: on ? C.teal : C.gray,
          position: "relative",
          transition: "all .2s",
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: "#fff",
            position: "absolute",
            top: 3,
            left: on ? 21 : 3,
            transition: "all .2s",
            boxShadow: "0 2px 4px rgba(0,0,0,.15)",
          }}
        />
      </button>
    </div>
  );
}
