import { useState } from "react";
import { BarChart3, ArrowUpRight, ArrowDownRight, AlertTriangle, Wallet } from "lucide-react";
import { Card, PageHead, Empty } from "../components/ui.jsx";
import { C, serif, fmt, inp } from "../lib/theme.js";
import { useStore } from "../lib/store.jsx";
import { resumoRecebiveis, hojeSP, dataCaixa, ehNaoComercial, vencimentosAte } from "../lib/financeiro.js";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// Controladoria consolidada do grupo: soma as unidades VISÍVEIS ao usuário e
// compara lado a lado. Reusa o núcleo financeiro (mesmas regras do painel por
// unidade). Tudo em uma tela acima do Financeiro (que é escopado a 1 unidade).
export default function ControladoriaGrupo() {
  const store = useStore();
  const { unidadesVisiveis, lancamentosDe, contasDe } = store;
  const hoje = hojeSP();
  const [periodo, setPeriodo] = useState(() => `${hoje.ano}-${String(hoje.mes + 1).padStart(2, "0")}`);
  const [y, m] = periodo.split("-").map(Number);
  const anoSel = y, mesSel = (m || 1) - 1;

  const sinal = (l) => (l.tipo === "entrada" ? 1 : -1);
  const noMesCaixa = (l) => { const c = dataCaixa(l); return c && c.ano === anoSel && c.mes === mesSel; };

  const linhas = unidadesVisiveis.map((u) => {
    const lanc = lancamentosDe(u.id);
    const contas = contasDe(u.id);
    const pagos = lanc.filter((l) => l.status === "pago");
    const saldo = contas.reduce((s, c) => s + (c.saldo || 0), 0) + pagos.reduce((s, l) => s + sinal(l) * (l.valor || 0), 0);
    const recebido = pagos.filter((l) => l.tipo === "entrada" && !ehNaoComercial(l) && noMesCaixa(l)).reduce((s, l) => s + l.valor, 0);
    const pago = pagos.filter((l) => l.tipo === "saida" && !ehNaoComercial(l) && noMesCaixa(l)).reduce((s, l) => s + l.valor, 0);
    const resumo = resumoRecebiveis(lanc, hoje);
    const aReceber = resumo.vencido.total + resumo.a_vencer.total;
    const vencido = resumo.vencido.total;
    const prox30 = vencimentosAte(lanc, hoje, 30);
    return { id: u.id, nome: u.nome, saldo, recebido, pago, resultado: recebido - pago, aReceber, vencido, prox30: prox30.saldo };
  }).sort((a, b) => b.recebido - a.recebido);

  const tot = linhas.reduce((t, r) => ({
    saldo: t.saldo + r.saldo, recebido: t.recebido + r.recebido, pago: t.pago + r.pago,
    resultado: t.resultado + r.resultado, aReceber: t.aReceber + r.aReceber, vencido: t.vencido + r.vencido, prox30: t.prox30 + r.prox30,
  }), { saldo: 0, recebido: 0, pago: 0, resultado: 0, aReceber: 0, vencido: 0, prox30: 0 });

  const KPI = ({ titulo, valor, cor, sub }) => (
    <Card><div style={{ fontSize: 12.5, color: C.text3 }}>{titulo}</div><div style={{ fontFamily: serif, fontSize: 23, color: cor || C.text }}>{fmt(valor)}</div>{sub && <div style={{ fontSize: 11, color: C.text4, marginTop: 2 }}>{sub}</div>}</Card>
  );
  const col = "minmax(140px,1.4fr) 120px 120px 120px 120px 120px";
  const Cel = ({ children, style }) => <div style={{ fontSize: 13, minWidth: 0, ...style }}>{children}</div>;

  return (
    <div>
      <PageHead
        title="Controladoria do grupo"
        sub="Visão consolidada das unidades: saldo, recebido e resultado do mês, a receber e inadimplência — tudo somado e comparado lado a lado."
        action={<input type="month" value={periodo} onChange={(e) => e.target.value && setPeriodo(e.target.value)} style={{ ...inp, width: "auto" }} />}
      />

      {unidadesVisiveis.length === 0 ? (
        <Card><Empty icon={BarChart3} title="Nenhuma unidade visível" sub="Não há unidades no seu escopo para consolidar." /></Card>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, marginBottom: 14 }}>
            <KPI titulo="Saldo em caixa (grupo)" valor={tot.saldo} />
            <KPI titulo={`Recebido em ${MESES[mesSel]}`} valor={tot.recebido} cor={C.green} />
            <KPI titulo={`Resultado de ${MESES[mesSel]}`} valor={tot.resultado} cor={tot.resultado >= 0 ? C.teal : C.red} sub={`pago ${fmt(tot.pago)}`} />
            <KPI titulo="A receber (carteira)" valor={tot.aReceber} sub={`vencido ${fmt(tot.vencido)}`} />
          </div>

          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.border2}`, fontWeight: 700, fontSize: 13.5 }}>Por unidade · {MESES[mesSel]}/{anoSel}</div>
            <div style={{ overflowX: "auto" }}><div style={{ minWidth: 760 }}>
              <div style={{ display: "grid", gridTemplateColumns: col, gap: 8, padding: "10px 18px", background: C.cream, fontSize: 11, fontWeight: 700, color: C.text3 }}>
                <div>UNIDADE</div>
                <div style={{ textAlign: "right" }}>SALDO</div>
                <div style={{ textAlign: "right" }}>RECEBIDO</div>
                <div style={{ textAlign: "right" }}>RESULTADO</div>
                <div style={{ textAlign: "right" }}>A RECEBER</div>
                <div style={{ textAlign: "right" }}>VENCIDO</div>
              </div>
              {linhas.map((r) => (
                <div key={r.id} style={{ display: "grid", gridTemplateColumns: col, gap: 8, padding: "10px 18px", borderTop: `1px solid ${C.border2}`, alignItems: "center" }}>
                  <Cel style={{ fontWeight: 600 }}>{r.nome}</Cel>
                  <Cel style={{ textAlign: "right" }}>{fmt(r.saldo)}</Cel>
                  <Cel style={{ textAlign: "right", color: C.green }}>{fmt(r.recebido)}</Cel>
                  <Cel style={{ textAlign: "right", color: r.resultado >= 0 ? C.teal : C.red, fontWeight: 600 }}>{fmt(r.resultado)}</Cel>
                  <Cel style={{ textAlign: "right" }}>{fmt(r.aReceber)}</Cel>
                  <Cel style={{ textAlign: "right", color: r.vencido ? C.red : C.text4 }}>{r.vencido ? fmt(r.vencido) : "—"}</Cel>
                </div>
              ))}
              <div style={{ display: "grid", gridTemplateColumns: col, gap: 8, padding: "12px 18px", background: C.cream, fontWeight: 700 }}>
                <Cel style={{ fontFamily: serif }}>GRUPO</Cel>
                <Cel style={{ textAlign: "right" }}>{fmt(tot.saldo)}</Cel>
                <Cel style={{ textAlign: "right", color: C.green }}>{fmt(tot.recebido)}</Cel>
                <Cel style={{ textAlign: "right", color: tot.resultado >= 0 ? C.teal : C.red }}>{fmt(tot.resultado)}</Cel>
                <Cel style={{ textAlign: "right" }}>{fmt(tot.aReceber)}</Cel>
                <Cel style={{ textAlign: "right", color: tot.vencido ? C.red : C.text4 }}>{tot.vencido ? fmt(tot.vencido) : "—"}</Cel>
              </div>
            </div></div>
          </Card>

          <div style={{ fontSize: 11.5, color: C.text4, marginTop: 10 }}>
            Saldo e valores seguem as mesmas regras do Financeiro por unidade (regime de caixa pela data do pagamento). Abra o Financeiro de cada unidade para o detalhe e os drill-downs.
          </div>
        </>
      )}
    </div>
  );
}
