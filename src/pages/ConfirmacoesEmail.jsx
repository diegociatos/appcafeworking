import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Eye, Mail, RefreshCw, Search, AlertCircle } from "lucide-react";
import { Badge, Btn, Card, Empty } from "../components/ui.jsx";
import { notificacoesApi } from "../lib/notificacoesApi.js";
import { C, inp } from "../lib/theme.js";

const EVENTOS = {
  boleto_nova: "Boleto enviado", boleto_lembrete: "Lembrete de boleto",
  boleto_pago: "Boleto pago", boleto_vencido: "Boleto vencido",
  cobranca_nova: "Cobrança enviada", nfse_emitida: "Nota fiscal enviada",
};
const horario = (valor) => valor ? new Date(valor).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
const estado = (item) => item.confirmed_at ? ["Recebimento confirmado", C.green]
  : item.opened_at ? ["Abertura detectada", C.teal]
  : item.status === "enviado" ? ["Enviado", C.blue]
  : item.status === "erro" ? ["Falha no envio", C.red]
  : item.status === "cancelado" ? ["Não enviado", C.text3]
  : ["Em processamento", C.amber];

export default function ConfirmacoesEmail({ unidadeId }) {
  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [evento, setEvento] = useState("todos");
  const carregar = useCallback(async () => {
    setCarregando(true);
    const resposta = await notificacoesApi.listarDetalhado(unidadeId, 200, Object.keys(EVENTOS));
    setItens(resposta.itens);
    setErro(resposta.erro);
    setCarregando(false);
  }, [unidadeId]);

  useEffect(() => { carregar(); }, [carregar]);
  const filtrados = useMemo(() => itens.filter((n) => {
    if (evento !== "todos" && n.evento !== evento) return false;
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return !termo || `${n.cliente_nome || ""} ${n.destinatario || ""} ${n.assunto || ""}`.toLocaleLowerCase("pt-BR").includes(termo);
  }), [itens, evento, busca]);
  const total = {
    enviados: itens.filter((n) => n.sent_at || n.status === "enviado").length,
    abertos: itens.filter((n) => n.opened_at).length,
    confirmados: itens.filter((n) => n.confirmed_at).length,
    falhas: itens.filter((n) => n.status === "erro").length,
  };

  return <div>
    <Card style={{ marginBottom: 16, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: 23, margin: 0 }}>Confirmação dos e-mails financeiros</h2>
          <p style={{ color: C.text3, fontSize: 13, margin: "7px 0 0" }}>Acompanhe cada destinatário do boleto, cobrança e nota fiscal.</p>
        </div>
        <Btn variant="ghost" onClick={carregar} disabled={carregando}><RefreshCw size={15} /> {carregando ? "Atualizando…" : "Atualizar"}</Btn>
      </div>
      <p style={{ background: C.cafePale, borderRadius: 10, padding: 12, color: C.text2, fontSize: 12.5, margin: "16px 0 0" }}>
        “Enviado” indica aceite pelo serviço de e-mail. “Abertura detectada” depende das imagens do e-mail; “Recebimento confirmado” aparece quando o cliente clica no botão de confirmação.
      </p>
    </Card>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 16 }}>
      {[["Enviados", total.enviados, Mail, C.blue], ["Abertos", total.abertos, Eye, C.teal], ["Confirmados", total.confirmados, CheckCircle2, C.green], ["Falhas", total.falhas, AlertCircle, C.red]].map(([titulo, valor, Icon, cor]) =>
        <Card key={titulo} style={{ padding: 17 }}><Icon size={18} color={cor} /><div style={{ fontSize: 25, fontWeight: 700, color: cor, marginTop: 8 }}>{valor}</div><div style={{ color: C.text3, fontSize: 12 }}>{titulo}</div></Card>)}
    </div>
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: 16, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ position: "relative", flex: "1 1 240px" }}><Search size={16} color={C.text3} style={{ position: "absolute", left: 11, top: 12 }} /><input aria-label="Buscar cliente ou e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente ou e-mail" style={{ ...inp, width: "100%", paddingLeft: 35 }} /></div>
        <select aria-label="Filtrar tipo de e-mail" value={evento} onChange={(e) => setEvento(e.target.value)} style={{ ...inp, flex: "0 1 220px" }}><option value="todos">Todos os avisos</option>{Object.entries(EVENTOS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
      </div>
      {erro && <p role="alert" style={{ color: C.red, padding: "0 16px" }}>{erro}</p>}
      {carregando ? <p role="status" style={{ padding: 20, color: C.text3 }}>Carregando envios…</p>
        : filtrados.length === 0 ? <Empty icon={Mail} title="Nenhum envio encontrado" sub={busca || evento !== "todos" ? "Ajuste os filtros para ver outros envios." : "Os e-mails financeiros desta unidade aparecerão aqui."} />
        : filtrados.map((n) => { const [rotulo, cor] = estado(n); return <div key={n.id} style={{ padding: "15px 18px", borderBottom: `1px solid ${C.border2}`, display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ minWidth: 200, flex: "1 1 250px" }}><div style={{ fontWeight: 700, fontSize: 14 }}>{n.cliente_nome || "Cliente"}</div><div style={{ color: C.text3, fontSize: 12, overflowWrap: "anywhere" }}>{n.destinatario}</div><div style={{ color: C.text2, fontSize: 12, marginTop: 4 }}>{EVENTOS[n.evento]}</div></div>
          <div style={{ flex: "1 1 270px", fontSize: 12, color: C.text3, display: "grid", gap: 2 }}><span>Enviado: {horario(n.sent_at)}</span><span>Aberto: {horario(n.opened_at)}</span><span>Confirmado: {horario(n.confirmed_at)}</span></div>
          <div style={{ alignSelf: "center" }}><Badge color={cor}>{rotulo}</Badge></div>
          {n.status === "erro" && n.erro && <div style={{ width: "100%", color: C.red, fontSize: 12 }}>Falha: {n.erro}</div>}
        </div>; })}
    </Card>
    {itens.length >= 200 && <p style={{ color: C.text3, fontSize: 12, marginTop: 10 }}>Exibindo os 200 envios mais recentes desta unidade.</p>}
  </div>;
}
