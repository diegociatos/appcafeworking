import React, { useState } from "react";
import {
  Plus, Eye, Edit3, Trash2, Building2, Mail, FileText, Store, Phone, Paperclip,
} from "lucide-react";
import { Card, Badge, Btn, PageHead, Modal, Field, Empty, FileInput } from "../components/ui.jsx";
import { C, serif, sans, fmt, inp } from "../lib/theme.js";

const PLANOS = [
  { nome: "Essencial", valor: 297 },
  { nome: "Pro", valor: 597 },
  { nome: "Enterprise", valor: 1290 },
];
import { useStore } from "../lib/store.jsx";

function baixarContrato(c) {
  if (!c?.url) return;
  const a = document.createElement("a");
  a.href = c.url; a.download = c.nome || "contrato";
  document.body.appendChild(a); a.click(); a.remove();
}

// CPF tem 11 dígitos; CNPJ tem 14
const tipoDoc = (doc) => ((doc || "").replace(/\D/g, "").length > 11 ? "CNPJ" : "CPF");

export default function Franqueados({ go }) {
  const { franqueados, unidades, unidadesDe, addFranqueado, updateFranqueado, removeFranqueado, enterViewAs } = useStore();
  const [modal, setModal] = useState(null);

  const mrr = franqueados.reduce((s, f) => s + (f.mensalidade || 0), 0);

  return (
    <div>
      <PageHead
        title="Contas"
        sub="Cada coworking que assina o CafeWorking é uma conta, com um usuário master e suas unidades."
        action={
          <Btn onClick={() => setModal({})}>
            <Plus size={16} /> Nova conta
          </Btn>
        }
      />

      {/* KPIs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
          gap: 16,
          marginBottom: 22,
        }}
      >
        <Card>
          <div style={{ fontSize: 13, color: C.text3, marginBottom: 6 }}>Contas (coworkings)</div>
          <div style={{ fontFamily: serif, fontSize: 26, color: C.cafe }}>{franqueados.length}</div>
        </Card>
        <Card>
          <div style={{ fontSize: 13, color: C.text3, marginBottom: 6 }}>Unidades na plataforma</div>
          <div style={{ fontFamily: serif, fontSize: 26, color: C.teal }}>{unidades.length}</div>
        </Card>
        <Card>
          <div style={{ fontSize: 13, color: C.text3, marginBottom: 6 }}>MRR da plataforma</div>
          <div style={{ fontFamily: serif, fontSize: 26, color: C.green }}>{fmt(mrr)}</div>
        </Card>
      </div>

      {franqueados.length === 0 ? (
        <Card>
          <Empty icon={Store} title="Nenhuma conta" sub="Cadastre o primeiro coworking que vai assinar o CafeWorking." />
        </Card>
      ) : (
        franqueados.map((f, i) => {
          const us = unidadesDe(f.id);
          return (
            <Card key={f.id} className={`cw-fade cw-fade-${Math.min(i + 1, 4)}`} style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: "50%",
                    background: "#B8862F",
                    color: "#fff",
                    display: "grid",
                    placeItems: "center",
                    fontFamily: serif,
                    fontSize: 22,
                    flexShrink: 0,
                  }}
                >
                  {f.nome.charAt(0)}
                </div>

                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: serif, fontSize: 21, color: C.text }}>{f.nome}</span>
                    <Badge color={C.cafe}>{us.length} unidade{us.length === 1 ? "" : "s"}</Badge>
                    {f.plano && <Badge color={C.green}>{f.plano} · {fmt(f.mensalidade || 0)}/mês</Badge>}
                  </div>
                  <div style={{ fontSize: 13, color: C.text2, marginTop: 4 }}>
                    Master: <b>{f.master || f.responsavel || "—"}</b>
                  </div>
                  <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 8, fontSize: 13, color: C.text3 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <FileText size={14} /> {tipoDoc(f.documento)}: {f.documento || "—"}
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <Mail size={14} /> {f.email || "—"}
                    </span>
                    {f.telefone && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <Phone size={14} /> {f.telefone}
                      </span>
                    )}
                    {f.contrato && (
                      <button onClick={() => baixarContrato(f.contrato)} className="cw-btn" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.teal, fontWeight: 600 }} title="Baixar contrato">
                        <Paperclip size={14} /> Contrato
                      </button>
                    )}
                  </div>

                  {/* unidades vinculadas */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                    {us.length === 0 ? (
                      <span style={{ fontSize: 12, color: C.text4, fontStyle: "italic" }}>
                        Nenhuma unidade vinculada ainda — cadastre uma em Unidades → Nova unidade.
                      </span>
                    ) : (
                      us.map((u) => (
                        <span
                          key={u.id}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            color: C.text2,
                            background: C.cream2,
                            borderRadius: 8,
                            padding: "5px 10px",
                          }}
                        >
                          <Building2 size={13} color={u.cor} /> {u.nome}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "stretch" }}>
                  <Btn
                    variant="soft"
                    onClick={() => {
                      enterViewAs(f.id);
                      go && go("dash");
                    }}
                    disabled={us.length === 0}
                    title={us.length === 0 ? "Vincule uma unidade primeiro" : "Entrar nesta conta para operar/dar suporte"}
                    style={{ justifyContent: "center" }}
                  >
                    <Eye size={15} /> Entrar
                  </Btn>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn variant="ghost" onClick={() => setModal(f)} style={{ flex: 1, justifyContent: "center" }}>
                      <Edit3 size={15} /> Editar
                    </Btn>
                    <Btn
                      variant="ghost"
                      onClick={() => removeFranqueado(f.id)}
                      style={{ color: C.red, borderColor: C.redPale, padding: "10px 12px" }}
                      title="Excluir franqueado"
                    >
                      <Trash2 size={15} />
                    </Btn>
                  </div>
                </div>
              </div>
            </Card>
          );
        })
      )}

      {modal && (
        <Modal title={modal.id ? "Editar conta" : "Nova conta"} onClose={() => setModal(null)}>
          <FranqueadoForm
            inicial={modal}
            onSave={(dados) => {
              if (modal.id) updateFranqueado(modal.id, dados);
              else addFranqueado(dados);
              setModal(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function FranqueadoForm({ inicial, onSave }) {
  const [f, setF] = useState({
    tipoPessoa: inicial.tipoPessoa || "PJ",
    nome: inicial.nome || "",
    nomeFantasia: inicial.nomeFantasia || "",
    documento: inicial.documento || "",
    responsavel: inicial.responsavel || "",
    master: inicial.master || "",
    email: inicial.email || "",
    telefone: inicial.telefone || "",
    endereco: inicial.endereco || "",
    cidade: inicial.cidade || "",
    plano: inicial.plano || "Essencial",
    mensalidade: inicial.mensalidade ?? 297,
    contrato: inicial.contrato || null,
    observacoes: inicial.observacoes || "",
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const pj = f.tipoPessoa === "PJ";
  const valido = f.nome.trim() && f.documento.trim() && f.email.trim();

  return (
    <>
      <Field label="Tipo de pessoa">
        <div style={{ display: "flex", gap: 8 }}>
          {[["PJ", "Pessoa Jurídica"], ["PF", "Pessoa Física"]].map(([v, lb]) => (
            <button key={v} type="button" onClick={() => setF({ ...f, tipoPessoa: v })}
              style={{ flex: 1, padding: "10px 0", borderRadius: 10, fontFamily: sans, fontSize: 13.5, fontWeight: 600, border: `1px solid ${f.tipoPessoa === v ? C.cafe : C.border}`, background: f.tipoPessoa === v ? C.cafe : C.white, color: f.tipoPessoa === v ? "#fff" : C.text2 }}>
              {lb}
            </button>
          ))}
        </div>
      </Field>

      <Field label={pj ? "Razão social" : "Nome completo"}>
        <input value={f.nome} onChange={set("nome")} style={inp} placeholder={pj ? "Razão social da empresa" : "Nome completo"} />
      </Field>
      {pj && (
        <Field label="Nome fantasia">
          <input value={f.nomeFantasia} onChange={set("nomeFantasia")} style={inp} placeholder="Nome fantasia (opcional)" />
        </Field>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label={pj ? "CNPJ" : "CPF"}>
          <input value={f.documento} onChange={set("documento")} style={inp} placeholder={pj ? "00.000.000/0000-00" : "000.000.000-00"} />
        </Field>
        <Field label="Telefone / WhatsApp">
          <input value={f.telefone} onChange={set("telefone")} style={inp} placeholder="(31) 99999-9999" />
        </Field>
      </div>
      {pj && (
        <Field label="Responsável legal (sócio)">
          <input value={f.responsavel} onChange={set("responsavel")} style={inp} placeholder="Nome do responsável/sócio administrador" />
        </Field>
      )}
      <Field label="Usuário master (nome do dono/responsável pela conta)">
        <input value={f.master} onChange={set("master")} style={inp} placeholder="Ex: Diego Garcia" />
      </Field>
      <Field label="E-mail de acesso do master">
        <input type="email" value={f.email} onChange={set("email")} style={inp} placeholder="diego.garcia@empresa.com.br" />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <Field label="Endereço">
          <input value={f.endereco} onChange={set("endereco")} style={inp} placeholder="Rua, número, bairro" />
        </Field>
        <Field label="Cidade/UF">
          <input value={f.cidade} onChange={set("cidade")} style={inp} placeholder="BH/MG" />
        </Field>
      </div>

      <Field label="Plano da plataforma (assinatura do app)">
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 12 }}>
          <select value={f.plano} onChange={(e) => { const p = PLANOS.find((x) => x.nome === e.target.value); setF({ ...f, plano: e.target.value, mensalidade: p ? p.valor : f.mensalidade }); }} style={inp}>
            {PLANOS.map((p) => <option key={p.nome} value={p.nome}>{p.nome} — R$ {p.valor}/mês</option>)}
          </select>
          <input type="number" min="0" step="0.01" value={f.mensalidade} onChange={(e) => setF({ ...f, mensalidade: +e.target.value })} style={inp} />
        </div>
      </Field>

      <Field label="Contrato de assinatura (PDF ou imagem)">
        <FileInput value={f.contrato} onChange={(v) => setF({ ...f, contrato: v })} label="Anexar contrato" />
      </Field>

      <Field label="Observações">
        <textarea value={f.observacoes} onChange={set("observacoes")} rows={2} style={{ ...inp, resize: "vertical", minHeight: 52 }} placeholder="Condições da assinatura, descontos, etc." />
      </Field>

      <div style={{ fontSize: 11, color: C.text4, marginBottom: 14 }}>
        O e-mail será o login do <b>master</b> quando ativarmos o acesso. Use "Entrar" para operar/dar suporte à conta.
      </div>
      <Btn style={{ width: "100%", justifyContent: "center" }} onClick={() => valido && onSave(f)}>
        {inicial.id ? "Salvar conta" : "Cadastrar conta"}
      </Btn>
    </>
  );
}
