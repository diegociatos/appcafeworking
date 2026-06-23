import React, { useState } from "react";
import { Tags, Plus, Edit3, Trash2, Check, X, FileText, Repeat, Zap, ShoppingBag } from "lucide-react";
import { Card, Badge, Btn, PageHead, Modal, Field, Empty } from "../components/ui.jsx";
import { C, serif, sans, fmt, inp } from "../lib/theme.js";
import { useStore } from "../lib/store.jsx";

export default function Planos() {
  const { activeUnit, unidadeAtiva, planosDe, addPlano, updatePlano, removePlano } = useStore();
  const planos = planosDe(activeUnit, true); // inclui inativos para gerir
  const [modal, setModal] = useState(null); // {} novo | plano editar

  const ativos = planos.filter((p) => p.ativo !== false);
  const ticketMedio = ativos.length ? ativos.reduce((s, p) => s + p.preco, 0) / ativos.length : 0;
  const mrr = ativos.filter((p) => p.recorrencia === "mensal").reduce((s, p) => s + p.preco, 0);

  return (
    <div>
      <PageHead
        title="Planos e serviços"
        sub={`O que ${unidadeAtiva?.nome || "sua unidade"} vende. Usado nas cobranças e no autocadastro do cliente.`}
        action={<Btn onClick={() => setModal({})}><Plus size={16} /> Novo plano</Btn>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 16, marginBottom: 18 }}>
        <Kpi label="Planos ativos" valor={ativos.length} cor={C.cafe} icon={Tags} />
        <Kpi label="Ticket médio" valor={fmt(ticketMedio)} cor={C.teal} icon={ShoppingBag} />
        <Kpi label="Receita recorrente / plano" valor={fmt(mrr)} cor={C.green} icon={Repeat} sub="Soma dos mensais" />
      </div>

      {planos.length === 0 ? (
        <Card><Empty icon={Tags} title="Nenhum plano cadastrado" sub="Cadastre o que você vende (Endereço Fiscal, Coworking, Sala Privativa…). O cliente escolhe um deles no cadastro e na cobrança." /></Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 14 }}>
          {planos.map((p) => {
            const inativo = p.ativo === false;
            return (
              <Card key={p.id} style={{ opacity: inativo ? 0.6 : 1, borderLeft: `3px solid ${inativo ? C.text4 : C.cafe}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: serif, fontSize: 18 }}>{p.nome}</span>
                      <Badge color={p.recorrencia === "mensal" ? C.teal : C.amber} bg={p.recorrencia === "mensal" ? C.tealPale : C.amberPale}>
                        {p.recorrencia === "mensal" ? <><Repeat size={11} /> Mensal</> : <><Zap size={11} /> Avulso</>}
                      </Badge>
                      {inativo && <Badge color={C.text3} bg={C.cream2}>Inativo</Badge>}
                    </div>
                    {p.descricao && <div style={{ fontSize: 12.5, color: C.text3, marginTop: 4 }}>{p.descricao}</div>}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: 12 }}>
                  <div>
                    <span style={{ fontFamily: serif, fontSize: 24, color: C.cafe }}>{fmt(p.preco)}</span>
                    <span style={{ fontSize: 12, color: C.text3 }}>{p.recorrencia === "mensal" ? " /mês" : ""}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {p.emiteNF && <span title="Emite nota fiscal" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: C.teal, background: C.tealPale, padding: "3px 8px", borderRadius: 8 }}><FileText size={12} /> NF</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 14, borderTop: `1px solid ${C.border2}`, paddingTop: 12 }}>
                  <Btn variant="ghost" style={{ flex: 1, justifyContent: "center", fontSize: 13 }} onClick={() => setModal(p)}><Edit3 size={14} /> Editar</Btn>
                  <Btn variant="ghost" style={{ fontSize: 13, color: inativo ? C.green : C.amber }} onClick={() => updatePlano(p.id, { ativo: inativo })}>
                    {inativo ? <><Check size={14} /> Ativar</> : <><X size={14} /> Pausar</>}
                  </Btn>
                  <Btn variant="ghost" style={{ color: C.red, padding: "10px 12px" }} onClick={() => { if (confirm(`Excluir o plano "${p.nome}"?`)) removePlano(p.id); }}><Trash2 size={14} /></Btn>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {modal && (
        <Modal title={modal.id ? "Editar plano" : "Novo plano"} onClose={() => setModal(null)} maxWidth={460}>
          <PlanoForm inicial={modal} onSave={(d) => { if (modal.id) updatePlano(modal.id, d); else addPlano(activeUnit, d); setModal(null); }} />
        </Modal>
      )}
    </div>
  );
}

function PlanoForm({ inicial, onSave }) {
  const [f, setF] = useState({
    nome: inicial.nome || "", preco: inicial.preco ?? "", recorrencia: inicial.recorrencia || "mensal",
    emiteNF: inicial.emiteNF !== false, descricao: inicial.descricao || "",
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const valido = f.nome.trim() && +f.preco > 0;

  return (
    <>
      <Field label="Nome do plano"><input value={f.nome} onChange={set("nome")} style={inp} placeholder="Ex: Endereço Fiscal" autoFocus /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Preço (R$)"><input type="number" min="0" step="0.01" value={f.preco} onChange={set("preco")} style={inp} placeholder="0,00" /></Field>
        <Field label="Cobrança">
          <div style={{ display: "flex", gap: 8 }}>
            {[["mensal", "Mensal"], ["avulso", "Avulso"]].map(([v, lb]) => (
              <button key={v} type="button" onClick={() => setF({ ...f, recorrencia: v })}
                style={{ flex: 1, padding: "10px 0", borderRadius: 10, fontFamily: sans, fontSize: 13, fontWeight: 600, border: `1px solid ${f.recorrencia === v ? C.cafe : C.border}`, background: f.recorrencia === v ? C.cafePale : C.white, color: f.recorrencia === v ? C.cafe : C.text2 }}>
                {lb}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <Field label="Descrição (aparece para o cliente)"><input value={f.descricao} onChange={set("descricao")} style={inp} placeholder="O que está incluso" /></Field>
      <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "10px 12px", border: `1px solid ${C.border}`, borderRadius: 11, marginBottom: 14, background: f.emiteNF ? C.tealPale : C.white }}>
        <input type="checkbox" checked={f.emiteNF} onChange={(e) => setF({ ...f, emiteNF: e.target.checked })} />
        <FileText size={16} color={C.teal} />
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>Emitir nota fiscal (NFS-e) ao receber</span>
      </label>
      <Btn style={{ width: "100%", justifyContent: "center", opacity: valido ? 1 : 0.5 }} onClick={() => valido && onSave({ ...f, preco: +f.preco })}>
        {inicial.id ? "Salvar plano" : "Criar plano"}
      </Btn>
    </>
  );
}

function Kpi({ label, valor, cor, icon: Icon, sub }) {
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 12.5, color: C.text3 }}>{label}</div>
          <div style={{ fontFamily: serif, fontSize: 23, marginTop: 4 }}>{valor}</div>
          {sub && <div style={{ fontSize: 11, color: C.text4, marginTop: 2 }}>{sub}</div>}
        </div>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: `${cor}16`, display: "grid", placeItems: "center" }}><Icon size={19} color={cor} /></div>
      </div>
    </Card>
  );
}
