import React, { useState } from "react";
import {
  Landmark, Plus, Edit3, Trash2, FileText, Download, Armchair, Coins, Boxes,
} from "lucide-react";
import { Card, Badge, Btn, PageHead, Modal, Field, Empty, FileInput } from "../components/ui.jsx";
import { C, serif, fmt, inp } from "../lib/theme.js";
import { useStore } from "../lib/store.jsx";

const CATEGORIAS = ["Mobiliário", "Equipamento", "TI", "Decoração", "Outros"];
const corCat = (c) => ({ Mobiliário: C.cafe, Equipamento: C.teal, TI: C.blue, Decoração: C.amber }[c] || C.text3);
const fmtMes = (m) => (m ? m.split("-").reverse().join("/") : "—");

function baixarAnexo(a) {
  if (!a?.url) return;
  const el = document.createElement("a");
  el.href = a.url; el.download = a.nome || "contrato";
  document.body.appendChild(el); el.click(); el.remove();
}

export default function Patrimonio() {
  const store = useStore();
  const { activeUnit, unidadeAtiva } = store;
  const ativos = store.patrimonioDe(activeUnit);
  const [modal, setModal] = useState(null);

  const total = ativos.reduce((s, a) => s + a.quantidade * (a.valorUnitario || 0), 0);
  const totalUnidades = ativos.reduce((s, a) => s + a.quantidade, 0);

  return (
    <div>
      <PageHead
        title="Patrimônio"
        sub={`Ativos mobilizados da unidade ${unidadeAtiva?.nome || ""} — mobília, equipamentos e o contrato/NF de cada um.`}
        action={<Btn onClick={() => setModal({})}><Plus size={16} /> Novo ativo</Btn>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16, marginBottom: 18 }}>
        <Kpi label="Patrimônio total" valor={fmt(total)} icon={Coins} cor={C.cafe} />
        <Kpi label="Ativos cadastrados" valor={ativos.length} icon={Landmark} cor={C.teal} />
        <Kpi label="Itens (unidades)" valor={totalUnidades} icon={Boxes} cor={C.blue} />
      </div>

      {ativos.length === 0 ? (
        <Card><Empty icon={Armchair} title="Nenhum ativo" sub="Cadastre a mobília e os equipamentos da unidade para apurar o patrimônio." /></Card>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.7fr 70px 120px 130px 110px", gap: 8, padding: "11px 18px", background: C.cream, fontSize: 11, fontWeight: 700, color: C.text3, letterSpacing: 0.3 }}>
            <div>ATIVO</div><div style={{ textAlign: "center" }}>QTD</div><div style={{ textAlign: "right" }}>VALOR UNIT.</div><div style={{ textAlign: "right" }}>TOTAL</div><div style={{ textAlign: "right" }}>AÇÕES</div>
          </div>
          {ativos.map((a) => (
            <div key={a.id} style={{ display: "grid", gridTemplateColumns: "1.7fr 70px 120px 130px 110px", gap: 8, padding: "13px 18px", borderTop: `1px solid ${C.border2}`, alignItems: "center" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{a.nome}</span>
                  <Badge color={corCat(a.categoria)}>{a.categoria}</Badge>
                  {a.anexo && (
                    <button onClick={() => baixarAnexo(a.anexo)} className="cw-btn" title="Contrato / NF" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.teal, fontSize: 11, fontWeight: 600 }}>
                      <FileText size={13} /> contrato
                    </button>
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: C.text4, marginTop: 2 }}>
                  {a.fornecedor ? `${a.fornecedor} · ` : ""}aquisição {fmtMes(a.aquisicao)}
                </div>
              </div>
              <div style={{ textAlign: "center", fontSize: 14, fontWeight: 600 }}>{a.quantidade}</div>
              <div style={{ textAlign: "right", fontSize: 13, color: C.text2 }}>{fmt(a.valorUnitario)}</div>
              <div style={{ textAlign: "right", fontFamily: serif, fontSize: 15, color: C.cafe }}>{fmt(a.quantidade * (a.valorUnitario || 0))}</div>
              <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                <button onClick={() => setModal(a)} className="cw-btn" style={{ color: C.text3, padding: 6 }}><Edit3 size={15} /></button>
                <button onClick={() => store.removeAtivo(a.id)} className="cw-btn" style={{ color: C.red, padding: 6 }}><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
          <div style={{ display: "grid", gridTemplateColumns: "1.7fr 70px 120px 130px 110px", gap: 8, padding: "13px 18px", background: C.cream, borderTop: `1px solid ${C.border2}`, fontWeight: 700 }}>
            <div style={{ fontFamily: serif, fontSize: 15 }}>Patrimônio total</div><div /><div />
            <div style={{ textAlign: "right", fontFamily: serif, fontSize: 16, color: C.cafe }}>{fmt(total)}</div><div />
          </div>
        </Card>
      )}

      {modal && (
        <Modal title={modal.id ? "Editar ativo" : "Novo ativo"} onClose={() => setModal(null)} maxWidth={480}>
          <AtivoForm inicial={modal} onSalvar={(d) => { if (modal.id) store.updateAtivo(modal.id, d); else store.addAtivo(activeUnit, d); setModal(null); }} />
        </Modal>
      )}
    </div>
  );
}

function Kpi({ label, valor, icon: Icon, cor }) {
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 12.5, color: C.text3 }}>{label}</div>
          <div style={{ fontFamily: serif, fontSize: 24, color: C.text, marginTop: 4 }}>{valor}</div>
        </div>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: `${cor}16`, display: "grid", placeItems: "center" }}><Icon size={19} color={cor} /></div>
      </div>
    </Card>
  );
}

function AtivoForm({ inicial, onSalvar }) {
  const [f, setF] = useState({
    nome: inicial.nome || "", categoria: inicial.categoria || "Mobiliário",
    quantidade: inicial.quantidade ?? 1, valorUnitario: inicial.valorUnitario ?? 0,
    aquisicao: inicial.aquisicao || "", fornecedor: inicial.fornecedor || "", anexo: inicial.anexo || null,
  });
  const valido = f.nome.trim() && f.valorUnitario >= 0;
  return (
    <>
      <Field label="Nome do ativo"><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} style={inp} placeholder="Ex: Mesa de reunião 8 lugares" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Categoria">
          <select value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} style={inp}>
            {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Fornecedor"><input value={f.fornecedor} onChange={(e) => setF({ ...f, fornecedor: e.target.value })} style={inp} placeholder="Ex: Flexform" /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Field label="Quantidade"><input type="number" min="1" value={f.quantidade} onChange={(e) => setF({ ...f, quantidade: +e.target.value })} style={inp} /></Field>
        <Field label="Valor unit. (R$)"><input type="number" min="0" step="0.01" value={f.valorUnitario} onChange={(e) => setF({ ...f, valorUnitario: +e.target.value })} style={inp} /></Field>
        <Field label="Aquisição"><input type="month" value={f.aquisicao} onChange={(e) => setF({ ...f, aquisicao: e.target.value })} style={inp} /></Field>
      </div>
      {f.valorUnitario > 0 && (
        <div style={{ fontSize: 12, color: C.text3, marginBottom: 8 }}>Valor total: <b style={{ color: C.cafe }}>{fmt(f.quantidade * f.valorUnitario)}</b></div>
      )}
      <Field label="Contrato / nota fiscal (opcional)">
        <FileInput value={f.anexo} onChange={(v) => setF({ ...f, anexo: v })} label="Anexar contrato/NF" />
      </Field>
      <Btn style={{ width: "100%", justifyContent: "center", opacity: valido ? 1 : 0.5 }} onClick={() => valido && onSalvar({ ...f })}>
        <Landmark size={16} /> {inicial.id ? "Salvar ativo" : "Cadastrar ativo"}
      </Btn>
    </>
  );
}
