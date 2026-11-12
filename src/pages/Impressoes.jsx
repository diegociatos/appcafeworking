// Impressões (equipe): fila e histórico da unidade, consumo por cliente no mês e
// exportação para Excel. Na Fase 1 (sem agente local) a recepção pode marcar um
// trabalho como impresso aqui para registrar o consumo e testar a contabilização.
import { useEffect, useState } from "react";
import { Printer, Download, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { Card, Btn, PageHead, Empty, Badge } from "../components/ui.jsx";
import { C, serif, sans, fmt, inp } from "../lib/theme.js";
import { useStore } from "../lib/store.jsx";
import { impressoesApi } from "../lib/impressoesApi.js";
import { mensagemDe } from "../lib/erros.js";

const STATUS = {
  fila: ["Na fila", C.amber],
  enviado: ["Enviada", C.teal],
  impresso: ["Impressa", C.green],
  falha: ["Falhou", C.red],
  cancelado: ["Cancelada", C.text3],
};
const dataBR = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

export default function Impressoes() {
  const { activeUnit } = useStore();
  const [dados, setDados] = useState(null);
  const [competencia, setCompetencia] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [acao, setAcao] = useState("");

  const carregar = (comp = competencia) => {
    if (!activeUnit) { setCarregando(false); setErro("Selecione uma unidade."); return Promise.resolve(); }
    setCarregando(true); setErro("");
    return impressoesApi.painel(activeUnit, comp || undefined)
      .then((r) => { setDados(r); if (!competencia) setCompetencia(r.competencia); })
      .catch((e) => setErro(mensagemDe(e)))
      .finally(() => setCarregando(false));
  };
  useEffect(() => { carregar(competencia); }, [activeUnit]); // eslint-disable-line react-hooks/exhaustive-deps

  const concluir = async (job, status) => {
    setAcao(job.id);
    try {
      await impressoesApi.concluir(job.id, status === "falha" ? { status: "falha", erro: "Registrado pela recepção" } : { status: "impresso" });
      await carregar(competencia);
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setAcao("");
    }
  };

  const jobs = dados?.jobs || [];
  const resumo = dados?.resumo || [];
  const precoFolha = dados?.preco_folha || 1.5;

  const totalFolhas = resumo.reduce((s, r) => s + Number(r.folhas || 0), 0);

  const exportarExcel = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const aoaJobs = [
      ["Documento", "Cliente", "E-mail", "Páginas", "Cópias", "Frente e verso", "Folhas", "Folhas impressas", "Status", "Origem", "Enviado", "Impresso"],
      ...jobs.map((j) => [
        j.documento_nome, j.cliente_nome || "", j.cliente_email, j.paginas, j.copias, j.duplex ? "Sim" : "Não",
        j.folhas, j.folhas_impressas ?? "", (STATUS[j.status] || [j.status])[0], j.origem, dataBR(j.criado_em), dataBR(j.impresso_em),
      ]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoaJobs), "Trabalhos");
    const aoaResumo = [
      ["Cliente (e-mail)", "Folhas no mês", "Excedente (folhas)", "Valor excedente (R$)"],
      ...resumo.map((r) => [r.cliente_email, r.folhas, "", ""]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoaResumo), "Consumo por cliente");
    XLSX.writeFile(wb, `impressoes-${competencia || "mes"}.xlsx`);
  };

  return (
    <div>
      <PageHead title="Impressões" sub="Fila, histórico e consumo por cliente. Cobrança por folha; excedente faturado no fechamento."
        action={<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn variant="soft" onClick={() => carregar(competencia)}><RefreshCw size={16} /> Atualizar</Btn>
          <Btn variant="soft" onClick={exportarExcel} disabled={!jobs.length}><Download size={16} /> Excel</Btn>
        </div>} />

      <Card style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: C.text3 }}>Competência</label>
        <input type="month" value={competencia} onChange={(e) => { setCompetencia(e.target.value); carregar(e.target.value); }} style={{ ...inp, maxWidth: 180 }} />
        <span style={{ fontSize: 13.5, color: C.text2 }}>
          {resumo.length} cliente{resumo.length !== 1 ? "s" : ""} · <b>{totalFolhas}</b> folha{totalFolhas !== 1 ? "s" : ""} no mês
        </span>
        {(dados?.impressoras || []).length === 0 && (
          <span style={{ fontSize: 12.5, color: C.amber }}>Nenhuma impressora cadastrada nesta unidade (cadastro via SQL na Fase 1; painel na Fase 2).</span>
        )}
      </Card>

      {carregando && !dados && <Card><div style={{ color: C.text3 }}>Carregando…</div></Card>}
      {erro && <Card style={{ borderLeft: `3px solid ${C.red}` }}><div style={{ color: C.red }}>{erro}</div></Card>}

      {dados && (
        <>
          <Card style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: serif, fontSize: 18, marginBottom: 10 }}>Trabalhos</div>
            {jobs.length === 0 ? (
              <Empty icon={Printer} title="Nenhum trabalho" sub="Os envios dos clientes aparecem aqui." />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, fontFamily: sans }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: C.text3 }}>
                      <th style={{ padding: "8px 10px" }}>Documento</th>
                      <th style={{ padding: "8px 10px" }}>Cliente</th>
                      <th style={{ padding: "8px 10px" }}>Folhas</th>
                      <th style={{ padding: "8px 10px" }}>Status</th>
                      <th style={{ padding: "8px 10px" }}>Enviado</th>
                      <th style={{ padding: "8px 10px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((j) => {
                      const [rot, cor] = STATUS[j.status] || [j.status, C.text3];
                      const pendente = j.status === "fila" || j.status === "enviado";
                      return (
                        <tr key={j.id} style={{ borderTop: `1px solid ${C.border2}` }}>
                          <td style={{ padding: "8px 10px" }}>{j.documento_nome}</td>
                          <td style={{ padding: "8px 10px" }}>{j.cliente_nome || j.cliente_email}</td>
                          <td style={{ padding: "8px 10px" }}>{j.folhas}{j.folhas_impressas != null && j.folhas_impressas !== j.folhas ? ` (saiu ${j.folhas_impressas})` : ""}{j.duplex ? " · F/V" : ""}</td>
                          <td style={{ padding: "8px 10px" }}><Badge color={cor}>{rot}</Badge></td>
                          <td style={{ padding: "8px 10px", color: C.text3 }}>{dataBR(j.criado_em)}</td>
                          <td style={{ padding: "8px 10px" }}>
                            <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
                              {j.arquivo_url && (
                                <a href={j.arquivo_url} target="_blank" rel="noopener noreferrer"
                                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", fontSize: 12.5, fontWeight: 600, borderRadius: 10, background: C.cafe, color: "#fff", textDecoration: "none" }}>
                                  <Download size={14} /> Abrir
                                </a>
                              )}
                              {pendente && (
                                <>
                                  <Btn variant="soft" disabled={acao === j.id} onClick={() => concluir(j, "impresso")} style={{ padding: "5px 10px", fontSize: 12.5 }}><CheckCircle2 size={14} /> Marcar impressa</Btn>
                                  <Btn variant="ghost" disabled={acao === j.id} onClick={() => concluir(j, "falha")} style={{ padding: "5px 10px", fontSize: 12.5, color: C.red }}><XCircle size={14} /> Falha</Btn>
                                </>
                              )}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <div style={{ fontFamily: serif, fontSize: 18, marginBottom: 10 }}>Consumo por cliente · {competencia}</div>
            {resumo.length === 0 ? (
              <Empty icon={Printer} title="Sem consumo no mês" sub="Quando houver impressões, o total por cliente aparece aqui." />
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {resumo.map((r) => (
                  <li key={r.cliente_email} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: `1px solid ${C.border2}` }}>
                    <span style={{ color: C.text2 }}>{r.cliente_email}</span>
                    <span style={{ fontWeight: 600 }}>{r.folhas} folha{r.folhas !== 1 ? "s" : ""}</span>
                  </li>
                ))}
              </ul>
            )}
            <div style={{ fontSize: 12.5, color: C.text3, marginTop: 10 }}>
              A franquia de cada plano e o excedente a {fmt(precoFolha)}/folha são apurados no fechamento do mês (Fase 3).
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
