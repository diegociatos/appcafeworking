import { useState } from "react";
import {
  Boxes, Plus, Edit3, Trash2, Minus, AlertTriangle, PackageSearch, Coins,
  ArrowDownUp, ShoppingCart, Coffee, ShoppingBag, Wrench, Store, DollarSign,
} from "lucide-react";
import { Card, Badge, Btn, PageHead, Modal, Field, Empty } from "../components/ui.jsx";
import { C, serif, sans, fmt, inp } from "../lib/theme.js";
import { useStore } from "../lib/store.jsx";

// Os 3 tipos de item que um coworking controla.
const TIPOS = {
  insumo: { label: "Cafeteria / Insumo", curto: "Cafeteria", cor: C.cafe, icon: Coffee, dica: "Vira produto da cafeteria; baixa sozinho na venda do PDV." },
  revenda: { label: "Revenda (loja)", curto: "Revenda", cor: C.teal, icon: ShoppingBag, dica: "Vendido ao cliente do coworking (papelaria, snacks, etc.)." },
  uso: { label: "Uso interno", curto: "Uso interno", cor: C.blue, icon: Wrench, dica: "Consumo da operação (limpeza, suprimentos)." },
};
const tipoDe = (e) => TIPOS[e.tipo] || TIPOS.uso;
const CATEGORIAS = ["Cafeteria", "Insumo", "Bebidas", "Snacks", "Papelaria", "Escritório", "Suprimento", "Limpeza", "Outros"];
const MEDIDAS = ["un", "kg", "L", "cx", "rolo", "pct"];
const margemPct = (e) => (e.precoVenda > 0 ? Math.round((1 - (e.custo || 0) / e.precoVenda) * 100) : 0);

export default function Estoque() {
  const store = useStore();
  const { activeUnit, unidadeAtiva } = store;
  const todos = store.estoqueDe(activeUnit);
  const baixos = store.estoqueBaixoDe(activeUnit);
  const [filtro, setFiltro] = useState("todos");
  const [modal, setModal] = useState(null);
  const [compra, setCompra] = useState(null);
  const [venda, setVenda] = useState(null);

  const itens = filtro === "todos" ? todos : todos.filter((e) => (e.tipo || "uso") === filtro);
  const valorTotal = todos.reduce((s, e) => s + e.quantidade * (e.custo || 0), 0);
  const valorLoja = todos.filter((e) => e.tipo === "revenda").reduce((s, e) => s + e.quantidade * (e.precoVenda || 0), 0);
  const contar = (t) => todos.filter((e) => (e.tipo || "uso") === t).length;

  const TABS = [
    { id: "todos", label: "Todos", icon: Boxes, n: todos.length },
    { id: "insumo", label: "Cafeteria", icon: Coffee, n: contar("insumo") },
    { id: "revenda", label: "Revenda (loja)", icon: ShoppingBag, n: contar("revenda") },
    { id: "uso", label: "Uso interno", icon: Wrench, n: contar("uso") },
  ];

  return (
    <div>
      <PageHead
        title="Estoque"
        sub={`Itens da unidade ${unidadeAtiva?.nome || ""} — cafeteria, revenda (loja) e uso interno, com estoque mínimo e baixa automática.`}
        action={<Btn onClick={() => setModal({})}><Plus size={16} /> Novo item</Btn>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16, marginBottom: 18 }}>
        <Kpi label="Valor em estoque" valor={fmt(valorTotal)} icon={Coins} cor={C.cafe} />
        <Kpi label="Abaixo do mínimo" valor={baixos.length} icon={AlertTriangle} cor={baixos.length ? C.red : C.green} />
        <Kpi label="Loja · potencial de venda" valor={fmt(valorLoja)} icon={Store} cor={C.teal} />
        <Kpi label="Itens cadastrados" valor={todos.length} icon={Boxes} cor={C.blue} />
      </div>

      {/* Filtros por tipo */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {TABS.map((t) => {
          const on = filtro === t.id;
          return (
            <button key={t.id} onClick={() => setFiltro(t.id)} className="cw-btn"
              style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 13px", borderRadius: 11, fontFamily: sans, fontSize: 13, fontWeight: 600, border: `1px solid ${on ? C.cafe : C.border}`, background: on ? C.cafe : C.white, color: on ? "#fff" : C.text2 }}>
              <t.icon size={14} /> {t.label}
              <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 10, background: on ? "rgba(255,255,255,.22)" : C.cream2, color: on ? "#fff" : C.text3 }}>{t.n}</span>
            </button>
          );
        })}
      </div>

      {baixos.length > 0 && filtro === "todos" && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, background: C.amberPale, border: `1px solid ${C.amber}55`, borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
          <AlertTriangle size={18} color={C.amber} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: C.text2 }}>
            <b>{baixos.length} {baixos.length > 1 ? "itens precisam" : "item precisa"} de reposição.</b>{" "}
            Recepção e responsável avisados: {baixos.map((b) => b.nome).join(", ")}.
          </div>
        </div>
      )}

      {itens.length === 0 ? (
        <Card><Empty icon={PackageSearch} title="Nada por aqui" sub="Cadastre itens de cafeteria, revenda (loja) e uso interno." /></Card>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {itens.map((e, i) => {
            const baixo = e.quantidade <= e.estoqueMinimo;
            const t = tipoDe(e);
            const ehRevenda = e.tipo === "revenda";
            return (
              <div key={e.id} className="cw-row" style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 18px", borderTop: i > 0 ? `1px solid ${C.border2}` : "none", flexWrap: "wrap" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: baixo ? C.red : C.green, flexShrink: 0 }} />
                <div style={{ width: 38, height: 38, borderRadius: 10, background: `${t.cor}14`, display: "grid", placeItems: "center", flexShrink: 0 }}>
                  <t.icon size={18} color={t.cor} />
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{e.nome}</span>
                    <Badge color={t.cor}>{t.curto}</Badge>
                    {e.categoria && <span style={{ fontSize: 11, color: C.text4 }}>{e.categoria}</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: C.text3, marginTop: 2 }}>
                    mín. {e.estoqueMinimo} {e.unidade} · custo {fmt(e.custo || 0)}
                    {ehRevenda && e.precoVenda > 0 && <> · vende <b style={{ color: C.teal }}>{fmt(e.precoVenda)}</b> · margem {margemPct(e)}%</>}
                  </div>
                </div>

                {/* Quantidade com ajuste rápido */}
                <div style={{ textAlign: "center" }}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <button onClick={() => store.ajustarEstoque(e.id, -1)} className="cw-btn" title="Baixa (−1)" style={{ width: 24, height: 24, borderRadius: 7, border: `1px solid ${C.border}`, color: C.red, display: "grid", placeItems: "center" }}><Minus size={13} /></button>
                    <span style={{ fontFamily: serif, fontSize: 18, fontWeight: 600, color: baixo ? C.red : C.text, minWidth: 30 }}>{e.quantidade}</span>
                    <button onClick={() => store.ajustarEstoque(e.id, 1)} className="cw-btn" title="Entrada (+1)" style={{ width: 24, height: 24, borderRadius: 7, border: `1px solid ${C.border}`, color: C.green, display: "grid", placeItems: "center" }}><Plus size={13} /></button>
                  </div>
                  {baixo && <div style={{ fontSize: 10, color: C.red, marginTop: 2 }}>repor</div>}
                </div>

                <div style={{ display: "flex", gap: 4 }}>
                  {ehRevenda && (
                    <button onClick={() => setVenda(e)} title="Vender ao cliente" className="cw-btn" style={{ color: "#fff", background: C.teal, padding: "6px 10px", borderRadius: 9, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 600 }}><DollarSign size={14} /> Vender</button>
                  )}
                  <button onClick={() => setCompra(e)} title="Comprar / repor" className="cw-btn" style={{ color: C.cafe, padding: 6 }}><ShoppingCart size={15} /></button>
                  <button onClick={() => setModal(e)} title="Editar" className="cw-btn" style={{ color: C.text3, padding: 6 }}><Edit3 size={15} /></button>
                  <button onClick={() => store.removeItemEstoque(e.id)} title="Excluir" className="cw-btn" style={{ color: C.red, padding: 6 }}><Trash2 size={15} /></button>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <div style={{ fontSize: 12, color: C.text3, marginTop: 14, fontStyle: "italic", display: "flex", alignItems: "center", gap: 7 }}>
        <ArrowDownUp size={14} /> Cafeteria baixa sozinho na venda do PDV. Revenda baixa ao clicar em "Vender" (lança no financeiro). Uso interno você ajusta na mão.
      </div>

      {modal && (
        <Modal title={modal.id ? "Editar item" : "Novo item de estoque"} onClose={() => setModal(null)} maxWidth={480}>
          <ItemForm inicial={modal} onSalvar={(d) => { if (modal.id) store.updateItemEstoque(modal.id, d); else store.addItemEstoque(activeUnit, d); setModal(null); }} />
        </Modal>
      )}
      {compra && (
        <Modal title={`Comprar / repor · ${compra.nome}`} onClose={() => setCompra(null)} maxWidth={440}>
          <CompraForm item={compra} onComprar={(d) => { store.comprarEstoque(activeUnit, compra.id, d); setCompra(null); }} />
        </Modal>
      )}
      {venda && (
        <Modal title={`Vender · ${venda.nome}`} onClose={() => setVenda(null)} maxWidth={400}>
          <VendaForm item={venda} onVender={(q, cli) => { store.venderEstoque(activeUnit, venda.id, q, cli); setVenda(null); }} />
        </Modal>
      )}
    </div>
  );
}

function VendaForm({ item, onVender }) {
  const [q, setQ] = useState(1);
  const [cli, setCli] = useState("");
  const total = (q || 0) * (item.precoVenda || 0);
  const valido = q > 0 && q <= item.quantidade;
  return (
    <>
      <div style={{ fontSize: 12.5, color: C.text3, marginBottom: 14 }}>
        Em estoque: <b>{item.quantidade} {item.unidade}</b> · preço {fmt(item.precoVenda || 0)} · margem {margemPct(item)}%. A venda baixa o estoque e lança a receita no financeiro.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 12 }}>
        <Field label="Qtd"><input type="number" min="1" max={item.quantidade} value={q} onChange={(e) => setQ(+e.target.value)} style={inp} /></Field>
        <Field label="Cliente (opcional)"><input value={cli} onChange={(e) => setCli(e.target.value)} style={inp} placeholder="Quem comprou" /></Field>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: C.tealPale, borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
        <span style={{ fontSize: 13, color: C.text2 }}>Total da venda</span>
        <span style={{ fontFamily: serif, fontSize: 19, color: C.teal }}>{fmt(total)}</span>
      </div>
      <Btn variant="teal" style={{ width: "100%", justifyContent: "center", opacity: valido ? 1 : 0.5 }} onClick={() => valido && onVender(q, cli)}>
        <DollarSign size={16} /> Registrar venda
      </Btn>
    </>
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
          <div style={{ fontFamily: serif, fontSize: 23, color: C.text, marginTop: 4 }}>{valor}</div>
        </div>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: `${cor}16`, display: "grid", placeItems: "center" }}><Icon size={19} color={cor} /></div>
      </div>
    </Card>
  );
}

function ItemForm({ inicial, onSalvar }) {
  const [f, setF] = useState({
    nome: inicial.nome || "", tipo: inicial.tipo || "insumo", categoria: inicial.categoria || "Cafeteria",
    quantidade: inicial.quantidade ?? 0, estoqueMinimo: inicial.estoqueMinimo ?? 0,
    unidade: inicial.unidade || "un", custo: inicial.custo ?? 0, precoVenda: inicial.precoVenda ?? 0,
  });
  const num = (k) => (e) => setF({ ...f, [k]: +e.target.value });
  const valido = f.nome.trim();
  const ehRevenda = f.tipo === "revenda";
  const margem = f.precoVenda > 0 ? Math.round((1 - (f.custo || 0) / f.precoVenda) * 100) : 0;

  return (
    <>
      <Field label="Tipo do item">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {Object.entries(TIPOS).map(([k, t]) => (
            <button key={k} type="button" onClick={() => setF({ ...f, tipo: k })}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "11px 6px", borderRadius: 12, border: `1px solid ${f.tipo === k ? t.cor : C.border}`, background: f.tipo === k ? `${t.cor}12` : C.white, color: f.tipo === k ? t.cor : C.text2, fontSize: 12, fontWeight: 600 }}>
              <t.icon size={18} /> {t.curto}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: C.text3, marginTop: 6 }}>{TIPOS[f.tipo].dica}</div>
      </Field>

      <Field label="Nome do item"><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} style={inp} placeholder="Ex: Caderno A5, Leite, Detergente" /></Field>
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
      <div style={{ display: "grid", gridTemplateColumns: ehRevenda ? "1fr 1fr 1fr 1fr" : "1fr 1fr 1fr", gap: 12 }}>
        <Field label="Quantidade"><input type="number" min="0" value={f.quantidade} onChange={num("quantidade")} style={inp} /></Field>
        <Field label="Estoque mín."><input type="number" min="0" value={f.estoqueMinimo} onChange={num("estoqueMinimo")} style={inp} /></Field>
        <Field label="Custo (R$)"><input type="number" min="0" step="0.01" value={f.custo} onChange={num("custo")} style={inp} /></Field>
        {ehRevenda && <Field label="Venda (R$)"><input type="number" min="0" step="0.01" value={f.precoVenda} onChange={num("precoVenda")} style={inp} /></Field>}
      </div>
      {ehRevenda && (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: C.text2, background: C.tealPale, borderRadius: 9, padding: "8px 12px", marginBottom: 12 }}>
          <span>Margem de venda</span><b style={{ color: C.teal }}>{margem}%</b>
        </div>
      )}
      <div style={{ fontSize: 11.5, color: C.text3, marginBottom: 14 }}>Quando a quantidade ficar ≤ o mínimo, recepção e responsável recebem o alerta.</div>
      <Btn style={{ width: "100%", justifyContent: "center", opacity: valido ? 1 : 0.5 }} onClick={() => valido && onSalvar({ ...f })}>
        <Boxes size={16} /> {inicial.id ? "Salvar item" : "Cadastrar item"}
      </Btn>
    </>
  );
}
