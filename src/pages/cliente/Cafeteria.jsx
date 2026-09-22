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
  const [formaPagamento, setFormaPagamento] = useState("agora");

  const carregar = (forcar = false) => {
    setErro("");
    clienteApi.loja(forcar).then((r) => {
      setDados(r);
      setUnidadeId((atual) => atual || r.unidades?.[0]?.id || "");
    }).catch((e) => setErro(e.message));
  };
  useEffect(() => carregar(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const unidade = dados?.unidades?.find((u) => u.id === unidadeId);
  useEffect(() => setFormaPagamento(unidade?.cliente_mensal ? "mensal" : "agora"), [unidadeId, unidade?.cliente_mensal]);
  const produtos = useMemo(() => unidade?.produtos || [], [unidade]);
  const categorias = [...new Set(produtos.map((p) => p.categoria))];
  const itens = useMemo(() => produtos.flatMap((p) => carrinho[p.id] ? [{ ...p, quantidade: carrinho[p.id] }] : []), [produtos, carrinho]);
  const total = itens.reduce((s, i) => s + i.preco * i.quantidade, 0);
  const mudar = (id, delta) => setCarrinho((c) => ({ ...c, [id]: Math.max(0, Math.min(50, (c[id] || 0) + delta)) }));

  const finalizar = async () => {
    if (!itens.length) return;
    setEnviando(true); setErro("");
    try {
      const r = await clienteApi.comprar(unidadeId, itens.map((i) => ({ id: i.id, quantidade: i.quantidade })), formaPagamento);
      if (r.faturado_no_mes) carregar(true);
      setPagamento(r.faturado_no_mes ? { mensal: true, competencia: r.competencia } : r.cobranca); setCarrinho({});
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
      {unidade?.cliente_mensal && <Card style={{ marginBottom: 16, padding: 14, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div><b>Consumo previsto deste mês</b><div style={{ color: C.text3, fontSize: 12 }}>Compras lançadas e ainda não faturadas. Confira o extrato abaixo.</div></div>
        <strong style={{ fontFamily: serif, fontSize: 22, color: C.cafe }}>{fmt(unidade.consumo_mes || 0)}</strong>
      </Card>}
      {unidade?.cliente_mensal && <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ fontFamily: serif, fontSize: 20, margin: 0 }}>Extrato do mês</h2>
          <span style={{ color: C.text3, fontSize: 12 }}>Somente compras ainda não faturadas</span>
        </div>
        {!unidade.consumos?.length ? <p style={{ color: C.text3, fontSize: 13, marginBottom: 0 }}>Nenhuma compra lançada na fatura deste mês.</p> :
          <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
            {unidade.consumos.map((compra) => <li key={compra.id} style={{ borderTop: `1px solid ${C.border2}`, padding: "12px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <b style={{ fontSize: 13 }}>{new Date(compra.data).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" })}</b>
                <b style={{ color: C.cafe }}>{fmt(compra.valor)}</b>
              </div>
              <div style={{ color: C.text3, fontSize: 12, marginTop: 4 }}>{compra.itens.map((item) => `${item.quantidade}× ${item.nome}`).join(" · ")}</div>
            </li>)}
          </ul>}
        <p style={{ fontSize: 11.5, color: C.text3, margin: "8px 0 0" }}>Após o fechamento, consulte a cobrança em Faturas.</p>
      </Card>}
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
          {unidade?.cliente_mensal && <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: 10, border: `1px solid ${formaPagamento === "mensal" ? C.teal : C.border}`, borderRadius: 10, cursor: "pointer" }}>
              <input type="radio" name="forma-cafeteria" checked={formaPagamento === "mensal"} onChange={() => setFormaPagamento("mensal")} />
              <span style={{ fontSize: 12.5 }}><b>Lançar na fatura mensal</b><br /><small style={{ color: C.text3 }}>Receba uma cobrança consolidada no fechamento do mês.</small></span>
            </label>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: 10, border: `1px solid ${formaPagamento === "agora" ? C.teal : C.border}`, borderRadius: 10, cursor: "pointer" }}>
              <input type="radio" name="forma-cafeteria" checked={formaPagamento === "agora"} onChange={() => setFormaPagamento("agora")} />
              <span style={{ fontSize: 12.5 }}><b>Pagar agora</b><br /><small style={{ color: C.text3 }}>PIX, boleto ou cartão pelo Asaas.</small></span>
            </label>
          </div>}
          <Btn disabled={!itens.length || enviando} onClick={finalizar} style={{ width: "100%", justifyContent: "center" }}>{enviando ? "Registrando pedido…" : formaPagamento === "mensal" && unidade?.cliente_mensal ? "Fazer pedido" : "Pedir e pagar"}</Btn>
          <div style={{ fontSize: 11.5, color: C.text3, marginTop: 9 }}>{formaPagamento === "mensal" && unidade?.cliente_mensal ? "O pedido vai para a recepção agora e entra no fechamento mensal." : "Você escolhe PIX, boleto ou cartão na página segura de pagamento."}</div>
        </Card>
      </div>
    </>}
    {pagamento && <Card style={{ marginTop: 18, borderColor: C.green }}>
      <Badge color={C.green}>Pedido criado</Badge>
      <h3 style={{ fontFamily: serif, marginBottom: 6 }}>{pagamento.mensal ? "Lançado na fatura mensal" : "Conclua o pagamento"}</h3>
      <p style={{ color: C.text3 }}>{pagamento.mensal ? "O pedido já entrou na fila da recepção. Este consumo será somado à sua fatura no fechamento do mês." : "Conclua o pagamento para o pedido entrar na fila da recepção. A cobrança também aparecerá em suas faturas."}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {pagamento.invoice_url && <Btn onClick={() => window.open(pagamento.invoice_url, "_blank", "noopener")}><ExternalLink size={15} /> Abrir pagamento</Btn>}
        <Btn variant="ghost" onClick={() => go?.("cli_faturas")}>Ver faturas</Btn>
      </div>
    </Card>}
    {dados && <button className="cw-btn" onClick={() => carregar(true)} style={{ marginTop: 18, color: C.text3 }}><RefreshCw size={14} /> Atualizar produtos</button>}
  </div>;
}
