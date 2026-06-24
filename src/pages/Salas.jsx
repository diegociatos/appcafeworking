import React, { useState } from "react";
import { DoorOpen, Plus, Edit3, Trash2 } from "lucide-react";
import { Card, Badge, Btn, PageHead, Modal, Empty } from "../components/ui.jsx";
import { C, serif, fmt } from "../lib/theme.js";
import { useStore } from "../lib/store.jsx";
import { SalaForm } from "./Unidades.jsx";

const TIPO_COR = { Privativa: C.cafe, "Reunião": C.teal, Compartilhada: C.blue, "Auditório": C.amber, Atendimento: C.text3 };

export default function Salas() {
  const store = useStore();
  const { activeUnit, unidadeAtiva, salasDe } = store;
  const salas = salasDe(activeUnit);
  const [modal, setModal] = useState(null); // {} nova | sala editar

  if (!unidadeAtiva) {
    return (
      <div>
        <PageHead title="Salas" sub="Cadastre e gerencie as salas da unidade." />
        <Card><Empty icon={DoorOpen} title="Selecione uma unidade" sub="Escolha a unidade no seletor do topo para cadastrar salas." /></Card>
      </div>
    );
  }

  return (
    <div>
      <PageHead
        title="Salas"
        sub={`Salas de ${unidadeAtiva?.nome || ""} — reserváveis no portal do cliente e na agenda.`}
        action={<Btn onClick={() => setModal({})}><Plus size={16} /> Nova sala</Btn>}
      />

      {salas.length === 0 ? (
        <Card><Empty icon={DoorOpen} title="Nenhuma sala" sub="Clique em “Nova sala” para cadastrar a primeira desta unidade." /></Card>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {salas.map((s, i) => {
            const cor = TIPO_COR[s.tipo] || C.text3;
            return (
              <div key={s.id} style={{ display: "flex", gap: 14, padding: "14px 20px", borderBottom: i < salas.length - 1 ? `1px solid ${C.border2}` : "none", alignItems: "flex-start" }}>
                {s.foto ? (
                  <img src={s.foto} alt={s.nome} onError={(e) => (e.currentTarget.style.display = "none")} style={{ width: 92, height: 66, borderRadius: 10, objectFit: "cover", background: C.cream2, flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 92, height: 66, borderRadius: 10, background: C.cream2, display: "grid", placeItems: "center", flexShrink: 0 }}><DoorOpen size={22} color={C.text4} /></div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{s.nome}</span>
                    <Badge color={cor}>{s.tipo}</Badge>
                    {s.contratada
                      ? <Badge color={C.red} bg={C.redPale}>Contratada{s.contratante ? ` · ${s.contratante}` : ""}</Badge>
                      : <Badge color={C.green}>Disponível</Badge>}
                  </div>
                  <div style={{ fontSize: 12, color: C.text3, marginTop: 3 }}>
                    {s.cap} pessoas{s.bases > 0 ? ` · ${s.bases} bases` : ""} · {s.contratada && s.valorMensal ? `${fmt(s.valorMensal)}/mês` : (s.valor || "—")}
                  </div>
                  {s.descricao && <div style={{ fontSize: 12, color: C.text3, marginTop: 4, lineHeight: 1.45 }}>{s.descricao}</div>}
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button onClick={() => setModal(s)} title="Editar" className="cw-btn" style={{ color: C.text3, padding: 6 }}><Edit3 size={16} /></button>
                  <button onClick={() => { if (confirm(`Excluir a sala "${s.nome}"?`)) store.removeSala(s.id); }} title="Excluir" className="cw-btn" style={{ color: C.red, padding: 6 }}><Trash2 size={16} /></button>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {modal && (
        <Modal title={modal.id ? "Editar sala" : "Nova sala"} onClose={() => setModal(null)}>
          <SalaForm
            inicial={modal}
            unidade={unidadeAtiva}
            onSave={(dados) => {
              if (modal.id) store.updateSala(modal.id, dados);
              else store.addSala(activeUnit, dados);
              setModal(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}
