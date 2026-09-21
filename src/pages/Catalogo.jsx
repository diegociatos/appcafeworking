import { useState } from "react";
import { Plus, Edit3, Trash2, Package, Layers, Tag, Coffee, Globe2, UserRoundCheck } from "lucide-react";
import { Card, Badge, Btn, PageHead, Modal, Field, Empty, ImageInput } from "../components/ui.jsx";
import { C, serif, fmt, inp } from "../lib/theme.js";
import { useStore } from "../lib/store.jsx";
import { enviarFotoProduto } from "../lib/fotosProdutos.js";

export default function Catalogo() {
  const { activeUnit, unidadeAtiva, catalogoDe, addItemCatalogo, updateItemCatalogo, removeItemCatalogo } = useStore();
  const [modal, setModal] = useState(null);

  // Registros antigos de plano/serviço continuam preservados no banco, mas são
  // administrados somente pelo módulo "Planos e serviços" daqui em diante.
  const itens = catalogoDe(activeUnit).filter((i) => i.tipo === "produto");
  const ticket = itens.length ? itens.reduce((s, i) => s + i.preco, 0) / itens.length : 0;
  const noSite = itens.filter((i) => i.ativo !== false && i.publicarNoSite === true).length;
  const noApp = itens.filter((i) => i.ativo !== false && i.venderNoAppCliente === true).length;

  return (
    <div>
      <PageHead
        title="Produtos da cafeteria"
        sub={`Cadastre o que a unidade ${unidadeAtiva?.nome || ""} vende e escolha onde cada produto aparece.`}
        action={
          <Btn onClick={() => setModal({})}>
            <Plus size={16} /> Novo produto
          </Btn>
        }
      />

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 16, marginBottom: 20 }}>
        <Mini label="Produtos cadastrados" valor={itens.length} icon={Layers} cor={C.teal} />
        <Mini label="No cardápio do site" valor={noSite} icon={Globe2} cor={C.green} />
        <Mini label="Na área do cliente" valor={noApp} icon={UserRoundCheck} cor={C.cafe} />
        <Mini label="Ticket médio" valor={fmt(ticket)} icon={Tag} cor={C.amber} />
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border2}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12.5, color: C.text3 }}>Produtos ativos aparecem no PDV. Site e área do cliente são escolhidos separadamente.</div>
          <Btn onClick={() => setModal({})} style={{ padding: "8px 14px", fontSize: 13 }}><Plus size={15} /> Novo produto</Btn>
        </div>

        {itens.length === 0 ? (
          <Empty icon={Package} title="Nenhum produto cadastrado" sub="Cadastre cafés, alimentos, papelaria, impressões e outros itens vendidos pela cafeteria." />
        ) : (
          itens.map((it, i) => {
            const ti = { label: "Produto", cor: C.amber };
            const margem = it.preco > 0 ? Math.round(((it.preco - (it.custo || 0)) / it.preco) * 100) : 0;
            return (
              <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: i < itens.length - 1 ? `1px solid ${C.border2}` : "none" }}>
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
                    {it.ativo === false && <Badge color={C.text3}>Inativo</Badge>}
                    {it.publicarNoSite === true && <Badge color={C.green}>No site</Badge>}
                    {it.venderNoAppCliente === true && <Badge color={C.cafe}>Área do cliente</Badge>}
                  </div>
                  <div style={{ fontSize: 11.5, color: C.text3, marginTop: 3, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span>Custo {fmt(it.custo || 0)} · margem {margem}%</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: C.amber }}>
                      <Coffee size={12} /> {it.categoria || "Cafeteria"} · aparece no PDV
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: "right", minWidth: 100 }}>
                  <div style={{ fontFamily: serif, fontSize: 18, color: C.cafe }}>{fmt(it.preco)}</div>
                  <div style={{ fontSize: 10.5, color: C.text4 }}>por unidade</div>
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
        <Modal title={modal.id ? "Editar produto" : "Novo produto da cafeteria"} onClose={() => setModal(null)}>
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
  const { activeUnit, estoqueDe } = useStore();
  const insumos = estoqueDe(activeUnit);
  const [f, setF] = useState({
    nome: inicial.nome || "",
    tipo: "produto",
    preco: inicial.preco || 0,
    custo: inicial.custo || 0,
    recorrente: false,
    ativo: inicial.ativo !== false,
    categoria: inicial.categoria || "Café",
    emoji: inicial.emoji || "☕",
    foto: inicial.foto || "",
    publicarNoSite: inicial.id ? inicial.publicarNoSite === true : true,
    venderNoAppCliente: inicial.id ? inicial.venderNoAppCliente === true : false,
    ficha: inicial.ficha || [],
  });
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
      <Field label="Foto do produto">
        <ImageInput value={f.foto} onChange={(v) => setF({ ...f, foto: v })} uploadFile={(arquivo) => enviarFotoProduto(activeUnit, arquivo)} height={130} />
        <div style={{ fontSize: 11.5, color: C.text3, marginTop: 6 }}>A foto será usada no PDV e nos canais que você liberar abaixo.</div>
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: 12 }}>
        <Field label="Emoji">
          <input value={f.emoji} onChange={(e) => setF({ ...f, emoji: e.target.value })} style={{ ...inp, textAlign: "center", fontSize: 20 }} maxLength={2} />
        </Field>
        <Field label="Nome do produto">
          <input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} style={inp} placeholder="Ex: Cappuccino, caneta ou impressão A4" />
        </Field>
      </div>

      <Field label="Categoria (agrupa no PDV e nas vitrines)">
        <select value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} style={inp}>
          {["Café", "Salgados", "Doces", "Bebidas", "Papelaria", "Impressões", "Outros"].map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>

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
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.text2, marginBottom: 14, cursor: "pointer" }}>
        <input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} />
        Ativo (disponível para venda)
      </label>
      <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: C.text2, marginBottom: 14, cursor: "pointer" }}>
        <input type="checkbox" checked={f.publicarNoSite} onChange={(e) => setF({ ...f, publicarNoSite: e.target.checked })} style={{ marginTop: 2 }} />
        <span><b>Exibir no cardápio público do site</b><br /><small style={{ color: C.text3 }}>Use para cafés, alimentos e bebidas que qualquer visitante pode conhecer.</small></span>
      </label>
      <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: C.text2, marginBottom: 14, cursor: "pointer" }}>
        <input type="checkbox" checked={f.venderNoAppCliente} onChange={(e) => setF({ ...f, venderNoAppCliente: e.target.checked })} style={{ marginTop: 2 }} />
        <span><b>Permitir compra na área do cliente</b><br /><small style={{ color: C.text3 }}>Use também para papelaria, impressões e itens exclusivos de quem trabalha no coworking.</small></span>
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.amber, background: `${C.amber}12`, borderRadius: 8, padding: "8px 10px", marginBottom: 14 }}>
        <Coffee size={14} /> Todo produto ativo aparece no <b>PDV</b>. Os dois canais acima são independentes.
      </div>
      <Btn style={{ width: "100%", justifyContent: "center" }} onClick={() => f.nome.trim() && onSave(f)}>
        {inicial.id ? "Salvar produto" : "Adicionar produto"}
      </Btn>
    </>
  );
}
