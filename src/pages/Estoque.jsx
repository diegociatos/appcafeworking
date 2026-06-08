import React, { useState } from "react";
import {
  Boxes, Plus, Edit3, Trash2, Minus, AlertTriangle, PackageSearch, Coins, ArrowDownUp, ShoppingCart,
} from "lucide-react";
import { Card, Badge, Btn, PageHead, Modal, Field, Empty } from "../components/ui.jsx";
import { C, serif, sans, fmt, inp } from "../lib/theme.js";
import { useStore } from "../lib/store.jsx";

const CATEGORIAS = ["Cafeteria", "Insumo", "Suprimento", "Limpeza", "Escritório", "Outros"];
const MEDIDAS = ["un", "kg", "L", "cx", "rolo", "pct"];
const corCat = (c) => ({ Cafeteria: C.cafe, Insumo: C.teal, Suprimento: C.blue, Limpeza: C.amber, Escritório: C.text3 }[c] || C.text3);

export default function Estoque() {
  const store = useStore();
  const { activeUnit, unidadeAtiva } = store;
  const itens = store.estoqueDe(activeUnit);
  const baixos = store.estoqueBaixoDe(activeUnit);
  const [modal, setModal] = useState(null);
  const [compra, setCompra] = useState(null);

  const valorTotal = itens.reduce((s, e) => s + e.quantidade * (e.custo || 0), 0);

  return (
    <div>
      <PageHead
        title="Estoque"
        sub={`Controle de itens da unidade ${unidadeAtiva?.nome || ""} — com estoque mínimo e baixa automática nas vendas.`}
        action={<Btn onClick={() => setModal({})}><Plus size={16} /> Novo item</Btn>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 16, marginBottom: 18 }}>
        <Kpi label="Itens cadastrados" valor={itens.length} icon={Boxes} cor={C.teal} />
        <Kpi label="Abaixo do mínimo" valor={baixos.length} icon={AlertTriangle} cor={baixos.length ? C.red : C.green} />
        <Kpi label="Valor em estoque" valor={fmt(valorTotal)} icon={Coins} cor={C.cafe} />
      </div>

      {baixos.length > 0 && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, background: C.amberPale, border: `1px solid ${C.amber}55`, borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
          <AlertTriangle size={18} color={C.amber} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: C.text2 }}>
            <b>{baixos.length} {baixos.length > 1 ? "itens precisam" : "item precisa"} de reposição.</b>{" "}
            Recepção e responsável foram avisados: {baixos.map((b) => b.nome).join(", ")}.
          </div>
        </div>
      )}

      {itens.length === 0 ? (
        <Card><Empty icon={PackageSearch} title="Estoque vazio" sub="Cadastre os itens que a unidade controla (cafeteria, insumos, limpeza...)." /></Card>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 90px 110px 100px 120px", gap: 8, padding: "11px 18px", background: C.cream, fontSize: 11, fontWeight: 700, color: C.text3, letterSpacing: 0.3 }}>
            <div>ITEM</div><div style={{ textAlign: "center" }}>MÍNIMO</div><div style={{ textAlign: "center" }}>QUANTIDADE</div><div style={{ textAlign: "right" }}>VALOR</div><div style={{ textAlign: "right" }}>AÇÕES</div>
          </div>
          {itens.map((e, i) => {
            const baixo = e.quantidade <= e.estoqueMinimo;
            return (
              <div key={e.id} style={{ display: "grid", gridTemplateColumns: "1.6fr 90px 110px 100px 120px", gap: 8, padding: "12px 18px", borderTop: `1px solid ${C.border2}`, alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: baixo ? C.red : C.green, flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.nome}</div>
                    <Badge color={corCat(e.categoria)}>{e.categoria}</Badge>
                  </div>
                </div>
                <div style={{ textAlign: "center", fontSize: 13, color: C.text3 }}>{e.estoqueMinimo} {e.unidade}</div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <button onClick={() => store.ajustarEstoque(e.id, -1)} className="cw-btn" title="Baixa (−1)" style={{ width: 24, height: 24, borderRadius: 7, border: `1px solid ${C.border}`, color: C.red, display: "grid", placeItems: "center" }}><Minus size={13} /></button>
                    <span style={{ fontFamily: serif, fontSize: 17, fontWeight: 600, color: baixo ? C.red : C.text, minWidth: 34 }}>{e.quantidade}</span>
                    <button onClick={() => store.ajustarEstoque(e.id, 1)} className="cw-btn" title="Entrada (+1)" style={{ width: 24, height: 24, borderRadius: 7, border: `1px solid ${C.border}`, color: C.green, display: "grid", placeItems: "center" }}><Plus size={13} /></button>
                  </div>
                  {baixo && <div style={{ fontSize: 10, color: C.red, marginTop: 2 }}>repor</div>}
                </div>
                <div style={{ textAlign: "right", fontSize: 13, color: C.text2 }}>{fmt(e.quantidade * (e.custo || 0))}</div>
                <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                  <button onClick={() => setCompra(e)} title="Comprar / repor" className="cw-btn" style={{ color: C.teal, padding: 6 }}><ShoppingCart size={15} /></button>
                  <button onClick={() => setModal(e)} title="Editar" className="cw-btn" style={{ color: C.text3, padding: 6 }}><Edit3 size={15} /></button>
                  <button onClick={() => store.removeItemEstoque(e.id)} title="Excluir" className="cw-btn" style={{ color: C.red, padding: 6 }}><Trash2 size={15} /></button>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <div style={{ fontSize: 12, color: C.text3, marginTop: 14, fontStyle: "italic", display: "flex", alignItems: "center", gap: 7 }}>
        <ArrowDownUp size={14} /> A baixa acontece sozinha quando há venda na cafeteria (o item de mesmo nome é abatido).
      </div>

      {modal && (
        <Modal title={modal.id ? "Editar item" : "Novo item de estoque"} onClose={() => setModal(null)} maxWidth={460}>
          <ItemForm inicial={modal} onSalvar={(d) => { if (modal.id) store.updateItemEstoque(modal.id, d); else store.addItemEstoque(activeUnit, d); setModal(null); }} />
        </Modal>
      )}
      {compra && (
        <Modal title={`Comprar / repor · ${compra.nome}`} onClose={() => setCompra(null)} maxWidth={440}>
          <CompraForm item={compra} onComprar={(d) => { store.comprarEstoque(activeUnit, compra.id, d); setCompra(null); }} />
        </Modal>
      )}
    </div>
  );
}

function CompraForm({ item, onComprar }) {
  const [f, setF] = useState({ quantidade: Math.max(1, item.estoqueMinimo - item.quantidade) || 10, custoUnit: item.custo || 0, fornecedor: "", pago: false });
  const total = (f.quantidade || 0) * (f.custoUnit || 0);
  const valido = f.quantidade > 0;
  return (
    <>
      <div style={{ fontSize: 12.5, color: C.text3, marginBottom: 14 }}>
        Estoque atual: <b>{item.quantidade} {item.unidade}</b> · mínimo {item.estoqueMinimo}. A entrada repõe o estoque e lança a compra no financeiro.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label={`Quantidade (${item.unidade})`}><input type="number" min="1" value={f.quantidade} onChange={(e) => setF({ ...f, quantidade: +e.target.value })} style={inp} /></Field>
        <Field label="Custo unitário (R$)"><input type="number" min="0" step="0.01" value={f.custoUnit} onChange={(e) => setF({ ...f, custoUnit: +e.target.value })} style={inp} /></Field>
      </div>
      <Field label="Fornecedor (opcional)"><input value={f.fornecedor} onChange={(e) => setF({ ...f, fornecedor: e.target.value })} style={inp} placeholder="Quem vendeu" /></Field>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.text2, margin: "2px 0 12px", cursor: "pointer" }}>
        <input type="checkbox" checked={f.pago} onChange={(e) => setF({ ...f, pago: e.target.checked })} /> Já paguei (senão entra como conta a pagar)
      </label>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: C.cream2, borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
        <span style={{ fontSize: 13, color: C.text2 }}>Total da compra</span>
        <span style={{ fontFamily: serif, fontSize: 18, color: C.cafe }}>{fmt(total)}</span>
      </div>
      <Btn style={{ width: "100%", justifyContent: "center", opacity: valido ? 1 : 0.5 }} onClick={() => valido && onComprar({ ...f })}>
        <ShoppingCart size={16} /> Registrar compra
      </Btn>
    </>
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

function ItemForm({ inicial, onSalvar }) {
  const [f, setF] = useState({
    nome: inicial.nome || "", categoria: inicial.categoria || "Cafeteria",
    quantidade: inicial.quantidade ?? 0, estoqueMinimo: inicial.estoqueMinimo ?? 0,
    unidade: inicial.unidade || "un", custo: inicial.custo ?? 0,
  });
  const num = (k) => (e) => setF({ ...f, [k]: +e.target.value });
  const valido = f.nome.trim();
  return (
    <>
      <Field label="Nome do item"><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} style={inp} placeholder="Ex: Leite integral" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Categoria">
          <select value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} style={inp}>
            {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Unidade de medida">
          <select value={f.unidade} onChange={(e) => setF({ ...f, unidade: e.target.value })} style={inp}>
            {MEDIDAS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Field label="Quantidade"><input type="number" min="0" value={f.quantidade} onChange={num("quantidade")} style={inp} /></Field>
        <Field label="Estoque mínimo"><input type="number" min="0" value={f.estoqueMinimo} onChange={num("estoqueMinimo")} style={inp} /></Field>
        <Field label="Custo unit. (R$)"><input type="number" min="0" step="0.01" value={f.custo} onChange={num("custo")} style={inp} /></Field>
      </div>
      <div style={{ fontSize: 11.5, color: C.text3, marginBottom: 14 }}>Quando a quantidade ficar ≤ o mínimo, recepção e responsável recebem o alerta.</div>
      <Btn style={{ width: "100%", justifyContent: "center", opacity: valido ? 1 : 0.5 }} onClick={() => valido && onSalvar({ ...f })}>
        <Boxes size={16} /> {inicial.id ? "Salvar item" : "Cadastrar item"}
      </Btn>
    </>
  );
}
