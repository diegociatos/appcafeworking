import React, { useState } from "react";
import {
  Plus, PackageCheck, MessageCircle, AlertCircle, Paperclip, Filter,
  CheckCircle2, Trash2, Download, FileText,
} from "lucide-react";
import { Card, Badge, Btn, PageHead, Modal, Field, Empty, FileInput } from "../components/ui.jsx";
import { C, serif, inp } from "../lib/theme.js";
import { CLIENTES } from "../lib/data.js";
import { useStore } from "../lib/store.jsx";

const STATUS = {
  aguardando: { c: C.amber, bg: C.amberPale, l: "Aguardando retirada" },
  digitalizada: { c: C.blue, bg: C.bluePale, l: "Digitalizada" },
  notificado: { c: C.teal, bg: C.tealPale, l: "Cliente notificado" },
  retirada: { c: C.green, bg: C.greenPale, l: "Retirada" },
};
const TIPOS = ["Notificação", "Intimação", "Extrato", "Carta", "Boleto", "Encomenda", "Outro"];

function baixarAnexo(anexo) {
  if (!anexo?.url) return;
  const a = document.createElement("a");
  a.href = anexo.url;
  a.download = anexo.nome || "anexo";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
const ehImagem = (anexo) => anexo && ((anexo.tipo || "").startsWith("image") || /^data:image|\.(png|jpe?g|webp|gif)$/i.test(anexo.url || ""));

export default function Correspondencias() {
  const { activeUnit, unidadeAtiva, correspondenciasDe, addCorrespondencia, updateCorrespondencia, removeCorrespondencia } = useStore();
  const [filtro, setFiltro] = useState("todas");
  const [modal, setModal] = useState(false);
  const [anexoAberto, setAnexoAberto] = useState(null);

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
                    <button onClick={() => removeCorrespondencia(c.id)} className="cw-btn" style={{ color: C.text4, padding: 4 }} title="Excluir"><Trash2 size={15} /></button>
                  </div>
                </div>
                <div style={{ fontFamily: serif, fontSize: 18, color: C.text, lineHeight: 1.2 }}>{c.cliente}</div>
                <div style={{ fontSize: 13, color: C.text3, marginTop: 4 }}><b style={{ color: C.text2 }}>{c.remetente}</b> · {c.tipo}</div>
                {c.descricao && <div style={{ fontSize: 12.5, color: C.text2, marginTop: 6, background: C.cream, borderRadius: 8, padding: "6px 9px" }}>{c.descricao}</div>}
                <div style={{ fontSize: 12, color: C.text4, marginTop: 6 }}>Recebida {c.recebido}</div>

                <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                  <Btn variant="ghost" style={{ flex: 1, justifyContent: "center", padding: "9px 10px", fontSize: 12 }} onClick={() => setAnexoAberto(c)} disabled={!c.anexo}>
                    <Paperclip size={14} /> Ver anexo
                  </Btn>
                  {(c.status === "aguardando" || c.status === "digitalizada") && (
                    <Btn variant="teal" style={{ flex: 1, justifyContent: "center", padding: "9px 10px", fontSize: 12 }} onClick={() => updateCorrespondencia(c.id, { status: "notificado", urgente: false })}>
                      <MessageCircle size={14} /> Notificar cliente
                    </Btn>
                  )}
                  {c.status === "notificado" && (
                    <Btn style={{ flex: 1, justifyContent: "center", padding: "9px 10px", fontSize: 12, background: C.green }} onClick={() => updateCorrespondencia(c.id, { status: "retirada" })}>
                      <CheckCircle2 size={14} /> Confirmar retirada
                    </Btn>
                  )}
                </div>
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
            onSave={(dados) => { addCorrespondencia(activeUnit, dados); setModal(false); }}
          />
        </Modal>
      )}

      {anexoAberto && (
        <Modal title={`${anexoAberto.tipo} · ${anexoAberto.cliente}`} onClose={() => setAnexoAberto(null)}>
          {anexoAberto.anexo ? (
            <>
              {ehImagem(anexoAberto.anexo) ? (
                <img src={anexoAberto.anexo.url} alt="anexo" onError={(e) => (e.currentTarget.style.display = "none")} style={{ width: "100%", borderRadius: 12, background: C.cream2 }} />
              ) : (
                <div style={{ background: C.cream, borderRadius: 12, padding: 24, textAlign: "center" }}>
                  <FileText size={40} color={C.teal} />
                  <div style={{ fontSize: 13, color: C.text2, marginTop: 8 }}>{anexoAberto.anexo.nome}</div>
                </div>
              )}
              {anexoAberto.descricao && <div style={{ fontSize: 13, color: C.text2, marginTop: 12 }}>{anexoAberto.descricao}</div>}
              <Btn style={{ width: "100%", justifyContent: "center", marginTop: 14 }} onClick={() => baixarAnexo(anexoAberto.anexo)}><Download size={16} /> Baixar anexo</Btn>
            </>
          ) : (
            <Empty icon={Paperclip} title="Sem anexo" sub="Esta correspondência não tem arquivo." />
          )}
        </Modal>
      )}
    </div>
  );
}

function RegistrarForm({ unidadeNome, onSave }) {
  const clientesUnidade = CLIENTES.filter((c) => c.unidade === unidadeNome);
  const [f, setF] = useState({ cliente: clientesUnidade[0]?.nome || "", remetente: "", tipo: "Notificação", descricao: "", urgente: false, anexo: null });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const valido = f.cliente && f.remetente.trim();

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
          <select value={f.cliente} onChange={set("cliente")} style={inp}>
            {clientesUnidade.map((c) => <option key={c.id} value={c.nome}>{c.nome}{c.fiscal ? " · endereço fiscal" : ""}</option>)}
          </select>
        )}
        <div style={{ fontSize: 11, color: C.text4, marginTop: 5 }}>
          A correspondência aparece automaticamente na Área do Cliente selecionado.
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
      <Btn style={{ width: "100%", justifyContent: "center" }} onClick={() => valido && onSave({ ...f, recebido: "Agora" })}>
        Registrar recebimento
      </Btn>
    </>
  );
}
