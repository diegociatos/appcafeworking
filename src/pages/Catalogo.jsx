import { useState } from "react";
import { Plus, Edit3, Trash2, Package, Repeat, Layers, Tag, Coffee, DoorOpen } from "lucide-react";
import { Card, Badge, Btn, PageHead, Modal, Field, Empty, ImageInput } from "../components/ui.jsx";
import { C, serif, sans, fmt, inp } from "../lib/theme.js";
import { useStore } from "../lib/store.jsx";

const TIPOS = [
  { id: "plano", label: "Plano", plural: "Planos", cor: C.cafe },
  { id: "servico", label: "Serviço", plural: "Serviços", cor: C.teal },
  { id: "produto", label: "Produto", plural: "Produtos", cor: C.amber },
];
const tipoInfo = (id) => TIPOS.find((t) => t.id === id) || { label: "Item", cor: C.text3 };

export default function Catalogo() {
  const { activeUnit, unidadeAtiva, catalogoDe, salasDe, addItemCatalogo, updateItemCatalogo, removeItemCatalogo } = useStore();
  const [filtro, setFiltro] = useState("todos");
  const [modal, setModal] = useState(null);

  const salas = salasDe(activeUnit);
  const salaNome = (id) => salas.find((s) => s.id === id)?.nome;
  const itens = catalogoDe(activeUnit);
  const lista = filtro === "todos" ? itens : itens.filter((i) => i.tipo === filtro);

  const recorrentes = itens.filter((i) => i.recorrente).length;
  const ticket = itens.length ? itens.reduce((s, i) => s + i.preco, 0) / itens.length : 0;

  return (
    <div>
      <PageHead
        title="Produtos e Serviços"
        sub={`O que a unidade ${unidadeAtiva?.nome || ""} comercializa: planos, serviços e produtos para faturamento.`}
        action={
          <Btn onClick={() => setModal({})}>
            <Plus size={16} /> Novo item
          </Btn>
        }
      />

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 16, marginBottom: 20 }}>
        <Mini label="Itens no catálogo" valor={itens.length} icon={Layers} cor={C.teal} />
        <Mini label="Recorrentes (mensalidade)" valor={recorrentes} icon={Repeat} cor={C.cafe} />
        <Mini label="Ticket médio" valor={fmt(ticket)} icon={Tag} cor={C.amber} />
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border2}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[["todos", "Todos"], ...TIPOS.map((t) => [t.id, t.plural])].map(([id, lb]) => (
              <button key={id} onClick={() => setFiltro(id)} className="cw-btn"
                style={{ padding: "6px 12px", borderRadius: 9, fontSize: 13, fontWeight: 600, border: `1px solid ${filtro === id ? C.cafe : C.border}`, background: filtro === id ? C.cafe : C.white, color: filtro === id ? "#fff" : C.text2 }}>
                {lb}
              </button>
            ))}
          </div>
          <Btn onClick={() => setModal({})} style={{ padding: "8px 14px", fontSize: 13 }}><Plus size={15} /> Novo item</Btn>
        </div>

        {lista.length === 0 ? (
          <Empty icon={Package} title="Nada no catálogo" sub="Cadastre planos, serviços e produtos que a unidade vende." />
        ) : (
          lista.map((it, i) => {
            const ti = tipoInfo(it.tipo);
            const margem = it.preco > 0 ? Math.round(((it.preco - (it.custo || 0)) / it.preco) * 100) : 0;
            return (
              <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: i < lista.length - 1 ? `1px solid ${C.border2}` : "none" }}>
                {it.foto ? (
                  <img src={it.foto} alt={it.nome} style={{ width: 38, height: 38, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: `${ti.cor}16`, display: "grid", placeItems: "center", flexShrink: 0, fontSize: 18 }}>
                    {it.tipo === "produto" && it.emoji ? it.emoji : <Package size={18} color={ti.cor} />}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14.5, fontWeight: 600 }}>{it.nome}</span>
                    <Badge color={ti.cor}>{ti.label}</Badge>
                    {it.recorrente && <Badge color={C.teal}>Recorrente</Badge>}
                    {it.ativo === false && <Badge color={C.text3}>Inativo</Badge>}
                  </div>
                  <div style={{ fontSize: 11.5, color: C.text3, marginTop: 3, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span>Custo {fmt(it.custo || 0)} · margem {margem}%</span>
                    {it.tipo === "produto" && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: C.amber }}>
                        <Coffee size={12} /> {it.categoria || "Cafeteria"} · aparece no PDV
                      </span>
                    )}
                    {it.tipo === "plano" && it.salaId && salaNome(it.salaId) && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: C.cafe }}>
                        <DoorOpen size={12} /> {salaNome(it.salaId)}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: "right", minWidth: 100 }}>
                  <div style={{ fontFamily: serif, fontSize: 18, color: C.cafe }}>{fmt(it.preco)}</div>
                  <div style={{ fontSize: 10.5, color: C.text4 }}>{it.recorrente ? "por mês" : "por unidade"}</div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => setModal(it)} className="cw-btn" style={{ color: C.text3, padding: 6 }}><Edit3 size={15} /></button>
                  <button onClick={() => removeItemCatalogo(it.id)} className="cw-btn" style={{ color: C.red, padding: 6 }}><Trash2 size={15} /></button>
                </div>
              </div>
            );
          })
        )}
      </Card>

      {modal && (
        <Modal title={modal.id ? "Editar item" : "Novo produto/serviço"} onClose={() => setModal(null)}>
          <ItemForm
            inicial={modal}
            onSave={(d) => {
              if (modal.id) updateItemCatalogo(modal.id, d);
              else addItemCatalogo(activeUnit, d);
              setModal(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function Mini({ label, valor, icon: Icon, cor }) {
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 12.5, color: C.text3 }}>{label}</div>
          <div style={{ fontFamily: serif, fontSize: 24, color: C.text, marginTop: 4 }}>{valor}</div>
        </div>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: `${cor}16`, display: "grid", placeItems: "center" }}>
          <Icon size={19} color={cor} />
        </div>
      </div>
    </Card>
  );
}

function ItemForm({ inicial, onSave }) {
  const { activeUnit, salasDe, estoqueDe } = useStore();
  const salas = salasDe(activeUnit);
  const insumos = estoqueDe(activeUnit);
  const [f, setF] = useState({
    nome: inicial.nome || "",
    tipo: inicial.tipo || "plano",
    preco: inicial.preco || 0,
    custo: inicial.custo || 0,
    recorrente: inicial.recorrente ?? true,
    ativo: inicial.ativo !== false,
    categoria: inicial.categoria || "Café",
    emoji: inicial.emoji || "☕",
    foto: inicial.foto || "",
    salaId: inicial.salaId || "",
    ficha: inicial.ficha || [],
  });
  const ehProduto = f.tipo === "produto";
  const escolherSala = (id) => {
    const s = salas.find((x) => x.id === id);
    setF({ ...f, salaId: id, preco: f.preco || s?.valorMensal || 0, nome: f.nome || (s ? s.nome : "") });
  };
  // Ficha técnica: ao alterar, recalcula o custo do produto pelo custo dos insumos.
  const setFicha = (ficha) => setF((p) => {
    if (!ficha.length) return { ...p, ficha };
    const custo = ficha.reduce((s, r) => {
      const e = insumos.find((x) => x.nome === r.nome);
      return s + (e ? e.custo * (r.qtd || 0) : 0);
    }, 0);
    return { ...p, ficha, custo: Math.round(custo * 100) / 100 };
  });
  const addFichaRow = () => setFicha([...(f.ficha || []), { nome: insumos[0]?.nome || "", qtd: 1 }]);
  const updFichaRow = (i, patch) => setFicha(f.ficha.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const delFichaRow = (i) => setFicha(f.ficha.filter((_, j) => j !== i));
  return (
    <>
      <Field label="Tipo">
        <div style={{ display: "flex", gap: 8 }}>
          {TIPOS.map((t) => (
            <button key={t.id} type="button" onClick={() => setF({ ...f, tipo: t.id, recorrente: t.id === "produto" ? false : f.recorrente })}
              style={{ flex: 1, padding: "10px 0", borderRadius: 10, fontFamily: sans, fontSize: 13.5, fontWeight: 600, border: `1px solid ${f.tipo === t.id ? t.cor : C.border}`, background: f.tipo === t.id ? t.cor : C.white, color: f.tipo === t.id ? "#fff" : C.text2 }}>
              {t.label}
            </button>
          ))}
        </div>
      </Field>

      {ehProduto && (
        <Field label="Foto do produto (o cliente e a recepção veem na cafeteria)">
          <ImageInput value={f.foto} onChange={(v) => setF({ ...f, foto: v })} height={130} />
        </Field>
      )}

      {ehProduto ? (
        <div style={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: 12 }}>
          <Field label="Emoji">
            <input value={f.emoji} onChange={(e) => setF({ ...f, emoji: e.target.value })} style={{ ...inp, textAlign: "center", fontSize: 20 }} maxLength={2} />
          </Field>
          <Field label="Nome do produto">
            <input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} style={inp} placeholder="Ex: Cappuccino" />
          </Field>
        </div>
      ) : (
        <Field label="Nome do produto/serviço">
          <input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} style={inp} placeholder="Ex: Sala Privativa, Diária, Hora de reunião..." />
        </Field>
      )}

      {f.tipo === "plano" && (
        <Field label="Sala vinculada (opcional)">
          <select value={f.salaId} onChange={(e) => escolherSala(e.target.value)} style={inp}>
            <option value="">— nenhuma (plano genérico) —</option>
            {salas.map((s) => <option key={s.id} value={s.id}>{s.nome} · {s.tipo}{s.valorMensal ? ` · ${fmt(s.valorMensal)}/mês` : ""}</option>)}
          </select>
          {salas.length === 0
            ? <div style={{ fontSize: 11, color: C.text4, marginTop: 4 }}>Cadastre salas no menu "Salas" para poder vincular.</div>
            : <div style={{ fontSize: 11, color: C.text4, marginTop: 4 }}>Vincule quando o plano é de uma sala específica (ex.: Sala Privativa 3). Ao escolher, sugerimos o valor mensal da sala.</div>}
        </Field>
      )}

      {ehProduto && (
        <Field label="Categoria (agrupa no PDV da cafeteria)">
          <select value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} style={inp}>
            {["Café", "Salgados", "Doces", "Bebidas", "Outros"].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      )}

      {ehProduto && (
        <Field label="Ficha técnica (insumos do estoque — baixa automática e CMV real na venda)">
          {insumos.length === 0 ? (
            <div style={{ fontSize: 11.5, color: C.text4 }}>
              Cadastre insumos no menu <b>Estoque</b> para montar a ficha. Sem ficha, a venda baixa o próprio produto do estoque.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {(f.ficha || []).map((r, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 92px 30px", gap: 8, alignItems: "center" }}>
                  <select value={r.nome} onChange={(ev) => updFichaRow(i, { nome: ev.target.value })} style={inp}>
                    {insumos.map((x) => <option key={x.id} value={x.nome}>{x.nome} ({x.unidade})</option>)}
                  </select>
                  <input type="number" min="0" step="0.01" value={r.qtd} onChange={(ev) => updFichaRow(i, { qtd: +ev.target.value })} style={inp} placeholder="qtd" />
                  <button type="button" onClick={() => delFichaRow(i)} className="cw-btn" style={{ color: C.red, padding: 6 }}><Trash2 size={15} /></button>
                </div>
              ))}
              <button type="button" onClick={addFichaRow} className="cw-btn"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.cafe, border: `1px dashed ${C.border}`, borderRadius: 9, padding: "7px 0", background: C.white }}>
                <Plus size={14} /> Adicionar insumo
              </button>
              {f.ficha?.length > 0 && (
                <div style={{ fontSize: 11.5, color: C.text3 }}>
                  Custo pela ficha: <b style={{ color: C.text2 }}>{fmt(f.custo)}</b> — preenche o custo automaticamente e baixa cada insumo a cada venda.
                </div>
              )}
            </div>
          )}
        </Field>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Preço de venda (R$)">
          <input type="number" min="0" step="0.01" value={f.preco} onChange={(e) => setF({ ...f, preco: +e.target.value })} style={inp} />
        </Field>
        <Field label="Custo (R$)">
          <input type="number" min="0" step="0.01" value={f.custo} onChange={(e) => setF({ ...f, custo: +e.target.value })} style={inp} />
        </Field>
      </div>
      {f.preco > 0 && (
        <div style={{ fontSize: 12, color: C.text3, marginBottom: 12 }}>
          Margem: <b style={{ color: C.green }}>{(((f.preco - f.custo) / f.preco) * 100).toFixed(0)}%</b>
        </div>
      )}
      {!ehProduto && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.text2, marginBottom: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={f.recorrente} onChange={(e) => setF({ ...f, recorrente: e.target.checked })} />
          Cobrança recorrente (mensalidade)
        </label>
      )}
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.text2, marginBottom: 14, cursor: "pointer" }}>
        <input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} />
        Ativo (disponível para venda)
      </label>
      {ehProduto && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.amber, background: `${C.amber}12`, borderRadius: 8, padding: "8px 10px", marginBottom: 14 }}>
          <Coffee size={14} /> Este produto aparece na <b>cafeteria/PDV</b> para a recepção vender.
        </div>
      )}
      <Btn style={{ width: "100%", justifyContent: "center" }} onClick={() => f.nome.trim() && onSave(f)}>
        {inicial.id ? "Salvar item" : "Adicionar ao catálogo"}
      </Btn>
    </>
  );
}
