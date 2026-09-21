import { useEffect, useMemo, useState } from "react";
import { Coffee, Minus, Plus, ShoppingBag, ExternalLink, RefreshCw } from "lucide-react";
import { Badge, Btn, Card, Empty, PageHead } from "../../components/ui.jsx";
import { C, fmt, inp, serif } from "../../lib/theme.js";
import { clienteApi } from "../../lib/clienteApi.js";

export default function CafeteriaCliente({ go }) {
  const [dados, setDados] = useState(null);
  const [unidadeId, setUnidadeId] = useState("");
  const [carrinho, setCarrinho] = useState({});
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pagamento, setPagamento] = useState(null);

  const carregar = (forcar = false) => {
    setErro("");
    clienteApi.loja(forcar).then((r) => {
      setDados(r);
      setUnidadeId((atual) => atual || r.unidades?.[0]?.id || "");
    }).catch((e) => setErro(e.message));
  };
  useEffect(() => carregar(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const unidade = dados?.unidades?.find((u) => u.id === unidadeId);
  const produtos = useMemo(() => unidade?.produtos || [], [unidade]);
  const categorias = [...new Set(produtos.map((p) => p.categoria))];
  const itens = useMemo(() => produtos.flatMap((p) => carrinho[p.id] ? [{ ...p, quantidade: carrinho[p.id] }] : []), [produtos, carrinho]);
  const total = itens.reduce((s, i) => s + i.preco * i.quantidade, 0);
  const mudar = (id, delta) => setCarrinho((c) => ({ ...c, [id]: Math.max(0, Math.min(50, (c[id] || 0) + delta)) }));

  const finalizar = async () => {
    if (!itens.length) return;
    setEnviando(true); setErro("");
    try {
      const r = await clienteApi.comprar(unidadeId, itens.map((i) => ({ id: i.id, quantidade: i.quantidade })));
      setPagamento(r.cobranca); setCarrinho({});
    } catch (e) { setErro(e.message); }
    finally { setEnviando(false); }
  };

  return <div>
    <PageHead title="Cafeteria e conveniência" sub="Peça cafés, lanches, papelaria e serviços rápidos da sua unidade." />
    {erro && <Card style={{ borderColor: C.red, color: C.red, marginBottom: 16 }}>{erro}</Card>}
    {!dados && !erro && <Card>Carregando produtos…</Card>}
    {dados && !dados.unidades?.length && <Empty icon={Coffee} title="Nenhum produto disponível" sub="A unidade ainda não liberou produtos para compra pelo aplicativo." />}
    {!!dados?.unidades?.length && <>
      {dados.unidades.length > 1 && <select value={unidadeId} onChange={(e) => { setUnidadeId(e.target.value); setCarrinho({}); }} style={{ ...inp, maxWidth: 360, marginBottom: 18 }}>
        {dados.unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
      </select>}
      <div className="cw-grid-stack" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 330px", gap: 18, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 22 }}>
          {categorias.map((categoria) => <section key={categoria}>
            <div style={{ fontFamily: serif, fontSize: 20, marginBottom: 10 }}>{categoria}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: 12 }}>
              {produtos.filter((p) => p.categoria === categoria).map((p) => <Card key={p.id} style={{ padding: 12 }}>
                {p.foto ? <img src={p.foto} alt={p.nome} style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", borderRadius: 12, marginBottom: 10 }} /> : <div style={{ width: "100%", aspectRatio: "4/3", borderRadius: 12, background: C.cream2, display: "grid", placeItems: "center", fontSize: 42, marginBottom: 10 }}>{p.emoji}</div>}
                <div style={{ fontWeight: 700 }}>{p.nome}</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                  <b style={{ color: C.cafe }}>{fmt(p.preco)}</b>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {!!carrinho[p.id] && <><button className="cw-btn" aria-label={`Remover ${p.nome}`} onClick={() => mudar(p.id, -1)}><Minus size={15} /></button><b>{carrinho[p.id]}</b></>}
                    <button className="cw-btn" aria-label={`Adicionar ${p.nome}`} onClick={() => mudar(p.id, 1)} style={{ background: C.teal, color: "white", borderRadius: 9, padding: 7 }}><Plus size={16} /></button>
                  </div>
                </div>
              </Card>)}
            </div>
          </section>)}
        </div>
        <Card style={{ position: "sticky", top: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: serif, fontSize: 20 }}><ShoppingBag size={20} /> Seu pedido</div>
          {!itens.length ? <p style={{ color: C.text3, fontSize: 13 }}>Adicione os produtos que deseja.</p> : itens.map((i) => <div key={i.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "9px 0", borderBottom: `1px solid ${C.border2}`, fontSize: 13 }}><span>{i.quantidade} × {i.nome}</span><b>{fmt(i.preco * i.quantidade)}</b></div>)}
          <div style={{ display: "flex", justifyContent: "space-between", margin: "16px 0", fontSize: 18 }}><b>Total</b><b style={{ color: C.cafe }}>{fmt(total)}</b></div>
          <Btn disabled={!itens.length || enviando} onClick={finalizar} style={{ width: "100%", justifyContent: "center" }}>{enviando ? "Gerando pagamento…" : "Pedir e pagar"}</Btn>
          <div style={{ fontSize: 11.5, color: C.text3, marginTop: 9 }}>Você escolhe PIX, boleto ou cartão na página segura de pagamento.</div>
        </Card>
      </div>
    </>}
    {pagamento && <Card style={{ marginTop: 18, borderColor: C.green }}>
      <Badge color={C.green}>Pedido criado</Badge>
      <h3 style={{ fontFamily: serif, marginBottom: 6 }}>Conclua o pagamento</h3>
      <p style={{ color: C.text3 }}>Conclua o pagamento para o pedido entrar na fila da recepção. A cobrança também aparecerá em suas faturas.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {pagamento.invoice_url && <Btn onClick={() => window.open(pagamento.invoice_url, "_blank", "noopener")}><ExternalLink size={15} /> Abrir pagamento</Btn>}
        <Btn variant="ghost" onClick={() => go?.("cli_faturas")}>Ver faturas</Btn>
      </div>
    </Card>}
    {dados && <button className="cw-btn" onClick={() => carregar(true)} style={{ marginTop: 18, color: C.text3 }}><RefreshCw size={14} /> Atualizar produtos</button>}
  </div>;
}
