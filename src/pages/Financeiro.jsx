import { useState } from "react";
import {
  Wallet, TrendingUp, Landmark, BarChart3, FileText, Tags,
  Plus, Edit3, Trash2, Check, X, ArrowUpRight, ArrowDownRight, Receipt, Paperclip, Download, Barcode, Copy, QrCode,
  FileSignature, RefreshCw, AlertTriangle, Upload, CheckCircle2, AlertCircle,
} from "lucide-react";
import { Card, Badge, Btn, PageHead, Modal, Field, Empty, FileInput } from "../components/ui.jsx";
import { C, serif, sans, fmt, fmtShort, inp } from "../lib/theme.js";
import { useStore, SECOES } from "../lib/store.jsx";
import { getCurrentCompetencia, parseDateBR } from "../lib/dateUtils.js";
import { gerarModeloFluxo, lerPlanilhaFluxo, validarLinhas, exportarExtratoExcel } from "../lib/fluxoImport.js";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
// Competência atual a partir da data real (sem datas fixas).
const { mes: MES_ATUAL, ano: ANO_ATUAL } = getCurrentCompetencia();
const TODOS_MESES = MESES.map((_, i) => i);
const diaDe = (data) => parseInt((data || "").slice(0, 2), 10) || 0;
// Máscara de data DD/MM/AAAA — a "barra" fica fixa: o usuário só digita números
// e as barras entram sozinhas nas posições certas.
const maskData = (v) => {
  const d = String(v || "").replace(/\D/g, "").slice(0, 8);
  let out = d.slice(0, 2);
  if (d.length >= 3) out += "/" + d.slice(2, 4);
  if (d.length >= 5) out += "/" + d.slice(4, 8);
  return out;
};
// Saldo ATUAL de uma conta = saldo INICIAL (do cadastro) + lançamentos pagos.
// O `conta.saldo` guarda o saldo inicial (abertura); o fluxo soma a partir dele.
const saldoAtualConta = (conta, lancamentos) =>
  (conta?.saldo || 0) + lancamentos
    .filter((l) => l.contaId === conta?.id && l.status === "pago")
    .reduce((s, l) => s + (l.tipo === "entrada" ? l.valor : -l.valor), 0);

// Seções do Financeiro — usadas no sidebar PRINCIPAL (App.jsx) como submenu.
export const FIN_GRUPOS = [
  { titulo: "Movimento", itens: [
    { id: "visao", label: "Visão Geral", icon: BarChart3 },
    { id: "extrato", label: "Fluxo de Caixa", icon: Wallet },
    { id: "receber", label: "Contas a Receber", icon: ArrowUpRight },
    { id: "pagar", label: "Contas a Pagar", icon: ArrowDownRight },
    { id: "inadimplencia", label: "Inadimplência", icon: AlertTriangle },
    { id: "contratos", label: "Contratos", icon: FileSignature },
  ] },
  { titulo: "Relatórios", itens: [
    { id: "dre", label: "DRE", icon: FileText },
    { id: "provisao", label: "Provisão", icon: TrendingUp },
    { id: "recebimentos", label: "Recebimentos por Cliente", icon: Receipt },
  ] },
  { titulo: "Cadastros", itens: [
    { id: "bancos", label: "Bancos", icon: Landmark },
    { id: "categorias", label: "Categorias", icon: Tags },
    { id: "anexos", label: "Anexos", icon: Paperclip },
  ] },
];

export default function Financeiro({ finTab }) {
  const store = useStore();
  const { activeUnit, unidadeAtiva, categorias } = store;
  const [tabInner] = useState("visao");
  const tab = finTab ?? tabInner;
  const [lancModal, setLancModal] = useState(null);
  const [contaModal, setContaModal] = useState(null);
  const [contaPRModal, setContaPRModal] = useState(null);
  const [detalheLanc, setDetalheLanc] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  const contas = store.contasDe(activeUnit);
  const lancamentos = store.lancamentosDe(activeUnit).slice().sort((a, b) => b.mes - a.mes || diaDe(b.data) - diaDe(a.data));
  const clientesUnidade = store.clientesDe(unidadeAtiva?.nome);

  const saldoTotal = contas.reduce((s, c) => s + saldoAtualConta(c, lancamentos), 0);
  const aReceber = lancamentos.filter((l) => l.tipo === "entrada" && l.status === "previsto").reduce((s, l) => s + l.valor, 0);
  const aPagar = lancamentos.filter((l) => l.tipo === "saida" && l.status === "previsto").reduce((s, l) => s + l.valor, 0);
  const entradasMes = lancamentos.filter((l) => l.mes === MES_ATUAL && l.tipo === "entrada" && l.status === "pago").reduce((s, l) => s + l.valor, 0);
  const saidasMes = lancamentos.filter((l) => l.mes === MES_ATUAL && l.tipo === "saida" && l.status === "pago").reduce((s, l) => s + l.valor, 0);
  const resultadoMes = entradasMes - saidasMes;

  const fluxo = MESES.map((label, m) => {
    const e = lancamentos.filter((l) => l.mes === m && l.tipo === "entrada").reduce((s, l) => s + l.valor, 0);
    const sa = lancamentos.filter((l) => l.mes === m && l.tipo === "saida").reduce((s, l) => s + l.valor, 0);
    return { label, entrada: e, saida: sa, saldo: e - sa };
  });

  const secaoAtual = FIN_GRUPOS.flatMap((g) => g.itens).find((i) => i.id === tab);

  return (
    <div>
      <PageHead
        title={secaoAtual ? `Financeiro · ${secaoAtual.label}` : "Financeiro"}
        sub={`Gestão financeira da unidade ${unidadeAtiva?.nome || ""} · fluxo de caixa, contas, DRE e bancos.`}
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn variant="soft" onClick={() => setImportOpen(true)}>
              <Upload size={16} /> Importar Excel
            </Btn>
            <Btn onClick={() => setLancModal({})}>
              <Plus size={16} /> Novo lançamento
            </Btn>
          </div>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16, marginBottom: 20 }}>
        <Kpi label="Saldo em contas" valor={saldoTotal} icon={Wallet} cor={C.teal} sub={`${contas.length} contas`} />
        <Kpi label="A receber" valor={aReceber} icon={ArrowUpRight} cor={C.green} sub="Previstos não pagos" />
        <Kpi label="A pagar" valor={aPagar} icon={ArrowDownRight} cor={C.red} sub="Despesas previstas" />
        <Kpi label="Resultado do mês" valor={resultadoMes} icon={TrendingUp} cor={resultadoMes >= 0 ? C.green : C.red} sub={`Entradas − saídas (${MESES[MES_ATUAL]})`} />
      </div>

      {/* Conteúdo (seções navegadas pelo sidebar principal) */}
      <div style={{ minWidth: 0 }}>
        {tab === "visao" && <VisaoGeral fluxo={fluxo} lancamentos={lancamentos} contas={contas} onAbrir={setDetalheLanc} />}
        {(tab === "receber" || tab === "pagar") && (
          <Contas
            lancamentos={lancamentos}
            tipo={tab === "receber" ? "entrada" : "saida"}
            onNova={(tipo) => setContaPRModal({ tipo })}
            onAbrir={setDetalheLanc}
            onBaixar={(l) => { if (l.boletoId) store.baixarBoleto(l.boletoId); else store.updateLancamento(l.id, { status: "pago" }); }}
            onEditar={(l) => setLancModal(l)}
            onExcluir={(l) => store.removeLancamento(l.id)}
          />
        )}
        {tab === "contratos" && <Contratos store={store} activeUnit={activeUnit} />}
        {tab === "extrato" && <Extrato contas={contas} lancamentos={lancamentos} onAbrir={setDetalheLanc} onRemoverImportados={(contaId) => store.removerImportados(activeUnit, contaId)} />}
        {tab === "dre" && <DRE lancamentos={lancamentos} categorias={categorias} />}
        {tab === "recebimentos" && <RecebimentosCliente clientes={clientesUnidade} lancamentos={lancamentos} updateLancamento={store.updateLancamento} />}
        {tab === "inadimplencia" && <Inadimplencia clientes={clientesUnidade} lancamentos={lancamentos} contas={contas} categorias={categorias} store={store} activeUnit={activeUnit} />}
        {tab === "provisao" && <Provisao store={store} activeUnit={activeUnit} lancamentos={lancamentos} categorias={categorias} onNovaDespesa={() => setContaPRModal({ tipo: "saida" })} />}
        {tab === "bancos" && <Bancos contas={contas} lancamentos={lancamentos} saldoTotal={saldoTotal} onNovo={() => setContaModal({})} onEditar={(c) => setContaModal(c)} onExcluir={(c) => store.removeConta(c.id)} />}
        {tab === "categorias" && <Categorias categorias={categorias} lancamentos={lancamentos} store={store} />}
        {tab === "anexos" && <Anexos lancamentos={lancamentos} contas={contas} onAbrir={setDetalheLanc} />}
      </div>

      {lancModal && (
        <Modal title={lancModal.id ? "Editar lançamento" : "Novo lançamento"} onClose={() => setLancModal(null)}>
          <LancamentoForm inicial={lancModal} contas={contas} categorias={categorias} clientes={clientesUnidade}
            onSave={(d) => { if (lancModal.id) store.updateLancamento(lancModal.id, d); else store.addLancamento(activeUnit, d); setLancModal(null); }} />
        </Modal>
      )}
      {importOpen && (
        <ImportarFluxoModal
          contas={contas}
          categorias={categorias}
          unidadeNome={unidadeAtiva?.nome || ""}
          onClose={() => setImportOpen(false)}
          onImportar={(validos) => store.addLancamentosBulk(activeUnit, validos)}
        />
      )}
      {contaModal && (
        <Modal title={contaModal.id ? "Editar conta" : "Nova conta bancária"} onClose={() => setContaModal(null)}>
          <ContaForm inicial={contaModal} onSave={(d) => { if (contaModal.id) store.updateConta(contaModal.id, d); else store.addConta(activeUnit, d); setContaModal(null); }} />
        </Modal>
      )}
      {contaPRModal && (
        <Modal title={contaPRModal.tipo === "entrada" ? "Nova conta a receber" : "Nova conta a pagar"} onClose={() => setContaPRModal(null)} maxWidth={520}>
          <ContaPRForm
            inicialTipo={contaPRModal.tipo}
            contas={contas}
            categorias={categorias}
            clientes={clientesUnidade}
            bankAccounts={store.bankAccountsDe(activeUnit)}
            onSave={(base, meses, boletoCfg) => { store.addContaRecorrente(activeUnit, base, meses, boletoCfg); setContaPRModal(null); }}
          />
        </Modal>
      )}
      {detalheLanc && (
        <LancamentoDetalhe
          lanc={detalheLanc}
          contas={contas}
          boleto={detalheLanc.boletoId ? store.boletos.find((b) => b.id === detalheLanc.boletoId) : null}
          onClose={() => setDetalheLanc(null)}
          onEditar={() => { setLancModal(detalheLanc); setDetalheLanc(null); }}
          onBaixar={() => { if (detalheLanc.boletoId) store.baixarBoleto(detalheLanc.boletoId); else store.updateLancamento(detalheLanc.id, { status: "pago" }); setDetalheLanc(null); }}
          onExcluir={() => { store.removeLancamento(detalheLanc.id); setDetalheLanc(null); }}
        />
      )}
    </div>
  );
}

// ===== IMPORTAÇÃO DE FLUXO DE CAIXA (Excel/CSV) ============================
function ImportarFluxoModal({ contas, categorias, unidadeNome, onClose, onImportar }) {
  const [estado, setEstado] = useState("inicial"); // inicial | lendo | previa | importado | erro
  const [previa, setPrevia] = useState({ validos: [], erros: [] });
  const [erroMsg, setErroMsg] = useState("");
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [qtd, setQtd] = useState(0);
  const [rawRows, setRawRows] = useState([]);
  const [contaDestino, setContaDestino] = useState(""); // "" = usar coluna Conta da planilha

  const baixarModelo = () =>
    gerarModeloFluxo({ contas, categorias, unidadeNome }).catch((e) => setErroMsg("Não foi possível gerar o modelo: " + (e?.message || e)));

  const validar = (rows, destinoId) => {
    const contaForcada = destinoId ? contas.find((c) => c.id === destinoId) : null;
    setPrevia(validarLinhas(rows, { contas, categorias, contaForcada }));
  };

  const trocarDestino = (destinoId) => {
    setContaDestino(destinoId);
    if (rawRows.length) validar(rawRows, destinoId);
  };

  const aoEscolher = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite reenviar o mesmo arquivo
    if (!file) return;
    setNomeArquivo(file.name);
    setErroMsg("");
    setEstado("lendo");
    try {
      const rows = await lerPlanilhaFluxo(file);
      setRawRows(rows);
      validar(rows, contaDestino);
      setEstado("previa");
    } catch (err) {
      setErroMsg("Não consegui ler a planilha. Confira se é um .xlsx/.csv válido e se a aba se chama \"Lançamentos\". (" + (err?.message || err) + ")");
      setEstado("erro");
    }
  };

  const confirmar = () => {
    const n = onImportar(previa.validos) || previa.validos.length;
    setQtd(n);
    setEstado("importado");
  };

  if (estado === "importado") {
    return (
      <Modal title="Importar Fluxo de Caixa" onClose={onClose} maxWidth={620}>
        <div style={{ textAlign: "center", padding: "8px 4px" }}>
          <CheckCircle2 size={40} color={C.green} style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{qtd} lançamento(s) importado(s)</div>
          <div style={{ fontSize: 13, color: C.text3, marginBottom: 16 }}>Já aparecem no Fluxo de caixa e na Visão geral, no mês de cada data.</div>
          <Btn style={{ justifyContent: "center", width: "100%" }} onClick={onClose}>Concluir</Btn>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Importar Fluxo de Caixa (Excel)" onClose={onClose} maxWidth={620}>
      <div style={{ fontSize: 13, color: C.text2, marginBottom: 14 }}>
        <b>1.</b> Baixe o modelo, preencha e salve. <b>2.</b> Envie o arquivo — validamos tudo antes de importar. A aba <b>Instruções</b> do modelo lista as contas e categorias válidas desta unidade.
      </div>

      <div style={{ background: C.cream, border: `1px solid ${C.border2}`, borderRadius: 12, padding: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Importar tudo para a conta:</div>
        <select value={contaDestino} onChange={(e) => trocarDestino(e.target.value)} style={inp}>
          <option value="">— usar a coluna “Conta” de cada linha da planilha —</option>
          {contas.map((c) => <option key={c.id} value={c.id}>{c.banco}</option>)}
        </select>
        <div style={{ fontSize: 11.5, color: C.text3, marginTop: 6 }}>
          Extrato de um banco só? Escolha a conta aqui — <b>todas as linhas entram nela</b> e a coluna “Conta” da planilha é ignorada. Assim o extrato do Bradesco não cai no Inter por engano.
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <Btn variant="soft" onClick={baixarModelo}><Download size={16} /> Baixar modelo (.xlsx)</Btn>
        <label className="cw-btn" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 12, fontWeight: 600, fontSize: 14, background: C.cafe, color: "#fff", cursor: "pointer" }}>
          <Upload size={16} /> {estado === "lendo" ? "Lendo…" : "Escolher planilha"}
          <input type="file" accept=".xlsx,.xls,.csv" onChange={aoEscolher} style={{ display: "none" }} />
        </label>
      </div>

      {nomeArquivo && <div style={{ fontSize: 12, color: C.text3, marginBottom: 10 }}>Arquivo: <b>{nomeArquivo}</b></div>}

      {erroMsg && (
        <div style={{ display: "flex", gap: 8, background: C.redPale, color: C.red, borderRadius: 10, padding: "10px 12px", fontSize: 13, marginBottom: 12 }}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> <span>{erroMsg}</span>
        </div>
      )}

      {estado === "previa" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <Badge color={C.green}>{previa.validos.length} válido(s)</Badge>
            {previa.erros.length > 0 && <Badge color={C.red}>{previa.erros.length} com erro</Badge>}
          </div>

          {previa.erros.length > 0 && (
            <div style={{ maxHeight: 190, overflowY: "auto", border: `1px solid ${C.border2}`, borderRadius: 10, marginBottom: 12 }}>
              {previa.erros.map((e, i) => (
                <div key={i} style={{ padding: "8px 12px", borderBottom: i < previa.erros.length - 1 ? `1px solid ${C.border2}` : "none", fontSize: 12.5 }}>
                  <b>Linha {e.linha}</b>{e.descricao ? ` · ${e.descricao}` : ""}: <span style={{ color: C.red }}>{e.motivo}</span>
                </div>
              ))}
            </div>
          )}

          {previa.validos.length > 0 ? (
            <>
              <Btn style={{ width: "100%", justifyContent: "center" }} onClick={confirmar}>
                <Check size={16} /> Importar {previa.validos.length} lançamento(s)
              </Btn>
              {previa.erros.length > 0 && (
                <div style={{ fontSize: 11.5, color: C.text4, marginTop: 8, textAlign: "center" }}>As linhas com erro serão ignoradas.</div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 13, color: C.text3, textAlign: "center", padding: "6px 0" }}>Nenhuma linha válida. Corrija os erros acima e reenvie a planilha.</div>
          )}
        </>
      )}
    </Modal>
  );
}

const ehImagemAnexo = (a) => a && ((a.tipo || "").startsWith("image") || /^data:image|\.(png|jpe?g|webp|gif)$/i.test(a.url || ""));
function baixarAnexoArq(a) {
  if (!a?.url) return;
  const el = document.createElement("a");
  el.href = a.url; el.download = a.nome || "anexo";
  document.body.appendChild(el); el.click(); el.remove();
}

function LancamentoDetalhe({ lanc, contas, boleto, onClose, onEditar, onBaixar, onExcluir }) {
  const ent = lanc.tipo === "entrada";
  const conta = contas.find((c) => c.id === lanc.contaId);
  const copiar = (txt) => navigator.clipboard?.writeText(txt);
  const linha = (lbl, val) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: `1px solid ${C.border2}`, fontSize: 13.5 }}>
      <span style={{ color: C.text3 }}>{lbl}</span>
      <span style={{ fontWeight: 600, color: C.text, textAlign: "right" }}>{val}</span>
    </div>
  );
  return (
    <Modal title="Lançamento" onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: ent ? C.greenPale : C.redPale, display: "grid", placeItems: "center", flexShrink: 0 }}>
          {ent ? <ArrowUpRight size={20} color={C.green} /> : <ArrowDownRight size={20} color={C.red} />}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{lanc.descricao}</div>
          <div style={{ fontSize: 12, color: C.text3 }}>{ent ? "Entrada" : "Saída"}{lanc.status === "previsto" ? " · previsto" : " · realizado"}</div>
        </div>
        <div style={{ fontFamily: serif, fontSize: 22, color: ent ? C.green : C.red }}>{ent ? "+" : "−"} {fmt(lanc.valor || 0)}</div>
      </div>

      {linha("Categoria", lanc.categoria || "—")}
      {linha("Subcategoria", lanc.subcategoria || "—")}
      {linha("Conta", conta?.banco || "—")}
      {linha("Data", lanc.data || "—")}
      {linha("Situação", lanc.status === "previsto" ? "Previsto (a receber/pagar)" : "Pago / recebido")}
      {lanc.grupoRecorrencia && linha("Recorrência", "Lançamento recorrente")}

      {boleto && (
        <div style={{ marginTop: 14, border: `1px solid ${C.cafeLine}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: C.cafePale }}>
            <Barcode size={16} color={C.cafe} />
            <span style={{ fontSize: 13, fontWeight: 700, color: C.cafe, flex: 1 }}>Boleto bancário</span>
            <Badge color={boleto.status === "pago" ? C.green : boleto.status === "cancelado" ? C.text3 : C.blue} bg={boleto.status === "pago" ? C.greenPale : C.bluePale}>
              {boleto.status === "pago" ? "Pago" : boleto.status === "cancelado" ? "Cancelado" : "Registrado"}
            </Badge>
          </div>
          <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
            {boleto.linhaDigitavel && (
              <button onClick={() => copiar(boleto.linhaDigitavel)} className="cw-btn" title="Copiar linha digitável"
                style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left", border: `1px solid ${C.border2}`, borderRadius: 9, padding: "8px 10px", background: C.white }}>
                <Barcode size={14} color={C.text3} />
                <span style={{ flex: 1, minWidth: 0, fontFamily: "monospace", fontSize: 11.5, color: C.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{boleto.linhaDigitavel}</span>
                <Copy size={14} color={C.text3} />
              </button>
            )}
            {boleto.pixCopiaCola && (
              <button onClick={() => copiar(boleto.pixCopiaCola)} className="cw-btn" title="Copiar PIX copia e cola"
                style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left", border: `1px solid ${C.border2}`, borderRadius: 9, padding: "8px 10px", background: C.white }}>
                <QrCode size={14} color={C.text3} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: C.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>PIX copia e cola</span>
                <Copy size={14} color={C.text3} />
              </button>
            )}
            <div style={{ fontSize: 11, color: C.text4 }}>Sacado: {boleto.sacado || "—"} · venc. {(boleto.vencimento || "").split("-").reverse().join("/")}</div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.text3, marginBottom: 8 }}>ANEXO / COMPROVANTE</div>
        {lanc.anexo ? (
          ehImagemAnexo(lanc.anexo) ? (
            <img src={lanc.anexo.url} alt="anexo" onError={(e) => (e.currentTarget.style.display = "none")} style={{ width: "100%", borderRadius: 12, background: C.cream2 }} />
          ) : (
            <button onClick={() => baixarAnexoArq(lanc.anexo)} className="cw-btn" style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: 14, border: `1px solid ${C.border}`, borderRadius: 12, background: C.cream }}>
              <FileText size={22} color={C.teal} />
              <span style={{ flex: 1, textAlign: "left", fontSize: 13, fontWeight: 600 }}>{lanc.anexo.nome || "Comprovante"}</span>
              <Download size={16} color={C.text3} />
            </button>
          )
        ) : (
          <div style={{ fontSize: 12.5, color: C.text4, fontStyle: "italic" }}>Sem anexo. Use "Editar" para anexar um comprovante.</div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {lanc.status === "previsto" && (
          <Btn variant="teal" style={{ flex: 1, justifyContent: "center" }} onClick={onBaixar}><Check size={16} /> Dar baixa</Btn>
        )}
        <Btn variant="ghost" style={{ flex: 1, justifyContent: "center" }} onClick={onEditar}><Edit3 size={16} /> Editar</Btn>
        <Btn variant="ghost" style={{ color: C.red, borderColor: C.redPale, padding: "10px 14px" }} onClick={onExcluir}><Trash2 size={16} /></Btn>
      </div>
    </Modal>
  );
}

function Kpi({ label, valor, icon: Icon, cor, sub }) {
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 13, color: C.text3, marginBottom: 8 }}>{label}</div>
          <div style={{ fontFamily: serif, fontSize: 23, color: C.text, lineHeight: 1 }}>{fmt(valor)}</div>
          <div style={{ fontSize: 11, color: C.text3, marginTop: 6 }}>{sub}</div>
        </div>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: `${cor}16`, display: "grid", placeItems: "center" }}>
          <Icon size={20} color={cor} />
        </div>
      </div>
    </Card>
  );
}

function GraficoFluxo({ fluxo }) {
  const max = Math.max(1, ...fluxo.flatMap((f) => [f.entrada, f.saida]));
  return (
    <div>
      <div style={{ display: "flex", gap: 18, fontSize: 12, color: C.text3, marginBottom: 14 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: C.green }} /> Entradas</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: C.red }} /> Saídas</span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 150, borderBottom: `1px solid ${C.border}` }}>
        {fluxo.map((f, i) => (
          <div key={i} style={{ flex: 1, display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 4, height: "100%" }}>
            <div title={`Entradas ${fmt(f.entrada)}`} style={{ width: 16, height: `${(f.entrada / max) * 100}%`, minHeight: f.entrada ? 3 : 0, background: C.green, borderRadius: "4px 4px 0 0" }} />
            <div title={`Saídas ${fmt(f.saida)}`} style={{ width: 16, height: `${(f.saida / max) * 100}%`, minHeight: f.saida ? 3 : 0, background: C.red, borderRadius: "4px 4px 0 0" }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        {fluxo.map((f, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.text2 }}>{f.label}</div>
            <div style={{ fontSize: 10.5, color: f.saldo >= 0 ? C.green : C.red }}>{fmtShort(f.saldo)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Anexos({ lancamentos, onAbrir }) {
  const comAnexo = lancamentos.filter((l) => l.anexo);
  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border2}`, fontFamily: serif, fontSize: 18 }}>
        Anexos e comprovantes
        {comAnexo.length > 0 && <span style={{ fontSize: 13, color: C.text3, marginLeft: 8 }}>({comAnexo.length})</span>}
      </div>
      {comAnexo.length === 0 ? (
        <Empty icon={Paperclip} title="Nenhum anexo" sub="Anexe um comprovante ao criar/editar um lançamento (campo Anexo)." />
      ) : (
        comAnexo.map((l, i) => {
          const ent = l.tipo === "entrada";
          return (
            <div key={l.id} onClick={() => onAbrir && onAbrir(l)} title="Ver lançamento" style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 18px", borderBottom: i < comAnexo.length - 1 ? `1px solid ${C.border2}` : "none", cursor: "pointer" }}>
              <div style={{ width: 38, height: 38, borderRadius: 9, background: C.cream2, display: "grid", placeItems: "center", flexShrink: 0, overflow: "hidden" }}>
                {ehImagemAnexo(l.anexo)
                  ? <img src={l.anexo.url} alt="" onError={(e) => (e.currentTarget.style.display = "none")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <FileText size={18} color={C.teal} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{l.descricao}</div>
                <div style={{ fontSize: 11.5, color: C.text3 }}>{l.anexo.nome || "Comprovante"} · {MESES[l.mes]} {l.data}</div>
              </div>
              <div style={{ fontFamily: serif, fontSize: 15, color: ent ? C.green : C.red }}>{ent ? "+" : "−"} {fmt(l.valor)}</div>
              <button onClick={(e) => { e.stopPropagation(); baixarAnexoArq(l.anexo); }} title="Baixar anexo" className="cw-btn" style={{ color: C.text4, padding: 5 }}><Download size={16} /></button>
            </div>
          );
        })
      )}
    </Card>
  );
}

function VisaoGeral({ fluxo, lancamentos, onAbrir }) {
  const recentes = lancamentos.slice(0, 6);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16 }} className="cw-grid-stack">
      <Card>
        <div style={{ fontFamily: serif, fontSize: 19, marginBottom: 4 }}>Movimentação do ano</div>
        <div style={{ fontSize: 12, color: C.text3, marginBottom: 18 }}>Entradas e saídas mês a mês (realizado + provisionado)</div>
        <GraficoFluxo fluxo={fluxo} />
      </Card>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border2}`, fontFamily: serif, fontSize: 18 }}>Lançamentos recentes</div>
        {recentes.length === 0 ? (
          <Empty icon={Receipt} title="Sem lançamentos" sub="Adicione o primeiro lançamento." />
        ) : (
          recentes.map((l, i) => (
            <div key={l.id} onClick={() => onAbrir && onAbrir(l)} title="Ver lançamento completo" style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderBottom: i < recentes.length - 1 ? `1px solid ${C.border2}` : "none", cursor: "pointer" }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: l.tipo === "entrada" ? C.greenPale : C.redPale, display: "grid", placeItems: "center", flexShrink: 0 }}>
                {l.tipo === "entrada" ? <ArrowUpRight size={15} color={C.green} /> : <ArrowDownRight size={15} color={C.red} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{l.descricao}</div>
                <div style={{ fontSize: 11, color: C.text3 }}>{l.categoria} · {l.data}</div>
              </div>
              <div style={{ fontFamily: serif, fontSize: 15, color: l.tipo === "entrada" ? C.green : C.red }}>
                {l.tipo === "entrada" ? "+" : "−"} {fmtShort(l.valor)}
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}

// ===== CONTAS A PAGAR / RECEBER ===========================================
function Contas({ lancamentos, tipo, onNova, onAbrir, onBaixar, onEditar, onExcluir }) {
  const previstos = lancamentos.filter((l) => l.status === "previsto");
  const ordena = (a, b) => a.mes - b.mes || diaDe(a.data) - diaDe(b.data);
  const receber = previstos.filter((l) => l.tipo === "entrada").sort(ordena);
  const pagar = previstos.filter((l) => l.tipo === "saida").sort(ordena);
  const totalRec = receber.reduce((s, l) => s + l.valor, 0);
  const totalPag = pagar.reduce((s, l) => s + l.valor, 0);

  const Lista = ({ titulo, itens, total, cor, tipo }) => (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border2}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontFamily: serif, fontSize: 18, color: cor }}>{titulo}</div>
          <div style={{ fontSize: 18, fontFamily: serif, color: cor }}>{fmt(total)}</div>
        </div>
        <Btn onClick={() => onNova(tipo)} style={{ padding: "8px 12px", fontSize: 13, background: cor }}>
          <Plus size={15} /> Nova
        </Btn>
      </div>
      {itens.length === 0 ? (
        <Empty icon={Receipt} title="Nada pendente" sub={`Sem contas a ${tipo === "entrada" ? "receber" : "pagar"}.`} />
      ) : (
        itens.map((l, i) => (
          <div key={l.id} onClick={() => onAbrir && onAbrir(l)} title="Ver lançamento completo" style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderBottom: i < itens.length - 1 ? `1px solid ${C.border2}` : "none", cursor: "pointer" }}>
            <div style={{ textAlign: "center", minWidth: 38 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: cor }}>{MESES[l.mes]}</div>
              <div style={{ fontSize: 10, color: C.text4 }}>{(l.data || "").slice(0, 2) || "—"}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{l.descricao}</span>
                {l.grupoRecorrencia && <Badge color={C.teal}>Recorrente</Badge>}
                {l.boletoId && <span title="Boleto emitido" style={{ display: "inline-flex" }}><Barcode size={13} color={C.cafe} /></span>}
                {l.anexo && <Paperclip size={12} color={C.text4} />}
              </div>
              <div style={{ fontSize: 11, color: C.text3 }}>{l.categoria}{l.subcategoria ? ` › ${l.subcategoria}` : ""}</div>
            </div>
            <div style={{ fontFamily: serif, fontSize: 15, color: cor, minWidth: 84, textAlign: "right" }}>{fmt(l.valor)}</div>
            <div style={{ display: "flex", gap: 2 }} onClick={(e) => e.stopPropagation()}>
              <button onClick={() => onBaixar(l)} title="Dar baixa (marcar pago/recebido)" className="cw-btn" style={{ color: C.green, padding: 5 }}><Check size={15} /></button>
              <button onClick={() => onEditar(l)} title="Editar" className="cw-btn" style={{ color: C.text3, padding: 5 }}><Edit3 size={14} /></button>
              <button onClick={() => onExcluir(l)} title="Excluir" className="cw-btn" style={{ color: C.red, padding: 5 }}><Trash2 size={14} /></button>
            </div>
          </div>
        ))
      )}
    </Card>
  );

  const ehReceber = tipo === "entrada";
  const itens = ehReceber ? receber : pagar;
  const total = ehReceber ? totalRec : totalPag;
  const cor = ehReceber ? C.green : C.red;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16, marginBottom: 18 }}>
        <Kpi label={ehReceber ? "Total a receber" : "Total a pagar"} valor={total} icon={ehReceber ? ArrowUpRight : ArrowDownRight} cor={cor} sub={`${itens.length} contas`} />
        <Kpi label="Saldo previsto" valor={totalRec - totalPag} icon={TrendingUp} cor={totalRec - totalPag >= 0 ? C.green : C.red} sub="A receber − a pagar" />
      </div>
      <div style={{ fontSize: 12, color: C.text3, marginBottom: 14, fontStyle: "italic" }}>
        💡 Contas previstas (inclusive recorrentes) entram no DRE por <b>competência</b>, e saem do caixa só ao dar baixa.
      </div>
      <Lista titulo={ehReceber ? "Contas a receber" : "Contas a pagar"} itens={itens} total={total} cor={cor} tipo={tipo} />
    </>
  );
}

function ContaPRForm({ inicialTipo, contas, categorias, bankAccounts = [], clientes = [], onSave }) {
  const tipo = inicialTipo;
  const ehReceber = tipo === "entrada";
  const permite = (secaoKey) => {
    const s = SECOES.find((x) => x.key === secaoKey);
    return !s || s.tipo === "ambos" || s.tipo === tipo;
  };
  const cats = categorias.filter((c) => permite(c.secao));
  const subsDe = (n) => categorias.find((c) => c.nome === n)?.subs || [];
  const [f, setF] = useState(() => {
    const cat = cats[0]?.nome || "";
    return {
      descricao: "", categoria: cat, subcategoria: subsDe(cat)[0] || "", valor: 0, contaId: contas[0]?.id || "", dataVencimento: "", dataPagamento: "", mesInicial: MES_ATUAL, recorrencia: "unica", nMeses: 6, clienteId: "",
      // Boleto (só conta a receber). Liga automaticamente se houver conta bancária.
      gerarBoleto: ehReceber && bankAccounts.length > 0,
      bankAccountId: bankAccounts[0]?.id || "",
      sacado: "", sacadoDocumento: "",
    };
  });
  const subs = subsDe(f.categoria);
  const trocaCat = (cat) => setF({ ...f, categoria: cat, subcategoria: subsDe(cat)[0] || "" });
  const contaBoleto = bankAccounts.find((b) => b.id === f.bankAccountId);

  const submit = () => {
    if (!f.descricao.trim() || !(f.valor > 0)) return;
    const clienteId = ehReceber ? (f.clienteId || null) : null;
    const clienteNome = clienteId ? (clientes.find((c) => c.id === clienteId)?.nome || "") : null;
    const pago = !!f.dataPagamento.trim();
    // Data "oficial" do lançamento: pagamento (se já pago) senão vencimento.
    const data = f.dataPagamento || f.dataVencimento;
    const base = {
      tipo, descricao: f.descricao, categoria: f.categoria, subcategoria: f.subcategoria, valor: f.valor, contaId: f.contaId,
      data, dataVencimento: f.dataVencimento, dataPagamento: f.dataPagamento || "",
      status: pago ? "pago" : "previsto",
      recorrente: f.recorrencia === "mensal", clienteId, clienteNome,
    };
    const start = f.mesInicial;
    const meses = f.recorrencia === "mensal"
      ? Array.from({ length: Math.min(f.nMeses, MESES.length - start) }, (_, i) => start + i)
      : [start];
    const boletoCfg = ehReceber && f.gerarBoleto
      ? { gerar: true, bankAccountId: f.bankAccountId, sacado: f.sacado, sacadoDocumento: f.sacadoDocumento }
      : null;
    onSave(base, meses, boletoCfg);
  };

  return (
    <>
      <div style={{ fontSize: 13, color: tipo === "entrada" ? C.green : C.red, fontWeight: 600, marginBottom: 12 }}>
        {tipo === "entrada" ? "Conta a receber (entrada futura)" : "Conta a pagar (saída futura)"}
      </div>
      <Field label="Descrição — do que se trata">
        <input value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} style={inp} placeholder={tipo === "entrada" ? "Ex: Mensalidade Sala Privativa · Cliente X" : "Ex: Aluguel do imóvel"} />
      </Field>
      {ehReceber && (
        <Field label="Cliente (opcional) — entra no controle de recebimentos por cliente">
          <select value={f.clienteId} onChange={(e) => setF({ ...f, clienteId: e.target.value })} style={inp}>
            <option value="">— sem cliente —</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </Field>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Categoria (grupo no DRE)">
          <select value={f.categoria} onChange={(e) => trocaCat(e.target.value)} style={inp}>
            {cats.map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
          </select>
        </Field>
        <Field label="Subcategoria">
          <select value={f.subcategoria} onChange={(e) => setF({ ...f, subcategoria: e.target.value })} style={inp}>
            {subs.length === 0 && <option value="">—</option>}
            {subs.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Valor (R$)">
          <input type="number" min="0" step="0.01" value={f.valor} onChange={(e) => setF({ ...f, valor: +e.target.value })} style={inp} />
        </Field>
        <Field label="Conta">
          <select value={f.contaId} onChange={(e) => setF({ ...f, contaId: e.target.value })} style={inp}>
            {contas.map((c) => <option key={c.id} value={c.id}>{c.banco}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Vencimento">
          <input value={f.dataVencimento} onChange={(e) => setF({ ...f, dataVencimento: maskData(e.target.value) })} style={inp} placeholder="DD/MM/AAAA" inputMode="numeric" />
        </Field>
        <Field label="1ª competência (mês)">
          <select value={f.mesInicial} onChange={(e) => setF({ ...f, mesInicial: +e.target.value })} style={inp}>
            {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Pagamento — preencha só se já foi pago (entra no regime de caixa)">
        <input value={f.dataPagamento} onChange={(e) => setF({ ...f, dataPagamento: maskData(e.target.value) })} style={inp} placeholder="DD/MM/AAAA — deixe vazio se ainda não pago" inputMode="numeric" />
      </Field>
      <Field label="Recorrência">
        <div style={{ display: "flex", gap: 8 }}>
          {[["unica", "Única"], ["mensal", "Mensal"]].map(([v, lb]) => (
            <button key={v} type="button" onClick={() => setF({ ...f, recorrencia: v })}
              style={{ flex: 1, padding: "10px 0", borderRadius: 10, fontFamily: sans, fontSize: 13.5, fontWeight: 600, border: `1px solid ${f.recorrencia === v ? C.cafe : C.border}`, background: f.recorrencia === v ? C.cafePale : C.white, color: f.recorrencia === v ? C.cafe : C.text2 }}>
              {lb}
            </button>
          ))}
        </div>
      </Field>
      {f.recorrencia === "mensal" && (
        <Field label="Repetir por quantos meses">
          <input type="number" min="1" max="12" value={f.nMeses} onChange={(e) => setF({ ...f, nMeses: Math.max(1, Math.min(12, +e.target.value)) })} style={inp} />
          <div style={{ fontSize: 11, color: C.text4, marginTop: 5 }}>
            Gera {Math.min(f.nMeses, MESES.length - f.mesInicial)} lançamentos previstos (provisionados no DRE).
          </div>
        </Field>
      )}

      {/* Emissão de boleto — só faz sentido em conta a RECEBER (cobrança) */}
      {ehReceber && (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 14, background: C.cream }}>
          {bankAccounts.length === 0 ? (
            <div style={{ fontSize: 12.5, color: C.text3, display: "flex", alignItems: "center", gap: 8 }}>
              <Barcode size={16} color={C.text4} /> Cadastre uma conta bancária em <b>Boletos</b> para emitir cobranças automaticamente.
            </div>
          ) : (
            <>
              <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
                <input type="checkbox" checked={f.gerarBoleto} onChange={(e) => setF({ ...f, gerarBoleto: e.target.checked })} />
                <Barcode size={16} color={C.cafe} />
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>Emitir boleto bancário automaticamente</span>
              </label>
              {f.gerarBoleto && (
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                  <Field label="Conta emissora">
                    <select value={f.bankAccountId} onChange={(e) => setF({ ...f, bankAccountId: e.target.value })} style={inp}>
                      {bankAccounts.map((b) => (
                        <option key={b.id} value={b.id}>{b.apelido} · {b.tipo === "franqueador" ? "Franqueador" : "Franqueado"}</option>
                      ))}
                    </select>
                  </Field>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <Field label="Sacado (pagador)">
                      <input value={f.sacado} onChange={(e) => setF({ ...f, sacado: e.target.value })} style={inp} placeholder="Nome do cliente" />
                    </Field>
                    <Field label="CPF / CNPJ">
                      <input value={f.sacadoDocumento} onChange={(e) => setF({ ...f, sacadoDocumento: e.target.value })} style={inp} placeholder="000.000.000-00" />
                    </Field>
                  </div>
                  <div style={{ fontSize: 11.5, color: C.text3, display: "flex", alignItems: "center", gap: 6 }}>
                    <QrCode size={13} color={contaBoleto?.banco === "inter" ? C.green : C.text4} />
                    {f.recorrencia === "mensal"
                      ? `Gera ${Math.min(f.nMeses, MESES.length - f.mesInicial)} boletos (1 por parcela)`
                      : "Gera 1 boleto"}
                    {contaBoleto?.banco === "inter" ? " com PIX integrado." : "."}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <Btn style={{ width: "100%", justifyContent: "center", marginTop: 4 }} onClick={submit}>
        {ehReceber
          ? (f.gerarBoleto && bankAccounts.length ? "Lançar e emitir boleto" : "Lançar conta a receber")
          : "Lançar conta a pagar"}
      </Btn>
    </>
  );
}

// ===== CONTRATOS RECORRENTES ==============================================
function Contratos({ store, activeUnit }) {
  const contratos = store.contratosDe(activeUnit);
  const bankAccounts = store.bankAccountsDe(activeUnit);
  const vencendo = store.contratosVencendoDe(activeUnit);
  const [novo, setNovo] = useState(false);
  const [renovar, setRenovar] = useState(null);
  const venceuIds = new Set(vencendo.map((c) => c.id));

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: C.text3, maxWidth: 460 }}>
          O sistema emite um boleto por mês até o fim do prazo. No vencimento, o contrato é sinalizado para você renovar/atualizar os valores.
        </div>
        <Btn onClick={() => setNovo(true)} disabled={!bankAccounts.length}><Plus size={16} /> Novo contrato</Btn>
      </div>

      {/* Notificação ao financeiro */}
      {vencendo.length > 0 && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, background: C.amberPale, border: `1px solid ${C.amber}55`, borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
          <AlertTriangle size={18} color={C.amber} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: C.text2 }}>
            <b>{vencendo.length} contrato{vencendo.length > 1 ? "s" : ""} chegou ao fim do prazo.</b> A emissão de boletos foi interrompida — revise e <b>atualize os valores</b> para renovar.
          </div>
        </div>
      )}

      {contratos.length === 0 ? (
        <Card><Empty icon={FileSignature} title="Nenhum contrato" sub="Cadastre um contrato mensal para emitir boletos recorrentes automaticamente." /></Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {contratos.map((c) => {
            const fim = store.mesFimContrato(c);
            const decorridos = Math.max(0, Math.min(c.meses, MES_ATUAL - c.mesInicial + 1));
            const pct = Math.round((decorridos / c.meses) * 100);
            const venceu = venceuIds.has(c.id);
            const encerrado = c.status === "encerrado";
            const conta = bankAccounts.find((b) => b.id === c.bankAccountId);
            return (
              <Card key={c.id} style={{ borderLeft: `3px solid ${venceu ? C.amber : encerrado ? C.text4 : C.green}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: serif, fontSize: 18 }}>{c.cliente}</span>
                      <Badge color={venceu ? C.amber : encerrado ? C.text3 : C.green} bg={venceu ? C.amberPale : encerrado ? C.cream2 : C.greenPale}>
                        {venceu ? "Renovar" : encerrado ? "Encerrado" : "Ativo"}
                      </Badge>
                    </div>
                    <div style={{ fontSize: 12.5, color: C.text3, marginTop: 2 }}>
                      {c.plano} · {conta?.apelido || "—"} · venc. dia {c.diaVencimento}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: serif, fontSize: 20, color: C.cafe }}>{fmt(c.valorMensal)}</div>
                    <div style={{ fontSize: 10.5, color: C.text4 }}>por mês</div>
                  </div>
                </div>

                {/* progresso do contrato */}
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: C.text3, marginBottom: 4 }}>
                    <span>Mês {Math.min(decorridos, c.meses)} de {c.meses}{!venceu && !encerrado ? ` · próximo boleto em ${MESES[Math.min(MES_ATUAL + 1, fim)]}` : ""}</span>
                    <span>{MESES[c.mesInicial]}–{MESES[fim]}</span>
                  </div>
                  <div style={{ height: 7, borderRadius: 6, background: C.cream2, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: venceu ? C.amber : C.green, borderRadius: 6 }} />
                  </div>
                </div>

                {(venceu || encerrado) && (
                  <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                    <Btn onClick={() => setRenovar(c)} style={{ background: C.amber }}><RefreshCw size={15} /> Renovar / atualizar valores</Btn>
                    {!encerrado && (
                      <Btn variant="ghost" onClick={() => store.encerrarContrato(c.id)}>Encerrar</Btn>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {novo && (
        <Modal title="Novo contrato recorrente" onClose={() => setNovo(false)} maxWidth={520}>
          <ContratoForm bankAccounts={bankAccounts} onSalvar={(cfg) => { store.addContrato(activeUnit, cfg); setNovo(false); }} />
        </Modal>
      )}
      {renovar && (
        <Modal title="Renovar contrato" onClose={() => setRenovar(null)} maxWidth={460}>
          <RenovarForm contrato={renovar} onSalvar={(patch) => { store.renovarContrato(renovar.id, patch); setRenovar(null); }} />
        </Modal>
      )}
    </>
  );
}

function ContratoForm({ bankAccounts, onSalvar }) {
  const [f, setF] = useState({
    cliente: "", documento: "", plano: "", valorMensal: "", bankAccountId: bankAccounts[0]?.id || "",
    diaVencimento: "10", mesInicial: MES_ATUAL, meses: 12,
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const valido = f.cliente.trim() && f.plano.trim() && +f.valorMensal > 0 && f.bankAccountId;
  const ate = Math.min(f.mesInicial + (+f.meses) - 1, 11);

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Cliente"><input value={f.cliente} onChange={set("cliente")} style={inp} placeholder="Nome / razão social" /></Field>
        <Field label="CPF / CNPJ"><input value={f.documento} onChange={set("documento")} style={inp} placeholder="000.000.000-00" /></Field>
      </div>
      <Field label="Contrato / plano"><input value={f.plano} onChange={set("plano")} style={inp} placeholder="Ex: Sala Privativa 12" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Valor mensal (R$)"><input type="number" min="0" step="0.01" value={f.valorMensal} onChange={set("valorMensal")} style={inp} placeholder="0,00" /></Field>
        <Field label="Dia de vencimento"><input value={f.diaVencimento} onChange={set("diaVencimento")} style={inp} placeholder="10" /></Field>
      </div>
      <Field label="Conta emissora dos boletos">
        <select value={f.bankAccountId} onChange={set("bankAccountId")} style={inp}>
          {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.apelido} · {b.tipo === "franqueador" ? "Franqueador" : "Franqueado"}</option>)}
        </select>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Início (competência)">
          <select value={f.mesInicial} onChange={(e) => setF({ ...f, mesInicial: +e.target.value })} style={inp}>
            {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
        </Field>
        <Field label="Prazo (meses)">
          <input type="number" min="1" max="12" value={f.meses} onChange={(e) => setF({ ...f, meses: Math.max(1, Math.min(12, +e.target.value)) })} style={inp} />
        </Field>
      </div>
      <div style={{ fontSize: 12, color: C.text3, background: C.cafePale, borderRadius: 9, padding: "9px 12px", marginBottom: 14, display: "flex", alignItems: "center", gap: 7 }}>
        <Barcode size={14} color={C.cafe} /> Emite {Math.min(f.meses, MESES.length - f.mesInicial)} boletos ({MESES[f.mesInicial]}–{MESES[ate]}), 1 por mês.
      </div>
      <Btn style={{ width: "100%", justifyContent: "center", opacity: valido ? 1 : 0.5 }} onClick={() => valido && onSalvar({ ...f, valorMensal: +f.valorMensal, meses: +f.meses })}>
        <FileSignature size={16} /> Criar contrato e emitir boletos
      </Btn>
    </>
  );
}

function RenovarForm({ contrato, onSalvar }) {
  const [valorMensal, setValor] = useState(contrato.valorMensal);
  const [meses, setMeses] = useState(12);
  return (
    <>
      <div style={{ fontSize: 13, color: C.text3, marginBottom: 14 }}>
        Contrato de <b>{contrato.cliente}</b> ({contrato.plano}) chegou ao fim. Defina o novo valor e o prazo para reativar a cobrança.
      </div>
      <Field label="Novo valor mensal (R$)">
        <input type="number" min="0" step="0.01" value={valorMensal} onChange={(e) => setValor(+e.target.value)} style={inp} />
        {valorMensal !== contrato.valorMensal && (
          <div style={{ fontSize: 11.5, color: valorMensal > contrato.valorMensal ? C.green : C.red, marginTop: 5 }}>
            {valorMensal > contrato.valorMensal ? "▲" : "▼"} antes {fmt(contrato.valorMensal)}
          </div>
        )}
      </Field>
      <Field label="Novo prazo (meses)">
        <input type="number" min="1" max="12" value={meses} onChange={(e) => setMeses(Math.max(1, Math.min(12, +e.target.value)))} style={inp} />
      </Field>
      <Btn style={{ width: "100%", justifyContent: "center" }} onClick={() => onSalvar({ valorMensal: +valorMensal, meses: +meses })}>
        <RefreshCw size={16} /> Renovar e emitir novos boletos
      </Btn>
    </>
  );
}

// ===== EXTRATO (por conta, com saldo corrente) =============================
function Extrato({ contas, lancamentos, onAbrir, onRemoverImportados }) {
  const [contaSel, setContaSel] = useState(contas[0]?.id || "");
  const [mesSel, setMesSel] = useState(MES_ATUAL); // 0..11 ou "todos" (ano inteiro)
  const conta = contas.find((c) => c.id === contaSel);
  const qtdImportados = lancamentos.filter((l) => l.contaId === contaSel && l.origem === "importacao").length;
  const desfazerImport = () => {
    if (!qtdImportados) return;
    if (!window.confirm(`Remover ${qtdImportados} lançamento(s) IMPORTADO(S) da conta "${conta?.banco}"?\n\nOs lançamentos digitados à mão NÃO são afetados. Esta ação não pode ser desfeita.`)) return;
    const n = onRemoverImportados && onRemoverImportados(contaSel);
    if (n != null) window.alert(`${n} lançamento(s) importado(s) removido(s).`);
  };

  if (!conta) return <Card><Empty icon={Wallet} title="Nenhuma conta" sub="Cadastre uma conta em Bancos." /></Card>;

  // Extrato por período (mês selecionado ou ano inteiro), estilo extrato bancário.
  const anoTodo = mesSel === "todos";
  const pagosConta = lancamentos.filter((l) => l.contaId === contaSel && l.status === "pago");
  const netMes = (m) => pagosConta.filter((l) => l.mes === m).reduce((s, l) => s + (l.tipo === "entrada" ? l.valor : -l.valor), 0);
  const movs = (anoTodo ? pagosConta : pagosConta.filter((l) => l.mes === mesSel))
    .slice()
    .sort((a, b) => (a.mes - b.mes) || (diaDe(a.data) - diaDe(b.data)));
  // Saldo de abertura do período = SALDO INICIAL (do cadastro) + movimentos
  // ANTES do período. Assim o valor do banco é o ponto de partida do fluxo e os
  // lançamentos somam a partir dele.
  const saldoInicial = conta.saldo || 0;
  let antesDoPeriodo = 0;
  const inicioPeriodo = anoTodo ? 0 : mesSel;
  for (let k = 0; k < inicioPeriodo; k++) antesDoPeriodo += netMes(k);
  const saldoAnterior = saldoInicial + antesDoPeriodo;
  let run = saldoAnterior;
  const linhas = movs.map((l) => {
    run += l.tipo === "entrada" ? l.valor : -l.valor;
    return { ...l, saldoCorrente: run };
  });
  const saldoFimPeriodo = run;
  const totalEntradas = movs.reduce((s, l) => s + (l.tipo === "entrada" ? l.valor : 0), 0);
  const totalSaidas = movs.reduce((s, l) => s + (l.tipo === "saida" ? l.valor : 0), 0);
  const saldoAtual = saldoAtualConta(conta, lancamentos);
  const previstos = lancamentos.filter((l) => l.contaId === contaSel && l.status === "previsto");

  const col = "78px 110px 110px 130px 1fr";
  const Cel = ({ children, style }) => <div style={{ fontSize: 13, ...style }}>{children}</div>;

  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {contas.map((c) => (
          <button key={c.id} onClick={() => setContaSel(c.id)} className="cw-btn"
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 11, fontSize: 13, fontWeight: 600,
              border: `1px solid ${contaSel === c.id ? C.teal : C.border}`, background: contaSel === c.id ? C.tealPale : C.white, color: contaSel === c.id ? C.teal : C.text2,
            }}>
            <Landmark size={14} /> {c.banco}
            <span style={{ color: C.text3, fontWeight: 500 }}>{fmtShort(saldoAtualConta(c, lancamentos))}</span>
          </button>
        ))}
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border2}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontFamily: serif, fontSize: 19 }}>{conta.banco}</div>
            <div style={{ fontSize: 12, color: C.text3 }}>{conta.tipo} · extrato de {anoTodo ? `${ANO_ATUAL} (ano todo)` : `${MESES[mesSel]}/${ANO_ATUAL}`} · saldo inicial {fmt(saldoInicial)}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <select value={String(mesSel)} onChange={(e) => setMesSel(e.target.value === "todos" ? "todos" : +e.target.value)}
              style={{ ...inp, width: "auto", padding: "8px 12px", fontSize: 13 }}>
              <option value="todos">Ano todo ({ANO_ATUAL})</option>
              {MESES.map((m, i) => <option key={i} value={i}>{m}/{ANO_ATUAL}</option>)}
            </select>
            <Btn variant="soft" disabled={linhas.length === 0} onClick={() => exportarExtratoExcel({
              contaNome: conta.banco, periodoLabel: anoTodo ? `Ano ${ANO_ATUAL}` : `${MESES[mesSel]} ${ANO_ATUAL}`,
              saldoInicial, saldoAnterior, linhas, totalEntradas, totalSaidas, saldoFim: saldoFimPeriodo,
            }).catch((e) => alert("Não foi possível exportar: " + (e?.message || e)))}
              style={{ opacity: linhas.length === 0 ? 0.5 : 1 }} title="Exportar este período para Excel">
              <Download size={15} /> Exportar Excel
            </Btn>
            {qtdImportados > 0 && (
              <Btn variant="ghost" onClick={desfazerImport} title="Remove em lote os lançamentos que vieram de importação nesta conta"
                style={{ color: C.red }}>
                <Trash2 size={15} /> Desfazer importação ({qtdImportados})
              </Btn>
            )}
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: C.text3 }}>Saldo atual</div>
              <div style={{ fontFamily: serif, fontSize: 22, color: saldoAtual >= 0 ? C.teal : C.red }}>{fmt(saldoAtual)}</div>
            </div>
          </div>
        </div>

        {/* cabeçalho de colunas */}
        <div style={{ display: "grid", gridTemplateColumns: col, gap: 8, padding: "10px 20px", background: C.cream, fontSize: 11, fontWeight: 700, color: C.text3, letterSpacing: 0.3 }}>
          <div>DATA</div>
          <div style={{ textAlign: "right" }}>ENTRADA</div>
          <div style={{ textAlign: "right" }}>SAÍDA</div>
          <div style={{ textAlign: "right" }}>SALDO</div>
          <div>DESCRIÇÃO</div>
        </div>

        {/* saldo anterior */}
        <div style={{ display: "grid", gridTemplateColumns: col, gap: 8, padding: "11px 20px", borderBottom: `1px solid ${C.border2}`, background: "#fff" }}>
          <Cel style={{ color: C.text4 }}>—</Cel>
          <Cel />
          <Cel />
          <Cel style={{ textAlign: "right", fontWeight: 600 }}>{fmt(saldoAnterior)}</Cel>
          <Cel style={{ color: C.text3, fontStyle: "italic" }}>{anoTodo || saldoAnterior === saldoInicial ? "Saldo inicial" : "Saldo anterior"}</Cel>
        </div>

        {linhas.map((l) => (
          <div key={l.id} onClick={() => onAbrir && onAbrir(l)} title="Ver lançamento completo" style={{ display: "grid", gridTemplateColumns: col, gap: 8, padding: "11px 20px", borderBottom: `1px solid ${C.border2}`, alignItems: "center", cursor: "pointer" }}>
            <Cel style={{ color: C.text3 }}>{l.data}</Cel>
            <Cel style={{ textAlign: "right", color: C.green, fontWeight: 600 }}>{l.tipo === "entrada" ? fmt(l.valor) : ""}</Cel>
            <Cel style={{ textAlign: "right", color: C.red, fontWeight: 600 }}>{l.tipo === "saida" ? fmt(l.valor) : ""}</Cel>
            <Cel style={{ textAlign: "right", fontWeight: 600 }}>{fmt(l.saldoCorrente)}</Cel>
            <Cel>
              <div style={{ fontWeight: 600, color: C.text }}>{l.descricao}</div>
              <div style={{ fontSize: 11, color: C.text4 }}>{l.categoria}{l.subcategoria ? ` › ${l.subcategoria}` : ""}</div>
            </Cel>
          </div>
        ))}

        {linhas.length === 0 && <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: C.text4 }}>Nenhuma movimentação em {anoTodo ? ANO_ATUAL : `${MESES[mesSel]}/${ANO_ATUAL}`} nesta conta. Troque o mês acima para procurar em outro período.</div>}

        {/* totais de entradas e saídas do período */}
        {linhas.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: col, gap: 8, padding: "12px 20px", borderTop: `1px solid ${C.border2}`, background: "#fff", fontWeight: 700 }}>
            <Cel style={{ color: C.text4 }}>Totais</Cel>
            <Cel style={{ textAlign: "right", color: C.green }}>{fmt(totalEntradas)}</Cel>
            <Cel style={{ textAlign: "right", color: C.red }}>{fmt(totalSaidas)}</Cel>
            <Cel style={{ textAlign: "right", color: (totalEntradas - totalSaidas) >= 0 ? C.teal : C.red }}>{fmt(totalEntradas - totalSaidas)}</Cel>
            <Cel style={{ color: C.text3, fontStyle: "italic" }}>Entradas e saídas {anoTodo ? `de ${ANO_ATUAL}` : `de ${MESES[mesSel]}`} · resultado do período</Cel>
          </div>
        )}

        {/* saldo final do período */}
        <div style={{ display: "grid", gridTemplateColumns: col, gap: 8, padding: "13px 20px", background: C.cream, fontWeight: 700 }}>
          <Cel />
          <Cel /><Cel />
          <Cel style={{ textAlign: "right", fontFamily: serif, fontSize: 16, color: saldoFimPeriodo >= 0 ? C.teal : C.red }}>{fmt(saldoFimPeriodo)}</Cel>
          <Cel style={{ fontFamily: serif, fontSize: 15 }}>Saldo ao fim {anoTodo ? `de ${ANO_ATUAL}` : `de ${MESES[mesSel]}`}</Cel>
        </div>
      </Card>

      {previstos.length > 0 && (
        <Card style={{ marginTop: 16, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "12px 20px", borderBottom: `1px solid ${C.border2}`, fontSize: 13, fontWeight: 700, color: C.text3 }}>
            LANÇAMENTOS PREVISTOS (não entram no saldo)
          </div>
          {previstos.map((l, i) => (
            <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 20px", borderBottom: i < previstos.length - 1 ? `1px solid ${C.border2}` : "none" }}>
              <Badge color={C.amber} bg={C.amberPale}>{l.data}</Badge>
              <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{l.descricao}</div>
              <div style={{ fontFamily: serif, color: l.tipo === "entrada" ? C.green : C.red }}>
                {l.tipo === "entrada" ? "+" : "−"} {fmt(l.valor)}
              </div>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}

// ===== DRE =================================================================
const TRIMESTRES = [
  { label: "1º tri (Jan–Mar)", meses: [0, 1, 2] },
  { label: "2º tri (Abr–Jun)", meses: [3, 4, 5] },
  { label: "3º tri (Jul–Set)", meses: [6, 7, 8] },
  { label: "4º tri (Out–Dez)", meses: [9, 10, 11] },
];

function calcDRE(lancs, categorias) {
  const sec = {};
  // Cada seção agrega por CATEGORIA (nível do meio) → SUBCATEGORIA.
  SECOES.forEach((s) => (sec[s.key] = { total: 0, cats: {} }));
  // Pré-popula TODA a estrutura do plano de contas (categorias + subcategorias)
  // zerada — assim o DRE exibe o plano completo mesmo sem lançamentos.
  categorias.forEach((c) => {
    const b = sec[c.secao];
    if (!b) return;
    const cg = (b.cats[c.nome] ||= { total: 0, subs: {} });
    (c.subs || []).forEach((s) => { if (!(s in cg.subs)) cg.subs[s] = 0; });
  });
  lancs.forEach((l) => {
    const cat = categorias.find((c) => c.nome === l.categoria);
    // Fallback: se a categoria do lançamento não existe mais no plano (ex.: era o
    // nome de uma seção — default antigo, substituído por categorias novas),
    // mapeia pela SEÇÃO de mesmo nome; só então cai no tipo.
    const secaoPeloNome = SECOES.find((s) => s.label === l.categoria);
    const key = cat?.secao || secaoPeloNome?.key || (l.tipo === "entrada" ? "receita_bruta" : "despesa_operacional");
    const b = sec[key] || sec.despesa_operacional;
    const abaixoLinha = key === "movimentacao" || key === "investimentos";
    const signed = abaixoLinha ? (l.tipo === "entrada" ? l.valor : -l.valor) : l.valor;
    b.total += signed;
    const cg = (b.cats[l.categoria || "—"] ||= { total: 0, subs: {} });
    cg.total += signed;
    const s = l.subcategoria || "—";
    cg.subs[s] = (cg.subs[s] || 0) + signed;
  });
  const rb = sec.receita_bruta.total;
  const trib = sec.tributos.total;
  const recLiq = rb - trib;
  const cd = sec.custo_direto.total;
  const lucroBruto = recLiq - cd;
  const dop = sec.despesa_operacional.total;
  const lucroLiq = lucroBruto - dop;
  return { sec, rb, trib, recLiq, cd, lucroBruto, dop, lucroLiq, inv: sec.investimentos.total, mov: sec.movimentacao.total };
}

function DRE({ lancamentos, categorias }) {
  const [regime, setRegime] = useState("competencia");
  const [visao, setVisao] = useState("ano"); // abre no ano todo (senão o mês atual pode estar vazio)
  const [mesSel, setMesSel] = useState(MES_ATUAL);
  const [triSel, setTriSel] = useState(1);

  const porRegime = (l) => (regime === "caixa" ? l.status === "pago" : true);
  const mesesVisao = visao === "mes" ? [mesSel] : visao === "trimestre" ? TRIMESTRES[triSel].meses : TODOS_MESES;
  const base = lancamentos.filter((l) => porRegime(l) && mesesVisao.includes(l.mes));
  const dre = calcDRE(base, categorias);
  const margem = dre.rb > 0 ? (dre.lucroLiq / dre.rb) * 100 : 0;

  const periodoLabel =
    visao === "mes" ? `${MESES[mesSel]} de ${ANO_ATUAL}` :
    visao === "trimestre" ? `${TRIMESTRES[triSel].label} · ${ANO_ATUAL}` :
    visao === "ano" ? `Ano de ${ANO_ATUAL}` :
    `Exercício ${ANO_ATUAL} · mês a mês`;

  const Toggle = ({ opcoes, valor, set }) => (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {opcoes.map(([id, lb]) => (
        <button key={id} onClick={() => set(id)} className="cw-btn"
          style={{ padding: "7px 12px", borderRadius: 9, fontSize: 12.5, fontWeight: 600, border: `1px solid ${valor === id ? C.cafe : C.border}`, background: valor === id ? C.cafe : C.white, color: valor === id ? "#fff" : C.text2 }}>
          {lb}
        </button>
      ))}
    </div>
  );

  const controles = (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        <div style={{ fontFamily: serif, fontSize: 20 }}>Demonstração do Resultado (DRE)</div>
        <Toggle opcoes={[["competencia", "Competência"], ["caixa", "Caixa"]]} valor={regime} set={setRegime} />
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Toggle opcoes={[["mes", "Mês"], ["trimestre", "Trimestre"], ["ano", "Ano"], ["mensal", "Mensal (12 meses)"]]} valor={visao} set={setVisao} />
        {visao === "mes" && (
          <select value={mesSel} onChange={(e) => setMesSel(+e.target.value)} style={{ ...inp, width: "auto", padding: "7px 10px", fontSize: 13 }}>
            {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
        )}
        {visao === "trimestre" && (
          <select value={triSel} onChange={(e) => setTriSel(+e.target.value)} style={{ ...inp, width: "auto", padding: "7px 10px", fontSize: 13 }}>
            {TRIMESTRES.map((t, i) => <option key={i} value={i}>{t.label}</option>)}
          </select>
        )}
        <div style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: C.cafe, background: C.cafePale, padding: "6px 13px", borderRadius: 9, whiteSpace: "nowrap" }}>
          {periodoLabel}
        </div>
      </div>
    </div>
  );

  // ---- Visão mensal (matriz: linhas × meses) ----
  if (visao === "mensal") {
    const cols = TODOS_MESES.map((m) => calcDRE(lancamentos.filter((l) => porRegime(l) && l.mes === m), categorias));
    const ROWS = [
      { label: "Receita Operacional Bruta", get: (d) => d.rb, t: "n" },
      { label: "(−) Tributos", get: (d) => -d.trib, t: "n" },
      { label: "= Receita Líquida", get: (d) => d.recLiq, t: "b" },
      { label: "(−) Custo Direto", get: (d) => -d.cd, t: "n" },
      { label: "= Lucro Bruto", get: (d) => d.lucroBruto, t: "b" },
      { label: "(−) Despesas Operacionais", get: (d) => -d.dop, t: "n" },
      { label: "= Lucro Líquido", get: (d) => d.lucroLiq, t: "f" },
      { label: "Investimentos/Dividendos", get: (d) => d.inv, t: "m" },
      { label: "Conta Movimentação", get: (d) => d.mov, t: "m" },
    ];
    const grid = `220px repeat(${MESES.length + 1}, minmax(74px,1fr))`;
    return (
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: 20 }}>{controles}</div>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 1240 }}>
            <div style={{ display: "grid", gridTemplateColumns: grid, background: C.cream, fontSize: 11.5, fontWeight: 700, color: C.text3 }}>
              <div style={{ padding: "10px 16px" }}>CONTA</div>
              {MESES.map((m) => <div key={m} style={{ padding: "10px 8px", textAlign: "right" }}>{m}</div>)}
              <div style={{ padding: "10px 12px", textAlign: "right" }}>TOTAL</div>
            </div>
            {ROWS.map((r) => {
              const forte = r.t === "f"; const bold = r.t === "b" || forte;
              const total = r.get(dre);
              return (
                <div key={r.label} style={{ display: "grid", gridTemplateColumns: grid, borderTop: `1px solid ${C.border2}`, background: forte ? C.cafePale : "#fff", alignItems: "center" }}>
                  <div style={{ padding: "10px 16px", fontSize: 13, fontWeight: bold ? 700 : 500, fontFamily: bold ? serif : sans }}>{r.label}</div>
                  {cols.map((d, i) => {
                    const v = r.get(d);
                    return <div key={i} style={{ padding: "10px 8px", textAlign: "right", fontSize: 12, color: r.t === "m" ? C.text3 : v < 0 ? C.red : C.text2, fontWeight: bold ? 600 : 400 }}>{v ? fmtShort(v) : "—"}</div>;
                  })}
                  <div style={{ padding: "10px 12px", textAlign: "right", fontSize: 12.5, fontWeight: 700, color: r.t === "m" ? C.text3 : total < 0 ? C.red : C.text }}>{fmtShort(total)}</div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    );
  }

  // ---- Visão vertical (mês / trimestre / ano) ----
  // 3 níveis: SEÇÃO → categoria (só aparece quando há +de 1 por seção) → subcategoria.
  const Secao = ({ titulo, total, cats, cor, sinal }) => {
    const entries = Object.entries(cats).sort((a, b) => Math.abs(b[1].total) - Math.abs(a[1].total));
    const mostrarCategoria = entries.length > 1;
    return (
      <div style={{ marginBottom: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 0 5px", fontWeight: 700, fontSize: 13.5, borderBottom: `1px solid ${C.border2}` }}>
          <span style={{ color: cor }}>{titulo}</span>
          <span style={{ color: cor }}>{sinal}{fmt(Math.abs(total))}</span>
        </div>
        {entries.map(([catNome, cg]) => (
          <div key={catNome}>
            {mostrarCategoria && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0 2px 12px", fontSize: 13, fontWeight: 600, color: C.text2 }}>
                <span>{catNome}</span><span>{fmt(cg.total)}</span>
              </div>
            )}
            {Object.entries(cg.subs).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).map(([s, v]) => (
              <div key={s} style={{ display: "flex", justifyContent: "space-between", padding: `3px 0 3px ${mostrarCategoria ? 26 : 14}px`, fontSize: 12.5, color: C.text3 }}>
                <span>› {s}</span><span>{fmt(v)}</span>
              </div>
            ))}
          </div>
        ))}
        {entries.length === 0 && <div style={{ padding: "4px 0 4px 14px", fontSize: 12, color: C.text4 }}>—</div>}
      </div>
    );
  };
  const Calc = ({ titulo, valor, forte }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: forte ? "13px 10px" : "10px 0", borderTop: `2px solid ${forte ? C.text : C.border}`, marginTop: 6, marginBottom: forte ? 10 : 6, background: forte ? C.cafePale : "transparent", borderRadius: forte ? 10 : 0, paddingLeft: forte ? 12 : 0, paddingRight: forte ? 12 : 0 }}>
      <span style={{ fontFamily: serif, fontSize: forte ? 17 : 15 }}>{titulo}</span>
      <span style={{ fontFamily: serif, fontSize: forte ? 21 : 16, color: valor >= 0 ? C.green : C.red }}>{fmt(valor)}</span>
    </div>
  );

  return (
    <Card style={{ maxWidth: 760 }}>
      {controles}
      <Secao titulo="RECEITA OPERACIONAL BRUTA" total={dre.rb} cats={dre.sec.receita_bruta.cats} cor={C.green} sinal="+ " />
      <Secao titulo="(−) TRIBUTOS" total={dre.trib} cats={dre.sec.tributos.cats} cor={C.red} sinal="− " />
      <Calc titulo="= RECEITA LÍQUIDA" valor={dre.recLiq} />
      <Secao titulo="(−) CUSTO DIRETO" total={dre.cd} cats={dre.sec.custo_direto.cats} cor={C.red} sinal="− " />
      <Calc titulo="= LUCRO BRUTO" valor={dre.lucroBruto} />
      <Secao titulo="(−) DESPESAS OPERACIONAIS" total={dre.dop} cats={dre.sec.despesa_operacional.cats} cor={C.red} sinal="− " />
      <Calc titulo="= LUCRO LÍQUIDO" valor={dre.lucroLiq} forte />
      <div style={{ textAlign: "right", fontSize: 12.5, color: C.text3, marginBottom: 18 }}>
        Margem líquida: <b style={{ color: dre.lucroLiq >= 0 ? C.green : C.red }}>{margem.toFixed(1)}%</b>
      </div>
      <Secao titulo="INVESTIMENTOS / DIVIDENDOS (não afeta o resultado)" total={dre.inv} cats={dre.sec.investimentos.cats} cor={C.text3} sinal="" />
      <Secao titulo="CONTA MOVIMENTAÇÃO (não afeta o resultado)" total={dre.mov} cats={dre.sec.movimentacao.cats} cor={C.text3} sinal="" />
    </Card>
  );
}

// ===== CATEGORIAS ==========================================================
function Categorias({ categorias, lancamentos = [], store }) {
  const [modal, setModal] = useState(null);
  const [reclOpen, setReclOpen] = useState(false);
  const corSecao = (k) => (k === "receita_bruta" ? C.green : (k === "movimentacao" || k === "investimentos") ? C.text3 : C.red);

  // Categorias usadas em lançamentos que NÃO existem mais no plano (órfãs) —
  // continuam aparecendo no DRE até serem reclassificadas.
  const nomesPlano = new Set(categorias.map((c) => c.nome));
  const orfasMap = {};
  lancamentos.forEach((l) => { if (l.categoria && !nomesPlano.has(l.categoria)) orfasMap[l.categoria] = (orfasMap[l.categoria] || 0) + 1; });
  const orfas = Object.entries(orfasMap);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 13, color: C.text3, maxWidth: 620 }}>3 níveis: <b>Seção</b> (grupo do DRE) → <b>Categoria</b> → <b>Subcategoria</b>. Crie várias categorias por seção — ex.: em <i>Custo Direto</i>: Cafeteria e Coworking; em <i>Despesas Operacionais</i>: Administrativas, Comerciais, Financeiras.</div>
        <Btn onClick={() => setModal({})}><Plus size={16} /> Nova categoria</Btn>
      </div>

      {orfas.length > 0 && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", background: `${C.amber}14`, color: C.amber, borderRadius: 10, padding: "10px 12px", fontSize: 12.5, marginBottom: 14 }}>
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <AlertCircle size={15} /> {orfas.length} categoria(s) usada(s) em lançamentos não estão mais no plano ({orfas.map(([n, c]) => `${n} (${c})`).join(", ")}). Por isso ainda aparecem no DRE.
          </span>
          <button onClick={() => setReclOpen(true)} className="cw-btn" style={{ fontWeight: 600, fontSize: 12.5, color: "#fff", background: C.cafe, borderRadius: 9, padding: "7px 12px", whiteSpace: "nowrap" }}>Reclassificar</button>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="cw-grid-stack">
        {SECOES.map((s) => {
          const cats = categorias.filter((c) => c.secao === s.key);
          if (cats.length === 0) return null;
          return <Coluna key={s.key} titulo={s.label} cor={corSecao(s.key)} cats={cats} store={store} />;
        })}
      </div>

      {modal && (
        <Modal title="Nova categoria" onClose={() => setModal(null)}>
          <CategoriaForm onSave={(d) => { store.addCategoria(d); setModal(null); }} />
        </Modal>
      )}
      {reclOpen && (
        <ReclassificarModal
          orfas={orfas}
          categorias={categorias}
          onClose={() => setReclOpen(false)}
          onAplicar={(pares) => {
            // pares: [{ de: nomeOrfao, para: nomeAlvo }]
            const alvoPorOrfa = Object.fromEntries(pares.filter((p) => p.para).map((p) => [p.de, p.para]));
            lancamentos.forEach((l) => {
              const para = alvoPorOrfa[l.categoria];
              if (para) store.updateLancamento(l.id, { categoria: para });
            });
            setReclOpen(false);
          }}
        />
      )}
    </>
  );
}

// Remaneja lançamentos cuja categoria saiu do plano para uma categoria atual.
function ReclassificarModal({ orfas, categorias, onClose, onAplicar }) {
  const [mapa, setMapa] = useState({}); // orfaNome -> alvoNome
  // Sugere alvos da mesma seção (via SECOES label) quando possível.
  const secaoDaOrfa = (nome) => SECOES.find((s) => s.label === nome)?.key;
  const alvosPara = (orfaNome) => {
    const sk = secaoDaOrfa(orfaNome);
    const daSecao = categorias.filter((c) => c.secao === sk);
    return (daSecao.length ? daSecao : categorias);
  };
  return (
    <Modal title="Reclassificar lançamentos" onClose={onClose} maxWidth={560}>
      <div style={{ fontSize: 13, color: C.text2, marginBottom: 14 }}>
        Essas categorias não existem mais no plano, mas há lançamentos usando-as. Escolha para qual categoria atual mover cada uma — todos os lançamentos daquela categoria vão junto.
      </div>
      {orfas.map(([nome, count]) => (
        <div key={nome} style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 10, alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{nome} <span style={{ color: C.text3, fontWeight: 400 }}>({count})</span></div>
          <div style={{ color: C.text3 }}>→</div>
          <select value={mapa[nome] || ""} onChange={(e) => setMapa({ ...mapa, [nome]: e.target.value })} style={inp}>
            <option value="">— manter como está —</option>
            {alvosPara(nome).map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
          </select>
        </div>
      ))}
      <Btn style={{ width: "100%", justifyContent: "center", marginTop: 6 }}
        onClick={() => onAplicar(orfas.map(([nome]) => ({ de: nome, para: mapa[nome] })))}>
        <Check size={16} /> Aplicar reclassificação
      </Btn>
    </Modal>
  );
}

function Coluna({ titulo, cor, cats, store }) {
  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border2}`, fontFamily: serif, fontSize: 18, color: cor }}>{titulo}</div>
      {cats.length === 0 ? (
        <Empty icon={Tags} title="Sem categorias" sub="Adicione uma categoria." />
      ) : (
        cats.map((c, i) => <CategoriaCard key={c.id} c={c} last={i === cats.length - 1} store={store} />)
      )}
    </Card>
  );
}

function CategoriaCard({ c, last, store }) {
  const [novaSub, setNovaSub] = useState("");
  const addSub = () => {
    const s = novaSub.trim();
    if (s && !c.subs.includes(s)) store.updateCategoria(c.id, { subs: [...c.subs, s] });
    setNovaSub("");
  };
  const removeSub = (s) => store.updateCategoria(c.id, { subs: c.subs.filter((x) => x !== s) });

  return (
    <div style={{ padding: "14px 18px", borderBottom: last ? "none" : `1px solid ${C.border2}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 14.5, fontWeight: 600 }}>{c.nome}</span>
        <button onClick={() => store.removeCategoria(c.id)} className="cw-btn" style={{ color: C.red, padding: 5 }} title="Excluir categoria"><Trash2 size={14} /></button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        {c.subs.map((s) => (
          <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, background: C.cream2, borderRadius: 8, padding: "4px 8px", color: C.text2 }}>
            {s}
            <button onClick={() => removeSub(s)} style={{ color: C.text4, display: "grid", placeItems: "center" }} title="Remover"><X size={12} /></button>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <input value={novaSub} onChange={(e) => setNovaSub(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addSub()} placeholder="Nova subcategoria"
          style={{ ...inp, padding: "7px 10px", fontSize: 12.5, flex: 1 }} />
        <Btn variant="soft" onClick={addSub} style={{ padding: "0 12px" }}><Plus size={14} /></Btn>
      </div>
    </div>
  );
}

function CategoriaForm({ onSave }) {
  const [f, setF] = useState({ nome: "", secao: "despesa_operacional" });
  return (
    <>
      <Field label="Seção no DRE">
        <select value={f.secao} onChange={(e) => setF({ ...f, secao: e.target.value })} style={inp}>
          {SECOES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </Field>
      <Field label="Nome da categoria">
        <input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} style={inp} placeholder="Ex: Receita Financeira, Despesa Administrativa..." />
      </Field>
      <div style={{ fontSize: 11, color: C.text4, marginBottom: 14 }}>
        A seção define onde a categoria entra no DRE (e se soma ou subtrai no resultado).
      </div>
      <Btn style={{ width: "100%", justifyContent: "center" }} onClick={() => f.nome.trim() && onSave({ ...f, subs: [] })}>Criar categoria</Btn>
    </>
  );
}

// ===== BANCOS / PRODUTOS ===================================================
function Bancos({ contas, lancamentos = [], saldoTotal, onNovo, onEditar, onExcluir }) {
  return (
    <>
      <Card style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, color: C.text3 }}>Saldo consolidado</div>
          <div style={{ fontFamily: serif, fontSize: 28, color: C.teal }}>{fmt(saldoTotal)}</div>
        </div>
        <Btn onClick={onNovo}><Plus size={16} /> Nova conta</Btn>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 14 }}>
        {contas.map((c) => (
          <Card key={c.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: C.tealPale, display: "grid", placeItems: "center" }}><Landmark size={22} color={C.teal} /></div>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => onEditar(c)} className="cw-btn" style={{ color: C.text3, padding: 6 }}><Edit3 size={15} /></button>
                <button onClick={() => onExcluir(c)} className="cw-btn" style={{ color: C.red, padding: 6 }}><Trash2 size={15} /></button>
              </div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{c.banco}</div>
            <div style={{ fontSize: 12, color: C.text3, marginBottom: 10 }}>{c.tipo}</div>
            {(() => { const atual = saldoAtualConta(c, lancamentos); return (
              <>
                <div style={{ fontFamily: serif, fontSize: 22, color: atual >= 0 ? C.text : C.red }}>{fmt(atual)}</div>
                <div style={{ fontSize: 11, color: C.text4, marginTop: 2 }}>Saldo atual · inicial {fmt(c.saldo || 0)}</div>
              </>
            ); })()}
          </Card>
        ))}
        {contas.length === 0 && <Empty icon={Landmark} title="Nenhuma conta" sub="Cadastre as contas bancárias da unidade." />}
      </div>
    </>
  );
}

// ===== RECEBIMENTOS POR CLIENTE ============================================
function RecebimentosCliente({ clientes = [], lancamentos = [], updateLancamento }) {
  const [mesRef, setMesRef] = useState(MES_ATUAL);
  const [previa, setPrevia] = useState(null); // { vinculaveis:[{l,cliente}], ambiguos, semMatch }
  const normTxt = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const naoVinculados = lancamentos.filter((l) => l.tipo === "entrada" && l.status === "pago" && !l.clienteId);
  const calcularVinculos = () => {
    const vinculaveis = []; let ambiguos = 0, semMatch = 0;
    for (const l of naoVinculados) {
      const d = normTxt(l.descricao);
      const achados = clientes.filter((c) => c.nome && d.includes(normTxt(c.nome)));
      if (achados.length === 1) vinculaveis.push({ l, cliente: achados[0] });
      else if (achados.length > 1) ambiguos++;
      else semMatch++;
    }
    setPrevia({ vinculaveis, ambiguos, semMatch });
  };
  const aplicarVinculos = () => {
    (previa?.vinculaveis || []).forEach(({ l, cliente }) => updateLancamento && updateLancamento(l.id, { clienteId: cliente.id, clienteNome: cliente.nome }));
    setPrevia(null);
  };
  const [view, setView] = useState("mensal"); // "mensal" (mês a mês) | "consolidado"
  // Regime de caixa: mês em que o dinheiro entrou (data de pagamento). Cai para
  // a competência (l.mes) quando o lançamento antigo não tem data de pagamento.
  const mesCaixa = (l) => {
    const d = l.dataPagamento || l.data;
    if (d && /^\d{2}\/\d{2}\/\d{4}$/.test(d)) { const m = +d.slice(3, 5) - 1; if (m >= 0 && m <= 11) return m; }
    return l.mes;
  };
  const recebidos = lancamentos.filter((l) => l.tipo === "entrada" && l.status === "pago" && l.clienteId);
  const clientesOrd = clientes.slice().sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
  const triIdx = Math.floor(mesRef / 3);
  const triMeses = TRIMESTRES[triIdx].meses;
  const somaCli = (cid, filtro) => recebidos.filter((l) => l.clienteId === cid && filtro(l)).reduce((s, l) => s + l.valor, 0);
  const linhas = clientesOrd.map((c) => ({
    id: c.id, nome: c.nome,
    mes: somaCli(c.id, (l) => mesCaixa(l) === mesRef),
    tri: somaCli(c.id, (l) => triMeses.includes(mesCaixa(l))),
    ano: somaCli(c.id, () => true),
    acum: somaCli(c.id, () => true),
  }));
  const tot = linhas.reduce((t, r) => ({ mes: t.mes + r.mes, tri: t.tri + r.tri, ano: t.ano + r.ano, acum: t.acum + r.acum }), { mes: 0, tri: 0, ano: 0, acum: 0 });
  // Matriz mês a mês (regime de caixa): cada cliente x 12 meses + total
  const matriz = clientesOrd.map((c) => {
    const meses = MESES.map((_, mi) => somaCli(c.id, (l) => mesCaixa(l) === mi));
    return { id: c.id, nome: c.nome, meses, total: meses.reduce((s, v) => s + v, 0) };
  });
  const totMes = MESES.map((_, mi) => matriz.reduce((s, r) => s + r.meses[mi], 0));
  const totGeral = totMes.reduce((s, v) => s + v, 0);
  const semVinculo = lancamentos.filter((l) => l.tipo === "entrada" && l.status === "pago" && !l.clienteId).length;
  const fmtNum = (v) => fmt(v).replace("R$ ", "").replace("R$ ", "");

  const col = "1fr 110px 110px 110px 130px";
  const Cel = ({ children, style }) => <div style={{ fontSize: 13, ...style }}>{children}</div>;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: serif, fontSize: 20 }}>Recebimentos por cliente</div>
          <div style={{ fontSize: 12.5, color: C.text3 }}>Regime de caixa — valor recebido no mês do pagamento. Clientes sem recebimento aparecem destacados.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", background: C.cream, borderRadius: 10, padding: 3, gap: 2 }}>
            {[["mensal", "Mês a mês"], ["consolidado", "Consolidado"]].map(([v, lbl]) => (
              <button key={v} onClick={() => setView(v)} className="cw-btn"
                style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, border: "none",
                  background: view === v ? C.white : "transparent", color: view === v ? C.cafe : C.text3,
                  boxShadow: view === v ? "0 1px 3px rgba(0,0,0,.08)" : "none" }}>{lbl}</button>
            ))}
          </div>
          {view === "consolidado" && (
            <select value={mesRef} onChange={(e) => setMesRef(+e.target.value)} style={{ ...inp, width: "auto", padding: "7px 10px", fontSize: 13 }}>
              {MESES.map((m, i) => <option key={i} value={i}>{m}/{ANO_ATUAL}</option>)}
            </select>
          )}
        </div>
      </div>

      {semVinculo > 0 && !previa && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", background: `${C.amber}14`, color: C.amber, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, marginBottom: 12 }}>
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}><AlertCircle size={15} /> {semVinculo} recebimento(s) pago(s) sem cliente vinculado.</span>
          <button onClick={calcularVinculos} className="cw-btn" style={{ fontWeight: 600, fontSize: 12.5, color: "#fff", background: C.cafe, borderRadius: 9, padding: "7px 12px" }}>Vincular automaticamente</button>
        </div>
      )}
      {previa && (
        <div style={{ background: C.cream, border: `1px solid ${C.border2}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 6 }}>Vinculação automática pela descrição</div>
          <div style={{ fontSize: 12.5, color: C.text2, marginBottom: 10 }}>
            <b style={{ color: C.green }}>{previa.vinculaveis.length}</b> serão vinculados (nome do cliente encontrado na descrição).
            {previa.ambiguos > 0 && <> · <b style={{ color: C.amber }}>{previa.ambiguos}</b> ambíguos</>}
            {previa.semMatch > 0 && <> · <b style={{ color: C.text3 }}>{previa.semMatch}</b> sem correspondência</>}
            {(previa.ambiguos > 0 || previa.semMatch > 0) && " — esses ficam para vincular manualmente."}
          </div>
          {previa.vinculaveis.length > 0 && (
            <div style={{ maxHeight: 160, overflowY: "auto", marginBottom: 10, fontSize: 12 }}>
              {previa.vinculaveis.slice(0, 40).map(({ l, cliente }) => (
                <div key={l.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "3px 0", color: C.text3 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.descricao}</span>
                  <span style={{ whiteSpace: "nowrap", color: C.text2 }}>→ {cliente.nome}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={aplicarVinculos} disabled={previa.vinculaveis.length === 0} style={{ opacity: previa.vinculaveis.length ? 1 : 0.5 }}><Check size={15} /> Vincular {previa.vinculaveis.length}</Btn>
            <Btn variant="ghost" onClick={() => setPrevia(null)}>Cancelar</Btn>
          </div>
        </div>
      )}

      {view === "mensal" ? (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 240 + 12 * 84 + 120 }}>
              {(() => {
                const mcol = `220px repeat(12, 84px) 120px`;
                return (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: mcol, gap: 0, padding: "11px 18px", background: C.cream, fontSize: 10.5, fontWeight: 700, color: C.text3, letterSpacing: 0.3, position: "sticky", top: 0 }}>
                      <div>CLIENTE</div>
                      {MESES.map((m, i) => <div key={i} style={{ textAlign: "right" }}>{m.slice(0, 3).toUpperCase()}</div>)}
                      <div style={{ textAlign: "right" }}>TOTAL {ANO_ATUAL}</div>
                    </div>
                    {matriz.map((r) => {
                      const semRec = r.total === 0;
                      return (
                        <div key={r.id} style={{ display: "grid", gridTemplateColumns: mcol, gap: 0, padding: "9px 18px", borderTop: `1px solid ${C.border2}`, alignItems: "center", background: semRec ? `${C.red}08` : "transparent" }}>
                          <Cel style={{ fontWeight: 600, color: semRec ? C.red : C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8 }} >{r.nome}{semRec && <span style={{ fontSize: 10, fontWeight: 700, color: C.red, marginLeft: 6 }}>· sem recebimento</span>}</Cel>
                          {r.meses.map((v, i) => <Cel key={i} style={{ textAlign: "right", fontSize: 11.5, color: v ? C.text : C.border, fontVariantNumeric: "tabular-nums" }}>{v ? fmtNum(v) : "·"}</Cel>)}
                          <Cel style={{ textAlign: "right", fontWeight: 700, fontSize: 12.5, color: r.total ? C.green : C.text4, fontVariantNumeric: "tabular-nums" }}>{r.total ? fmtNum(r.total) : "—"}</Cel>
                        </div>
                      );
                    })}
                    {matriz.length === 0 && <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: C.text4 }}>Nenhum cliente cadastrado nesta unidade.</div>}
                    {matriz.length > 0 && (
                      <div style={{ display: "grid", gridTemplateColumns: mcol, gap: 0, padding: "12px 18px", background: C.cream, fontWeight: 700 }}>
                        <Cel style={{ fontFamily: serif, fontSize: 13.5 }}>TOTAL</Cel>
                        {totMes.map((v, i) => <Cel key={i} style={{ textAlign: "right", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>{v ? fmtNum(v) : "·"}</Cel>)}
                        <Cel style={{ textAlign: "right", color: C.green, fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>{fmtNum(totGeral)}</Cel>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 620 }}>
              <div style={{ display: "grid", gridTemplateColumns: col, gap: 8, padding: "11px 18px", background: C.cream, fontSize: 11, fontWeight: 700, color: C.text3, letterSpacing: 0.3 }}>
                <div>CLIENTE</div>
                <div style={{ textAlign: "right" }}>{MESES[mesRef].toUpperCase()}</div>
                <div style={{ textAlign: "right" }}>{triIdx + 1}º TRI</div>
                <div style={{ textAlign: "right" }}>ANO {ANO_ATUAL}</div>
                <div style={{ textAlign: "right" }}>ACUMULADO</div>
              </div>
              {linhas.map((r) => (
                <div key={r.id} style={{ display: "grid", gridTemplateColumns: col, gap: 8, padding: "11px 18px", borderTop: `1px solid ${C.border2}`, alignItems: "center" }}>
                  <Cel style={{ fontWeight: 600 }}>{r.nome}</Cel>
                  <Cel style={{ textAlign: "right", color: r.mes ? C.text : C.text4 }}>{r.mes ? fmt(r.mes) : "—"}</Cel>
                  <Cel style={{ textAlign: "right", color: r.tri ? C.text : C.text4 }}>{r.tri ? fmt(r.tri) : "—"}</Cel>
                  <Cel style={{ textAlign: "right", color: r.ano ? C.text : C.text4 }}>{r.ano ? fmt(r.ano) : "—"}</Cel>
                  <Cel style={{ textAlign: "right", fontWeight: 700, color: r.acum ? C.green : C.text4 }}>{r.acum ? fmt(r.acum) : "—"}</Cel>
                </div>
              ))}
              {linhas.length === 0 && <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: C.text4 }}>Nenhum cliente cadastrado nesta unidade.</div>}
              {linhas.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: col, gap: 8, padding: "13px 18px", background: C.cream, fontWeight: 700 }}>
                  <Cel style={{ fontFamily: serif, fontSize: 14 }}>TOTAL</Cel>
                  <Cel style={{ textAlign: "right" }}>{fmt(tot.mes)}</Cel>
                  <Cel style={{ textAlign: "right" }}>{fmt(tot.tri)}</Cel>
                  <Cel style={{ textAlign: "right" }}>{fmt(tot.ano)}</Cel>
                  <Cel style={{ textAlign: "right", color: C.green }}>{fmt(tot.acum)}</Cel>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}
    </>
  );
}

// ===== INADIMPLÊNCIA =======================================================
function Inadimplencia({ clientes = [], lancamentos = [], contas = [], categorias = [], store, activeUnit }) {
  const [modal, setModal] = useState(false);
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const d2 = (n) => String(n).padStart(2, "0");
  const hojeBR = `${d2(hoje.getDate())}/${d2(hoje.getMonth() + 1)}/${hoje.getFullYear()}`;
  const nomeCli = (l) => l.clienteNome || clientes.find((c) => c.id === l.clienteId)?.nome || "— sem cliente —";

  // Todo recebível PREVISTO cujo vencimento já passou = inadimplente (automático).
  const vencidos = lancamentos
    .filter((l) => l.tipo === "entrada" && l.status === "previsto")
    .map((l) => { const v = parseDateBR(l.dataVencimento || l.data); return v ? { l, venc: v, dias: Math.round((hoje - v) / 86400000) } : null; })
    .filter((x) => x && x.dias >= 1)
    .sort((a, b) => b.dias - a.dias);

  const total = vencidos.reduce((s, x) => s + (x.l.valor || 0), 0);
  const maiorAtraso = vencidos[0]?.dias || 0;

  // Aging (faixas de atraso).
  const FAIXAS = [
    { lbl: "1–30 dias", min: 1, max: 30, cor: C.amber },
    { lbl: "31–60 dias", min: 31, max: 60, cor: "#e08a00" },
    { lbl: "61–90 dias", min: 61, max: 90, cor: C.red },
    { lbl: "90+ dias", min: 91, max: Infinity, cor: "#9a1414" },
  ];
  const faixaTot = FAIXAS.map((f) => vencidos.filter((x) => x.dias >= f.min && x.dias <= f.max).reduce((s, x) => s + x.l.valor, 0));
  const corAtraso = (dias) => (dias <= 30 ? C.amber : dias <= 60 ? "#e08a00" : dias <= 90 ? C.red : "#9a1414");

  // Resumo por cliente.
  const porClienteMap = new Map();
  for (const x of vencidos) {
    const chave = x.l.clienteId || nomeCli(x.l);
    const g = porClienteMap.get(chave) || { nome: nomeCli(x.l), total: 0, titulos: 0, maior: 0 };
    g.total += x.l.valor; g.titulos += 1; g.maior = Math.max(g.maior, x.dias);
    porClienteMap.set(chave, g);
  }
  const porCliente = [...porClienteMap.values()].sort((a, b) => b.total - a.total);

  const marcarRecebido = (id) => { if (window.confirm("Marcar como RECEBIDO hoje?\n\nSai da inadimplência e entra no regime de caixa.")) store.updateLancamento(id, { status: "pago", dataPagamento: hojeBR }); };
  const excluir = (id) => { if (window.confirm("Excluir este título de inadimplência? Esta ação não pode ser desfeita.")) store.removeLancamento(id); };

  const Cel = ({ children, style }) => <div style={{ fontSize: 13, ...style }}>{children}</div>;
  const colCli = "1fr 110px 130px 140px";
  const colTit = "1fr 120px 110px 120px 96px";

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: serif, fontSize: 20 }}>Gestão de Inadimplência</div>
          <div style={{ fontSize: 12.5, color: C.text3, maxWidth: 640 }}>Recebíveis previstos cujo vencimento já passou aparecem aqui automaticamente. Você também pode lançar dívidas antigas manualmente. Ao receber, marque no ✓ — sai da inadimplência e entra no caixa.</div>
        </div>
        <Btn onClick={() => setModal(true)}><Plus size={16} /> Lançar inadimplência</Btn>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, marginBottom: 14 }}>
        <Card><div style={{ fontSize: 12.5, color: C.text3 }}>Total vencido</div><div style={{ fontFamily: serif, fontSize: 26, color: C.red }}>{fmt(total)}</div></Card>
        <Card><div style={{ fontSize: 12.5, color: C.text3 }}>Clientes inadimplentes</div><div style={{ fontFamily: serif, fontSize: 26 }}>{porCliente.length}</div></Card>
        <Card><div style={{ fontSize: 12.5, color: C.text3 }}>Títulos vencidos</div><div style={{ fontFamily: serif, fontSize: 26 }}>{vencidos.length}</div></Card>
        <Card><div style={{ fontSize: 12.5, color: C.text3 }}>Maior atraso</div><div style={{ fontFamily: serif, fontSize: 26 }}>{maiorAtraso} <span style={{ fontSize: 14, color: C.text3 }}>dias</span></div></Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 18 }}>
        {FAIXAS.map((f, i) => (
          <Card key={i} style={{ borderLeft: `4px solid ${f.cor}` }}>
            <div style={{ fontSize: 12, color: C.text3 }}>{f.lbl}</div>
            <div style={{ fontFamily: serif, fontSize: 19, color: faixaTot[i] ? f.cor : C.text4 }}>{fmt(faixaTot[i])}</div>
          </Card>
        ))}
      </div>

      {vencidos.length === 0 ? (
        <Empty icon={CheckCircle2} title="Nenhuma inadimplência em aberto" sub="Não há recebíveis vencidos. Assim que um recebível passar do vencimento sem pagamento, ele aparece aqui." />
      ) : (
        <>
          <Card style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
            <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.border2}`, fontWeight: 700, fontSize: 13.5 }}>Resumo por cliente</div>
            <div style={{ overflowX: "auto" }}><div style={{ minWidth: 540 }}>
              <div style={{ display: "grid", gridTemplateColumns: colCli, gap: 8, padding: "10px 18px", background: C.cream, fontSize: 11, fontWeight: 700, color: C.text3 }}>
                <div>CLIENTE</div><div style={{ textAlign: "right" }}>TÍTULOS</div><div style={{ textAlign: "right" }}>MAIOR ATRASO</div><div style={{ textAlign: "right" }}>TOTAL VENCIDO</div>
              </div>
              {porCliente.map((g, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: colCli, gap: 8, padding: "10px 18px", borderTop: `1px solid ${C.border2}`, alignItems: "center" }}>
                  <Cel style={{ fontWeight: 600 }}>{g.nome}</Cel>
                  <Cel style={{ textAlign: "right" }}>{g.titulos}</Cel>
                  <Cel style={{ textAlign: "right", color: corAtraso(g.maior), fontWeight: 600 }}>{g.maior} dias</Cel>
                  <Cel style={{ textAlign: "right", fontWeight: 700, color: C.red }}>{fmt(g.total)}</Cel>
                </div>
              ))}
            </div></div>
          </Card>

          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.border2}`, fontWeight: 700, fontSize: 13.5 }}>Títulos vencidos ({vencidos.length})</div>
            <div style={{ overflowX: "auto" }}><div style={{ minWidth: 660 }}>
              <div style={{ display: "grid", gridTemplateColumns: colTit, gap: 8, padding: "10px 18px", background: C.cream, fontSize: 11, fontWeight: 700, color: C.text3 }}>
                <div>CLIENTE · DESCRIÇÃO</div><div style={{ textAlign: "right" }}>VENCIMENTO</div><div style={{ textAlign: "right" }}>ATRASO</div><div style={{ textAlign: "right" }}>VALOR</div><div style={{ textAlign: "right" }}>AÇÕES</div>
              </div>
              {vencidos.map(({ l, dias }) => (
                <div key={l.id} style={{ display: "grid", gridTemplateColumns: colTit, gap: 8, padding: "10px 18px", borderTop: `1px solid ${C.border2}`, alignItems: "center" }}>
                  <Cel><div style={{ fontWeight: 600 }}>{nomeCli(l)}</div><div style={{ fontSize: 11.5, color: C.text3 }}>{l.descricao || "—"}{l.origem === "inadimplencia_manual" ? " · manual" : ""}</div></Cel>
                  <Cel style={{ textAlign: "right" }}>{l.dataVencimento || l.data || "—"}</Cel>
                  <Cel style={{ textAlign: "right" }}><Badge color={corAtraso(dias)}>{dias} dias</Badge></Cel>
                  <Cel style={{ textAlign: "right", fontWeight: 700, color: C.red }}>{fmt(l.valor)}</Cel>
                  <Cel style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                    <button onClick={() => marcarRecebido(l.id)} className="cw-btn" title="Marcar como recebido hoje" style={{ color: C.green, padding: 5 }}><Check size={16} /></button>
                    <button onClick={() => excluir(l.id)} className="cw-btn" title="Excluir título" style={{ color: C.red, padding: 5 }}><Trash2 size={15} /></button>
                  </Cel>
                </div>
              ))}
            </div></div>
          </Card>
        </>
      )}

      {modal && (
        <LancarInadimplenciaModal clientes={clientes} categorias={categorias} contas={contas}
          onClose={() => setModal(false)}
          onSave={(base) => { store.addLancamento(activeUnit, base); setModal(false); }} />
      )}
    </>
  );
}

function LancarInadimplenciaModal({ clientes = [], categorias = [], contas = [], onClose, onSave }) {
  const catReceita = categorias.find((c) => { const s = SECOES.find((x) => x.key === c.secao); return !s || s.tipo === "ambos" || s.tipo === "entrada"; });
  const [f, setF] = useState({ clienteId: "", descricao: "", valor: 0, dataVencimento: "" });
  const podeSalvar = f.descricao.trim() && f.valor > 0 && f.dataVencimento.trim().length >= 8;
  const salvar = () => {
    if (!podeSalvar) return;
    const cli = clientes.find((c) => c.id === f.clienteId);
    onSave({
      tipo: "entrada", status: "previsto",
      descricao: f.descricao, valor: f.valor,
      categoria: catReceita?.nome || "", subcategoria: (catReceita?.subs || [])[0] || "",
      clienteId: f.clienteId || null, clienteNome: cli?.nome || null,
      contaId: contas[0]?.id || "",
      dataVencimento: f.dataVencimento, data: f.dataVencimento, dataCompetencia: f.dataVencimento,
      origem: "inadimplencia_manual",
    });
  };
  return (
    <Modal title="Lançar inadimplência" onClose={onClose} maxWidth={480}>
      <div style={{ fontSize: 12.5, color: C.text3, marginBottom: 14 }}>Registre uma dívida em aberto (do passado ou atual). Ela aparece como inadimplente pelo vencimento e sai daqui quando você marcar como recebida.</div>
      <Field label="Cliente">
        <select value={f.clienteId} onChange={(e) => setF({ ...f, clienteId: e.target.value })} style={inp}>
          <option value="">— sem cliente —</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </Field>
      <Field label="Descrição">
        <input value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} style={inp} placeholder="Ex: Mensalidade atrasada · maio/2026" />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Valor (R$)"><input type="number" min="0" step="0.01" value={f.valor} onChange={(e) => setF({ ...f, valor: +e.target.value })} style={inp} /></Field>
        <Field label="Vencimento"><input value={f.dataVencimento} onChange={(e) => setF({ ...f, dataVencimento: maskData(e.target.value) })} style={inp} placeholder="DD/MM/AAAA" inputMode="numeric" /></Field>
      </div>
      <Btn disabled={!podeSalvar} style={{ width: "100%", justifyContent: "center", marginTop: 6, opacity: podeSalvar ? 1 : 0.5 }} onClick={salvar}>Lançar inadimplência</Btn>
    </Modal>
  );
}

// ===== PROVISÃO / DRE PROVISIONADO =========================================
function Provisao({ store, activeUnit, lancamentos = [], categorias = [], onNovaDespesa }) {
  const [incluirRealizado, setIncluirRealizado] = useState(false);
  const contratos = store.contratosDe(activeUnit).filter((c) => c.status === "ativo");
  const mesFim = (c) => Math.min(c.mesInicial + c.meses - 1, 11);

  // Base da provisão: lançamentos PREVISTOS (já incluem contratos recorrentes e
  // despesas recorrentes). Opcionalmente soma os realizados (pagos) p/ ver a
  // projeção total do ano.
  const base = lancamentos.filter((l) => (incluirRealizado ? true : l.status === "previsto"));

  const linhasMes = MESES.map((lbl, m) => {
    const rec = base.filter((l) => l.tipo === "entrada" && l.mes === m).reduce((s, l) => s + l.valor, 0);
    const desp = base.filter((l) => l.tipo === "saida" && l.mes === m).reduce((s, l) => s + l.valor, 0);
    return { m, lbl, rec, desp, res: rec - desp };
  });
  const totRec = linhasMes.reduce((s, x) => s + x.rec, 0);
  const totDesp = linhasMes.reduce((s, x) => s + x.desp, 0);
  const totRes = totRec - totDesp;

  const dre = calcDRE(base, categorias);
  const margem = dre.rb > 0 ? (dre.lucroLiq / dre.rb) * 100 : 0;

  // Despesas recorrentes agrupadas (por grupo de recorrência ou descrição).
  const despRecMap = new Map();
  base.filter((l) => l.tipo === "saida" && l.recorrente).forEach((l) => {
    const k = l.grupoRecorrencia || l.descricao;
    const g = despRecMap.get(k) || { descricao: l.descricao, categoria: l.categoria, valorMensal: l.valor, meses: 0, total: 0 };
    g.meses += 1; g.total += l.valor; despRecMap.set(k, g);
  });
  const despRec = [...despRecMap.values()].sort((a, b) => b.total - a.total);
  const totContratos = contratos.reduce((s, c) => s + c.valorMensal * (mesFim(c) - c.mesInicial + 1), 0);
  const totDespRec = despRec.reduce((s, g) => s + g.total, 0);

  const Cel = ({ children, style }) => <div style={{ fontSize: 13, ...style }}>{children}</div>;
  const Linha = ({ label, valor, tipo }) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: `1px solid ${C.border2}` }}>
      <span style={{ fontSize: 13.5, fontWeight: tipo === "b" || tipo === "f" ? 700 : 500, color: tipo === "f" ? C.text : C.text2 }}>{label}</span>
      <span style={{ fontFamily: serif, fontSize: tipo === "f" ? 16 : 14, color: valor < 0 ? C.red : (tipo === "f" ? C.teal : C.text) }}>{fmt(valor)}</span>
    </div>
  );
  const modo = incluirRealizado ? "tudo" : "prev";
  const gcol = "90px 1fr 1fr 1fr";

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: serif, fontSize: 20 }}>Provisão · DRE Provisionado</div>
          <div style={{ fontSize: 12.5, color: C.text3, maxWidth: 680 }}>Projeção do ano pelos lançamentos previstos — contratos recorrentes (receita) e despesas recorrentes. Planeje o resultado antes de acontecer. Ao dar baixa (receber/pagar), o valor sai da provisão e vira caixa.</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", background: C.cream, borderRadius: 10, padding: 3, gap: 2 }}>
            {[["prev", "Só provisionado"], ["tudo", "Provisionado + realizado"]].map(([v, lb]) => (
              <button key={v} onClick={() => setIncluirRealizado(v === "tudo")} className="cw-btn"
                style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, border: "none",
                  background: modo === v ? C.white : "transparent", color: modo === v ? C.cafe : C.text3, boxShadow: modo === v ? "0 1px 3px rgba(0,0,0,.08)" : "none" }}>{lb}</button>
            ))}
          </div>
          <Btn variant="soft" onClick={onNovaDespesa}><Plus size={15} /> Despesa recorrente</Btn>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 16 }}>
        <Card><div style={{ fontSize: 12.5, color: C.text3 }}>Receita provisionada (ano)</div><div style={{ fontFamily: serif, fontSize: 24, color: C.green }}>{fmt(totRec)}</div></Card>
        <Card><div style={{ fontSize: 12.5, color: C.text3 }}>Despesa provisionada (ano)</div><div style={{ fontFamily: serif, fontSize: 24, color: C.red }}>{fmt(totDesp)}</div></Card>
        <Card><div style={{ fontSize: 12.5, color: C.text3 }}>Resultado provisionado</div><div style={{ fontFamily: serif, fontSize: 24, color: totRes >= 0 ? C.teal : C.red }}>{fmt(totRes)}</div></Card>
        <Card><div style={{ fontSize: 12.5, color: C.text3 }}>Margem projetada</div><div style={{ fontFamily: serif, fontSize: 24 }}>{margem.toFixed(1)}%</div></Card>
      </div>

      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.border2}`, fontWeight: 700, fontSize: 13.5 }}>Projeção mês a mês</div>
        <div style={{ overflowX: "auto" }}><div style={{ minWidth: 560 }}>
          <div style={{ display: "grid", gridTemplateColumns: gcol, gap: 8, padding: "10px 18px", background: C.cream, fontSize: 11, fontWeight: 700, color: C.text3 }}>
            <div>MÊS</div><div style={{ textAlign: "right" }}>RECEITAS</div><div style={{ textAlign: "right" }}>DESPESAS</div><div style={{ textAlign: "right" }}>RESULTADO</div>
          </div>
          {linhasMes.map((x) => (
            <div key={x.m} style={{ display: "grid", gridTemplateColumns: gcol, gap: 8, padding: "9px 18px", borderTop: `1px solid ${C.border2}`, alignItems: "center", opacity: (x.rec || x.desp) ? 1 : 0.5 }}>
              <Cel style={{ fontWeight: 600 }}>{x.lbl}/{ANO_ATUAL}</Cel>
              <Cel style={{ textAlign: "right", color: x.rec ? C.green : C.text4 }}>{x.rec ? fmt(x.rec) : "—"}</Cel>
              <Cel style={{ textAlign: "right", color: x.desp ? C.red : C.text4 }}>{x.desp ? fmt(x.desp) : "—"}</Cel>
              <Cel style={{ textAlign: "right", fontWeight: 700, color: x.res > 0 ? C.teal : x.res < 0 ? C.red : C.text4 }}>{(x.rec || x.desp) ? fmt(x.res) : "—"}</Cel>
            </div>
          ))}
          <div style={{ display: "grid", gridTemplateColumns: gcol, gap: 8, padding: "12px 18px", background: C.cream, fontWeight: 700 }}>
            <Cel style={{ fontFamily: serif }}>ANO</Cel>
            <Cel style={{ textAlign: "right", color: C.green }}>{fmt(totRec)}</Cel>
            <Cel style={{ textAlign: "right", color: C.red }}>{fmt(totDesp)}</Cel>
            <Cel style={{ textAlign: "right", color: totRes >= 0 ? C.teal : C.red }}>{fmt(totRes)}</Cel>
          </div>
        </div></div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 16, marginBottom: 16 }}>
        <Card>
          <div style={{ fontFamily: serif, fontSize: 17, marginBottom: 10 }}>DRE Provisionado (ano)</div>
          <Linha label="Receita Operacional Bruta" valor={dre.rb} />
          <Linha label="(−) Tributos" valor={-dre.trib} />
          <Linha label="= Receita Líquida" valor={dre.recLiq} tipo="b" />
          <Linha label="(−) Custo Direto" valor={-dre.cd} />
          <Linha label="= Lucro Bruto" valor={dre.lucroBruto} tipo="b" />
          <Linha label="(−) Despesas Operacionais" valor={-dre.dop} />
          <Linha label="= Resultado Provisionado" valor={dre.lucroLiq} tipo="f" />
        </Card>

        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border2}`, fontWeight: 700, fontSize: 13.5, display: "flex", justifyContent: "space-between" }}>
            <span>Contratos recorrentes (receita)</span><span style={{ color: C.green }}>{fmt(totContratos)}</span>
          </div>
          {contratos.length === 0 && <div style={{ padding: 16, fontSize: 12.5, color: C.text4 }}>Nenhum contrato ativo. Crie em Financeiro → Contratos; as parcelas entram na provisão automaticamente.</div>}
          {contratos.map((c) => (
            <div key={c.id} style={{ padding: "10px 16px", borderTop: `1px solid ${C.border2}`, display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div><div style={{ fontSize: 13, fontWeight: 600 }}>{c.cliente}</div><div style={{ fontSize: 11.5, color: C.text3 }}>{c.plano} · {MESES[c.mesInicial]}–{MESES[mesFim(c)]}/{ANO_ATUAL}</div></div>
              <div style={{ textAlign: "right" }}><div style={{ fontFamily: serif, fontSize: 14 }}>{fmt(c.valorMensal)}<span style={{ fontSize: 11, color: C.text3 }}>/mês</span></div><div style={{ fontSize: 11, color: C.text3 }}>{mesFim(c) - c.mesInicial + 1} meses</div></div>
            </div>
          ))}
        </Card>
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.border2}`, fontWeight: 700, fontSize: 13.5, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Despesas recorrentes</span>
          <span style={{ display: "flex", gap: 10, alignItems: "center" }}><span style={{ color: C.red }}>{fmt(totDespRec)}</span><Btn variant="soft" onClick={onNovaDespesa} style={{ padding: "5px 10px", fontSize: 12 }}><Plus size={13} /> Nova</Btn></span>
        </div>
        {despRec.length === 0 ? (
          <div style={{ padding: 16, fontSize: 12.5, color: C.text4 }}>Nenhuma despesa recorrente provisionada. Clique em “Nova” (aluguel, energia, folha…), escolhendo <b>Mensal</b> e o nº de meses — cada parcela entra na provisão.</div>
        ) : (
          <div style={{ overflowX: "auto" }}><div style={{ minWidth: 560 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 80px 120px", gap: 8, padding: "10px 18px", background: C.cream, fontSize: 11, fontWeight: 700, color: C.text3 }}>
              <div>DESCRIÇÃO · CATEGORIA</div><div style={{ textAlign: "right" }}>VALOR/MÊS</div><div style={{ textAlign: "right" }}>MESES</div><div style={{ textAlign: "right" }}>TOTAL</div>
            </div>
            {despRec.map((g, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 120px 80px 120px", gap: 8, padding: "9px 18px", borderTop: `1px solid ${C.border2}`, alignItems: "center" }}>
                <Cel><div style={{ fontWeight: 600 }}>{g.descricao}</div><div style={{ fontSize: 11.5, color: C.text3 }}>{g.categoria || "—"}</div></Cel>
                <Cel style={{ textAlign: "right" }}>{fmt(g.valorMensal)}</Cel>
                <Cel style={{ textAlign: "right" }}>{g.meses}</Cel>
                <Cel style={{ textAlign: "right", fontWeight: 700, color: C.red }}>{fmt(g.total)}</Cel>
              </div>
            ))}
          </div></div>
        )}
      </Card>
    </>
  );
}

// ===== FORMULÁRIOS =========================================================
function LancamentoForm({ inicial, contas, categorias, clientes = [], onSave }) {
  const permite = (secaoKey, tipo) => {
    const s = SECOES.find((x) => x.key === secaoKey);
    return !s || s.tipo === "ambos" || s.tipo === tipo;
  };
  const catsDoTipo = (tipo) => categorias.filter((c) => permite(c.secao, tipo));
  const subsDe = (catNome) => categorias.find((c) => c.nome === catNome)?.subs || [];
  const init = inicial.id ? inicial : {};
  const [f, setF] = useState(() => {
    const tipo = init.tipo || "entrada";
    const cat = init.categoria || catsDoTipo(tipo)[0]?.nome || "";
    const subList = subsDe(cat);
    return {
      tipo,
      descricao: init.descricao || "",
      categoria: cat,
      subcategoria: init.subcategoria || subList[0] || "",
      valor: init.valor || 0,
      contaId: init.contaId || contas[0]?.id || "",
      dataCompetencia: init.dataCompetencia || init.data || "",
      dataVencimento: init.dataVencimento || "",
      dataPagamento: init.dataPagamento || (init.status !== "previsto" ? (init.data || "") : ""),
      status: init.status || "pago",
      clienteId: init.clienteId || "",
      anexo: init.anexo || null,
    };
  });

  const cats = catsDoTipo(f.tipo);
  const subs = subsDe(f.categoria);

  const trocaTipo = (tipo) => {
    const cat = catsDoTipo(tipo)[0]?.nome || "";
    setF({ ...f, tipo, categoria: cat, subcategoria: subsDe(cat)[0] || "" });
  };
  const trocaCat = (cat) => {
    setF({ ...f, categoria: cat, subcategoria: subsDe(cat)[0] || "" });
  };

  return (
    <>
      <Field label="Tipo">
        <div style={{ display: "flex", gap: 8 }}>
          {[["entrada", "Entrada", C.green], ["saida", "Saída", C.red]].map(([v, lb, cor]) => (
            <button key={v} type="button" onClick={() => trocaTipo(v)}
              style={{ flex: 1, padding: "10px 0", borderRadius: 10, fontFamily: sans, fontSize: 14, fontWeight: 600, border: `1px solid ${f.tipo === v ? cor : C.border}`, background: f.tipo === v ? cor : C.white, color: f.tipo === v ? "#fff" : C.text2 }}>
              {lb}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Descrição — do que se trata">
        <input value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} style={inp} placeholder="Ex: Mensalidade da Sala 3 · Ciatos Log" />
      </Field>
      {f.tipo === "entrada" && (
        <Field label="Cliente (opcional) — para o controle de recebimentos por cliente">
          <select value={f.clienteId} onChange={(e) => setF({ ...f, clienteId: e.target.value })} style={inp}>
            <option value="">— sem cliente —</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          {clientes.length === 0 && <div style={{ fontSize: 11, color: C.text4, marginTop: 4 }}>Nenhum cliente cadastrado nesta unidade ainda.</div>}
        </Field>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Valor (R$)">
          <input type="number" min="0" step="0.01" value={f.valor} onChange={(e) => setF({ ...f, valor: +e.target.value })} style={inp} />
        </Field>
        <Field label="Conta">
          <select value={f.contaId} onChange={(e) => setF({ ...f, contaId: e.target.value })} style={inp}>
            {contas.map((c) => <option key={c.id} value={c.id}>{c.banco}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Categoria (grupo no DRE)" style={{ marginBottom: 4 }}>
          <select value={f.categoria} onChange={(e) => trocaCat(e.target.value)} style={inp}>
            {cats.map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
          </select>
        </Field>
        <Field label="Subcategoria" style={{ marginBottom: 4 }}>
          <select value={f.subcategoria} onChange={(e) => setF({ ...f, subcategoria: e.target.value })} style={inp}>
            {subs.length === 0 && <option value="">—</option>}
            {subs.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ fontSize: 11, color: C.text4, marginBottom: 12 }}>
        A subcategoria aparece <b>dentro</b> da categoria na DRE. Gerencie na aba Categorias.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Field label="Competência">
          <input value={f.dataCompetencia} onChange={(e) => setF({ ...f, dataCompetencia: maskData(e.target.value) })} style={inp} placeholder="DD/MM/AAAA" inputMode="numeric" />
        </Field>
        <Field label="Vencimento">
          <input value={f.dataVencimento} onChange={(e) => setF({ ...f, dataVencimento: maskData(e.target.value) })} style={inp} placeholder="DD/MM/AAAA" inputMode="numeric" />
        </Field>
        <Field label="Pagamento">
          <input value={f.dataPagamento} onChange={(e) => setF({ ...f, dataPagamento: maskData(e.target.value) })} style={inp} placeholder="DD/MM/AAAA" inputMode="numeric" />
        </Field>
      </div>
      <div style={{ fontSize: 11, color: C.text4, marginBottom: 10 }}>
        <b>Competência</b> = mês a que se refere (entra no DRE). <b>Vencimento</b> = quando vence. <b>Pagamento</b> = quando foi pago/recebido.
      </div>
      <Field label="Situação">
        <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} style={inp}>
          <option value="pago">Pago/recebido</option>
          <option value="previsto">Previsto</option>
        </select>
      </Field>
      <Field label="Anexo / comprovante (opcional)">
        <FileInput value={f.anexo} onChange={(v) => setF({ ...f, anexo: v })} label="Anexar comprovante" />
      </Field>
      <Btn style={{ width: "100%", justifyContent: "center", marginTop: 4 }} onClick={() => {
        if (!f.descricao.trim() || !(f.valor > 0)) return;
        const clienteId = f.tipo === "entrada" ? (f.clienteId || null) : null;
        const clienteNome = clienteId ? (clientes.find((c) => c.id === clienteId)?.nome || "") : null;
        // `data` (usado no extrato/dia) = pagamento, senão competência/vencimento.
        const data = f.dataPagamento || f.dataCompetencia || f.dataVencimento || "";
        onSave({ ...f, clienteId, clienteNome, data });
      }}>
        {inicial.id ? "Salvar lançamento" : "Adicionar lançamento"}
      </Btn>
    </>
  );
}

function ContaForm({ inicial, onSave }) {
  const [f, setF] = useState({ banco: inicial.banco || "", tipo: inicial.tipo || "Conta corrente", saldo: inicial.saldo || 0 });
  return (
    <>
      <Field label="Banco / Instituição">
        <input value={f.banco} onChange={(e) => setF({ ...f, banco: e.target.value })} style={inp} placeholder="Ex: Itaú, Sicoob, Caixa da loja" />
      </Field>
      <Field label="Tipo de conta">
        <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} style={inp}>
          {["Conta corrente", "Conta poupança", "Conta digital", "Dinheiro", "Cartão"].map((t) => <option key={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="Saldo inicial (R$)">
        <input type="number" step="0.01" value={f.saldo} onChange={(e) => setF({ ...f, saldo: +e.target.value })} style={inp} />
        <div style={{ fontSize: 11, color: C.text4, marginTop: 4 }}>Saldo de abertura desta conta. O Fluxo de caixa parte dele e soma os lançamentos — o saldo atual é calculado automaticamente.</div>
      </Field>
      <Btn style={{ width: "100%", justifyContent: "center", marginTop: 4 }} onClick={() => f.banco.trim() && onSave(f)}>
        {inicial.id ? "Salvar conta" : "Adicionar conta"}
      </Btn>
    </>
  );
}
