import React, { useState } from "react";
import {
  Plus, Instagram, Globe, MessageCircle, Search as SearchIcon,
  Phone, Mail, Calendar, TrendingUp, DollarSign,
} from "lucide-react";
import { Card, Badge, Btn, PageHead, Modal, Field } from "../components/ui.jsx";
import { C, serif, fmt, fmtShort, inp } from "../lib/theme.js";
import { LEADS_INIT, ETAPAS_CRM } from "../lib/data.js";

const ORIGEM_ICON = {
  Instagram: Instagram,
  Site: Globe,
  WhatsApp: MessageCircle,
  "Google Ads": SearchIcon,
};

const ORIGEM_COR = {
  Instagram: "#E1306C",
  Site: C.teal,
  WhatsApp: "#25D366",
  "Google Ads": "#4285F4",
};

export default function CRM() {
  const [leads, setLeads] = useState(LEADS_INIT);
  const [modal, setModal] = useState(null);
  const [drag, setDrag] = useState(null);

  const totalPipeline = leads
    .filter((l) => l.etapa !== "fechado")
    .reduce((s, l) => s + (l.valor * l.prob) / 100, 0);

  const fechados = leads.filter((l) => l.etapa === "fechado");
  const taxa = leads.length > 0 ? Math.round((fechados.length / leads.length) * 100) : 0;

  const onDrop = (etapa) => {
    if (drag) {
      setLeads((ls) => ls.map((l) => (l.id === drag ? { ...l, etapa } : l)));
      setDrag(null);
    }
  };

  return (
    <div>
      <PageHead
        title="CRM · Funil de leads"
        sub="Transforme interessados em contratos. Funil integrado a Instagram, WhatsApp, Site e Google Ads."
        action={
          <Btn onClick={() => setModal({})}>
            <Plus size={16} /> Novo lead
          </Btn>
        }
      />

      {/* Resumo do funil */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <Card>
          <div style={{ fontSize: 13, color: C.text3, marginBottom: 6 }}>Pipeline ponderado</div>
          <div style={{ fontFamily: serif, fontSize: 26, color: C.cafe }}>{fmt(totalPipeline)}</div>
          <div style={{ fontSize: 12, color: C.text3, marginTop: 4 }}>
            {leads.filter((l) => l.etapa !== "fechado").length} leads em aberto
          </div>
        </Card>
        <Card>
          <div style={{ fontSize: 13, color: C.text3, marginBottom: 6 }}>Taxa de conversão</div>
          <div style={{ fontFamily: serif, fontSize: 26, color: C.green }}>{taxa}%</div>
          <div style={{ fontSize: 12, color: C.text3, marginTop: 4 }}>
            {fechados.length} fechados de {leads.length}
          </div>
        </Card>
        <Card>
          <div style={{ fontSize: 13, color: C.text3, marginBottom: 6 }}>Receita conquistada</div>
          <div style={{ fontFamily: serif, fontSize: 26, color: C.teal }}>
            {fmt(fechados.reduce((s, l) => s + l.valor, 0))}
          </div>
          <div style={{ fontSize: 12, color: C.text3, marginTop: 4 }}>contratos do mês</div>
        </Card>
        <Card>
          <div style={{ fontSize: 13, color: C.text3, marginBottom: 6 }}>Origem campeã</div>
          <div style={{ fontFamily: serif, fontSize: 22, color: C.text }}>Instagram</div>
          <div style={{ fontSize: 12, color: C.text3, marginTop: 4 }}>
            {leads.filter((l) => l.origem === "Instagram").length} leads novos
          </div>
        </Card>
      </div>

      {/* Kanban */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${ETAPAS_CRM.length}, minmax(220px, 1fr))`,
          gap: 12,
          overflowX: "auto",
          paddingBottom: 8,
        }}
      >
        {ETAPAS_CRM.map((e) => {
          const leadsEtapa = leads.filter((l) => l.etapa === e.id);
          const valorEtapa = leadsEtapa.reduce((s, l) => s + l.valor, 0);
          return (
            <div
              key={e.id}
              onDragOver={(ev) => ev.preventDefault()}
              onDrop={() => onDrop(e.id)}
              style={{ background: C.cream2, borderRadius: 14, padding: 12, minHeight: 280 }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 10,
                  paddingBottom: 10,
                  borderBottom: `2px solid ${e.cor}`,
                }}
              >
                <div>
                  <div style={{ fontFamily: serif, fontSize: 15, color: C.text, fontWeight: 500 }}>
                    {e.label}
                  </div>
                  <div style={{ fontSize: 11, color: C.text3 }}>{fmtShort(valorEtapa)}</div>
                </div>
                <span
                  style={{
                    background: e.cor,
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 700,
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  {leadsEtapa.length}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {leadsEtapa.map((l) => {
                  const OI = ORIGEM_ICON[l.origem];
                  const oc = ORIGEM_COR[l.origem];
                  return (
                    <div
                      key={l.id}
                      draggable
                      onDragStart={() => setDrag(l.id)}
                      style={{
                        background: "#fff",
                        border: `1px solid ${C.border2}`,
                        borderRadius: 12,
                        padding: 12,
                        cursor: "grab",
                        transition: "all .15s",
                        opacity: drag === l.id ? 0.5 : 1,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{l.nome}</div>
                        {OI && (
                          <div
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 6,
                              background: `${oc}1a`,
                              display: "grid",
                              placeItems: "center",
                            }}
                          >
                            <OI size={12} color={oc} />
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: C.text3, marginBottom: 8 }}>{l.interesse}</div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontSize: 12,
                        }}
                      >
                        <span style={{ color: C.cafe, fontWeight: 600 }}>{fmtShort(l.valor)}</span>
                        <Badge color={l.prob >= 70 ? C.green : l.prob >= 40 ? C.amber : C.text3}>
                          {l.prob}%
                        </Badge>
                      </div>
                    </div>
                  );
                })}
                {leadsEtapa.length === 0 && (
                  <div
                    style={{
                      padding: 16,
                      textAlign: "center",
                      fontSize: 12,
                      color: C.text4,
                      border: `2px dashed ${C.border2}`,
                      borderRadius: 10,
                    }}
                  >
                    Arraste leads pra cá
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: C.text3, fontStyle: "italic" }}>
        💡 Arraste os cards entre as colunas para mover leads no funil.
      </div>

      {modal && (
        <Modal title="Novo lead" onClose={() => setModal(null)}>
          <NovoLead
            onSave={(novo) => {
              setLeads((ls) => [
                ...ls,
                {
                  id: "l" + Date.now(),
                  ...novo,
                  etapa: "novo",
                  prob: 20,
                  desde: "Agora",
                },
              ]);
              setModal(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function NovoLead({ onSave }) {
  const [f, setF] = useState({ nome: "", origem: "Site", interesse: "", valor: 0, tel: "" });
  return (
    <>
      <Field label="Nome">
        <input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} style={inp} placeholder="Nome completo" />
      </Field>
      <Field label="Telefone">
        <input value={f.tel} onChange={(e) => setF({ ...f, tel: e.target.value })} style={inp} placeholder="(31) 99999-9999" />
      </Field>
      <Field label="Origem">
        <select value={f.origem} onChange={(e) => setF({ ...f, origem: e.target.value })} style={inp}>
          {["Instagram", "Site", "WhatsApp", "Google Ads", "Indicação"].map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </Field>
      <Field label="Interesse">
        <input value={f.interesse} onChange={(e) => setF({ ...f, interesse: e.target.value })} style={inp} placeholder="Ex: Sala Privativa" />
      </Field>
      <Field label="Valor estimado (R$)">
        <input
          type="number"
          value={f.valor}
          onChange={(e) => setF({ ...f, valor: +e.target.value })}
          style={inp}
        />
      </Field>
      <Btn
        style={{ width: "100%", justifyContent: "center", marginTop: 6 }}
        onClick={() => f.nome && onSave(f)}
      >
        Adicionar lead
      </Btn>
    </>
  );
}
