// ============================================================================
// Abertura de empresas · contabilidade parceira e equipe da unidade
//
// Lista por etapa com busca; no detalhe, os dados do cliente em seções (com
// copiar nos campos que a contabilidade redigita), documentos para baixar,
// histórico e as ações da etapa: pedir correção, marcar em registro, registrar
// o resultado e concluir (com os anexos), e cancelar (só equipe/admin).
//
// A contabilidade enxerga só as unidades em que está vinculada (o servidor
// decide); a equipe trabalha na unidade ativa.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Briefcase, Search, ArrowLeft, Loader2, RefreshCw, AlertTriangle, CheckCircle2, FileSignature, XCircle, Plus, Undo2, Save,
} from "lucide-react";
import { Card, Badge, Btn, PageHead, Modal, Field, Empty } from "../components/ui.jsx";
import { C, serif, inp } from "../lib/theme.js";
import { useStore } from "../lib/store.jsx";
import { mensagemDe } from "../lib/erros.js";
import { buscarCnpj } from "../lib/lookup.js";
import {
  aberturasApi, cnpjValido, dataBR, dataHoraBR, DOCS_CONTABILIDADE, DOCS_OBRIGATORIOS_CONCLUSAO, formatarCNAE, formatarCNPJ,
  pendenciasDaConclusao, podeMudarStatus, REGIMES_TRIBUTARIOS, STATUS_ABERTURA_UI, TIPOS_EMPRESA,
} from "../lib/aberturasApi.js";
import { CartaoEmpresa, EnvioArquivo, Historico, ListaDocumentos, ResumoDados, Secao } from "../components/AberturaPartes.jsx";

const FILTROS = ["todas", "aguardando_cliente", "em_analise", "pendente_cliente", "em_registro", "concluida", "cancelada"];

export default function Aberturas() {
  const { perfil, activeUnit, unidadeAtiva } = useStore();
  const contabilidade = perfil === "contabilidade";
  const [lista, setLista] = useState(null);
  const [papel, setPapel] = useState(contabilidade ? "contabilidade" : "equipe");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [filtro, setFiltro] = useState("todas");
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState(null);
  const [novo, setNovo] = useState(false);

  const carregar = useCallback(() => {
    setErro("");
    setCarregando(true);
    aberturasApi.listar({ unidadeId: contabilidade ? "" : activeUnit })
      .then((r) => { setLista(r.aberturas || []); if (r.papel) setPapel(r.papel); })
      .catch((e) => { setLista((l) => l || []); setErro(mensagemDe(e)); })
      .finally(() => setCarregando(false));
  }, [contabilidade, activeUnit]);
  useEffect(() => { carregar(); }, [carregar]);

  const contagem = useMemo(() => {
    const c = { todas: (lista || []).length };
    for (const a of lista || []) c[a.status] = (c[a.status] || 0) + 1;
    return c;
  }, [lista]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const digitos = q.replace(/\D/g, "");
    return (lista || []).filter((a) => (filtro === "todas" || a.status === filtro) && (!q
      || [a.cliente_nome, a.cliente_email, a.razao_social, a.unidade, a.plano_nome].some((v) => String(v || "").toLowerCase().includes(q))
      || (digitos.length >= 4 && String(a.cnpj || "").includes(digitos))));
  }, [lista, filtro, busca]);

  const variasUnidades = new Set((lista || []).map((a) => a.unidade_id)).size > 1;

  if (aberta) {
    return <Detalhe id={aberta} onVoltar={() => { setAberta(null); carregar(); }} />;
  }

  return (
    <div>
      <PageHead
        title="Abertura de empresas"
        sub={contabilidade
          ? "Processos de abertura dos clientes do CafeWorking: confira os dados, peça ajustes e registre a empresa aberta."
          : `Processos de abertura de empresa${unidadeAtiva?.nome ? ` · ${unidadeAtiva.nome}` : ""}. A contabilidade parceira acompanha pelo login próprio.`}
        action={(
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn variant="ghost" onClick={carregar} disabled={carregando}><RefreshCw size={15} className={carregando ? "cw-spin" : ""} aria-hidden="true" /> Atualizar</Btn>
            {(papel === "equipe" || papel === "admin") && <Btn onClick={() => setNovo(true)}><Plus size={15} aria-hidden="true" /> Novo processo</Btn>}
          </div>
        )}
      />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: "8px 12px", flex: "1 1 240px", maxWidth: 420 }}>
          <Search size={16} color={C.text4} aria-hidden="true" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente, e-mail, razão social ou CNPJ" aria-label="Buscar processos"
            style={{ border: "none", outline: "none", fontSize: 14, flex: 1, background: "transparent", minWidth: 0 }} />
        </div>
      </div>
      <div role="tablist" aria-label="Filtrar por etapa" style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, marginBottom: 12 }}>
        {FILTROS.map((f) => {
          const sel = filtro === f;
          const rot = f === "todas" ? "Todas" : STATUS_ABERTURA_UI[f].rotulo;
          return (
            <button key={f} role="tab" aria-selected={sel} type="button" onClick={() => setFiltro(f)} className="cw-btn"
              style={{ whiteSpace: "nowrap", padding: "7px 12px", borderRadius: 999, fontSize: 13, fontWeight: 600, border: `1px solid ${sel ? C.cafe : C.border}`, background: sel ? C.cafe : "#fff", color: sel ? "#fff" : C.text2 }}>
              {rot}{contagem[f] ? ` · ${contagem[f]}` : ""}
            </button>
          );
        })}
      </div>

      {erro && <div role="alert" style={{ fontSize: 14, color: C.red, background: C.redPale, borderRadius: 12, padding: "10px 14px", marginBottom: 12 }}>{erro}</div>}

      {lista === null ? (
        <Card><div role="status" style={{ color: C.text3, fontSize: 14 }}><Loader2 size={15} className="cw-spin" aria-hidden="true" /> Carregando…</div></Card>
      ) : visiveis.length === 0 ? (
        <Card><Empty icon={Briefcase} title={lista.length ? "Nada nesta etapa" : "Nenhum processo de abertura"} sub={lista.length ? "Troque o filtro ou a busca." : "Os processos aparecem aqui quando um cliente compra a abertura de empresa ou a equipe abre um manualmente."} /></Card>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {visiveis.map((a, i) => {
            const st = STATUS_ABERTURA_UI[a.status] || {};
            const acao = a.status === "em_analise" ? "Conferir" : a.status === "em_registro" ? "Concluir" : "Abrir";
            return (
              <button key={a.id} type="button" onClick={() => setAberta(a.id)} className="cw-nav-btn"
                style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", textAlign: "left", padding: "14px 18px", borderTop: i ? `1px solid ${C.border2}` : "none", flexWrap: "wrap", background: "#fff" }}>
                <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{a.razao_social || a.cliente_nome}</span>
                    <Badge color={C[st.cor] || C.text3}>{st.rotulo || a.status}</Badge>
                  </div>
                  <div style={{ fontSize: 12.5, color: C.text3, marginTop: 3, wordBreak: "break-word" }}>
                    {a.razao_social ? `${a.cliente_nome} · ` : ""}{a.cliente_email}
                    {a.tipo_empresa ? ` · ${TIPOS_EMPRESA[a.tipo_empresa] || a.tipo_empresa}` : ""}
                    {variasUnidades && a.unidade ? ` · ${a.unidade}` : ""}
                    {a.cnpj ? ` · CNPJ ${formatarCNPJ(a.cnpj)}` : ""}
                  </div>
                  {a.status === "pendente_cliente" && a.pendencia && (
                    <div style={{ fontSize: 12.5, color: C.red, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Ajuste pedido: {a.pendencia}</div>
                  )}
                </div>
                <div style={{ fontSize: 12, color: C.text3, textAlign: "right" }}>
                  <div>{a.enviado_em ? `Enviado ${dataBR(a.enviado_em)}` : `Aberto ${dataBR(a.created_at)}`}</div>
                  <div>Atualizado {dataBR(a.updated_at)}</div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.teal }}>{acao} →</span>
              </button>
            );
          })}
        </Card>
      )}

      {novo && <NovoProcesso onFechar={() => setNovo(false)} onCriado={(id) => { setNovo(false); setAberta(id); }} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detalhe
// ---------------------------------------------------------------------------

function Detalhe({ id, onVoltar }) {
  const [det, setDet] = useState(null);
  const [erro, setErro] = useState("");
  const [modal, setModal] = useState(null); // correcao | registro | voltar | cancelar
  const [msg, setMsg] = useState("");

  const carregar = useCallback(() => {
    setErro("");
    return aberturasApi.detalhe(id).then(setDet).catch((e) => setErro(mensagemDe(e)));
  }, [id]);
  useEffect(() => { carregar(); }, [carregar]);

  if (!det) {
    return (
      <div>
        <Btn variant="ghost" onClick={onVoltar} style={{ marginBottom: 14 }}><ArrowLeft size={15} aria-hidden="true" /> Voltar</Btn>
        {erro ? <div role="alert" style={{ color: C.red, fontSize: 14 }}>{erro}</div> : <Card><Loader2 size={15} className="cw-spin" aria-hidden="true" /> Carregando…</Card>}
      </div>
    );
  }

  const a = det.abertura;
  const papel = det.papel;
  const st = STATUS_ABERTURA_UI[a.status] || {};
  const docsCliente = det.documentos.filter((d) => d.lado === "cliente");
  const docsContab = det.documentos.filter((d) => d.lado === "contabilidade");
  const pode = (para) => podeMudarStatus(a.status, para, papel);
  const feito = (texto) => { setModal(null); setMsg(texto); carregar(); };

  return (
    <div>
      <Btn variant="ghost" onClick={onVoltar} style={{ marginBottom: 14 }}><ArrowLeft size={15} aria-hidden="true" /> Todos os processos</Btn>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: serif, fontSize: 26, lineHeight: 1.15 }}>{a.cliente_nome}</div>
            <div style={{ fontSize: 13, color: C.text3, marginTop: 4, wordBreak: "break-word" }}>
              {a.cliente_email} · {det.unidade?.nome || a.unidade_id}{a.plano_nome ? ` · ${a.plano_nome}` : ""} · {a.origem === "venda" ? "venda pelo site" : "aberto pela equipe"}
            </div>
            <div style={{ fontSize: 13, color: C.text3 }}>
              Aberto em {dataBR(a.created_at)}{a.enviado_em ? ` · enviado em ${dataHoraBR(a.enviado_em)}` : ""}{a.concluido_em ? ` · concluído em ${dataBR(a.concluido_em)}` : ""}
            </div>
          </div>
          <Badge color={C[st.cor] || C.text3}>{st.rotulo || a.status}</Badge>
        </div>

        {a.status === "pendente_cliente" && a.pendencia && (
          <div style={{ marginTop: 12, background: C.redPale, borderRadius: 10, padding: "10px 12px", fontSize: 14, whiteSpace: "pre-wrap" }}>
            <b>Ajuste pedido ao cliente:</b> {a.pendencia}
          </div>
        )}
        {a.status === "aguardando_cliente" && (
          <div style={{ marginTop: 12, fontSize: 14, color: C.text2 }}>O cliente ainda não enviou os dados. Abaixo aparece o rascunho, que pode estar incompleto.</div>
        )}

        <div role="status" aria-live="polite">{msg && <div style={{ marginTop: 10, fontSize: 14, color: C.green }}>{msg}</div>}</div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          {pode("pendente_cliente") && <Btn variant="ghost" onClick={() => setModal("correcao")} style={{ color: C.red }}><AlertTriangle size={15} aria-hidden="true" /> Pedir correção ao cliente</Btn>}
          {pode("em_registro") && <Btn variant="teal" onClick={() => setModal("registro")}><FileSignature size={15} aria-hidden="true" /> Marcar em registro</Btn>}
          {a.status === "em_registro" && pode("em_analise") && <Btn variant="ghost" onClick={() => setModal("voltar")}><Undo2 size={15} aria-hidden="true" /> Voltar para análise</Btn>}
          {pode("cancelada") && <Btn variant="ghost" onClick={() => setModal("cancelar")} style={{ color: C.text3 }}><XCircle size={15} aria-hidden="true" /> Cancelar processo</Btn>}
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.35fr) minmax(0, 1fr)", gap: 16, alignItems: "start" }} className="cw-grid-stack">
        <Card>
          <h2 style={{ fontFamily: serif, fontSize: 21, fontWeight: 500, margin: 0 }}>Dados do cliente</h2>
          <ResumoDados dados={a.dados} docs={docsCliente} usaEnderecoUnidade={a.usa_endereco_unidade} unidade={det.unidade} kit={det.kit} copiar aberturaId={a.id} />
          <p style={{ fontSize: 12, color: C.text3, margin: "12px 0 0" }}>
            Links de download valem {det.validade_link_minutos || 10} minutos. <button type="button" onClick={carregar} style={{ color: C.teal, fontWeight: 600, textDecoration: "underline" }}>Gerar novos links</button>
          </p>
        </Card>

        <div style={{ display: "grid", gap: 16 }}>
          {a.status === "concluida" ? (
            <Card style={{ borderLeft: `4px solid ${C.green}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.green, fontWeight: 700, marginBottom: 10 }}><CheckCircle2 size={18} aria-hidden="true" /> Empresa aberta</div>
              <CartaoEmpresa resultado={a.resultado} />
              <Secao titulo="Documentos da empresa" id="docs-contab-fim"><ListaDocumentos docs={docsContab} aberturaId={a.id} /></Secao>
            </Card>
          ) : ["em_analise", "pendente_cliente", "em_registro"].includes(a.status) ? (
            <Resultado det={det} docs={docsContab} onMudou={carregar} onConcluido={() => feito("Processo concluído. O cliente recebeu o e-mail com os dados da empresa.")} />
          ) : (
            docsContab.length > 0 && <Card><Secao titulo="Documentos da contabilidade" id="docs-contab"><ListaDocumentos docs={docsContab} aberturaId={a.id} /></Secao></Card>
          )}

          <Card>
            <h2 style={{ fontFamily: serif, fontSize: 21, fontWeight: 500, margin: "0 0 12px" }}>Histórico</h2>
            <Historico eventos={det.eventos} mostrarEmail />
          </Card>
        </div>
      </div>

      {modal === "correcao" && (
        <AcaoTexto titulo="Pedir correção ao cliente" rotulo="O que o cliente precisa corrigir" minimo={10} obrigatorio botao="Enviar ao cliente"
          dica="O cliente recebe este texto por e-mail e vê em destaque no app. Seja específico (qual documento, qual campo)."
          executar={(t) => aberturasApi.pedirCorrecao(a.id, t)} onFechar={() => setModal(null)} onFeito={() => feito("Correção pedida. O cliente foi avisado por e-mail.")} />
      )}
      {modal === "registro" && (
        <AcaoTexto titulo="Marcar em registro" rotulo="Observação para o histórico" botao="Marcar em registro"
          dica="Use quando o pedido for protocolado na Junta Comercial / Redesim. Ex.: número do protocolo."
          executar={(t) => aberturasApi.mudarStatus(a.id, "em_registro", t)} onFechar={() => setModal(null)} onFeito={() => feito("Processo em registro.")} />
      )}
      {modal === "voltar" && (
        <AcaoTexto titulo="Voltar para análise" rotulo="Motivo" botao="Voltar para análise"
          executar={(t) => aberturasApi.mudarStatus(a.id, "em_analise", t)} onFechar={() => setModal(null)} onFeito={() => feito("Processo voltou para análise.")} />
      )}
      {modal === "cancelar" && (
        <AcaoTexto titulo="Cancelar processo" rotulo="Motivo do cancelamento" minimo={5} obrigatorio botao="Cancelar processo" perigo
          dica="O cancelamento fica no histórico e não pode ser desfeito. Não estorna pagamento: trate o valor em Assinaturas."
          executar={(t) => aberturasApi.mudarStatus(a.id, "cancelada", t)} onFechar={() => setModal(null)} onFeito={() => feito("Processo cancelado.")} />
      )}
    </div>
  );
}

function AcaoTexto({ titulo, rotulo, dica, minimo = 0, obrigatorio = false, botao, perigo, executar, onFechar, onFeito }) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const ok = !obrigatorio || texto.trim().length >= minimo;
  const confirmar = async () => {
    if (!ok) { setErro(`Escreva pelo menos ${minimo} caracteres.`); return; }
    setEnviando(true);
    setErro("");
    try {
      await executar(texto.trim());
      onFeito();
    } catch (e) {
      setErro(mensagemDe(e));
      setEnviando(false);
    }
  };
  return (
    <Modal title={titulo} onClose={() => !enviando && onFechar()} maxWidth={500}>
      <label htmlFor="acao-texto" style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.text2, marginBottom: 6 }}>
        {rotulo}{!obrigatorio && <span style={{ fontWeight: 400, color: C.text4 }}> (opcional)</span>}
      </label>
      <textarea id="acao-texto" value={texto} onChange={(e) => setTexto(e.target.value)} rows={5} maxLength={2000} style={{ ...inp, resize: "vertical" }} autoFocus />
      {dica && <div style={{ fontSize: 12.5, color: C.text3, marginTop: 6, lineHeight: 1.45 }}>{dica}</div>}
      {erro && <div role="alert" style={{ fontSize: 13, color: C.red, marginTop: 8 }}>{erro}</div>}
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <Btn variant="ghost" style={{ flex: 1 }} onClick={onFechar} disabled={enviando}>Voltar</Btn>
        <Btn style={{ flex: 1, ...(perigo ? { background: C.red, boxShadow: "none" } : {}) }} onClick={confirmar} disabled={enviando || !ok}>
          {enviando ? <><Loader2 size={15} className="cw-spin" aria-hidden="true" /> Salvando…</> : botao}
        </Btn>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Resultado (dados da empresa aberta + documentos) e conclusão
// ---------------------------------------------------------------------------

function Resultado({ det, docs: docsIniciais, onMudou, onConcluido }) {
  const a = det.abertura;
  const r0 = a.resultado || {};
  const [r, setR] = useState({
    razao_social: r0.razao_social || "", cnpj: r0.cnpj ? formatarCNPJ(r0.cnpj) : "", data_abertura: r0.data_abertura || "",
    nire: r0.nire || "", inscricao_municipal: r0.inscricao_municipal || "", inscricao_estadual: r0.inscricao_estadual || "",
    regime_tributario: r0.regime_tributario || "", cnae_principal: r0.cnae_principal ? formatarCNAE(r0.cnae_principal) : "",
    cnaes_secundarios: (r0.cnaes_secundarios || []).map(formatarCNAE).join(", "), observacoes: r0.observacoes || "",
  });
  const [docs, setDocs] = useState(docsIniciais);
  const [estado, setEstado] = useState({ salvando: false, concluindo: false, erro: "", ok: "" });
  const [buscando, setBuscando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  // Recarregou o detalhe (links novos): troca a lista, mas não o que foi digitado.
  const idsIniciais = docsIniciais.map((d) => `${d.id}:${d.url || ""}`).join(",");
  useEffect(() => setDocs(docsIniciais), [idsIniciais]); // eslint-disable-line react-hooks/exhaustive-deps

  const pendencias = pendenciasDaConclusao(r, docs, det.hoje);
  const podeConcluir = podeMudarStatus(a.status, "concluida", det.papel);
  const set = (k) => (e) => setR({ ...r, [k]: e.target.value });
  const cnpjDigitos = r.cnpj.replace(/\D/g, "");

  const preencherCnpj = async () => {
    setBuscando(true);
    const d = await buscarCnpj(cnpjDigitos);
    setBuscando(false);
    if (!d) { setEstado((s) => ({ ...s, erro: "Não encontramos este CNPJ na consulta pública (pode demorar alguns dias após a abertura).", ok: "" })); return; }
    setR((x) => ({ ...x, razao_social: x.razao_social || d.razaoSocial }));
    setEstado((s) => ({ ...s, erro: "", ok: "Razão social preenchida pela consulta pública." }));
  };

  const salvar = async () => {
    setEstado({ salvando: true, concluindo: false, erro: "", ok: "" });
    try {
      await aberturasApi.salvarResultado(a.id, r);
      setEstado({ salvando: false, concluindo: false, erro: "", ok: "Rascunho salvo." });
    } catch (e) {
      setEstado({ salvando: false, concluindo: false, erro: mensagemDe(e), ok: "" });
    }
  };

  const concluir = async () => {
    setConfirmar(false);
    setEstado({ salvando: false, concluindo: true, erro: "", ok: "" });
    try {
      await aberturasApi.concluir(a.id, r);
      onConcluido();
    } catch (e) {
      const extra = e.pendencias?.length ? ` ${e.pendencias.map((p) => p.mensagem).join(" ")}` : "";
      setEstado({ salvando: false, concluindo: false, erro: mensagemDe(e) + extra, ok: "" });
    }
  };

  const grade = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", columnGap: 12 };
  return (
    <Card>
      <h2 style={{ fontFamily: serif, fontSize: 21, fontWeight: 500, margin: 0 }}>Empresa constituída</h2>
      <p style={{ fontSize: 13, color: C.text3, margin: "4px 0 12px", lineHeight: 1.5 }}>
        Preencha quando o registro sair. Pode salvar aos poucos; ao concluir, o cliente recebe os dados e os documentos.
      </p>
      <Field label="Razão social"><input value={r.razao_social} onChange={set("razao_social")} style={inp} maxLength={200} aria-label="Razão social" /></Field>
      <div style={grade}>
        <Field label="CNPJ">
          <div style={{ display: "flex", gap: 6 }}>
            <input value={r.cnpj} onChange={set("cnpj")} onBlur={() => cnpjDigitos.length === 14 && setR((x) => ({ ...x, cnpj: formatarCNPJ(cnpjDigitos) }))} inputMode="numeric"
              style={{ ...inp, borderColor: cnpjDigitos.length === 14 && !cnpjValido(cnpjDigitos) ? C.red : undefined }} maxLength={18} aria-label="CNPJ" placeholder="00.000.000/0000-00" />
            <button type="button" onClick={preencherCnpj} disabled={!cnpjValido(cnpjDigitos) || buscando} title="Buscar razão social na consulta pública" aria-label="Buscar dados do CNPJ"
              style={{ padding: "0 10px", borderRadius: 10, border: `1px solid ${C.border}`, color: C.teal, opacity: cnpjValido(cnpjDigitos) ? 1 : 0.5 }}>
              {buscando ? <Loader2 size={15} className="cw-spin" /> : <Search size={15} />}
            </button>
          </div>
        </Field>
        <Field label="Data de abertura"><input type="date" value={r.data_abertura} onChange={set("data_abertura")} style={inp} aria-label="Data de abertura" max={det.hoje} /></Field>
        <Field label="Inscrição municipal"><input value={r.inscricao_municipal} onChange={set("inscricao_municipal")} style={inp} maxLength={30} aria-label="Inscrição municipal" /></Field>
        <Field label="Inscrição estadual (opcional)"><input value={r.inscricao_estadual} onChange={set("inscricao_estadual")} style={inp} maxLength={30} aria-label="Inscrição estadual" /></Field>
        <Field label="NIRE (opcional)"><input value={r.nire} onChange={set("nire")} style={inp} maxLength={30} aria-label="NIRE" /></Field>
        <Field label="Regime tributário">
          <select value={r.regime_tributario} onChange={set("regime_tributario")} style={inp} aria-label="Regime tributário">
            <option value="">Escolha…</option>
            {Object.entries(REGIMES_TRIBUTARIOS).map(([id, rot]) => <option key={id} value={id}>{rot}</option>)}
          </select>
        </Field>
        <Field label="CNAE principal"><input value={r.cnae_principal} onChange={set("cnae_principal")} style={inp} maxLength={12} placeholder="0000-0/00" aria-label="CNAE principal" /></Field>
      </div>
      <Field label="CNAEs secundários (separe por vírgula)"><textarea value={r.cnaes_secundarios} onChange={set("cnaes_secundarios")} rows={2} style={{ ...inp, resize: "vertical" }} aria-label="CNAEs secundários" /></Field>
      <Field label="Observações para o cliente (opcional)"><textarea value={r.observacoes} onChange={set("observacoes")} rows={3} maxLength={2000} style={{ ...inp, resize: "vertical" }} aria-label="Observações" /></Field>

      <Secao titulo="Documentos da empresa" id="docs-resultado">
        {Object.entries(DOCS_CONTABILIDADE).map(([categoria, rotulo]) => {
          const obrig = DOCS_OBRIGATORIOS_CONCLUSAO.includes(categoria);
          const lista = docs.filter((d) => d.categoria === categoria);
          return (
            <div key={categoria} style={{ padding: "10px 0", borderTop: `1px solid ${C.border2}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>
                  {rotulo}{obrig ? "" : <span style={{ fontWeight: 400, color: C.text4 }}> (opcional)</span>}
                </span>
                {obrig && (lista.length ? <Badge color={C.green}>Anexado</Badge> : <Badge color={C.amber}>Obrigatório</Badge>)}
              </div>
              {lista.length > 0 && (
                <ListaDocumentos docs={lista} aberturaId={a.id} mostrarTipo={false} podeRemover={(d) => d.meu}
                  onRemovido={(docId) => { setDocs((l) => l.filter((x) => x.id !== docId)); onMudou(); }} />
              )}
              <div style={{ marginTop: 6 }}>
                <EnvioArquivo aberturaId={a.id} lado="contabilidade" categoria={categoria} rotulo={rotulo} onEnviado={(doc) => setDocs((l) => [...l, doc])} />
              </div>
            </div>
          );
        })}
      </Secao>

      {pendencias.length > 0 && podeConcluir && (
        <div style={{ background: C.amberPale, borderRadius: 12, padding: "10px 12px", marginTop: 14, fontSize: 13.5, color: C.text2 }}>
          <b>Para concluir:</b>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{pendencias.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}
      {!podeConcluir && a.status === "pendente_cliente" && (
        <div style={{ fontSize: 13, color: C.text3, marginTop: 12 }}>Aguardando a correção do cliente para concluir. Os dados e anexos já podem ser salvos.</div>
      )}
      {estado.erro && <div role="alert" style={{ fontSize: 13.5, color: C.red, marginTop: 10 }}>{estado.erro}</div>}
      <div role="status" aria-live="polite">{estado.ok && <div style={{ fontSize: 13.5, color: C.green, marginTop: 10 }}>{estado.ok}</div>}</div>

      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <Btn variant="ghost" onClick={salvar} disabled={estado.salvando || estado.concluindo} style={{ flex: "1 1 140px" }}>
          {estado.salvando ? <Loader2 size={15} className="cw-spin" aria-hidden="true" /> : <Save size={15} aria-hidden="true" />} Salvar rascunho
        </Btn>
        {podeConcluir && (
          <Btn onClick={() => setConfirmar(true)} disabled={pendencias.length > 0 || estado.concluindo} style={{ flex: "1 1 180px", opacity: pendencias.length ? 0.55 : 1 }}>
            {estado.concluindo ? <Loader2 size={15} className="cw-spin" aria-hidden="true" /> : <CheckCircle2 size={15} aria-hidden="true" />} Concluir e avisar o cliente
          </Btn>
        )}
      </div>

      {confirmar && (
        <Modal title="Concluir a abertura?" onClose={() => setConfirmar(false)} maxWidth={440}>
          <div style={{ fontSize: 14, color: C.text2, lineHeight: 1.55 }}>
            <b>{r.razao_social}</b> · CNPJ {r.cnpj}<br />
            O cliente recebe um e-mail e passa a ver os dados e os documentos da empresa. Depois de concluído, o processo não volta.
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <Btn variant="ghost" style={{ flex: 1 }} onClick={() => setConfirmar(false)}>Voltar</Btn>
            <Btn style={{ flex: 1 }} onClick={concluir}>Concluir</Btn>
          </div>
        </Modal>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Processo manual (equipe)
// ---------------------------------------------------------------------------

function NovoProcesso({ onFechar, onCriado }) {
  const { clientes, activeUnit, unidadeAtiva } = useStore();
  const opcoes = (clientes || []).filter((c) => c.unidadeId === activeUnit && c.email).sort((x, y) => String(x.nome).localeCompare(String(y.nome), "pt-BR"));
  const [email, setEmail] = useState("");
  const [usaUnidade, setUsaUnidade] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const escolher = (valor) => {
    setEmail(valor);
    const c = opcoes.find((x) => x.email === valor);
    setUsaUnidade(!!c?.fiscal);
  };

  const criar = async () => {
    setEnviando(true);
    setErro("");
    try {
      const r = await aberturasApi.criar({ unidadeId: activeUnit, clienteEmail: email, usaEnderecoUnidade: usaUnidade });
      onCriado(r.abertura.id);
    } catch (e) {
      setErro(mensagemDe(e));
      setEnviando(false);
    }
  };

  return (
    <Modal title="Novo processo de abertura" onClose={() => !enviando && onFechar()} maxWidth={480}>
      <p style={{ fontSize: 13.5, color: C.text3, margin: "0 0 14px", lineHeight: 1.5 }}>
        Para cliente já cadastrado em {unidadeAtiva?.nome || "esta unidade"}. Ele recebe um e-mail para preencher os dados na área do cliente.
        Vendas pelo site com abertura criam o processo sozinhas.
      </p>
      <Field label="Cliente">
        <select value={email} onChange={(e) => escolher(e.target.value)} style={inp} aria-label="Cliente">
          <option value="">Escolha o cliente…</option>
          {opcoes.map((c) => <option key={c.id} value={c.email}>{c.nome} · {c.email}</option>)}
        </select>
      </Field>
      {!opcoes.length && <div style={{ fontSize: 13, color: C.amber, marginBottom: 10 }}>Nenhum cliente com e-mail nesta unidade.</div>}
      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14, cursor: "pointer", marginBottom: 12 }}>
        <input type="checkbox" checked={usaUnidade} onChange={(e) => setUsaUnidade(e.target.checked)} style={{ accentColor: C.cafe, width: 17, height: 17, marginTop: 2 }} />
        <span>A empresa vai usar o endereço fiscal da unidade<br /><span style={{ fontSize: 12.5, color: C.text3 }}>O IPTU e o índice cadastral saem do kit da unidade; o cliente não anexa nada do imóvel.</span></span>
      </label>
      {erro && <div role="alert" style={{ fontSize: 13, color: C.red, marginBottom: 10 }}>{erro}</div>}
      <div style={{ display: "flex", gap: 10 }}>
        <Btn variant="ghost" style={{ flex: 1 }} onClick={onFechar} disabled={enviando}>Voltar</Btn>
        <Btn style={{ flex: 1 }} onClick={criar} disabled={!email || enviando}>{enviando ? <Loader2 size={15} className="cw-spin" aria-hidden="true" /> : null} Abrir processo</Btn>
      </div>
    </Modal>
  );
}
