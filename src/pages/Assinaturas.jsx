import { useEffect, useMemo, useState } from "react";
import { ScrollText, FileCheck2, Loader2, RefreshCw, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { Card, Badge, Btn, PageHead, Modal, Empty, Field } from "../components/ui.jsx";
import { C, serif, fmt, inp } from "../lib/theme.js";
import { useStore } from "../lib/store.jsx";
import {
  assinaturasApi, CATEGORIAS_CONTRATO, STATUS_ASSINATURA, STATUS_DOCUMENTOS, TIPOS_DOCUMENTO, dataBR,
} from "../lib/assinaturasApi.js";

const FILTROS = [
  ["todas", "Todas"],
  ["conferir", "Documentos para conferir"],
  ["acerto", "Acerto pendente"],
  ["sem_sala", "Sala a atribuir"],
  ["cancelando", "Cancelamento agendado"],
  ["ativas", "Ativas"],
  ["canceladas", "Canceladas"],
];

const TURNOS = { manha: "Manhã (8h às 12h)", tarde: "Tarde (12h às 18h)" };
const precisaSala = (a) => a.categoria === "sala_privativa" && !a.sala_id && ["ativa", "inadimplente"].includes(a.status);

const TIPOS_DOC = TIPOS_DOCUMENTO;

// Equipe: assinaturas vendidas pelo site (documentos, cancelamentos, acertos) e versões de contrato.
export default function Assinaturas() {
  const { activeUnit, unidadeAtiva } = useStore();
  const [aba, setAba] = useState("assinaturas");

  return (
    <div>
      <PageHead title="Assinaturas e contratos" sub={`Planos contratados pelo site em ${unidadeAtiva?.nome || "sua unidade"}: documentos, cancelamentos, acertos e versões de contrato.`} />
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {[["assinaturas", "Assinaturas", FileCheck2], ["contratos", "Contratos", ScrollText]].map(([id, rotulo, Icon]) => (
          <Btn key={id} variant={aba === id ? "primary" : "ghost"} onClick={() => setAba(id)}><Icon size={15} /> {rotulo}</Btn>
        ))}
      </div>
      {!assinaturasApi.configured ? (
        <Card><Empty icon={ScrollText} title="Disponível no ambiente real" sub="Esta tela lê as assinaturas do Supabase." /></Card>
      ) : aba === "assinaturas" ? <ListaAssinaturas unidadeId={activeUnit} /> : <Contratos unidadeId={activeUnit} />}
    </div>
  );
}

function ListaAssinaturas({ unidadeId }) {
  const [lista, setLista] = useState([]);
  const [salasLivres, setSalasLivres] = useState([]);
  // Estorno e acerto são do master/financeiro (a função confirma de novo).
  const [podeFinanceiro, setPodeFinanceiro] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState("todas");
  const [aberta, setAberta] = useState(null);

  const carregar = () => {
    setCarregando(true);
    setErro("");
    assinaturasApi.listarDaUnidade(unidadeId)
      .then((d) => { setLista(d.assinaturas || []); setSalasLivres(d.salas_livres || []); setPodeFinanceiro(d.pode_financeiro !== false); })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  };
  useEffect(carregar, [unidadeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtradas = useMemo(() => lista.filter((a) => ({
    todas: true,
    conferir: a.docs_status === "enviado",
    acerto: a.requer_acerto && !a.acerto_resolvido_em,
    sem_sala: precisaSala(a),
    cancelando: a.status === "cancelando",
    ativas: ["ativa", "inadimplente"].includes(a.status),
    canceladas: a.status === "cancelada",
  }[filtro])), [lista, filtro]);

  const contagem = (id) => lista.filter((a) => ({
    conferir: a.docs_status === "enviado", acerto: a.requer_acerto && !a.acerto_resolvido_em, sem_sala: precisaSala(a), cancelando: a.status === "cancelando",
  }[id])).length;

  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
        {FILTROS.map(([id, rotulo]) => {
          const n = ["conferir", "acerto", "sem_sala", "cancelando"].includes(id) ? contagem(id) : 0;
          return (
            <button key={id} type="button" onClick={() => setFiltro(id)}
              style={{ padding: "7px 12px", borderRadius: 999, fontSize: 13, fontWeight: 600, border: `1px solid ${filtro === id ? C.teal : C.border}`, background: filtro === id ? C.tealPale : C.white, color: filtro === id ? C.teal : C.text2, cursor: "pointer" }}>
              {rotulo}{n ? ` (${n})` : ""}
            </button>
          );
        })}
        <Btn variant="ghost" onClick={carregar} style={{ marginLeft: "auto", padding: "7px 12px", fontSize: 13 }} aria-label="Atualizar lista">
          {carregando ? <Loader2 size={14} className="cw-spin" /> : <RefreshCw size={14} />} Atualizar
        </Btn>
      </div>
      {erro && <Card style={{ marginBottom: 12 }}><div role="alert" style={{ color: C.red }}>{erro}</div></Card>}
      {!carregando && !filtradas.length && <Card><Empty icon={FileCheck2} title="Nada por aqui" sub="Nenhuma assinatura neste filtro." /></Card>}
      {filtradas.map((a) => (
        <LinhaAssinatura key={a.id} a={a} salasLivres={salasLivres} podeFinanceiro={podeFinanceiro} aberta={aberta === a.id} onAbrir={() => setAberta(aberta === a.id ? null : a.id)} onMudou={carregar} />
      ))}
    </>
  );
}

function LinhaAssinatura({ a, salasLivres, podeFinanceiro, aberta, onAbrir, onMudou }) {
  const [modal, setModal] = useState(null); // aprovar | reprovar | cancelar | acerto | sala
  const st = STATUS_ASSINATURA[a.status] || { rotulo: a.status, cor: "text3" };
  const docs = a.docs_status && STATUS_DOCUMENTOS[a.docs_status];
  const ativa = ["ativa", "inadimplente"].includes(a.status);
  const acertoPendente = a.requer_acerto && !a.acerto_resolvido_em;

  return (
    <Card style={{ marginBottom: 10, padding: 16 }}>
      <button type="button" onClick={onAbrir} aria-expanded={aberta}
        style={{ display: "flex", width: "100%", justifyContent: "space-between", gap: 12, alignItems: "center", background: "none", border: 0, padding: 0, cursor: "pointer", textAlign: "left", color: C.text }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{a.cliente_nome} <span style={{ color: C.text3, fontWeight: 400 }}>· {a.plano_nome}</span></div>
          <div style={{ fontSize: 12.5, color: C.text3 }}>
            {a.cliente_email} · {fmt(a.valor)}{a.recorrencia === "anual" ? "/ano" : "/mês"} · desde {dataBR(a.inicio)}
            {a.status === "cancelando" ? ` · encerra ${dataBR(a.cancela_em)}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
          {acertoPendente && <Badge color={C.red}>Acerto pendente</Badge>}
          {precisaSala(a) && <Badge color={C.amber}>Sala a atribuir</Badge>}
          {docs && <Badge color={C[docs.cor]}>{docs.rotulo}</Badge>}
          <Badge color={C[st.cor]}>{st.rotulo}</Badge>
          {aberta ? <ChevronUp size={16} color={C.text3} /> : <ChevronDown size={16} color={C.text3} />}
        </div>
      </button>

      {aberta && (
        <div style={{ borderTop: `1px solid ${C.border2}`, marginTop: 12, paddingTop: 12, fontSize: 13.5, color: C.text2 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8, marginBottom: 12 }}>
            <div>Documento: {a.cliente_documento || "—"}</div>
            {a.turno && <div>Turno: {TURNOS[a.turno] || a.turno}</div>}
            {a.categoria === "sala_privativa" && <div>Sala: {a.sala_nome || "a atribuir"}{a.capacidade ? ` · plano de ${a.capacidade} lugares` : ""}</div>}
            <div>Próxima cobrança: {dataBR(a.proxima_cobranca)}</div>
            <div>Fidelidade até: {dataBR(a.fidelidade_ate)}</div>
            <div>Contrato: {a.aceite ? `v${a.aceite.versao}, aceito ${new Date(a.aceite.aceito_em).toLocaleString("pt-BR")} (IP ${a.aceite.ip || "—"})` : "sem aceite registrado"}</div>
            {a.motivo_acerto && <div>Acerto: {a.motivo_acerto === "anual" ? "devolução proporcional do anual" : a.motivo_acerto === "fidelidade" ? "multa de fidelidade" : "devolução manual"}{a.acerto_resolvido_em ? ` · resolvido ${dataBR(a.acerto_resolvido_em)}` : ""}</div>}
            {a.cancelamento_motivo && <div>Motivo/observações: {a.cancelamento_motivo}</div>}
          </div>

          {a.docs_status && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Documentos</div>
              {a.documentos.length ? a.documentos.map((d) => (
                <div key={d.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "5px 0", borderTop: `1px solid ${C.border2}` }}>
                  <span>{TIPOS_DOC[d.tipo] || d.tipo} · {d.nome_arquivo}</span>
                  <span>{dataBR(d.created_at)} {d.url && <a href={d.url} target="_blank" rel="noreferrer" style={{ color: C.teal, fontWeight: 600 }}><ExternalLink size={12} /> abrir</a>}</span>
                </div>
              )) : <div style={{ color: C.text3 }}>Nenhum documento enviado ainda.</div>}
              {a.docs_parecer && <div style={{ marginTop: 6, color: C.text3 }}>Parecer: {a.docs_parecer}</div>}
            </div>
          )}

          {a.cobrancas.length > 0 && (
            <div style={{ marginBottom: 12, color: C.text3 }}>
              Últimas cobranças: {a.cobrancas.map((c) => `${dataBR(c.vencimento)} ${fmt(c.valor)} (${c.status})`).join(" · ")}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["enviado", "pendente"].includes(a.docs_status) && a.status !== "cancelada" && (
              <>
                <Btn variant="teal" onClick={() => setModal("aprovar")} disabled={!a.documentos.length} title={a.documentos.length ? "" : "Aguardando envio"}>Aprovar documentos</Btn>
                {podeFinanceiro && <Btn variant="ghost" style={{ color: C.red }} onClick={() => setModal("reprovar")}>Reprovar e devolver</Btn>}
              </>
            )}
            {precisaSala(a) && <Btn variant="teal" onClick={() => setModal("sala")}>Atribuir sala</Btn>}
            {ativa && <Btn variant="ghost" onClick={() => setModal("cancelar")}>Cancelar pelo cliente</Btn>}
            {acertoPendente && podeFinanceiro && <Btn variant="soft" onClick={() => setModal("acerto")}>Marcar acerto resolvido</Btn>}
          </div>
          {!podeFinanceiro && (["enviado", "pendente"].includes(a.docs_status) || acertoPendente) && a.status !== "cancelada" && (
            <div style={{ marginTop: 8, fontSize: 12.5, color: C.text3 }}>
              Reprovar documentos (gera devolução) e resolver acerto ficam com o financeiro ou o master.
            </div>
          )}
        </div>
      )}

      {modal === "sala" && <AtribuirSalaModal a={a} salasLivres={salasLivres} onFechar={() => setModal(null)} onFeito={() => { setModal(null); onMudou(); }} />}
      {modal && modal !== "sala" && <AcaoModal tipo={modal} a={a} onFechar={() => setModal(null)} onFeito={() => { setModal(null); onMudou(); }} />}
    </Card>
  );
}

function AcaoModal({ tipo, a, onFechar, onFeito }) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const cfg = {
    aprovar: { titulo: "Aprovar documentos", rotulo: "Observação para o cliente (opcional)", botao: "Aprovar e avisar o cliente", obrigatorio: false,
      texto: "O cliente recebe um e-mail dizendo que os documentos foram aprovados." },
    reprovar: { titulo: "Reprovar documentos", rotulo: "Motivo (vai no e-mail ao cliente)", botao: "Reprovar, cancelar e devolver", obrigatorio: true, perigo: true,
      texto: "Pelo contrato (3.4), o plano é cancelado na hora e o valor pago é devolvido integralmente. Cartão e PIX são estornados pelo Asaas; boleto fica para devolução manual." },
    cancelar: { titulo: "Cancelar pelo cliente", rotulo: "Motivo e canal do pedido (ex.: pediu por WhatsApp em 15/09)", botao: "Registrar cancelamento", obrigatorio: true, perigo: true,
      texto: "Aplica as mesmas regras do cliente: até 7 dias do início cancela e devolve na hora; depois, aviso prévio de 30 dias." },
    acerto: { titulo: "Acerto resolvido", rotulo: "O que foi feito (valor, forma, data)", botao: "Marcar como resolvido", obrigatorio: true,
      texto: "Registre como a multa ou a devolução foi resolvida." },
  }[tipo];

  const confirmar = async () => {
    if (cfg.obrigatorio && !texto.trim()) { setErro("Preencha o campo acima."); return; }
    setEnviando(true);
    setErro("");
    try {
      if (tipo === "aprovar") await assinaturasApi.avaliarDocumentos(a.id, "aprovado", texto);
      if (tipo === "reprovar") await assinaturasApi.avaliarDocumentos(a.id, "reprovado", texto);
      if (tipo === "cancelar") await assinaturasApi.cancelar(a.id, texto);
      if (tipo === "acerto") await assinaturasApi.resolverAcerto(a.id, texto);
      onFeito();
    } catch (e) {
      setErro(e.message);
      setEnviando(false);
    }
  };

  return (
    <Modal title={cfg.titulo} onClose={onFechar} maxWidth={480}>
      <p style={{ fontSize: 13.5, color: C.text2, lineHeight: 1.6, marginTop: 0 }}>{cfg.texto}</p>
      <Field label={cfg.rotulo}>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={1000} style={{ ...inp, height: "auto", resize: "vertical" }} />
      </Field>
      {erro && <div role="alert" style={{ color: C.red, fontSize: 13, marginBottom: 10 }}>{erro}</div>}
      <div style={{ display: "flex", gap: 10 }}>
        <Btn variant="ghost" style={{ flex: 1 }} onClick={onFechar} disabled={enviando}>Voltar</Btn>
        <Btn style={{ flex: 1, ...(cfg.perigo ? { background: C.red, boxShadow: "none" } : {}) }} onClick={confirmar} disabled={enviando}>
          {enviando ? <><Loader2 size={15} className="cw-spin" /> Enviando…</> : cfg.botao}
        </Btn>
      </div>
    </Modal>
  );
}

function AtribuirSalaModal({ a, salasLivres, onFechar, onFeito }) {
  // mesmo tamanho do plano primeiro; as demais ficam disponíveis para exceções
  const ordenadas = [...salasLivres].sort((x, y) => (y.capacidade === a.capacidade) - (x.capacidade === a.capacidade));
  const [salaId, setSalaId] = useState(ordenadas.find((s) => s.capacidade === a.capacidade)?.id || ordenadas[0]?.id || "");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const escolhida = salasLivres.find((s) => s.id === salaId);

  const confirmar = async () => {
    setEnviando(true);
    setErro("");
    try {
      await assinaturasApi.atribuirSala(a.id, salaId);
      onFeito();
    } catch (e) {
      setErro(e.message);
      setEnviando(false);
    }
  };

  return (
    <Modal title="Atribuir sala" onClose={onFechar} maxWidth={480}>
      <p style={{ fontSize: 13.5, color: C.text2, lineHeight: 1.6, marginTop: 0 }}>
        {a.cliente_nome} contratou {a.plano_nome}. A sala escolhida passa a aparecer como alugada no app e deixa de contar como vaga no site.
      </p>
      {salasLivres.length ? (
        <Field label="Sala livre">
          <select value={salaId} onChange={(e) => setSalaId(e.target.value)} style={inp}>
            {ordenadas.map((s) => <option key={s.id} value={s.id}>{s.nome} · {s.capacidade || "?"} lugares</option>)}
          </select>
        </Field>
      ) : <div style={{ color: C.red, fontSize: 13.5, marginBottom: 12 }}>Nenhuma sala privativa livre nesta unidade.</div>}
      {escolhida && a.capacidade && escolhida.capacidade !== a.capacidade && (
        <div style={{ color: C.red, fontSize: 13, marginBottom: 10 }}>Atenção: a sala tem {escolhida.capacidade} lugares e o plano é de {a.capacidade}.</div>
      )}
      {erro && <div role="alert" style={{ color: C.red, fontSize: 13, marginBottom: 10 }}>{erro}</div>}
      <div style={{ display: "flex", gap: 10 }}>
        <Btn variant="ghost" style={{ flex: 1 }} onClick={onFechar} disabled={enviando}>Voltar</Btn>
        <Btn style={{ flex: 1 }} onClick={confirmar} disabled={enviando || !salaId}>
          {enviando ? <><Loader2 size={15} className="cw-spin" /> Salvando…</> : "Atribuir sala"}
        </Btn>
      </div>
    </Modal>
  );
}

function Contratos({ unidadeId }) {
  const [lista, setLista] = useState([]);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [editor, setEditor] = useState(null); // { categoria, titulo, corpo }

  const carregar = () => {
    setCarregando(true);
    setErro("");
    assinaturasApi.listarContratos(unidadeId)
      .then((d) => setLista(Array.isArray(d) ? d : []))
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  };
  useEffect(carregar, [unidadeId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Card style={{ marginBottom: 14, fontSize: 13.5, color: C.text2, lineHeight: 1.6 }}>
        Cada publicação cria uma <b>nova versão</b> e a anterior deixa de valer para novas contratações. Quem já aceitou continua com a versão aceita.
        Mudança que afete clientes atuais precisa de aviso com 30 dias (cláusula de disposições gerais). Revise com o jurídico antes de publicar.
      </Card>
      {erro && <Card style={{ marginBottom: 12 }}><div role="alert" style={{ color: C.red }}>{erro}</div></Card>}
      {carregando && <Card><Loader2 size={16} className="cw-spin" /> Carregando…</Card>}
      {!carregando && Object.entries(CATEGORIAS_CONTRATO).map(([categoria, rotulo]) => {
        const versoes = lista.filter((c) => c.categoria === categoria);
        const vigente = versoes.find((c) => c.vigente);
        return (
          <Card key={categoria} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <div style={{ fontFamily: serif, fontSize: 19 }}>{rotulo}</div>
                <div style={{ fontSize: 12.5, color: C.text3 }}>
                  {vigente ? `Vigente: versão ${vigente.versao} · ${vigente.titulo} · publicada ${dataBR(vigente.created_at)}${vigente.unidade_id ? "" : " (geral)"}` : "Sem contrato publicado: a venda pelo site fica bloqueada nesta categoria."}
                </div>
              </div>
              <Btn variant={vigente ? "ghost" : "primary"} onClick={() => setEditor({ categoria, titulo: vigente?.titulo || `Contrato de ${rotulo.toLowerCase()}`, corpo: vigente?.corpo || "" })}>
                {vigente ? "Publicar nova versão" : "Publicar contrato"}
              </Btn>
            </div>
            {versoes.length > 0 && (
              <details style={{ marginTop: 10 }}>
                <summary style={{ cursor: "pointer", fontSize: 13, color: C.teal, fontWeight: 600 }}>Versões ({versoes.length})</summary>
                {versoes.map((v) => (
                  <details key={v.id} style={{ marginTop: 8, paddingLeft: 10, borderLeft: `2px solid ${v.vigente ? C.green : C.border}` }}>
                    <summary style={{ cursor: "pointer", fontSize: 13 }}>Versão {v.versao}{v.vigente ? " (vigente)" : ""} · {dataBR(v.created_at)} · hash {v.hash.slice(0, 12)}…</summary>
                    <div style={{ whiteSpace: "pre-wrap", maxHeight: 300, overflow: "auto", fontSize: 12, lineHeight: 1.6, color: C.text2, marginTop: 6, padding: 10, background: C.cream, borderRadius: 8 }}>{v.corpo}</div>
                  </details>
                ))}
              </details>
            )}
          </Card>
        );
      })}
      {editor && <EditorContrato inicial={editor} unidadeId={unidadeId} onFechar={() => setEditor(null)} onFeito={() => { setEditor(null); carregar(); }} />}
    </>
  );
}

function EditorContrato({ inicial, unidadeId, onFechar, onFeito }) {
  const [titulo, setTitulo] = useState(inicial.titulo);
  const [corpo, setCorpo] = useState(inicial.corpo);
  const [confirmado, setConfirmado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const mudou = corpo.trim() !== inicial.corpo.trim() || titulo.trim() !== inicial.titulo.trim();

  const publicar = async () => {
    setEnviando(true);
    setErro("");
    try {
      await assinaturasApi.publicarContrato(unidadeId, inicial.categoria, titulo.trim(), corpo.replace(/\r\n/g, "\n").trim() + "\n");
      onFeito();
    } catch (e) {
      setErro(e.message);
      setEnviando(false);
    }
  };

  return (
    <Modal title={`Publicar: ${CATEGORIAS_CONTRATO[inicial.categoria]}`} onClose={onFechar} maxWidth={820}>
      <Field label="Título (aparece no site ao lado do aceite)">
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} style={inp} maxLength={120} />
      </Field>
      <Field label="Texto do contrato">
        <textarea value={corpo} onChange={(e) => setCorpo(e.target.value)} rows={18} style={{ ...inp, height: "auto", resize: "vertical", fontSize: 12.5, lineHeight: 1.55 }} />
      </Field>
      <label style={{ display: "flex", gap: 8, fontSize: 13, color: C.text2, alignItems: "flex-start", marginBottom: 12 }}>
        <input type="checkbox" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} style={{ marginTop: 3 }} />
        Revisei o texto. Entendo que a nova versão passa a valer para as próximas contratações e não pode ser editada depois de publicada.
      </label>
      {erro && <div role="alert" style={{ color: C.red, fontSize: 13, marginBottom: 10 }}>{erro}</div>}
      <div style={{ display: "flex", gap: 10 }}>
        <Btn variant="ghost" style={{ flex: 1 }} onClick={onFechar} disabled={enviando}>Voltar</Btn>
        <Btn style={{ flex: 1, opacity: confirmado && mudou && titulo.trim() && corpo.trim() ? 1 : 0.6 }} onClick={publicar}
          disabled={enviando || !confirmado || !mudou || !titulo.trim() || !corpo.trim()}>
          {enviando ? <><Loader2 size={15} className="cw-spin" /> Publicando…</> : mudou ? "Publicar versão" : "Altere o texto para publicar"}
        </Btn>
      </div>
    </Modal>
  );
}
