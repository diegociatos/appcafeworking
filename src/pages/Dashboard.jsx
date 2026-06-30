import {
  DollarSign, Users, Coffee, TrendingUp,
  MapPin, ArrowUpRight, Building2, AlertCircle, Mail, DoorOpen, Target,
  Receipt,
} from "lucide-react";
import { Card, Badge, Btn, PageHead } from "../components/ui.jsx";
import { C, serif, fmt, fmtShort } from "../lib/theme.js";
import { useStore } from "../lib/store.jsx";
import { getCurrentCompetencia, MESES_BR as MESES } from "../lib/dateUtils.js";
import { Store } from "lucide-react";

const ICONS = { fatura: Receipt, corresp: Mail, sala: DoorOpen, lead: Target, estoque: AlertCircle };

export default function Dashboard({ go }) {
  const store = useStore();
  const { perfil, franqueados, unidades } = store;
  // O Administrador da plataforma tem um painel próprio (não opera coworking)
  if (perfil === "franqueador") return <DashboardPlataforma franqueados={franqueados} unidades={unidades} go={go} />;

  // KPIs executivos calculados dos DADOS REAIS (competência atual). Zeram sem movimento.
  const ativo = store.activeUnit;
  const comp = getCurrentCompetencia();
  const daUnidade = (arr) => (arr || []).filter((x) => !x.unidadeId || x.unidadeId === ativo);
  const lancs = daUnidade(store.lancamentos);
  const clientes = daUnidade(store.clientes);
  const reservas = daUnidade(store.reservas);
  const pedidos = daUnidade(store.pedidos);
  const boletos = daUnidade(store.boletos);
  const leads = daUnidade(store.leads);
  const salas = store.salasDe ? store.salasDe(ativo) : [];
  const contratos = store.contratosDe ? store.contratosDe(ativo).filter((c) => c.status === "ativo") : [];

  // Fluxo real de 12 meses (entradas pagas) — substitui o gráfico procedural.
  const fluxo = MESES.map((label, m) => ({
    label,
    valor: lancs.filter((l) => l.mes === m && l.tipo === "entrada" && l.status === "pago").reduce((s, l) => s + (l.valor || 0), 0),
  }));
  const maxFluxo = Math.max(1, ...fluxo.map((f) => f.valor));
  const receitaMes = fluxo[comp.mes]?.valor || 0;
  const receitaAnterior = fluxo[(comp.mes + 11) % 12]?.valor || 0;
  const deltaMes = receitaAnterior > 0 ? Math.round(((receitaMes - receitaAnterior) / receitaAnterior) * 100) : 0;

  const recorrenteMes = contratos.reduce((s, c) => s + (c.valorMensal || 0), 0);
  const avulsaMes = Math.max(0, receitaMes - recorrenteMes);
  const aReceber = lancs.filter((l) => l.tipo === "entrada" && l.status === "previsto").reduce((s, l) => s + (l.valor || 0), 0);

  const hoje = new Date();
  const vencidos = boletos.filter((b) => b.status !== "pago" && b.status !== "cancelado" && b.vencimento && new Date(b.vencimento) < hoje);
  const inadimplentes = new Set(vencidos.map((b) => b.sacado)).size;

  const totalMembros = clientes.filter((c) => c.status !== "inativo").length;
  const salasTotal = salas.length;
  const ocupacao = salasTotal ? Math.round((salas.filter((s) => s.contratada).length / salasTotal) * 100) : 0;
  const horasReservadas = reservas.reduce((s, r) => s + (r.dur || 0), 0);

  const cafeteriaMes = pedidos.reduce((s, p) => s + (p.total || 0), 0);
  const cmvMes = pedidos.reduce((s, p) => s + (p.cmvTotal || 0), 0);
  const margemCafe = cafeteriaMes > 0 ? Math.round(((cafeteriaMes - cmvMes) / cafeteriaMes) * 100) : 0;
  const ticketCafe = pedidos.length ? cafeteriaMes / pedidos.length : 0;

  const leadsNovosN = leads.filter((l) => l.etapa === "novo").length;
  const conversao = leads.length ? Math.round((leads.filter((l) => l.etapa === "fechado").length / leads.length) * 100) : 0;

  // Top salas (por nº de reservas) e top produtos (por quantidade vendida).
  const nomeSala = (id) => salas.find((s) => s.id === id)?.nome || "Sala";
  const topSalas = Object.entries(reservas.reduce((a, r) => ((a[r.sala] = (a[r.sala] || 0) + 1), a), {}))
    .sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id, n]) => ({ nome: nomeSala(id), n }));
  const topProdutos = Object.entries(pedidos.flatMap((p) => p.itens || []).reduce((a, it) => ((a[it.nome] = (a[it.nome] || 0) + (it.q || 1)), a), {}))
    .sort((a, b) => b[1] - a[1]).slice(0, 4).map(([nome, n]) => ({ nome, n }));

  const stats = [
    { label: `Receita ${MESES[comp.mes]}`, val: fmtShort(receitaMes), delta: deltaMes >= 0 ? `▲ ${deltaMes}% vs mês anterior` : `▼ ${Math.abs(deltaMes)}% vs mês anterior`, icon: DollarSign, cor: deltaMes >= 0 ? C.green : C.red },
    { label: "Receita recorrente", val: fmtShort(recorrenteMes), delta: `avulsa ${fmtShort(avulsaMes)}`, icon: TrendingUp, cor: C.teal },
    { label: "Contas a receber", val: fmtShort(aReceber), delta: `${vencidos.length} boleto(s) vencido(s)`, icon: Receipt, cor: vencidos.length ? C.red : C.cafe },
    { label: "Inadimplentes", val: inadimplentes, delta: inadimplentes ? "acionar cobrança" : "em dia", icon: AlertCircle, cor: inadimplentes ? C.red : C.green },
    { label: "Ocupação de salas", val: `${ocupacao}%`, delta: `${horasReservadas}h reservadas`, icon: DoorOpen, cor: C.cafe },
    { label: "Cafeteria (mês)", val: fmtShort(cafeteriaMes), delta: `margem ${margemCafe}% · tkt ${fmtShort(ticketCafe)}`, icon: Coffee, cor: C.amber },
    { label: "Clientes ativos", val: totalMembros, delta: totalMembros === 1 ? "1 cliente" : `${totalMembros} clientes`, icon: Users, cor: C.teal },
    { label: "Leads / conversão", val: leadsNovosN, delta: `${conversao}% convertidos`, icon: Target, cor: C.cafe2 || C.cafe },
  ];

  // Alertas inteligentes derivados do estado real (vazio = tudo em dia).
  const alertas = [];
  boletos
    .filter((b) => b.status !== "pago" && b.status !== "cancelado" && b.vencimento && new Date(b.vencimento) < hoje)
    .slice(0, 3)
    .forEach((b) => alertas.push({ id: "fat" + b.id, tipo: "fatura", cor: C.red, titulo: "Fatura vencida", sub: `${b.sacado} · ${fmt(b.valor)} · acionar cobrança` }));
  const baixo = store.estoqueBaixoDe ? store.estoqueBaixoDe(ativo) : [];
  if (baixo.length) alertas.push({ id: "estbaixo", tipo: "estoque", cor: C.amber, titulo: `${baixo.length} item(ns) no estoque mínimo`, sub: baixo.slice(0, 3).map((i) => i.nome).join(", ") });
  const corrAg = store.correspondenciasDe ? store.correspondenciasDe(ativo).filter((c) => c.status === "aguardando") : [];
  if (corrAg.length) alertas.push({ id: "corr", tipo: "corresp", cor: C.teal2, titulo: `${corrAg.length} correspondência(s) a tratar`, sub: corrAg[0].cliente + (corrAg.length > 1 ? " e outros" : "") });
  const leadsNovos = leads.filter((l) => l.unidadeId === ativo && l.etapa === "novo");
  if (leadsNovos.length) alertas.push({ id: "leads", tipo: "lead", cor: C.cafe, titulo: `${leadsNovos.length} novo(s) lead(s)`, sub: "responder em < 1h aumenta a conversão" });

  return (
    <div>
      <PageHead
        title="Centro de Comando"
        sub="Operação, vendas, cafeteria, reservas e experiência do cliente em uma única visão."
      />

      {/* KPIs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: 16,
          marginBottom: 22,
        }}
      >
        {stats.map((s, i) => (
          <Card key={i} className={`cw-fade cw-fade-${i + 1}`}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 13, color: C.text3, marginBottom: 8 }}>{s.label}</div>
                <div style={{ fontFamily: serif, fontSize: 28, color: C.text, lineHeight: 1 }}>{s.val}</div>
              </div>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  background: `${s.cor}16`,
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <s.icon size={20} color={s.cor} />
              </div>
            </div>
            <div
              style={{
                marginTop: 12,
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 12,
                color: s.cor,
                fontWeight: 600,
              }}
            >
              <TrendingUp size={13} /> {s.delta}
            </div>
          </Card>
        ))}
      </div>

      {/* Gráfico + Alertas inteligentes */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.6fr 1fr",
          gap: 16,
          marginBottom: 22,
        }}
        className="cw-grid-stack"
      >
        <Card className="cw-fade cw-fade-2">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18 }}>
            <div>
              <div style={{ fontFamily: serif, fontSize: 20, color: C.text }}>Receita do ano</div>
              <div style={{ fontSize: 13, color: C.text3 }}>Entradas pagas, mês a mês · {unidades.find((u) => u.id === ativo)?.nome || ""}</div>
            </div>
            <Badge color={deltaMes >= 0 ? C.green : C.red}>{deltaMes >= 0 ? "▲" : "▼"} {Math.abs(deltaMes)}% no mês</Badge>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 160, padding: "0 4px" }}>
            {fluxo.map((f, i) => (
              <div key={f.label} title={`${f.label}: ${fmt(f.valor)}`} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                <div style={{ height: `${Math.max(2, (f.valor / maxFluxo) * 100)}%`, background: i === comp.mes ? `linear-gradient(180deg,${C.cafe},${C.cafe3})` : `linear-gradient(180deg,${C.teal2},${C.teal3})`, borderRadius: "4px 4px 0 0", transition: "all .3s", opacity: f.valor ? 1 : 0.35 }} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
            {fluxo.map((f, i) => (
              <div key={f.label} style={{ flex: 1, textAlign: "center", fontSize: 9.5, color: i === comp.mes ? C.cafe : C.text4, fontWeight: i === comp.mes ? 700 : 400 }}>{f.label[0]}</div>
            ))}
          </div>
        </Card>

        <Card className="cw-fade cw-fade-3">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontFamily: serif, fontSize: 20, color: C.text }}>Alertas inteligentes</div>
            <Badge color={alertas.length ? C.amber : C.green}>{alertas.length ? `${alertas.length} ativos` : "tudo em dia"}</Badge>
          </div>
          {alertas.length === 0 && (
            <div style={{ fontSize: 13, color: C.text3, padding: "18px 0", textAlign: "center" }}>
              Nenhum alerta no momento. 🎉
            </div>
          )}
          {alertas.map((a, i) => {
            const Ic = ICONS[a.tipo] || AlertCircle;
            return (
              <div
                key={a.id}
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "11px 0",
                  borderBottom: i < alertas.length - 1 ? `1px solid ${C.border2}` : "none",
                  cursor: "pointer",
                }}
                onClick={() =>
                  go(a.tipo === "fatura" ? "financeiro" : a.tipo === "corresp" ? "corresp" : a.tipo === "lead" ? "crm" : a.tipo === "estoque" ? "estoque" : "reservas")
                }
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: `${a.cor}14`,
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <Ic size={17} color={a.cor} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, color: C.text, fontWeight: 600 }}>{a.titulo}</div>
                  <div style={{ fontSize: 12, color: C.text3, lineHeight: 1.4 }}>{a.sub}</div>
                </div>
                <ArrowUpRight size={15} color={C.text4} style={{ flexShrink: 0, marginTop: 8 }} />
              </div>
            );
          })}
        </Card>
      </div>

      {/* Destaques operacionais */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 22 }} className="cw-grid-stack">
        {[
          { titulo: "Salas mais reservadas", icon: DoorOpen, cor: C.cafe, itens: topSalas, vazio: "Sem reservas ainda.", acao: "reservas" },
          { titulo: "Produtos mais vendidos", icon: Coffee, cor: C.amber, itens: topProdutos, vazio: "Sem vendas ainda.", acao: "pdv" },
        ].map((p) => (
          <Card key={p.titulo} className="cw-fade cw-fade-4" style={{ cursor: "pointer" }} onClick={() => go(p.acao)}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <p.icon size={18} color={p.cor} />
              <span style={{ fontFamily: serif, fontSize: 18, color: C.text }}>{p.titulo}</span>
            </div>
            {p.itens.length === 0 ? (
              <div style={{ fontSize: 13, color: C.text4, padding: "10px 0" }}>{p.vazio}</div>
            ) : p.itens.map((it, i) => (
              <div key={it.nome} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < p.itens.length - 1 ? `1px solid ${C.border2}` : "none" }}>
                <span style={{ width: 22, height: 22, borderRadius: 7, background: `${p.cor}16`, color: p.cor, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.nome}</span>
                <span style={{ fontSize: 12, color: C.text3 }}>{it.n}{p.acao === "pdv" ? " vend." : " reserva(s)"}</span>
              </div>
            ))}
          </Card>
        ))}
      </div>

      {/* Unidades */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 16 }}>
        {unidades.map((u, i) => {
          const salasU = store.salasDe ? store.salasDe(u.id) : [];
          const uSalas = salasU.length;
          const uOcup = uSalas ? Math.round((salasU.filter((s) => s.contratada).length / uSalas) * 100) : 0;
          const uMembros = clientes.filter((c) => c.unidadeId === u.id && c.status !== "inativo").length;
          const uReceita = lancs.filter((l) => l.unidadeId === u.id && l.tipo === "entrada" && l.status === "pago").reduce((s, l) => s + (l.valor || 0), 0);
          return (
          <Card
            key={u.id}
            className={`cw-fade cw-fade-${i + 3}`}
            style={{ cursor: "pointer" }}
            onClick={() => go("unidades")}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: `${u.cor}16`,
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <Building2 size={22} color={u.cor} />
                </div>
                <div>
                  <div style={{ fontFamily: serif, fontSize: 19, color: C.text }}>{u.nome}</div>
                  <div
                    style={{
                      fontSize: 12,
                      color: C.text3,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <MapPin size={11} /> {u.endereco}
                  </div>
                </div>
              </div>
              <ArrowUpRight size={18} color={C.text4} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8 }}>
              <span style={{ color: C.text3 }}>Ocupação</span>
              <span style={{ color: C.text, fontWeight: 600 }}>{uOcup}%</span>
            </div>
            <div style={{ height: 7, background: C.cream2, borderRadius: 10, overflow: "hidden" }}>
              <div
                style={{
                  width: `${uOcup}%`,
                  height: "100%",
                  background: `linear-gradient(90deg,${u.cor},${u.cor}aa)`,
                  borderRadius: 10,
                  transition: "width .6s",
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, fontSize: 13 }}>
              <div>
                <span style={{ color: C.text3 }}>Salas </span>
                <b>{uSalas}</b>
              </div>
              <div>
                <span style={{ color: C.text3 }}>Membros </span>
                <b>{uMembros}</b>
              </div>
              <div>
                <span style={{ color: C.text3 }}>Receita </span>
                <b>{fmtShort(uReceita)}</b>
              </div>
            </div>
          </Card>
          );
        })}
      </div>
    </div>
  );
}

// Painel do Administrador da plataforma (vendedor do app) — não opera coworking
function DashboardPlataforma({ franqueados, unidades, go }) {
  const mrr = franqueados.reduce((s, f) => s + (f.mensalidade || 0), 0);
  const kpis = [
    { label: "Contas (coworkings)", val: franqueados.length, icon: Store, cor: C.cafe },
    { label: "Unidades na plataforma", val: unidades.length, icon: Building2, cor: C.teal },
    { label: "MRR da plataforma", val: fmt(mrr), icon: DollarSign, cor: C.green },
    { label: "ARR estimado", val: fmt(mrr * 12), icon: TrendingUp, cor: C.amber },
  ];
  return (
    <div>
      <PageHead title="Plataforma CafeWorking" sub="Painel do administrador: contas que assinam o app e faturamento da plataforma. (O admin não opera coworking — use 'Entrar' numa conta.)" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16, marginBottom: 22 }}>
        {kpis.map((k, i) => (
          <Card key={i} className={`cw-fade cw-fade-${i + 1}`}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 13, color: C.text3 }}>{k.label}</div>
                <div style={{ fontFamily: serif, fontSize: 26, color: C.text, marginTop: 6 }}>{k.val}</div>
              </div>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: `${k.cor}16`, display: "grid", placeItems: "center" }}>
                <k.icon size={20} color={k.cor} />
              </div>
            </div>
          </Card>
        ))}
      </div>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border2}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: serif, fontSize: 19 }}>Contas assinantes</span>
          <Btn onClick={() => go("franqueados")} style={{ padding: "8px 14px", fontSize: 13 }}>Gerenciar contas</Btn>
        </div>
        {franqueados.map((f, i) => {
          const nUnid = unidades.filter((u) => u.franqueadoId === f.id).length;
          return (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: 16, borderBottom: i < franqueados.length - 1 ? `1px solid ${C.border2}` : "none" }}>
              <div style={{ width: 42, height: 42, borderRadius: "50%", background: "#B8862F", color: "#fff", display: "grid", placeItems: "center", fontFamily: serif, fontSize: 18 }}>{f.nome.charAt(0)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{f.nome}</div>
                <div style={{ fontSize: 12, color: C.text3 }}>Master: {f.master || "—"} · {nUnid} unidade{nUnid === 1 ? "" : "s"}</div>
              </div>
              <Badge color={C.green}>{f.plano} · {fmt(f.mensalidade || 0)}/mês</Badge>
            </div>
          );
        })}
        {franqueados.length === 0 && <div style={{ padding: 24, textAlign: "center", color: C.text4, fontSize: 13 }}>Nenhuma conta ainda. Cadastre em "Contas".</div>}
      </Card>
    </div>
  );
}
