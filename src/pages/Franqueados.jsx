import { useState } from "react";
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
import { onboardApi } from "../lib/onboardApi.js";
import { mapConta } from "../lib/supabaseDb.js";
import { buscarCnpj } from "../lib/lookup.js";

// Contrato gravado no servidor: link assinado de 10 minutos. Na demonstração
// (sem backend) o anexo continua só em memória, como data URL.
async function baixarContrato(f) {
  const c = f?.contrato;
  if (!c) return;
  if (c.url) {
    const a = document.createElement("a");
    a.href = c.url; a.download = c.nome || "contrato";
    document.body.appendChild(a); a.click(); a.remove();
    return;
  }
  // Abre a aba antes do await para o navegador não bloquear como pop-up.
  const janela = window.open("", "_blank");
  try {
    const url = await onboardApi.linkContrato(f.id);
    if (janela) janela.location.href = url; else window.open(url, "_blank", "noopener");
  } catch (e) {
    if (janela) janela.close();
    alert(e.message || "Não foi possível abrir o contrato. Tente de novo.");
  }
}

// O anexo do formulário é novo (ainda não foi para o servidor)?
const contratoNovo = (c) => Boolean(c?.url && /^data:/.test(c.url));

// CPF tem 11 dígitos; CNPJ tem 14
const tipoDoc = (doc) => ((doc || "").replace(/\D/g, "").length > 11 ? "CNPJ" : "CPF");

// Rede de parceiros (docs/PARCEIROS.md)
const STATUS_PARCEIRO = [
  ["em_analise", "Em análise"], ["ativo", "Ativo (vende)"], ["suspenso", "Suspenso"], ["encerrado", "Encerrado"],
];
const rotuloStatus = (s) => STATUS_PARCEIRO.find(([v]) => v === s)?.[1] || "Em análise";
const corStatus = (s) => (s === "ativo" ? C.green : s === "suspenso" || s === "encerrado" ? C.red : C.amber);

/** Campos do parceiro enviados às Edge Functions (camelCase; o backend valida). */
const dadosParceiro = (d) => ({
  tipo: d.tipo, parceiroPercentual: d.parceiroPercentual, garantiaPercentual: d.garantiaPercentual,
  asaasWalletId: d.asaasWalletId, parceiroStatus: d.tipo === "parceiro" ? d.parceiroStatus : "",
  emailsAviso: d.emailsAvisoTexto,
});

export default function Franqueados({ go }) {
  const { franqueados, unidades, unidadesDe, addFranqueado, updateFranqueado, removeFranqueado, removerCoworking, enterViewAs, adicionarCoworking } = useStore();
  const [modal, setModal] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState(null);
  const [credenciais, setCredenciais] = useState(null);
  const [excluir, setExcluir] = useState(null); // conta a confirmar exclusão
  const [excluindo, setExcluindo] = useState(false);
  const [erroExcluir, setErroExcluir] = useState(null);

  const confirmarExclusao = async () => {
    if (!excluir) return;
    if (!onboardApi.configured) { removeFranqueado(excluir.id); setExcluir(null); return; }
    setErroExcluir(null); setExcluindo(true);
    try {
      await onboardApi.excluirCoworking(excluir.id);
      removerCoworking(excluir.id);
      setExcluir(null);
    } catch (e) {
      setErroExcluir(e.message || "Falha ao excluir.");
    } finally {
      setExcluindo(false);
    }
  };

  const salvarConta = async (dados) => {
    if (!onboardApi.configured) {
      const local = { ...dados, emailsAviso: String(dados.emailsAvisoTexto || "").split(/[\s,;]+/).filter(Boolean) };
      if (modal?.id) updateFranqueado(modal.id, local); else addFranqueado(local);
      setModal(null);
      return;
    }
    setErroForm(null); setSalvando(true);
    try {
      if (modal?.id) {
        // Edição: grava na tabela contas; o contrato vai para o Storage privado.
        let conta = await onboardApi.salvarConta(modal.id, {
          nome: dados.nome, master: dados.master, documento: dados.documento, telefone: dados.telefone,
          plano: dados.plano, mensalidade: dados.mensalidade, tipoPessoa: dados.tipoPessoa, nomeFantasia: dados.nomeFantasia,
          responsavel: dados.responsavel, endereco: dados.endereco, cidade: dados.cidade, observacoes: dados.observacoes,
          ...dadosParceiro(dados),
        });
        updateFranqueado(modal.id, mapConta(conta));
        if (contratoNovo(dados.contrato)) conta = await onboardApi.enviarContrato(modal.id, dados.contrato);
        else if (!dados.contrato && modal.contrato) conta = await onboardApi.removerContrato(modal.id);
        updateFranqueado(modal.id, mapConta(conta));
        setModal(null);
        return;
      }
      const res = await onboardApi.criarCoworking({
        empresa: dados.nome,
        master_nome: dados.master || dados.responsavel || dados.nome,
        master_email: dados.email,
        documento: dados.documento, telefone: dados.telefone,
        plano: dados.plano, mensalidade: dados.mensalidade,
        unidade_nome: dados.unidadeNome || dados.nomeFantasia || dados.nome,
        endereco: [dados.endereco, dados.cidade].filter(Boolean).join(" · "),
        cidade: dados.cidade,
        senha: dados.senha || undefined,
        tipo_pessoa: dados.tipoPessoa, nome_fantasia: dados.nomeFantasia, responsavel: dados.responsavel,
        endereco_conta: dados.endereco, observacoes: dados.observacoes,
        tipo: dados.tipo, parceiro_percentual: dados.parceiroPercentual, garantia_percentual: dados.garantiaPercentual,
        asaas_wallet_id: dados.asaasWalletId, parceiro_status: dados.tipo === "parceiro" ? dados.parceiroStatus : "",
        emails_aviso: dados.emailsAvisoTexto,
      });
      let conta = res.conta;
      let avisoContrato = "";
      if (contratoNovo(dados.contrato)) {
        try {
          conta = await onboardApi.enviarContrato(res.conta.id, dados.contrato);
        } catch (e) {
          avisoContrato = `O coworking foi criado, mas o contrato não foi salvo (${e.message || "falha no envio"}). Anexe de novo em Editar.`;
        }
      }
      adicionarCoworking({ conta: mapConta(conta), unidade: res.unidade });
      setModal(null);
      setCredenciais({ ...res.login, empresa: dados.nome, avisoContrato });
    } catch (e) {
      setErroForm(e.message || (modal?.id ? "Falha ao salvar a conta." : "Falha ao cadastrar."));
    } finally {
      setSalvando(false);
    }
  };

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
                    {f.plano && f.tipo !== "parceiro" && <Badge color={C.green}>{f.plano} · {fmt(f.mensalidade || 0)}/mês</Badge>}
                    {f.tipo === "parceiro" && (
                      <Badge color={corStatus(f.parceiroStatus)}>
                        Parceiro · {rotuloStatus(f.parceiroStatus)} · {f.parceiroPercentual}% (garantia {f.garantiaPercentual}%)
                      </Badge>
                    )}
                    {f.tipo === "parceiro" && !f.asaasWalletId && <Badge color={C.red}>Sem carteira Asaas</Badge>}
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
                      <button onClick={() => baixarContrato(f)} className="cw-btn" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.teal, fontWeight: 600 }} title="Baixar contrato">
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
                      onClick={() => setExcluir(f)}
                      style={{ color: C.red, borderColor: C.redPale, padding: "10px 12px" }}
                      title="Excluir conta"
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
        <Modal title={modal.id ? "Editar conta" : "Novo coworking (cria o login do master)"} onClose={() => { if (!salvando) { setModal(null); setErroForm(null); } }}>
          <FranqueadoForm inicial={modal} onSave={salvarConta} loading={salvando} erro={erroForm} novo={!modal.id && onboardApi.configured} real={onboardApi.configured} />
        </Modal>
      )}

      {credenciais && (
        <Modal title="Coworking criado ✓" onClose={() => setCredenciais(null)}>
          <CredenciaisCriadas dados={credenciais} onClose={() => setCredenciais(null)} />
        </Modal>
      )}

      {excluir && (
        <Modal title="Excluir conta" onClose={() => !excluindo && setExcluir(null)}>
          <div style={{ fontSize: 14, color: C.text2, marginBottom: 12 }}>
            Excluir <b>{excluir.nome}</b> e <b>tudo</b> dela (unidades, clientes, equipe, login do master)?
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: C.redPale, border: `1px solid ${C.red}33`, borderRadius: 10, padding: "9px 12px", fontSize: 12, color: C.text2, marginBottom: 14 }}>
            <Trash2 size={14} color={C.red} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Esta ação é <b>irreversível</b>. Os dados e o acesso do coworking serão removidos para sempre.</span>
          </div>
          {erroExcluir && <div style={{ fontSize: 12.5, color: C.red, marginBottom: 12 }}>{erroExcluir}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="ghost" onClick={() => !excluindo && setExcluir(null)} style={{ flex: 1, justifyContent: "center" }}>Cancelar</Btn>
            <Btn onClick={confirmarExclusao} style={{ flex: 1, justifyContent: "center", background: C.red, opacity: excluindo ? 0.6 : 1 }}>
              {excluindo ? "Excluindo…" : "Excluir definitivamente"}
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

function CredenciaisCriadas({ dados, onClose }) {
  const [copiado, setCopiado] = useState(false);
  const texto = `CafeWorking — acesso\nEmpresa: ${dados.empresa}\nLogin: ${dados.email}\nSenha temporária: ${dados.senha_temporaria}\nEntre em: ${location.origin}`;
  const copiar = () => { navigator.clipboard?.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 2000); };
  return (
    <>
      <div style={{ fontSize: 13.5, color: C.text2, marginBottom: 14 }}>
        O login do master foi criado. <b>Repasse estes dados ao cliente</b> — a senha é temporária e ele pode trocá-la depois.
      </div>
      {dados.avisoContrato && (
        <div role="alert" style={{ fontSize: 12.5, color: C.red, background: C.redPale, borderRadius: 10, padding: "9px 12px", marginBottom: 14 }}>
          {dados.avisoContrato}
        </div>
      )}
      <div style={{ background: C.cream2, borderRadius: 12, padding: 16, marginBottom: 14, fontSize: 14 }}>
        <Linha rotulo="Empresa" valor={dados.empresa} />
        <Linha rotulo="Login (e-mail)" valor={dados.email} />
        <Linha rotulo="Senha temporária" valor={dados.senha_temporaria} mono />
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: C.amberPale, border: `1px solid ${C.amber}33`, borderRadius: 10, padding: "9px 12px", fontSize: 11.5, color: C.text2, marginBottom: 14 }}>
        <Mail size={14} color={C.amber} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>Guarde agora — a senha não será mostrada de novo. Oriente o cliente a trocá-la no primeiro acesso.</span>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Btn variant="ghost" onClick={copiar} style={{ flex: 1, justifyContent: "center" }}>{copiado ? "Copiado!" : "Copiar dados"}</Btn>
        <Btn onClick={onClose} style={{ flex: 1, justifyContent: "center" }}>Concluir</Btn>
      </div>
    </>
  );
}

function Linha({ rotulo, valor, mono }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "5px 0" }}>
      <span style={{ color: C.text3 }}>{rotulo}</span>
      <b style={{ fontFamily: mono ? "monospace" : serif, color: C.text, wordBreak: "break-all" }}>{valor}</b>
    </div>
  );
}

function FranqueadoForm({ inicial, onSave, loading, erro, novo, real }) {
  // Na edição real o e-mail é o login do master (Auth): não muda por esta tela.
  const emailTravado = Boolean(real && inicial.id);
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
    unidadeNome: inicial.unidadeNome || "",
    senha: "",
    plano: inicial.plano || "Essencial",
    mensalidade: inicial.mensalidade ?? 297,
    contrato: inicial.contrato || null,
    observacoes: inicial.observacoes || "",
    tipo: inicial.tipo === "parceiro" ? "parceiro" : "propria",
    parceiroPercentual: inicial.parceiroPercentual ?? 75,
    garantiaPercentual: inicial.garantiaPercentual ?? 10,
    asaasWalletId: inicial.asaasWalletId || "",
    parceiroStatus: inicial.parceiroStatus || "em_analise",
    emailsAvisoTexto: (inicial.emailsAviso || []).join("\n"),
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const pj = f.tipoPessoa === "PJ";
  const parceiro = f.tipo === "parceiro";
  const pctOk = +f.parceiroPercentual > 0 && +f.parceiroPercentual < 100 && +f.garantiaPercentual >= 0 && +f.garantiaPercentual < 100;
  const erroParceiro = !parceiro ? ""
    : !pctOk ? "Percentuais precisam ficar entre 0 e 100."
    : f.parceiroStatus === "ativo" && !f.asaasWalletId.trim() ? "Parceiro ativo precisa da carteira Asaas (walletId) para receber o split."
    : "";
  const imediato = Math.round(+f.parceiroPercentual * (1 - +f.garantiaPercentual / 100) * 100) / 100;
  const valido = f.nome.trim() && f.documento.trim() && f.email.trim() && (!novo || f.unidadeNome.trim()) && !erroParceiro;
  const [buscandoDoc, setBuscandoDoc] = useState(false);
  const lookupCnpj = async (d) => {
    setBuscandoDoc(true);
    const r = await buscarCnpj(d);
    setBuscandoDoc(false);
    if (!r) return;
    setF((prev) => ({
      ...prev,
      nome: r.razaoSocial || prev.nome,
      nomeFantasia: prev.nomeFantasia || r.nomeFantasia,
      telefone: prev.telefone || r.telefone,
      email: prev.email || r.email,
      endereco: prev.endereco || [r.logradouro, r.numero, r.bairro].filter(Boolean).join(", "),
      cidade: prev.cidade || [r.municipio, r.uf].filter(Boolean).join("/"),
    }));
  };
  const onDoc = (e) => {
    const v = e.target.value;
    setF((prev) => ({ ...prev, documento: v }));
    if (pj && v.replace(/\D/g, "").length === 14) lookupCnpj(v.replace(/\D/g, ""));
  };

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
          <input value={f.documento} onChange={onDoc} style={inp} placeholder={pj ? "00.000.000/0000-00" : "000.000.000-00"} />
          {pj && buscandoDoc && <div style={{ fontSize: 11, color: C.text4, marginTop: 4 }}>Buscando dados do CNPJ…</div>}
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
      <Field label="E-mail de acesso do master (será o login)">
        <input type="email" value={f.email} onChange={set("email")} style={{ ...inp, ...(emailTravado ? { background: C.cream2, color: C.text3 } : {}) }}
          placeholder="dono@coworking.com.br" readOnly={emailTravado} aria-readonly={emailTravado} />
        {emailTravado && <div style={{ fontSize: 11, color: C.text4, marginTop: 4 }}>O e-mail é o login do master e não muda por aqui.</div>}
      </Field>
      {novo && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Nome da primeira unidade">
            <input value={f.unidadeNome} onChange={set("unidadeNome")} style={inp} placeholder="Ex: Unidade Centro" />
          </Field>
          <Field label="Senha inicial (opcional)">
            <input value={f.senha} onChange={set("senha")} style={inp} placeholder="deixe vazio = gerar automática" />
          </Field>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <Field label="Endereço">
          <input value={f.endereco} onChange={set("endereco")} style={inp} placeholder="Rua, número, bairro" />
        </Field>
        <Field label="Cidade/UF">
          <input value={f.cidade} onChange={set("cidade")} style={inp} placeholder="BH/MG" />
        </Field>
      </div>

      <div style={{ background: C.cream2, borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>Rede de parceiros</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {[["propria", "Conta própria"], ["parceiro", "Parceiro da rede"]].map(([v, lb]) => (
            <button key={v} type="button" onClick={() => setF({ ...f, tipo: v })}
              style={{ flex: 1, padding: "9px 0", borderRadius: 10, fontFamily: sans, fontSize: 13, fontWeight: 600, border: `1px solid ${f.tipo === v ? C.cafe : C.border}`, background: f.tipo === v ? C.cafePale : C.white, color: f.tipo === v ? C.cafe : C.text2 }}>
              {lb}
            </button>
          ))}
        </div>
        {parceiro ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Situação" style={{ marginBottom: 0 }}>
                <select value={f.parceiroStatus} onChange={set("parceiroStatus")} style={inp}>
                  {STATUS_PARCEIRO.map(([v, lb]) => <option key={v} value={v}>{lb}</option>)}
                </select>
              </Field>
              <Field label="Carteira Asaas (walletId)" style={{ marginBottom: 0 }}>
                <input value={f.asaasWalletId} onChange={set("asaasWalletId")} style={inp} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
              </Field>
              <Field label="Parte do parceiro (%)" style={{ marginBottom: 0 }}>
                <input type="number" min="1" max="99" step="0.01" value={f.parceiroPercentual} onChange={set("parceiroPercentual")} style={inp} />
              </Field>
              <Field label="Garantia retida (% do repasse)" style={{ marginBottom: 0 }}>
                <input type="number" min="0" max="99" step="0.01" value={f.garantiaPercentual} onChange={set("garantiaPercentual")} style={inp} />
              </Field>
            </div>
            {pctOk && (
              <div style={{ fontSize: 11.5, color: C.text3, marginTop: 8 }}>
                Em cada pagamento: {imediato}% vai direto ao parceiro no split, {Math.round((+f.parceiroPercentual - imediato) * 100) / 100}% fica retido como garantia
                e {Math.round((100 - +f.parceiroPercentual) * 100) / 100}% é da CafeWorking. Só vende online com situação "Ativo" e carteira preenchida.
              </div>
            )}
            <Field label="E-mails que recebem os avisos (um por linha; vazio = e-mail do master)" style={{ marginTop: 10, marginBottom: 0 }}>
              <textarea value={f.emailsAvisoTexto} onChange={set("emailsAvisoTexto")} rows={2} style={{ ...inp, resize: "vertical", minHeight: 52 }} placeholder={"contato@escritorio.com.br"} />
            </Field>
            {erroParceiro && <div style={{ fontSize: 12, color: C.red, marginTop: 8 }}>{erroParceiro}</div>}
          </>
        ) : (
          <div style={{ fontSize: 11.5, color: C.text3 }}>Conta própria vende com a própria chave Asaas e define os próprios planos. Parceiro usa a conta da CafeWorking com split e a tabela nacional.</div>
        )}
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
        <FileInput value={f.contrato} onChange={(v) => setF({ ...f, contrato: v })} label="Anexar contrato" accept="application/pdf,image/jpeg,image/png" />
        {real && <div style={{ fontSize: 11, color: C.text4, marginTop: 4 }}>PDF, JPG ou PNG até 10 MB. Fica guardado em área privada; o download usa link temporário.</div>}
      </Field>

      <Field label="Observações">
        <textarea value={f.observacoes} onChange={set("observacoes")} rows={2} style={{ ...inp, resize: "vertical", minHeight: 52 }} placeholder="Condições da assinatura, descontos, etc." />
      </Field>

      <div style={{ fontSize: 11, color: C.text4, marginBottom: 12 }}>
        {novo
          ? <>Isto <b>cria o login do master</b> e a primeira unidade. Você recebe a senha temporária para repassar ao cliente. Depois, use "Entrar" para dar suporte.</>
          : <>O e-mail é o login do <b>master</b>. Use "Entrar" para operar/dar suporte à conta.</>}
      </div>
      {erro && (
        <div style={{ fontSize: 12.5, color: C.red, marginBottom: 12 }}>{erro}</div>
      )}
      <Btn style={{ width: "100%", justifyContent: "center", opacity: (!valido || loading) ? 0.6 : 1 }} onClick={() => valido && !loading && onSave(f)}>
        {loading ? (inicial.id ? "Salvando…" : "Criando…") : inicial.id ? "Salvar conta" : novo ? "Criar coworking + login" : "Cadastrar conta"}
      </Btn>
    </>
  );
}
