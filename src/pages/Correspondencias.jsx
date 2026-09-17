import { useState, useEffect } from "react";
import {
  Plus, PackageCheck, MessageCircle, AlertCircle, Paperclip, Filter,
  CheckCircle2, Trash2, Download, FileText,
} from "lucide-react";
import { Card, Badge, Btn, PageHead, Modal, Field, Empty, FileInput, ConfirmDialog } from "../components/ui.jsx";
import { C, serif, inp } from "../lib/theme.js";
import { useStore } from "../lib/store.jsx";
import { enviarAnexoCorrespondencia, linkAnexoCorrespondencia, removerAnexoCorrespondencia } from "../lib/correspondenciasArquivo.js";
import { mensagemDe } from "../lib/erros.js";
import { urlSegura } from "../lib/html.js";

const STATUS = {
  aguardando: { c: C.amber, bg: C.amberPale, l: "Aguardando retirada" },
  digitalizada: { c: C.blue, bg: C.bluePale, l: "Digitalizada" },
  notificado: { c: C.teal, bg: C.tealPale, l: "Cliente notificado" },
  retirada: { c: C.green, bg: C.greenPale, l: "Retirada" },
};
const TIPOS = ["Notificação", "Intimação", "Extrato", "Carta", "Boleto", "Encomenda", "Outro"];

// Anexo antigo embutido (base64) baixa pelo <a download>; o do Storage abre o
// link assinado com download (o navegador ignora `download` em outra origem).
async function baixarAnexo(anexo) {
  if (!anexo) return;
  if (!anexo.caminho) {
    const seguro = urlSegura(anexo.url);
    if (!seguro) return;
    const a = document.createElement("a");
    a.href = seguro;
    a.download = anexo.nome || "anexo";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  const url = await linkAnexoCorrespondencia(anexo, { baixar: true });
  window.open(url, "_blank", "noopener");
}
const recebidaEm = (c) => (c.recebidoEm
  ? new Date(c.recebidoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
  : c.recebido || "");
const AVISO = {
  enviado: [C.green, "E-mail enviado ao cliente."],
  demonstracao: [C.text3, "Demonstração: nenhum e-mail foi enviado e a correspondência continua como não notificada."],
  ignorado: [C.amber, "O cliente escolheu não receber este tipo de aviso."],
  sem_email: [C.red, "Cliente sem e-mail no cadastro. Atualize em Clientes e notifique de novo."],
  erro: [C.red, "O e-mail não saiu. Tente de novo em instantes."],
};
// Atalho "Registrar correspondência" vindo de outra tela (ex.: detalhe do cliente):
// a tela abre com o formulário já no cliente escolhido.
let registroPendente = null;
export function abrirRegistroCorrespondencia(clienteId) { registroPendente = clienteId || null; }

const ehImagem = (anexo) => anexo && ((anexo.tipo || "").startsWith("image") || /^data:image|\.(png|jpe?g|webp|gif)$/i.test(anexo.url || ""));

export default function Correspondencias() {
  const { activeUnit, unidadeAtiva, correspondenciasDe, addCorrespondencia, updateCorrespondencia, notificarCorrespondencia, removeCorrespondencia } = useStore();
  const [avisos, setAvisos] = useState({}); // id → { status, erro, enviando }
  const notificar = async (id) => {
    setAvisos((a) => ({ ...a, [id]: { enviando: true } }));
    const r = await notificarCorrespondencia(id);
    setAvisos((a) => ({ ...a, [id]: r }));
  };
  const [filtro, setFiltro] = useState("todas");
  const [modal, setModal] = useState(() => (registroPendente ? { clienteId: registroPendente } : false));
  useEffect(() => { registroPendente = null; }, []);
  const [anexoAberto, setAnexoAberto] = useState(null);
  const [excluir, setExcluir] = useState(null);
  const confirmarExclusao = () => {
    const alvo = excluir;
    setExcluir(null);
    removeCorrespondencia(alvo.id);
    removerAnexoCorrespondencia(alvo.anexo);
  };

  const corresp = correspondenciasDe(activeUnit);
  const filtrada =
    filtro === "urgente" ? corresp.filter((c) => c.urgente) :
    filtro === "aguardando" ? corresp.filter((c) => c.status === "aguardando") :
    corresp;

  const kpis = [
    { l: "Recebidas", v: corresp.length, c: C.cafe },
    { l: "Aguardando retirada", v: corresp.filter((c) => c.status === "aguardando").length, c: C.amber },
    { l: "Urgentes", v: corresp.filter((c) => c.urgente).length, c: C.red },
    { l: "Retiradas", v: corresp.filter((c) => c.status === "retirada").length, c: C.green },
  ];

  return (
    <div>
      <PageHead
        title="Correspondências"
        sub={`Endereço fiscal da unidade ${unidadeAtiva?.nome || ""} · anexo, notificação ao cliente e retirada.`}
        action={<Btn onClick={() => setModal(true)}><Plus size={16} /> Registrar recebimento</Btn>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 18 }}>
        {kpis.map((k, i) => (
          <Card key={i} className={`cw-fade cw-fade-${i + 1}`} style={{ padding: 16 }}>
            <div style={{ fontSize: 12, color: C.text3 }}>{k.l}</div>
            <div style={{ fontFamily: serif, fontSize: 26, color: k.c, marginTop: 4, lineHeight: 1 }}>{k.v}</div>
          </Card>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {[["todas", "Todas"], ["aguardando", "Aguardando"], ["urgente", "Urgentes"]].map(([id, l]) => (
          <button key={id} onClick={() => setFiltro(id)} className="cw-btn"
            style={{ padding: "8px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600, border: `1px solid ${filtro === id ? C.cafe : C.border}`, background: filtro === id ? C.cafe : C.white, color: filtro === id ? "#fff" : C.text2 }}>
            <Filter size={13} style={{ verticalAlign: -2, marginRight: 5 }} /> {l}
          </button>
        ))}
      </div>

      {filtrada.length === 0 ? (
        <Card><Empty icon={PackageCheck} title="Nenhuma correspondência" sub="Registre o primeiro recebimento desta unidade." /></Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(330px,1fr))", gap: 16 }}>
          {filtrada.map((c) => {
            const s = STATUS[c.status] || STATUS.aguardando;
            return (
              <Card key={c.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: c.urgente ? C.redPale : C.cafePale, display: "grid", placeItems: "center" }}>
                    <PackageCheck size={22} color={c.urgente ? C.red : C.cafe} />
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {c.urgente && <Badge color={C.red} bg={C.redPale}><AlertCircle size={11} /> Urgente</Badge>}
                    <button onClick={() => setExcluir(c)} className="cw-btn" style={{ color: C.text4, padding: 4 }} title="Excluir" aria-label={`Excluir correspondência de ${c.cliente}`}><Trash2 size={15} /></button>
                  </div>
                </div>
                <div style={{ fontFamily: serif, fontSize: 18, color: C.text, lineHeight: 1.2 }}>{c.cliente}</div>
                <div style={{ fontSize: 13, color: C.text3, marginTop: 4 }}><b style={{ color: C.text2 }}>{c.remetente}</b> · {c.tipo}</div>
                {c.descricao && <div style={{ fontSize: 12.5, color: C.text2, marginTop: 6, background: C.cream, borderRadius: 8, padding: "6px 9px" }}>{c.descricao}</div>}
                <div style={{ fontSize: 12, color: C.text3, marginTop: 6 }}>Recebida {recebidaEm(c)}</div>

                <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                  <Btn variant="ghost" style={{ flex: 1, justifyContent: "center", padding: "9px 10px", fontSize: 12 }} onClick={() => setAnexoAberto(c)} disabled={!c.anexo}>
                    <Paperclip size={14} /> Ver anexo
                  </Btn>
                  {(c.status === "aguardando" || c.status === "digitalizada") && (
                    <Btn variant="teal" style={{ flex: 1, justifyContent: "center", padding: "9px 10px", fontSize: 12 }} disabled={avisos[c.id]?.enviando} onClick={() => notificar(c.id)}>
                      <MessageCircle size={14} /> {avisos[c.id]?.enviando ? "Enviando e-mail…" : "Notificar cliente"}
                    </Btn>
                  )}
                  {c.status !== "retirada" && (
                    <Btn style={{ flex: 1, justifyContent: "center", padding: "9px 10px", fontSize: 12, background: C.green }} onClick={() => updateCorrespondencia(c.id, { status: "retirada", retiradaEm: new Date().toISOString() })}>
                      <CheckCircle2 size={14} /> Confirmar retirada
                    </Btn>
                  )}
                </div>
                {avisos[c.id]?.status && (
                  <div role="status" style={{ fontSize: 12, marginTop: 10, color: (AVISO[avisos[c.id].status] || AVISO.erro)[0] }}>
                    {avisos[c.id].status === "erro" && avisos[c.id].erro ? avisos[c.id].erro : (AVISO[avisos[c.id].status] || AVISO.erro)[1]}
                  </div>
                )}
                <div style={{ marginTop: 12 }}><Badge color={s.c} bg={s.bg}>{s.l}</Badge></div>
              </Card>
            );
          })}
        </div>
      )}

      {modal && (
        <Modal title="Registrar correspondência" onClose={() => setModal(false)}>
          <RegistrarForm
            unidadeNome={unidadeAtiva?.nome}
            clienteInicial={modal.clienteId}
            onSave={async (dados) => {
              // O arquivo sobe antes de gravar o registro: se o envio falhar, nada é criado.
              const id = "co" + Date.now();
              const anexo = await enviarAnexoCorrespondencia(activeUnit, id, dados.anexo);
              addCorrespondencia(activeUnit, { ...dados, id, anexo });
              setModal(false);
            }}
          />
        </Modal>
      )}

      {anexoAberto && <AnexoModal corresp={anexoAberto} onClose={() => setAnexoAberto(null)} />}

      <ConfirmDialog
        aberto={!!excluir}
        titulo="Excluir correspondência?"
        mensagem={excluir ? `A correspondência de ${excluir.remetente || "remetente não informado"} para ${excluir.cliente} será apagada, junto com o arquivo digitalizado, e some da área do cliente. Esta ação não pode ser desfeita.` : ""}
        onConfirmar={confirmarExclusao}
        onCancelar={() => setExcluir(null)}
      />
    </div>
  );
}

function AnexoModal({ corresp, onClose }) {
  const anexo = corresp.anexo;
  const [link, setLink] = useState({ url: anexo?.caminho ? "" : anexo?.url || "", erro: "", carregando: !!anexo?.caminho });
  const [baixando, setBaixando] = useState("");
  useEffect(() => {
    if (!anexo?.caminho) return undefined;
    let vivo = true;
    linkAnexoCorrespondencia(anexo)
      .then((url) => vivo && setLink({ url, erro: "", carregando: false }))
      .catch((e) => vivo && setLink({ url: "", erro: mensagemDe(e), carregando: false }));
    return () => { vivo = false; };
  }, [anexo]);
  const baixar = () => {
    setBaixando("");
    baixarAnexo(anexo).catch((e) => setBaixando(mensagemDe(e)));
  };

  return (
    <Modal title={`${corresp.tipo} · ${corresp.cliente}`} onClose={onClose}>
      {anexo ? (
        <>
          {link.carregando && <div role="status" style={{ fontSize: 13, color: C.text3, padding: "18px 0", textAlign: "center" }}>Abrindo arquivo…</div>}
          {link.erro && <div role="alert" style={{ fontSize: 13, color: C.red, padding: "10px 0" }}>{link.erro}</div>}
          {!link.carregando && !link.erro && (ehImagem(anexo) ? (
            <img src={link.url} alt={`Digitalização: ${corresp.tipo || "correspondência"} de ${corresp.remetente || "remetente"}`} onError={(e) => (e.currentTarget.style.display = "none")} style={{ width: "100%", borderRadius: 12, background: C.cream2 }} />
          ) : (
            <div style={{ background: C.cream, borderRadius: 12, padding: 24, textAlign: "center" }}>
              <FileText size={40} color={C.teal} />
              <div style={{ fontSize: 13, color: C.text2, marginTop: 8 }}>{anexo.nome}</div>
            </div>
          ))}
          {corresp.descricao && <div style={{ fontSize: 13, color: C.text2, marginTop: 12 }}>{corresp.descricao}</div>}
          <Btn style={{ width: "100%", justifyContent: "center", marginTop: 14 }} disabled={link.carregando} onClick={baixar}><Download size={16} /> Baixar anexo</Btn>
          {baixando && <div role="alert" style={{ fontSize: 12, color: C.red, marginTop: 8 }}>{baixando}</div>}
        </>
      ) : (
        <Empty icon={Paperclip} title="Sem anexo" sub="Esta correspondência não tem arquivo." />
      )}
    </Modal>
  );
}

function RegistrarForm({ unidadeNome, clienteInicial, onSave }) {
  const { clientesDe } = useStore();
  const clientesUnidade = clientesDe(unidadeNome);
  const [f, setF] = useState({ clienteId: (clienteInicial && clientesUnidade.some((c) => c.id === clienteInicial) ? clienteInicial : clientesUnidade[0]?.id) || "", remetente: "", tipo: "Notificação", descricao: "", urgente: false, anexo: null });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const escolhido = clientesUnidade.find((c) => c.id === f.clienteId);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const valido = escolhido && f.remetente.trim();
  const salvar = async () => {
    if (!valido || salvando) return;
    setSalvando(true); setErro("");
    try {
      await onSave({
        ...f, cliente: escolhido.nome, clienteId: escolhido.id, clienteEmail: (escolhido.email || "").trim().toLowerCase() || null,
        recebidoEm: new Date().toISOString(),
      });
    } catch (e) {
      setErro(mensagemDe(e));
      setSalvando(false);
    }
  };

  return (
    <>
      <Field label="Anexo (foto da correspondência ou PDF)">
        <FileInput value={f.anexo} onChange={(v) => setF({ ...f, anexo: v })} label="Anexar foto ou documento" />
      </Field>

      <Field label="Cliente destinatário (da base)">
        {clientesUnidade.length === 0 ? (
          <div style={{ fontSize: 13, color: C.red, padding: "8px 0" }}>
            Nenhum cliente cadastrado nesta unidade. Cadastre o cliente em "Clientes" para vincular a correspondência.
          </div>
        ) : (
          <select value={f.clienteId} onChange={set("clienteId")} style={inp}>
            {clientesUnidade.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.fiscal ? " · endereço fiscal" : ""}{c.email ? "" : " · sem e-mail"}</option>)}
          </select>
        )}
        <div style={{ fontSize: 11, color: C.text4, marginTop: 5 }}>
          A correspondência aparece na área do cliente. O e-mail sai quando você clicar em "Notificar cliente".
        </div>
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Remetente">
          <input value={f.remetente} onChange={set("remetente")} style={inp} placeholder="Ex: Receita Federal" />
        </Field>
        <Field label="Tipo">
          <select value={f.tipo} onChange={set("tipo")} style={inp}>
            {TIPOS.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Do que se trata (descrição)">
        <textarea value={f.descricao} onChange={set("descricao")} rows={2} style={{ ...inp, resize: "vertical", minHeight: 56 }} placeholder="Ex: Notificação da Receita sobre o IRPJ 2025" />
      </Field>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.text2, marginBottom: 14, cursor: "pointer" }}>
        <input type="checkbox" checked={f.urgente} onChange={(e) => setF({ ...f, urgente: e.target.checked })} />
        Marcar como urgente
      </label>
      {erro && <div role="alert" style={{ fontSize: 12.5, color: C.red, marginBottom: 10 }}>{erro}</div>}
      <Btn style={{ width: "100%", justifyContent: "center", opacity: valido ? 1 : 0.5 }} disabled={salvando} onClick={salvar}>
        {salvando ? (f.anexo ? "Enviando arquivo…" : "Registrando…") : "Registrar recebimento"}
      </Btn>
    </>
  );
}
