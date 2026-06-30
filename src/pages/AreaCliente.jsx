import { useState } from "react";
import {
  Eye, Home, Briefcase, CalendarDays, Coffee, CreditCard, FileText,
  Download, Wallet, Plus, Minus, CheckCircle2, Copy, Clock, ShoppingCart,
  Building2, Send, MessageSquare, Bell, ArrowRight,
} from "lucide-react";
import { Card, Badge, Btn, PageHead, Modal, Field, Empty } from "../components/ui.jsx";
import { C, serif, fmt, inp } from "../lib/theme.js";
import { HORARIOS, DIAS } from "../lib/data.js";
import { useStore } from "../lib/store.jsx";
import { getUser, supabaseConfigured } from "../lib/supabaseAuth.js";
import { getClienteAtualSeguro } from "../lib/clienteAtual.js";


// Documentos do imóvel liberados a clientes com endereço fiscal
const DOCS_IMOVEL = [
  { nome: "IPTU 2025.pdf", tipo: "Imposto predial", data: "08/01/2025" },
  { nome: "Matrícula do imóvel.pdf", tipo: "Registro de imóveis", data: "12/03/2024" },
  { nome: "Comprovante de endereço.pdf", tipo: "Endereço fiscal", data: "15/02/2025" },
  { nome: "Alvará de funcionamento.pdf", tipo: "Licença municipal", data: "20/01/2025" },
];

function baixarArquivo(nome, conteudo) {
  const blob = new Blob([conteudo], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome.replace(/\.pdf$/i, "") + ".txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function AreaCliente({ section, go }) {
  const { unidades, salasDe, produtosDe, criarReserva, reservas, addPedido, pedidosDe, correspondenciasDe, conversasDe, enviarMensagemCliente, clienteNotifPrefs, updateClienteNotifPrefs, clientes, boletos, baixarBoleto, saldosCliente, CREDITO_TIPOS } = useStore();
  const CRED_LB = { sala_reuniao: "Reunião (h)", coworking: "Coworking (h)", daypass: "Day-pass", correspondencia: "Corresp." };
  const meuEmail = (getUser()?.email || "").toLowerCase();
  // Em perfil cliente a navegação vem do sidebar (section = cli_*). Preview de
  // staff (não-clienteMode) e modo demo podem usar o primeiro cliente.
  const clienteMode = typeof section === "string" && section.startsWith("cli_");
  const demoOuPreview = !supabaseConfigured || !clienteMode;
  const cliReal = getClienteAtualSeguro({ email: meuEmail, clientes, demo: demoOuPreview });
  const naoLocalizado = clienteMode && supabaseConfigured && !cliReal; // login real sem cadastro vinculado
  const cli = cliReal || { nome: "Cliente", unidade: "", plano: "—", fiscal: false, docs: [] };
  const unidadeCli = unidades.find((u) => u.nome === cli.unidade) || unidades[0] || { id: "", nome: "" };
  const salas = salasDe(unidadeCli.id);
  // Salas de locação mensal (contratadas) não entram nas opções de reserva do cliente
  const salasDisponiveis = salas.filter((s) => !s.contratada);
  const produtos = produtosDe(unidadeCli.id).filter((p) => p.ativo !== false);

  const [tabInterno, setTabInterno] = useState("inicio");
  const sec = clienteMode ? section.slice(4) : tabInterno;
  const irPara = (s) => (clienteMode && go ? go(`cli_${s}`) : setTabInterno(s));

  const [reservaSala, setReservaSala] = useState(null);
  const [carrinho, setCarrinho] = useState([]);
  const [pedidoOk, setPedidoOk] = useState(false);
  const [obsCafe, setObsCafe] = useState("");
  const [entregaCafe, setEntregaCafe] = useState("balcao");
  // Faturas do cliente = boletos reais emitidos para ele (nada fictício).
  const faturas = (boletos || [])
    .filter((b) => b.sacado === cli.nome && b.status !== "cancelado")
    .map((b) => ({
      id: b.id, desc: b.instrucoes || "Cobrança", valor: b.valor,
      venc: (b.vencimento || "").split("-").reverse().join("/"),
      status: b.status === "pago" ? "pago" : "aberto",
    }));
  const [pagarFatura, setPagarFatura] = useState(null);
  const [docAberto, setDocAberto] = useState(null);
  const [msgInput, setMsgInput] = useState("");
  const minhaConversa = conversasDe(unidadeCli.id).find((c) => c.cliente === cli.nome);
  const mensagens = minhaConversa?.msgs?.length
    ? minhaConversa.msgs
    : [{ de: "adm", txt: "Olá! Aqui é a recepção do CafeWorking. Como podemos ajudar?", h: "" }];

  const minhasReservas = reservas.filter((r) => r.cliente === cli.nome);
  const proximaFatura = faturas.find((f) => f.status === "aberto");
  // Correspondências liberadas pela recepção (status notificado) chegam como documento novo
  const minhasCorresp = correspondenciasDe(unidadeCli.id).filter((c) => c.cliente === cli.nome && c.status !== "retirada");
  const corrNovas = minhasCorresp.filter((c) => c.status === "notificado");
  const novoDocs = cli.docs.filter((d) => d.status === "novo").length + corrNovas.length;

  const addCafe = (p) =>
    setCarrinho((c) => {
      const f = c.find((i) => i.id === p.id);
      return f ? c.map((i) => (i.id === p.id ? { ...i, q: i.q + 1 } : i)) : [...c, { ...p, q: 1 }];
    });
  const subCafe = (id) => setCarrinho((c) => c.map((i) => (i.id === id ? { ...i, q: i.q - 1 } : i)).filter((i) => i.q > 0));
  const totalCafe = carrinho.reduce((s, i) => s + i.preco * i.q, 0);
  const meusPedidos = pedidosDe(unidadeCli.id).filter((p) => p.cliente === cli.nome);
  const STATUS_PEDIDO = { recebido: ["Recebido", C.blue], preparo: ["Em preparo", C.amber], pronto: ["Pronto p/ retirada", C.green], entregue: ["Entregue", C.text3] };
  const finalizarPedido = () => {
    const naSala = entregaCafe === "sala" && minhasReservas[0];
    addPedido(unidadeCli.id, {
      cliente: cli.nome,
      itens: carrinho.map((i) => ({ nome: i.nome, preco: i.preco, q: i.q, emoji: i.emoji })),
      total: totalCafe,
      hora: "agora",
      origem: "app",
      observacao: obsCafe.trim() || undefined,
      entregaLocal: entregaCafe,
      salaId: naSala ? naSala.sala : undefined,
      salaNome: naSala ? salas.find((s) => s.id === naSala.sala)?.nome : undefined,
    });
    setCarrinho([]); setObsCafe(""); setEntregaCafe("balcao");
    setPedidoOk(true);
  };
  const pagar = (id) => { baixarBoleto?.(id); setPagarFatura(null); };
  const nomeSala = (id) => salas.find((s) => s.id === id)?.nome || "Sala";

  const enviarMsg = () => {
    const t = msgInput.trim();
    if (!t) return;
    enviarMensagemCliente(unidadeCli.id, cli.nome, t);
    setMsgInput("");
  };

  const TABS = [
    { id: "inicio", label: "Início", icon: Home },
    { id: "reservar", label: "Reservar sala", icon: CalendarDays },
    { id: "cafe", label: "Cafeteria", icon: Coffee },
    { id: "faturas", label: "Faturas", icon: Wallet },
    { id: "docs", label: "Documentos", icon: FileText, badge: novoDocs },
    ...(cli.fiscal ? [{ id: "fiscal", label: "Endereço fiscal", icon: Building2 }] : []),
    { id: "chat", label: "Falar com recepção", icon: MessageSquare },
    { id: "notif", label: "Notificações", icon: Bell },
  ];
  const tituloSec = TABS.find((t) => t.id === sec)?.label || "Portal";

  if (naoLocalizado) {
    return (
      <div>
        <PageHead title="Portal do cliente" sub="Acesso do membro do coworking." />
        <Card style={{ maxWidth: 520, margin: "8px auto", textAlign: "center", padding: "36px 28px" }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: C.amberPale, display: "grid", placeItems: "center", margin: "0 auto 14px" }}>
            <Bell size={26} color={C.amber} />
          </div>
          <div style={{ fontFamily: serif, fontSize: 21, color: C.text, marginBottom: 8 }}>Cadastro não localizado</div>
          <div style={{ fontSize: 14, color: C.text3, lineHeight: 1.6 }}>
            Seu login <b>{meuEmail || "—"}</b> ainda não está vinculado a um cadastro de cliente nesta unidade.
            Por segurança, não exibimos faturas, documentos nem reservas até que o vínculo seja confirmado.
            <br /><br />Procure a <b>recepção</b> para concluir seu cadastro.
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHead
        title={clienteMode ? tituloSec : "Área do Cliente"}
        sub={clienteMode ? `${cli.nome} · ${cli.plano} · ${cli.unidade}` : "Portal do membro — reservas, cafeteria, faturas e documentos."}
      />

      {!clienteMode && (
        <>
          <div style={{ background: C.teal, borderRadius: 16, padding: "12px 18px", marginBottom: 18, display: "flex", alignItems: "center", gap: 10, color: "#fff", fontSize: 13 }}>
            <Eye size={16} /> Pré-visualização de como <b style={{ margin: "0 4px" }}>{cli.nome}</b> enxerga o portal. No perfil "Cliente", a navegação fica no menu lateral.
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 22, flexWrap: "wrap" }}>
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTabInterno(t.id)} className="cw-btn"
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 12, fontFamily: "inherit", fontSize: 14, fontWeight: 600, border: `1px solid ${sec === t.id ? C.cafe : C.border}`, background: sec === t.id ? C.cafe : C.white, color: sec === t.id ? "#fff" : C.text2 }}>
                <t.icon size={16} /> {t.label}
                {t.badge > 0 && <span style={{ fontSize: 11, fontWeight: 700, background: sec === t.id ? "rgba(255,255,255,.25)" : C.cafe, color: "#fff", borderRadius: 9, padding: "1px 7px" }}>{t.badge}</span>}
              </button>
            ))}
          </div>
        </>
      )}

      {/* ===== INÍCIO ===== */}
      {sec === "inicio" && (
        <>
          {novoDocs > 0 && (
            <Card className="cw-lift" onClick={() => irPara("docs")} style={{ cursor: "pointer", marginBottom: 16, background: C.amberPale, border: `1px solid ${C.amber}44`, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: C.amber, display: "grid", placeItems: "center", flexShrink: 0 }}><Bell size={20} color="#fff" /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Você tem {novoDocs} documento{novoDocs > 1 ? "s" : ""} novo{novoDocs > 1 ? "s" : ""}</div>
                <div style={{ fontSize: 12, color: C.text3 }}>Toque para ver em Documentos</div>
              </div>
              <ArrowRight size={18} color={C.amber} />
            </Card>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }} className="cw-grid-stack">
            <Card>
              <div style={{ fontFamily: serif, fontSize: 19, marginBottom: 14 }}>Meu plano</div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 16, background: C.cafePale, borderRadius: 14 }}>
                <Briefcase size={28} color={C.cafe} />
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{cli.plano}</div>
                  <div style={{ fontSize: 13, color: C.text3 }}>{cli.unidade} · ativo desde {cli.desde}</div>
                </div>
              </div>
              {(() => {
                const cr = cli.id && saldosCliente ? saldosCliente(cli.id) : {};
                const ativos = (CREDITO_TIPOS || []).filter((t) => cr[t] > 0);
                if (!ativos.length) return null;
                return (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, color: C.text4, marginBottom: 6, fontWeight: 600 }}>SEUS CRÉDITOS NESTE CICLO</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {ativos.map((t) => (
                        <span key={t} style={{ fontSize: 11.5, color: C.cafe, background: C.cafePale, padding: "4px 9px", borderRadius: 10, fontWeight: 600 }}>{cr[t]} · {CRED_LB[t]}</span>
                      ))}
                    </div>
                  </div>
                );
              })()}
              <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Btn variant="ghost" style={{ flex: 1, justifyContent: "center", minWidth: 130 }} onClick={() => irPara("reservar")}><CalendarDays size={15} /> Reservar sala</Btn>
                <Btn variant="ghost" style={{ flex: 1, justifyContent: "center", minWidth: 130 }} onClick={() => irPara("cafe")}><Coffee size={15} /> Pedir café</Btn>
              </div>
            </Card>
            <Card>
              <div style={{ fontFamily: serif, fontSize: 19, marginBottom: 14 }}>Próxima fatura</div>
              {proximaFatura ? (
                <div style={{ textAlign: "center", padding: "10px 0" }}>
                  <div style={{ fontFamily: serif, fontSize: 34, color: C.cafe }}>{fmt(proximaFatura.valor)}</div>
                  <div style={{ fontSize: 13, color: C.text3 }}>vence em {proximaFatura.venc}</div>
                  <Btn variant="teal" style={{ marginTop: 14, justifyContent: "center", width: "100%" }} onClick={() => setPagarFatura(proximaFatura)}><CreditCard size={16} /> Pagar agora (Pix)</Btn>
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                  <CheckCircle2 size={32} color={C.green} />
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 8 }}>Tudo em dia!</div>
                </div>
              )}
            </Card>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
            {[
              { ic: CalendarDays, t: "Reservar sala", s: `${salasDisponiveis.length} salas`, go: "reservar" },
              { ic: Coffee, t: "Pedir café", s: `${produtos.length} itens`, go: "cafe" },
              { ic: Wallet, t: "Faturas", s: proximaFatura ? "1 em aberto" : "Em dia", go: "faturas" },
              { ic: MessageSquare, t: "Falar com recepção", s: "Atendimento", go: "chat" },
            ].map((a, i) => (
              <Card key={i} className="cw-lift" style={{ cursor: "pointer", padding: 16, textAlign: "left" }} onClick={() => irPara(a.go)}>
                <a.ic size={22} color={C.cafe} style={{ marginBottom: 10 }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{a.t}</div>
                <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>{a.s}</div>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* ===== RESERVAR ===== */}
      {sec === "reservar" && (
        <>
          <Card style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: serif, fontSize: 19, marginBottom: 14 }}>Salas em {unidadeCli.nome}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))", gap: 12 }}>
              {salasDisponiveis.map((s) => (
                <div key={s.id} style={{ border: `1px solid ${C.border2}`, borderRadius: 14, overflow: "hidden" }}>
                  {s.foto ? (
                    <img src={s.foto} alt={s.nome} onError={(e) => (e.currentTarget.style.display = "none")} style={{ width: "100%", height: 110, objectFit: "cover", background: C.cream2, display: "block" }} />
                  ) : (
                    <div style={{ height: 110, background: C.cream2, display: "grid", placeItems: "center" }}><CalendarDays size={26} color={C.gray} /></div>
                  )}
                  <div style={{ padding: 12 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{s.nome}</div>
                    <div style={{ fontSize: 12, color: C.text3 }}>{s.tipo} · {s.cap} lugares</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                      <span style={{ color: C.cafe, fontWeight: 600, fontSize: 13 }}>{s.valor}</span>
                      <Btn variant="soft" style={{ padding: "6px 12px", fontSize: 13 }} onClick={() => setReservaSala(s)}><CalendarDays size={14} /> Reservar</Btn>
                    </div>
                  </div>
                </div>
              ))}
              {salasDisponiveis.length === 0 && <Empty icon={CalendarDays} title="Sem salas disponíveis" sub="Não há salas disponíveis para reserva nesta unidade." />}
            </div>
          </Card>
          <Card>
            <div style={{ fontFamily: serif, fontSize: 19, marginBottom: 14 }}>Minhas reservas</div>
            {minhasReservas.length === 0 ? (
              <Empty icon={Clock} title="Nenhuma reserva" sub="Reserve uma sala acima." />
            ) : (
              minhasReservas.map((r) => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: `1px solid ${C.border2}` }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: C.cafePale, display: "grid", placeItems: "center" }}><CalendarDays size={18} color={C.cafe} /></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{nomeSala(r.sala)}</div>
                    <div style={{ fontSize: 12, color: C.text3 }}>{DIAS[r.dia] || "—"} · {HORARIOS[r.inicio]}–{HORARIOS[r.inicio + r.dur] || "23:00"}{r.base ? ` · Base ${r.base}` : ""}</div>
                  </div>
                  <Badge color={C.green}>Confirmada</Badge>
                </div>
              ))
            )}
          </Card>
        </>
      )}

      {/* ===== CAFETERIA ===== */}
      {sec === "cafe" && (
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16 }} className="cw-grid-stack">
          <Card>
            <div style={{ fontFamily: serif, fontSize: 19, marginBottom: 14 }}>Cardápio</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 12 }}>
              {produtos.map((p) => (
                <button key={p.id} className="cw-lift cw-btn" onClick={() => addCafe(p)} style={{ border: `1px solid ${C.border2}`, borderRadius: 14, overflow: "hidden", textAlign: "left", background: C.white, padding: 0 }}>
                  {p.foto ? (
                    <img src={p.foto} alt={p.nome} onError={(e) => (e.currentTarget.style.display = "none")} style={{ width: "100%", height: 96, objectFit: "cover", background: C.cream2, display: "block" }} />
                  ) : (
                    <div style={{ height: 96, background: C.cream2, display: "grid", placeItems: "center", fontSize: 34 }}>{p.emoji}</div>
                  )}
                  <div style={{ padding: 12 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{p.nome}</div>
                    <div style={{ color: C.cafe, fontWeight: 600, fontSize: 14, fontFamily: serif, marginTop: 4 }}>{fmt(p.preco)}</div>
                  </div>
                </button>
              ))}
              {produtos.length === 0 && <Empty icon={Coffee} title="Cardápio vazio" sub="Sem produtos nesta unidade." />}
            </div>
          </Card>
          <Card style={{ alignSelf: "start", position: "sticky", top: 90 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}><ShoppingCart size={18} color={C.cafe} /><span style={{ fontFamily: serif, fontSize: 19 }}>Meu pedido</span></div>
            {carrinho.length === 0 ? (
              <Empty icon={Coffee} title="Carrinho vazio" sub="Toque nos itens." />
            ) : (
              <>
                {carrinho.map((i) => (
                  <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `1px solid ${C.border2}` }}>
                    <span style={{ fontSize: 20 }}>{i.emoji || "🛒"}</span>
                    <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{i.nome}</div><div style={{ fontSize: 12, color: C.text3 }}>{fmt(i.preco)}</div></div>
                    <button onClick={() => subCafe(i.id)} style={{ width: 26, height: 26, borderRadius: 8, background: C.cream2, display: "grid", placeItems: "center" }}><Minus size={14} /></button>
                    <span style={{ width: 18, textAlign: "center", fontWeight: 600 }}>{i.q}</span>
                    <button onClick={() => addCafe(i)} style={{ width: 26, height: 26, borderRadius: 8, background: C.cafePale, display: "grid", placeItems: "center" }}><Plus size={14} color={C.cafe} /></button>
                  </div>
                ))}
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11.5, color: C.text3, fontWeight: 600, marginBottom: 6 }}>ENTREGA</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {[["balcao", "Retiro no balcão"], ...(minhasReservas.length ? [["sala", `Levar na ${salas.find((s) => s.id === minhasReservas[0].sala)?.nome || "sala"}`]] : [])].map(([v, lb]) => (
                      <button key={v} type="button" onClick={() => setEntregaCafe(v)}
                        style={{ flex: 1, padding: "9px 6px", borderRadius: 10, fontSize: 12.5, fontWeight: 600, border: `1px solid ${entregaCafe === v ? C.cafe : C.border}`, background: entregaCafe === v ? C.cafePale : C.white, color: entregaCafe === v ? C.cafe : C.text2 }}>
                        {lb}
                      </button>
                    ))}
                  </div>
                </div>
                <input value={obsCafe} onChange={(e) => setObsCafe(e.target.value)} placeholder="Observação (ex.: sem açúcar)" aria-label="Observação do pedido" style={{ ...inp, marginTop: 10 }} />
                <div style={{ display: "flex", justifyContent: "space-between", margin: "14px 0" }}><span style={{ fontSize: 15, color: C.text3 }}>Total</span><span style={{ fontFamily: serif, fontSize: 24, color: C.cafe }}>{fmt(totalCafe)}</span></div>
                <Btn style={{ width: "100%", justifyContent: "center" }} onClick={finalizarPedido}><CheckCircle2 size={17} /> Pedir agora</Btn>
              </>
            )}
            {meusPedidos.length > 0 && (
              <div style={{ marginTop: 18, borderTop: `1px solid ${C.border2}`, paddingTop: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text3, marginBottom: 8 }}>MEUS PEDIDOS</div>
                {meusPedidos.map((pd) => {
                  const [lb, cor] = STATUS_PEDIDO[pd.status] || ["—", C.text3];
                  return (
                    <div key={pd.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", fontSize: 13 }}>
                      <span style={{ color: C.text2 }}>{pd.itens.reduce((s, i) => s + i.q, 0)} itens · {fmt(pd.total)}</span>
                      <Badge color={cor} bg={`${cor}1a`}><Clock size={11} /> {lb}</Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ===== FATURAS ===== */}
      {sec === "faturas" && (
        <Card>
          <div style={{ fontFamily: serif, fontSize: 19, marginBottom: 14 }}>Minhas faturas</div>
          {faturas.map((f, i) => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 0", borderBottom: i < faturas.length - 1 ? `1px solid ${C.border2}` : "none" }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: C.cafePale, display: "grid", placeItems: "center" }}><Wallet size={18} color={C.cafe} /></div>
              <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{f.desc}</div><div style={{ fontSize: 12, color: C.text3 }}>Vence em {f.venc}</div></div>
              <span style={{ fontFamily: serif, fontSize: 17, color: C.cafe }}>{fmt(f.valor)}</span>
              {f.status === "pago" ? <Badge color={C.green}><CheckCircle2 size={11} /> Pago</Badge> : <Btn variant="teal" style={{ padding: "8px 14px", fontSize: 13 }} onClick={() => setPagarFatura(f)}><CreditCard size={14} /> Pagar</Btn>}
            </div>
          ))}
        </Card>
      )}

      {/* ===== DOCUMENTOS ===== */}
      {sec === "docs" && (
        <Card>
          <div style={{ fontFamily: serif, fontSize: 19, marginBottom: 4 }}>Documentos e correspondências</div>
          <div style={{ fontSize: 13, color: C.text3, marginBottom: 14 }}>Você é avisado aqui sempre que chega um documento novo.</div>

          {minhasCorresp.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text3, margin: "2px 0 6px", letterSpacing: 0.3 }}>CORRESPONDÊNCIAS RECEBIDAS</div>
              {minhasCorresp.map((c) => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: `1px solid ${C.border2}` }}>
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: c.status === "notificado" ? C.amberPale : C.tealPale, display: "grid", placeItems: "center", flexShrink: 0 }}>
                    <FileText size={17} color={c.status === "notificado" ? C.amber : C.teal} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{c.remetente}</div>
                    <div style={{ fontSize: 12, color: C.text3 }}>{c.tipo} · recebida {c.recebido}</div>
                  </div>
                  {c.status === "notificado" && <Badge color={C.amber} bg={C.amberPale}>Novo</Badge>}
                  {c.anexo && <Btn variant="ghost" style={{ padding: "8px 12px", fontSize: 13 }} onClick={() => setDocAberto({ nome: `${c.tipo} · ${c.remetente}`, tipo: c.tipo, data: c.recebido, foto: (c.anexo.tipo || "").startsWith("image") ? c.anexo.url : null, anexo: c.anexo, descricao: c.descricao })}>Ver</Btn>}
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: 12, fontWeight: 700, color: C.text3, margin: "2px 0 6px", letterSpacing: 0.3 }}>MEUS DOCUMENTOS</div>
          {cli.docs.length === 0 ? (
            <Empty icon={FileText} title="Nenhum documento" sub="Seus documentos aparecerão aqui." />
          ) : (
            cli.docs.map((d, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: i < cli.docs.length - 1 ? `1px solid ${C.border2}` : "none" }}>
                <FileText size={18} color={C.teal} />
                <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{d.nome}</div><div style={{ fontSize: 12, color: C.text3 }}>{d.tipo} · {d.data}</div></div>
                {d.status === "novo" && <Badge color={C.amber} bg={C.amberPale}>Novo</Badge>}
                <Btn variant="ghost" style={{ padding: "8px 12px", fontSize: 13 }} onClick={() => setDocAberto(d)}>Abrir</Btn>
                <button onClick={() => baixarArquivo(d.nome, `CafeWorking · ${cli.nome}\n${d.nome} · ${d.tipo} · ${d.data}`)} title="Baixar" style={{ color: C.text4, padding: 6 }}><Download size={17} /></button>
              </div>
            ))
          )}
        </Card>
      )}

      {/* ===== ENDEREÇO FISCAL ===== */}
      {sec === "fiscal" && (
        <>
          <Card style={{ marginBottom: 16, background: C.tealPale, border: `1px solid ${C.tealLine}`, display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: C.teal, display: "grid", placeItems: "center", flexShrink: 0 }}><Building2 size={22} color="#fff" /></div>
            <div>
              <div style={{ fontFamily: serif, fontSize: 17, color: C.teal }}>Endereço fiscal ativo em {cli.unidade}</div>
              <div style={{ fontSize: 13, color: C.teal2 }}>Como você tem endereço fiscal conosco, liberamos os documentos do imóvel (IPTU e outros) para o seu uso.</div>
            </div>
          </Card>
          <Card>
            <div style={{ fontFamily: serif, fontSize: 19, marginBottom: 14 }}>Documentos do imóvel</div>
            {DOCS_IMOVEL.map((d, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: i < DOCS_IMOVEL.length - 1 ? `1px solid ${C.border2}` : "none" }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: C.tealPale, display: "grid", placeItems: "center", flexShrink: 0 }}><FileText size={17} color={C.teal} /></div>
                <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{d.nome}</div><div style={{ fontSize: 12, color: C.text3 }}>{d.tipo} · {d.data}</div></div>
                <Badge color={C.green}>Liberado</Badge>
                <button onClick={() => baixarArquivo(d.nome, `CafeWorking · Documento do imóvel\n${d.nome} · ${d.tipo} · ${d.data}\nUnidade: ${cli.unidade}`)} title="Baixar" style={{ color: C.text4, padding: 6 }}><Download size={17} /></button>
              </div>
            ))}
          </Card>
        </>
      )}

      {/* ===== FALAR COM RECEPÇÃO ===== */}
      {sec === "chat" && (
        <Card style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", height: 460 }}>
          <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border2}`, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: "50%", background: C.cafe, color: "#fff", display: "grid", placeItems: "center" }}><MessageSquare size={18} /></div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Recepção · {cli.unidade}</div>
              <div style={{ fontSize: 12, color: C.green }}>● online agora</div>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10, background: C.cream }}>
            {mensagens.map((m, i) => (
              <div key={i} style={{ alignSelf: m.de === "cli" ? "flex-end" : "flex-start", maxWidth: "75%", background: m.de === "cli" ? C.cafe : "#fff", color: m.de === "cli" ? "#fff" : C.text, padding: "9px 13px", borderRadius: 14, fontSize: 13.5, border: m.de === "cli" ? "none" : `1px solid ${C.border2}` }}>
                {m.txt}
                <div style={{ fontSize: 10, opacity: 0.6, marginTop: 3, textAlign: "right" }}>{m.h}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, padding: 12, borderTop: `1px solid ${C.border2}` }}>
            <input value={msgInput} onChange={(e) => setMsgInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && enviarMsg()} placeholder="Escreva para a recepção..." style={{ ...inp, flex: 1 }} />
            <Btn onClick={enviarMsg} style={{ padding: "0 16px" }}><Send size={16} /></Btn>
          </div>
        </Card>
      )}

      {/* ===== NOTIFICAÇÕES (opt-in do cliente) ===== */}
      {sec === "notif" && (
        <NotifPrefs prefs={clienteNotifPrefs} onChange={updateClienteNotifPrefs} email={cli.email} />
      )}

      {/* ===== MODAIS ===== */}
      {reservaSala && (
        <ReservaModal sala={reservaSala} reservas={reservas} onClose={() => setReservaSala(null)}
          onConfirm={async (dados) => { const res = await criarReserva({ sala: reservaSala.id, dia: dados.dia, inicio: dados.inicio, dur: dados.dur, base: dados.base, cliente: cli.nome, clienteId: cli.id, email: cli.email, cor: C.cafe, origem: "app" }); if (!res || res.ok === false) { alert(res?.error || "Não foi possível reservar."); return; } setReservaSala(null); irPara("reservar"); }} />
      )}
      {pagarFatura && (
        <Modal title="Pagar com Pix" onClose={() => setPagarFatura(null)}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: serif, fontSize: 30, color: C.cafe }}>{fmt(pagarFatura.valor)}</div>
            <div style={{ fontSize: 13, color: C.text3, marginBottom: 16 }}>{pagarFatura.desc}</div>
            <div style={{ width: 150, height: 150, margin: "0 auto 14px", borderRadius: 14, background: `repeating-conic-gradient(${C.text} 0% 25%, #fff 0% 50%) 50% / 16px 16px`, border: `1px solid ${C.border}` }} />
            <div onClick={() => navigator.clipboard?.writeText("00020126_PIX_CAFEWORKING_" + pagarFatura.id)} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 13, color: C.text3, cursor: "pointer", marginBottom: 16 }}><Copy size={14} /> Copiar código Pix</div>
            <Btn variant="teal" style={{ width: "100%", justifyContent: "center" }} onClick={() => pagar(pagarFatura.id)}><CheckCircle2 size={16} /> Já paguei / Confirmar</Btn>
          </div>
        </Modal>
      )}
      {docAberto && (
        <Modal title={docAberto.nome} onClose={() => setDocAberto(null)}>
          {docAberto.foto ? (
            <img src={docAberto.foto} alt={docAberto.nome} onError={(e) => (e.currentTarget.style.display = "none")} style={{ width: "100%", borderRadius: 12, marginBottom: 16, background: C.cream2 }} />
          ) : (
            <div style={{ background: C.cream, borderRadius: 12, padding: 20, textAlign: "center", marginBottom: 16 }}>
              <FileText size={40} color={C.teal} />
              <div style={{ fontSize: 13, color: C.text3, marginTop: 10 }}>{docAberto.tipo} · {docAberto.data}</div>
            </div>
          )}
          {docAberto.descricao && <div style={{ fontSize: 13, color: C.text2, marginTop: 12 }}>{docAberto.descricao}</div>}
          <Btn style={{ width: "100%", justifyContent: "center", marginTop: 12 }} onClick={() => {
            if (docAberto.anexo?.url) { const a = document.createElement("a"); a.href = docAberto.anexo.url; a.download = docAberto.anexo.nome || docAberto.nome; document.body.appendChild(a); a.click(); a.remove(); }
            else baixarArquivo(docAberto.nome, `CafeWorking · ${cli.nome}\n${docAberto.nome}`);
          }}><Download size={16} /> Baixar</Btn>
        </Modal>
      )}
      {pedidoOk && (
        <Modal title="Pedido enviado!" onClose={() => setPedidoOk(false)}>
          <div style={{ textAlign: "center", padding: "10px 0" }}>
            <CheckCircle2 size={48} color={C.green} />
            <div style={{ fontSize: 15, fontWeight: 600, marginTop: 12 }}>Seu pedido foi para a cafeteria</div>
            <div style={{ fontSize: 13, color: C.text3, marginTop: 4, marginBottom: 18 }}>Você será avisado quando estiver pronto.</div>
            <Btn style={{ width: "100%", justifyContent: "center" }} onClick={() => setPedidoOk(false)}>Ok</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

function NotifPrefs({ prefs, onChange, email }) {
  const CATS = [
    { id: "cobranca", label: "Cobranças e boletos", sub: "Nova cobrança, lembrete e recibo de pagamento", icon: CreditCard, fixo: true },
    { id: "correspondencia", label: "Correspondências", sub: "Quando chega um documento para você", icon: FileText, fixo: true },
    { id: "cafeteria", label: "Cafeteria", sub: "Pedido recebido e pronto para retirada", icon: Coffee },
    { id: "reservas", label: "Reservas", sub: "Confirmação e lembrete das suas reservas", icon: CalendarDays },
    { id: "novidades", label: "Novidades e avisos", sub: "Eventos, promoções e comunicados", icon: Bell },
  ];
  return (
    <Card style={{ maxWidth: 600, padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border2}` }}>
        <div style={{ fontFamily: serif, fontSize: 18 }}>Notificações por e-mail</div>
        <div style={{ fontSize: 12.5, color: C.text3, marginTop: 3 }}>
          Enviamos para <b>{email || "seu e-mail cadastrado"}</b>. WhatsApp em breve.
        </div>
      </div>
      {CATS.map((c, i) => {
        const on = c.fixo ? true : prefs?.[c.id] !== false;
        return (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: i < CATS.length - 1 ? `1px solid ${C.border2}` : "none" }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: C.cafePale, display: "grid", placeItems: "center", flexShrink: 0 }}>
              <c.icon size={18} color={C.cafe} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{c.label}</span>
                {c.fixo && <Badge color={C.text3} bg={C.cream2}>Sempre ativo</Badge>}
              </div>
              <div style={{ fontSize: 11.5, color: C.text4 }}>{c.sub}</div>
            </div>
            <button
              onClick={() => !c.fixo && onChange({ [c.id]: !on })}
              disabled={c.fixo}
              title={c.fixo ? "Essencial — sempre enviado" : on ? "Receber: ativado" : "Receber: desativado"}
              style={{ width: 44, height: 26, borderRadius: 20, background: on ? C.cafe : C.gray, position: "relative", transition: "all .2s", cursor: c.fixo ? "not-allowed" : "pointer", opacity: c.fixo ? 0.6 : 1, flexShrink: 0 }}>
              <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "all .2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
            </button>
          </div>
        );
      })}
      <div style={{ padding: "12px 20px", background: C.cream, fontSize: 11.5, color: C.text3 }}>
        Cobranças e correspondências são essenciais e sempre enviadas. As demais você escolhe.
      </div>
    </Card>
  );
}

function ReservaModal({ sala, reservas = [], onClose, onConfirm }) {
  const compart = (sala.bases || 0) > 0; // sala compartilhada → reserva por base
  const [f, setF] = useState({ dia: 0, inicio: 2, dur: 1, base: null });
  const setTempo = (patch) => setF((p) => ({ ...p, ...patch, base: compart ? null : p.base }));
  const overlaps = (r) => r.sala === sala.id && r.dia === f.dia && f.inicio < r.inicio + r.dur && r.inicio < f.inicio + f.dur;
  const baseOcupada = (n) => reservas.some((r) => overlaps(r) && r.base === n);
  const bases = compart ? Array.from({ length: sala.bases }, (_, i) => i + 1) : [];
  const livres = bases.filter((n) => !baseOcupada(n)).length;
  const conflito = compart ? (!f.base || baseOcupada(f.base)) : reservas.some((r) => overlaps(r));

  return (
    <Modal title={`Reservar ${sala.nome}`} onClose={onClose}>
      {sala.foto && <img src={sala.foto} alt={sala.nome} onError={(e) => (e.currentTarget.style.display = "none")} style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: 12, marginBottom: 14, background: C.cream2 }} />}
      <div style={{ fontSize: 13, color: C.text3, marginBottom: 14 }}>{sala.tipo} · {sala.cap} lugares{compart ? ` · ${sala.bases} bases` : ""} · {sala.valor}</div>
      <Field label="Dia">
        <select value={f.dia} onChange={(e) => setTempo({ dia: +e.target.value })} style={inp}>
          {DIAS.map((d, i) => <option key={i} value={i}>{d}</option>)}
        </select>
      </Field>
      <div style={{ display: "flex", gap: 12 }}>
        <Field label="Início" style={{ flex: 1 }}>
          <select value={f.inicio} onChange={(e) => setTempo({ inicio: +e.target.value })} style={inp}>
            {HORARIOS.map((h, i) => <option key={i} value={i}>{h}</option>)}
          </select>
        </Field>
        <Field label="Duração" style={{ flex: 1 }}>
          <select value={f.dur} onChange={(e) => setTempo({ dur: +e.target.value })} style={inp}>
            {[1, 2, 3, 4].map((d) => <option key={d} value={d}>{d}h</option>)}
          </select>
        </Field>
      </div>

      {compart && (
        <Field label={`Base de trabalho — ${livres} de ${sala.bases} livre${livres === 1 ? "" : "s"} neste horário`}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(46px,1fr))", gap: 8 }}>
            {bases.map((n) => {
              const ocup = baseOcupada(n); const sel = f.base === n;
              return (
                <button key={n} type="button" disabled={ocup} onClick={() => setF((p) => ({ ...p, base: n }))}
                  title={ocup ? `Base ${n} ocupada` : `Base ${n} livre`} aria-label={`Base ${n}${ocup ? " ocupada" : " livre"}`}
                  style={{ height: 44, borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: ocup ? "not-allowed" : "pointer",
                    border: `1.5px solid ${sel ? C.cafe : ocup ? "transparent" : C.border}`,
                    background: sel ? C.cafe : ocup ? C.redPale : C.white, color: sel ? "#fff" : ocup ? C.red : C.text2 }}>
                  {n}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: C.text4, marginTop: 6 }}>Toque numa base livre (branca). Vermelho = ocupada nesse horário.</div>
        </Field>
      )}

      {conflito ? (
        <div style={{ background: C.redPale, color: C.red, borderRadius: 10, padding: "10px 12px", fontSize: 13, margin: "4px 0 12px" }}>
          {compart
            ? (livres === 0 ? "⚠ Todas as bases estão ocupadas nesse horário. Tente outro horário." : "⚠ Escolha uma base livre acima.")
            : "⚠ Esse horário já está ocupado. Escolha outro horário com a agenda livre."}
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: C.green, margin: "4px 0 12px" }}>
          ✓ {compart ? `Base ${f.base} livre` : "Horário livre"}: {HORARIOS[f.inicio]}–{HORARIOS[f.inicio + f.dur] || "23:00"} · {DIAS[f.dia]}
        </div>
      )}
      <Btn disabled={!!conflito} style={{ width: "100%", justifyContent: "center", marginTop: 6, opacity: conflito ? 0.5 : 1 }} onClick={() => !conflito && onConfirm(f)}><CheckCircle2 size={17} /> Confirmar reserva</Btn>
    </Modal>
  );
}
