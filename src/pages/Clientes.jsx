import { useState, useEffect } from "react";
import {
  Plus, Users, Briefcase, ChevronRight, ChevronLeft, FileText,
  Building, Mail, Phone, Upload, Download, FileCheck, FileClock,
  AlertCircle, MapPin, Edit3, Trash2, Search, X, Send, Smartphone, Clock,
} from "lucide-react";
import { Card, Badge, Btn, PageHead, Empty, Modal, Field, ConfirmDialog } from "../components/ui.jsx";
import { C, serif, fmt, inp } from "../lib/theme.js";
import { useStore } from "../lib/store.jsx";
import { buscarCnpj, buscarCep } from "../lib/lookup.js";
import { textoDesde } from "../lib/unidadeNome.js";
import { acessoClienteApi, situacaoAcesso } from "../lib/acessoClienteApi.js";
import { mensagemDe } from "../lib/erros.js";

// Quem envia o acesso ao app (a Edge Function confere de novo): admin, master e recepção.
const PERFIS_QUE_CONVIDAM = ["franqueador", "master", "recepcao"];
const dataCurta = (iso) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export default function Clientes() {
  const { clientes, addCliente, updateCliente, removeCliente, unidades, planosDe, perfil } = useStore();
  const [sel, setSel] = useState(null);
  const [editar, setEditar] = useState(null); // null | {} novo | cliente em edição
  const [excluir, setExcluir] = useState(null);
  const [busca, setBusca] = useState("");

  // Acesso ao app: quem já tem login (por unidade) e envio do convite.
  const podeConvidar = acessoClienteApi.configured && PERFIS_QUE_CONVIDAM.includes(perfil);
  const [acessos, setAcessos] = useState(null); // Map "unidade|email" → situação | null (não carregado)
  const [erroAcessos, setErroAcessos] = useState("");
  const [versaoAcessos, setVersaoAcessos] = useState(0);
  const [convites, setConvites] = useState({}); // clienteId → { enviando } | { ok, msg }
  const [confirmarLote, setConfirmarLote] = useState(false);
  const [lote, setLote] = useState(null); // { total, feitos, falhas: [{ nome, erro }], rodando }
  const unidadesDosClientes = [...new Set(clientes.map((c) => c.unidadeId).filter(Boolean))].sort().join("|");
  useEffect(() => {
    if (!acessoClienteApi.configured || perfil === "cliente" || !unidadesDosClientes) return undefined;
    let vivo = true;
    Promise.all(unidadesDosClientes.split("|").map((u) => acessoClienteApi.acessos(u)))
      .then((mapas) => {
        if (!vivo) return;
        const todos = new Map();
        mapas.forEach((m) => m.forEach((v, k) => todos.set(k, v)));
        setAcessos(todos); setErroAcessos("");
      })
      .catch((e) => { if (vivo) { setAcessos(null); setErroAcessos(mensagemDe(e)); } });
    return () => { vivo = false; };
  }, [unidadesDosClientes, versaoAcessos, perfil]);

  const convidar = async (c) => {
    setConvites((s) => ({ ...s, [c.id]: { enviando: true } }));
    try {
      await acessoClienteApi.convidar(c.id);
      setConvites((s) => ({ ...s, [c.id]: { ok: true, msg: `Acesso enviado para ${c.email}.` } }));
      setVersaoAcessos((v) => v + 1);
    } catch (e) {
      setConvites((s) => ({ ...s, [c.id]: { ok: false, msg: mensagemDe(e) } }));
    }
  };
  const semAcesso = acessos ? clientes.filter((c) => situacaoAcesso(c, acessos).tipo === "sem_acesso") : [];
  const enviarLote = async () => {
    setConfirmarLote(false);
    const alvo = semAcesso.slice();
    setLote({ total: alvo.length, feitos: 0, falhas: [], rodando: true });
    for (const c of alvo) {
      try {
        await acessoClienteApi.convidar(c.id);
        setLote((l) => ({ ...l, feitos: l.feitos + 1 }));
      } catch (e) {
        setLote((l) => ({ ...l, feitos: l.feitos + 1, falhas: [...l.falhas, { nome: c.nome, erro: mensagemDe(e) }] }));
      }
      await esperar(600); // respeita o limite de envios por segundo do provedor de e-mail
    }
    setLote((l) => ({ ...l, rodando: false }));
    setVersaoAcessos((v) => v + 1);
  };

  const cli = clientes.find((c) => c.id === sel);
  const termo = busca.trim().toLowerCase();
  const lista = clientes
    .filter((c) => !termo || `${c.nome || ""} ${c.cnpj || ""} ${c.plano || ""}`.toLowerCase().includes(termo))
    .slice()
    .sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
  if (cli) {
    return (
      <ClienteDetalhe
        cli={cli} onBack={() => setSel(null)} onEditar={() => { setSel(null); setEditar(cli); }} onExcluir={() => { setSel(null); setExcluir(cli); }}
        acesso={acessos ? situacaoAcesso(cli, acessos) : { tipo: cli.email ? "desconhecido" : "sem_email" }}
        podeConvidar={podeConvidar} convite={convites[cli.id]} onConvidar={() => convidar(cli)}
      />
    );
  }

  return (
    <div>
      <PageHead
        title="Clientes"
        sub="Contratos, planos, documentos, faturas, reservas e histórico completo."
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {podeConvidar && semAcesso.length > 0 && (
              <Btn variant="ghost" disabled={lote?.rodando} onClick={() => setConfirmarLote(true)}>
                <Send size={15} /> Enviar acesso a todos com e-mail e sem login ({semAcesso.length})
              </Btn>
            )}
            <Btn onClick={() => setEditar({})}>
              <Plus size={16} /> Novo cliente
            </Btn>
          </div>
        }
      />
      {podeConvidar && erroAcessos && (
        <div role="status" style={{ fontSize: 12.5, color: C.amber, marginBottom: 12 }}>
          Não foi possível verificar quem já tem acesso ao app: {erroAcessos}
        </div>
      )}
      {lote && (
        <Card style={{ marginBottom: 14, padding: 14 }}>
          <div role="status" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13.5, color: C.text2 }}>
              {lote.rodando
                ? <>Enviando acesso ao app… <b>{lote.feitos}</b> de <b>{lote.total}</b></>
                : <>Envio concluído: <b style={{ color: C.green }}>{lote.total - lote.falhas.length}</b> enviado(s){lote.falhas.length ? <>, <b style={{ color: C.red }}>{lote.falhas.length}</b> com problema</> : ""}.</>}
            </div>
            {!lote.rodando && <button type="button" onClick={() => setLote(null)} className="cw-btn" aria-label="Fechar resumo do envio" style={{ color: C.text3, padding: 4 }}><X size={15} /></button>}
          </div>
          {lote.falhas.length > 0 && (
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12.5, color: C.red }}>
              {lote.falhas.map((f, i) => <li key={i}><b>{f.nome}</b>: {f.erro}</li>)}
            </ul>
          )}
        </Card>
      )}
      {clientes.length > 0 && (
        <div style={{ position: "relative", marginBottom: 14 }}>
          <Search size={16} color={C.text4} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente por nome, CNPJ ou plano…"
            style={{ ...inp, padding: "10px 36px", fontSize: 13.5 }} />
          {busca && (
            <button onClick={() => setBusca("")} className="cw-btn" title="Limpar" style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: C.text3, padding: 4, display: "grid", placeItems: "center" }}><X size={15} /></button>
          )}
        </div>
      )}
      {clientes.length === 0 ? (
        <Card><Empty icon={Users} title="Nenhum cliente" sub="Cadastre o primeiro cliente do coworking." /></Card>
      ) : lista.length === 0 ? (
        <Card><Empty icon={Users} title="Nada encontrado" sub={`Nenhum cliente para “${busca.trim()}”.`} /></Card>
      ) : (
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {lista.map((c, i) => {
          const novos = c.docs.filter((d) => d.status === "novo").length;
          const acesso = acessos ? situacaoAcesso(c, acessos) : null;
          const convite = convites[c.id];
          return (
            <div
              key={c.id}
              onClick={() => setSel(c.id)}
              className="cw-lift"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: 18,
                borderBottom: i < lista.length - 1 ? `1px solid ${C.border2}` : "none",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: c.fiscal ? C.tealPale : C.cafePale,
                  display: "grid",
                  placeItems: "center",
                }}
              >
                {c.fiscal ? (
                  <Briefcase size={22} color={C.teal} />
                ) : (
                  <Users size={22} color={C.cafe} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: C.text }}>{c.nome}</div>
                <div style={{ fontSize: 12, color: C.text3 }}>
                  CNPJ {c.cnpj} · desde {textoDesde(c.desde)}
                </div>
                {convite?.msg && !convite.enviando && (
                  <div role="status" style={{ fontSize: 12, marginTop: 3, color: convite.ok ? C.green : C.red }}>{convite.msg}</div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Badge color={C.cafe}>{c.plano}</Badge>
                {c.fiscal && <Badge color={C.teal}>Endereço Fiscal</Badge>}
                {novos > 0 && (
                  <Badge color={C.amber} bg={C.amberPale}>
                    {novos} doc novo
                  </Badge>
                )}
                <Badge
                  color={c.status === "ativo" ? C.green : C.amber}
                  bg={c.status === "ativo" ? C.greenPale : C.amberPale}
                >
                  {c.status}
                </Badge>
                <BadgeAcesso acesso={acesso} />
              </div>
              <div style={{ display: "flex", gap: 2, alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
                {podeConvidar && acesso?.tipo === "sem_acesso" && (
                  <button onClick={() => convidar(c)} disabled={convite?.enviando || lote?.rodando} title={convite?.msg || "Enviar acesso ao app"} aria-label={`Enviar acesso ao app para ${c.nome}`} className="cw-btn"
                    style={{ color: convite && !convite.enviando ? (convite.ok ? C.green : C.red) : C.teal, padding: 6, opacity: convite?.enviando ? 0.5 : 1 }}>
                    <Send size={16} />
                  </button>
                )}
                <button onClick={() => setEditar(c)} title="Editar" aria-label={`Editar ${c.nome}`} className="cw-btn" style={{ color: C.text3, padding: 6 }}><Edit3 size={16} /></button>
                <button onClick={() => setExcluir(c)} title="Excluir" aria-label={`Excluir ${c.nome}`} className="cw-btn" style={{ color: C.red, padding: 6 }}><Trash2 size={16} /></button>
              </div>
              <ChevronRight size={18} color={C.text4} />
            </div>
          );
        })}
      </Card>
      )}

      {editar && (
        <Modal title={editar.id ? "Editar cliente" : "Novo cliente"} onClose={() => setEditar(null)} maxWidth={460}>
          <NovoClienteForm inicial={editar} unidades={unidades} planosDe={planosDe} onSalvar={(dados) => { if (editar.id) updateCliente(editar.id, dados); else addCliente(dados); setEditar(null); }} />
        </Modal>
      )}

      <ConfirmDialog
        aberto={!!excluir}
        titulo="Excluir cliente?"
        mensagem={excluir ? `O cliente "${excluir.nome}" será removido. Esta ação não pode ser desfeita.` : ""}
        onConfirmar={() => { removeCliente(excluir.id); setExcluir(null); }}
        onCancelar={() => setExcluir(null)}
      />

      <ConfirmDialog
        aberto={confirmarLote}
        perigo={false}
        titulo="Enviar acesso ao app?"
        mensagem={`${semAcesso.length} cliente(s) com e-mail e sem login vão receber um e-mail para criar a senha e entrar no app. Quem já tem acesso não recebe de novo. Clientes sem e-mail ficam de fora.`}
        textoConfirmar={`Enviar para ${semAcesso.length}`}
        onConfirmar={enviarLote}
        onCancelar={() => setConfirmarLote(false)}
      />
    </div>
  );
}

function BadgeAcesso({ acesso }) {
  if (!acesso) return null;
  if (acesso.tipo === "ativo") return <Badge color={C.green} bg={C.greenPale}><Smartphone size={11} /> Usa o app</Badge>;
  if (acesso.tipo === "convidado") return <Badge color={C.blue} bg={C.bluePale}><Clock size={11} /> Acesso enviado</Badge>;
  if (acesso.tipo === "sem_acesso") return <Badge color={C.text3} bg={C.cream2}>Sem acesso ao app</Badge>;
  return null;
}

function AcessoApp({ cli, acesso, podeConvidar, convite, onConvidar }) {
  const texto = {
    ativo: `Usa o app. Último acesso em ${dataCurta(acesso.ultimoLogin)}.`,
    convidado: acesso.convidadoEm
      ? `Acesso enviado em ${dataCurta(acesso.convidadoEm)}. O cliente ainda não entrou.`
      : "Tem login, mas ainda não entrou no app.",
    sem_acesso: "Ainda não tem acesso ao app.",
    sem_email: "Sem e-mail no cadastro. Cadastre o e-mail para enviar o acesso ao app.",
    desconhecido: "Não foi possível verificar o acesso ao app agora.",
  }[acesso.tipo];
  const botao = podeConvidar && (acesso.tipo === "sem_acesso" || acesso.tipo === "convidado");
  return (
    <div style={{ marginTop: 16, borderTop: `1px solid ${C.border2}`, paddingTop: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.text3, letterSpacing: 0.3, marginBottom: 8 }}>ACESSO AO APP</div>
      <div style={{ fontSize: 13, color: acesso.tipo === "sem_email" ? C.amber : C.text2 }}>{texto}</div>
      {botao && (
        <Btn variant={acesso.tipo === "sem_acesso" ? "teal" : "ghost"} style={{ width: "100%", marginTop: 10, fontSize: 13, padding: "9px 12px" }} disabled={convite?.enviando} onClick={onConvidar}>
          <Send size={14} /> {convite?.enviando ? "Enviando…" : acesso.tipo === "sem_acesso" ? "Enviar acesso ao app" : "Reenviar acesso"}
        </Btn>
      )}
      {botao && !convite && (
        <div style={{ fontSize: 11, color: C.text4, marginTop: 6 }}>
          {cli.nome} recebe em {cli.email} um e-mail para criar a senha e ver plano, faturas, reservas e correspondências.
        </div>
      )}
      {convite && !convite.enviando && (
        <div role="status" style={{ fontSize: 12, marginTop: 8, color: convite.ok ? C.green : C.red }}>{convite.msg}</div>
      )}
    </div>
  );
}

function NovoClienteForm({ inicial = {}, unidades, planosDe, onSalvar }) {
  const [f, setF] = useState({
    nome: inicial.nome || "", cnpj: inicial.cnpj || "", plano: inicial.plano || "",
    unidade: inicial.unidade || unidades[0]?.nome || "", fiscal: inicial.fiscal || false,
    contato: inicial.contato || "", email: inicial.email || "", tel: inicial.tel || "",
    cep: inicial.cep || "", endereco: inicial.endereco || "", numero: inicial.numero || "",
    bairro: inicial.bairro || "", cidade: inicial.cidade || "", uf: inicial.uf || "",
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const [buscando, setBuscando] = useState(false);
  const [erroBusca, setErroBusca] = useState("");
  const valido = f.nome.trim();
  const unidadeId = unidades.find((u) => u.nome === f.unidade)?.id;
  const planos = (planosDe && unidadeId) ? planosDe(unidadeId) : [];
  // Busca dados da empresa pelo CNPJ (só CNPJ = 14 dígitos) e preenche os campos.
  const buscarDoc = (v) => {
    const doc = String(v || "").replace(/\D/g, "");
    if (doc.length !== 14) { setErroBusca("Informe um CNPJ com 14 dígitos para buscar."); return; }
    setErroBusca(""); setBuscando(true);
    buscarCnpj(v).then((r) => {
      if (!r) { setErroBusca("CNPJ não encontrado."); return; }
      setF((p) => ({
        ...p,
        nome: r.razaoSocial || p.nome,
        email: p.email || r.email || "",
        tel: p.tel || r.telefone || "",
        cep: p.cep || r.cep || "",
        endereco: p.endereco || r.logradouro || "",
        numero: p.numero || r.numero || "",
        bairro: p.bairro || r.bairro || "",
        cidade: p.cidade || r.municipio || "",
        uf: p.uf || r.uf || "",
      }));
    }).catch(() => setErroBusca("Não foi possível buscar agora.")).finally(() => setBuscando(false));
  };
  const onCnpj = (e) => {
    const v = e.target.value; setF((p) => ({ ...p, cnpj: v }));
    if (v.replace(/\D/g, "").length === 14) buscarDoc(v);
  };
  const onCep = (e) => {
    const v = e.target.value; setF((p) => ({ ...p, cep: v }));
    if (v.replace(/\D/g, "").length === 8) {
      setBuscando(true);
      buscarCep(v).then((r) => { if (r) setF((p) => ({ ...p, endereco: p.endereco || r.logradouro || "", bairro: p.bairro || r.bairro || "", cidade: p.cidade || r.cidade || "", uf: p.uf || r.uf || "" })); }).finally(() => setBuscando(false));
    }
  };
  return (
    <>
      <Field label="Nome / razão social"><input value={f.nome} onChange={set("nome")} style={inp} placeholder="Ex: Mendes Advocacia" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="CPF / CNPJ">
          <div style={{ display: "flex", gap: 6 }}>
            <input value={f.cnpj} onChange={onCnpj} style={{ ...inp, flex: 1 }} placeholder="00.000.000/0001-00" inputMode="numeric" />
            <button type="button" onClick={() => buscarDoc(f.cnpj)} disabled={buscando} className="cw-btn" style={{ padding: "0 14px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.cafePale, color: C.cafe, fontWeight: 600, fontSize: 12.5, whiteSpace: "nowrap", opacity: buscando ? 0.6 : 1 }}>{buscando ? "…" : "Buscar"}</button>
          </div>
        </Field>
        <Field label="Unidade">
          <select value={f.unidade} onChange={set("unidade")} style={inp}>
            {unidades.map((u) => <option key={u.id} value={u.nome}>{u.nome}</option>)}
          </select>
        </Field>
      </div>
      {erroBusca && <div style={{ fontSize: 11.5, color: C.red, marginTop: -6, marginBottom: 10 }}>{erroBusca}</div>}
      <Field label="Plano / contrato">
        <select value={f.plano} onChange={set("plano")} style={inp}>
          <option value="">— sem plano —</option>
          {f.plano && !planos.some((p) => p.nome === f.plano) && <option value={f.plano}>{f.plano}</option>}
          {planos.map((p) => <option key={p.id} value={p.nome}>{p.nome}{p.preco ? ` · ${fmt(p.preco)}/mês` : ""}</option>)}
        </select>
        {planos.length === 0 && <div style={{ fontSize: 11, color: C.text4, marginTop: 4 }}>Cadastre planos em “Planos e serviços” para vincular aqui.</div>}
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Contato"><input value={f.contato} onChange={set("contato")} style={inp} placeholder="Pessoa de contato" /></Field>
        <Field label="Telefone"><input value={f.tel} onChange={set("tel")} style={inp} placeholder="(31) 9...." /></Field>
      </div>
      <Field label="E-mail">
        <input value={f.email} onChange={set("email")} style={inp} type="email" placeholder="contato@empresa.com.br" />
        <div style={{ fontSize: 11, color: C.text4, marginTop: 4 }}>Usado para enviar cobranças, boletos e notas fiscais ao cliente.</div>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 0.8fr", gap: 12 }}>
        <Field label="CEP"><input value={f.cep} onChange={onCep} style={inp} placeholder="00000-000" inputMode="numeric" aria-label="CEP do cliente" /></Field>
        <Field label="Endereço"><input value={f.endereco} onChange={set("endereco")} style={inp} placeholder="Rua / Av." /></Field>
        <Field label="Número"><input value={f.numero} onChange={set("numero")} style={inp} placeholder="Nº" aria-label="Número do endereço" /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.4fr 0.6fr", gap: 12 }}>
        <Field label="Bairro"><input value={f.bairro} onChange={set("bairro")} style={inp} placeholder="Bairro" /></Field>
        <Field label="Cidade"><input value={f.cidade} onChange={set("cidade")} style={inp} placeholder="Cidade" /></Field>
        <Field label="UF"><input value={f.uf} onChange={set("uf")} style={inp} placeholder="UF" maxLength={2} /></Field>
      </div>
      {buscando && <div style={{ fontSize: 11, color: C.text4, marginTop: -6, marginBottom: 10 }}>Buscando dados…</div>}
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.text2, margin: "4px 0 14px", cursor: "pointer" }}>
        <input type="checkbox" checked={f.fiscal} onChange={(e) => setF({ ...f, fiscal: e.target.checked })} /> Usa endereço fiscal (recebe correspondências)
      </label>
      <Btn style={{ width: "100%", justifyContent: "center", opacity: valido ? 1 : 0.5 }} onClick={() => valido && onSalvar({ ...f, desde: inicial.desde || new Date().toISOString().slice(0, 10) })}>
        <Plus size={16} /> {inicial.id ? "Salvar cliente" : "Cadastrar cliente"}
      </Btn>
    </>
  );
}

const CREDITO_LABEL = { sala_reuniao: "Sala reunião (h)", coworking: "Coworking (h)", daypass: "Day-pass", correspondencia: "Correspond." };

function CreditosCliente({ cli }) {
  const { saldosCliente, planosDe, concederCreditosPlano, ajustarCredito, CREDITO_TIPOS, ledgerDe } = useStore();
  const [aj, setAj] = useState({ tipo: "sala_reuniao", qtd: "", motivo: "" });
  const [feito, setFeito] = useState("");
  const saldos = saldosCliente(cli.id);
  const planos = planosDe ? planosDe(cli.unidadeId) : [];
  const plano = planos.find((p) => p.nome === cli.plano);
  const temDireitos = plano && plano.direitos && Object.values(plano.direitos).some((v) => typeof v === "number" && v > 0);
  const mov = ledgerDe(cli.id).length;
  const conceder = () => { const n = concederCreditosPlano(cli, plano); if (n) setFeito(`Créditos do plano "${plano.nome}" gerados.`); };
  const ajustar = () => { if (!+aj.qtd) return; ajustarCredito(cli.unidadeId, cli.id, aj.tipo, +aj.qtd, aj.motivo.trim()); setAj({ ...aj, qtd: "", motivo: "" }); setFeito("Ajuste lançado."); };

  return (
    <div style={{ marginTop: 16, borderTop: `1px solid ${C.border2}`, paddingTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.text3, letterSpacing: 0.3 }}>CRÉDITOS DO PLANO</span>
        {temDireitos && <button type="button" onClick={conceder} style={{ fontSize: 12, fontWeight: 600, color: C.teal, background: C.tealPale, border: "none", borderRadius: 8, padding: "5px 10px", cursor: "pointer" }}>+ Gerar do plano</button>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        {CREDITO_TIPOS.map((t) => (
          <div key={t} style={{ background: C.cream2, borderRadius: 10, padding: "8px 10px" }}>
            <div style={{ fontSize: 10.5, color: C.text3 }}>{CREDITO_LABEL[t]}</div>
            <div style={{ fontFamily: serif, fontSize: 18, color: saldos[t] > 0 ? C.cafe : C.text4 }}>{saldos[t]}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.7fr auto", gap: 6 }}>
        <select value={aj.tipo} onChange={(e) => setAj({ ...aj, tipo: e.target.value })} style={{ ...inp, padding: "8px 10px" }}>
          {CREDITO_TIPOS.map((t) => <option key={t} value={t}>{CREDITO_LABEL[t]}</option>)}
        </select>
        <input type="number" value={aj.qtd} onChange={(e) => setAj({ ...aj, qtd: e.target.value })} placeholder="±qtd" style={{ ...inp, padding: "8px 10px" }} aria-label="Quantidade do ajuste" />
        <button type="button" onClick={ajustar} style={{ padding: "9px 12px", borderRadius: 9, border: `1px solid ${C.border}`, background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Ajustar</button>
      </div>
      <input value={aj.motivo} onChange={(e) => setAj({ ...aj, motivo: e.target.value })} placeholder="Motivo do ajuste (auditável)" style={{ ...inp, padding: "8px 10px", marginTop: 6 }} aria-label="Motivo do ajuste" />
      {feito && <div style={{ fontSize: 11.5, color: C.green, marginTop: 6 }}>{feito}</div>}
      <div style={{ fontSize: 10.5, color: C.text4, marginTop: 6 }}>{mov} movimentação(ões) registradas.</div>
      <HorasSalaMes cli={cli} />
    </div>
  );
}

// Cliente antigo (sem assinatura pelo site) tem saldo zero de horas: a equipe
// lança as horas de sala do mês. Grava em creditos_ledger (auditado no banco) e
// a reserva pela recepção consome essas horas antes de cobrar excedente.
const TIPOS_HORAS = { sala_reuniao: "Sala de reunião", coworking: "Coworking (estação compartilhada)" };
const mesAtualISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
const mesBR = (iso) => { const [a, m] = String(iso).split("-"); return `${m}/${a}`; };

function HorasSalaMes({ cli }) {
  const { lancarHorasSalaMes, ledgerDe, saldoCreditos } = useStore();
  const [f, setF] = useState({ tipo: "sala_reuniao", horas: "", mes: mesAtualISO(), motivo: "" });
  const [estado, setEstado] = useState({ salvando: false, erro: "", ok: "" });
  const [repetido, setRepetido] = useState(null); // lançamentos anteriores do mesmo mês/tipo
  const horas = Math.floor(Number(f.horas));
  const valido = horas > 0 && horas <= 200 && /^\d{4}-\d{2}$/.test(f.mes) && f.motivo.trim().length >= 5;
  const referencia = `horas_mes:${f.mes}:${f.tipo}`;

  const gravar = async () => {
    setRepetido(null);
    setEstado({ salvando: true, erro: "", ok: "" });
    try {
      await lancarHorasSalaMes(cli, f.tipo, horas, `Horas de sala ${mesBR(f.mes)} · ${f.motivo.trim()}`, referencia);
      setEstado({ salvando: false, erro: "", ok: `${horas} h de ${TIPOS_HORAS[f.tipo].toLowerCase()} lançadas para ${mesBR(f.mes)}.` });
      setF((p) => ({ ...p, horas: "", motivo: "" }));
    } catch (e) {
      setEstado({ salvando: false, erro: mensagemDe(e, "Não foi possível lançar as horas. Nada foi gravado; tente de novo."), ok: "" });
    }
  };
  const pedirLancamento = () => {
    if (!valido || estado.salvando) return;
    const anteriores = ledgerDe(cli.id).filter((e) => e.referenciaId === referencia);
    if (anteriores.length) { setRepetido(anteriores); return; }
    gravar();
  };

  return (
    <div style={{ marginTop: 14, background: C.cream, borderRadius: 12, padding: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Lançar horas de sala do mês</div>
      <div style={{ fontSize: 11.5, color: C.text3, margin: "2px 0 10px" }}>
        Para cliente antigo, sem assinatura pelo site. Saldo atual: {saldoCreditos(cli.id, f.tipo)} h de {TIPOS_HORAS[f.tipo].toLowerCase()}.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.8fr 1fr", gap: 6 }}>
        <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} style={{ ...inp, padding: "8px 10px" }} aria-label="Tipo de sala">
          {Object.entries(TIPOS_HORAS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input type="number" min="1" max="200" step="1" value={f.horas} onChange={(e) => setF({ ...f, horas: e.target.value })} placeholder="Horas" style={{ ...inp, padding: "8px 10px" }} aria-label="Quantidade de horas" />
        <input type="month" value={f.mes} onChange={(e) => setF({ ...f, mes: e.target.value })} style={{ ...inp, padding: "8px 10px" }} aria-label="Mês de referência" />
      </div>
      <input value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} maxLength={200} placeholder="Motivo (ex.: contrato antigo prevê 4 h/mês)" style={{ ...inp, padding: "8px 10px", marginTop: 6 }} aria-label="Motivo do lançamento" />
      {!cli.email && (
        <div style={{ fontSize: 11.5, color: C.amber, marginTop: 6 }}>
          Cliente sem e-mail: as horas valem nas reservas feitas pela recepção, mas o cliente não as vê no app.
        </div>
      )}
      {repetido && (
        <div role="alert" style={{ fontSize: 12, color: C.amber, background: C.amberPale, borderRadius: 8, padding: "8px 10px", marginTop: 8 }}>
          Já foram lançadas {repetido.reduce((s, e) => s + (e.quantidade || 0), 0)} h de {TIPOS_HORAS[f.tipo].toLowerCase()} em {mesBR(f.mes)} para este cliente. Lançar mais {horas} h mesmo assim?
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" onClick={gravar} style={{ fontSize: 12, fontWeight: 600, color: "#fff", background: C.amber, border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>Lançar mesmo assim</button>
            <button type="button" onClick={() => setRepetido(null)} style={{ fontSize: 12, fontWeight: 600, color: C.text2, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>Cancelar</button>
          </div>
        </div>
      )}
      <Btn variant="teal" style={{ width: "100%", marginTop: 8, fontSize: 13, padding: "9px 12px", opacity: valido ? 1 : 0.5 }} disabled={estado.salvando || !!repetido} onClick={pedirLancamento}>
        {estado.salvando ? "Lançando…" : "Lançar horas"}
      </Btn>
      {!valido && (f.horas || f.motivo) && <div style={{ fontSize: 11, color: C.text4, marginTop: 5 }}>Informe as horas (1 a 200) e o motivo (mínimo 5 letras).</div>}
      {estado.erro && <div role="alert" style={{ fontSize: 12, color: C.red, marginTop: 6 }}>{estado.erro}</div>}
      {estado.ok && <div role="status" style={{ fontSize: 12, color: C.green, marginTop: 6 }}>{estado.ok}</div>}
    </div>
  );
}

function ClienteDetalhe({ cli, onBack, onEditar, onExcluir, acesso, podeConvidar, convite, onConvidar }) {
  const [docs, setDocs] = useState(cli.docs);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <button
          onClick={onBack}
          style={{ fontSize: 14, color: C.text3, display: "flex", alignItems: "center", gap: 4 }}
        >
          <ChevronLeft size={16} /> Voltar para clientes
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="ghost" style={{ padding: "8px 12px", fontSize: 13 }} onClick={onEditar}><Edit3 size={14} /> Editar</Btn>
          <Btn variant="ghost" style={{ padding: "8px 12px", fontSize: 13, color: C.red, borderColor: C.redPale }} onClick={onExcluir}><Trash2 size={14} /> Excluir</Btn>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 16 }} className="cw-grid-stack">
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: cli.fiscal ? C.tealPale : C.cafePale,
                display: "grid",
                placeItems: "center",
              }}
            >
              {cli.fiscal ? (
                <Briefcase size={26} color={C.teal} />
              ) : (
                <Users size={26} color={C.cafe} />
              )}
            </div>
            <div>
              <div style={{ fontFamily: serif, fontSize: 22, color: C.text }}>{cli.nome}</div>
              <Badge
                color={cli.status === "ativo" ? C.green : C.amber}
                bg={cli.status === "ativo" ? C.greenPale : C.amberPale}
              >
                {cli.status}
              </Badge>
            </div>
          </div>
          {[
            [FileText, "CNPJ", cli.cnpj],
            [Briefcase, "Plano", cli.plano],
            [Building, "Unidade", cli.unidade],
            [Users, "Contato", cli.contato],
            [Mail, "E-mail", cli.email],
            [Phone, "Telefone", cli.tel],
            [MapPin, "Endereço", [[cli.endereco, cli.numero].filter(Boolean).join(", "), cli.cep].filter(Boolean).join(" · ")],
          ].map(([Ic, l, v], i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 0",
                borderBottom: i < 5 ? `1px solid ${C.border2}` : "none",
              }}
            >
              <Ic size={17} color={C.text4} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: C.text3 }}>{l}</div>
                <div style={{ fontSize: 14, color: C.text, fontWeight: 500 }}>{v}</div>
              </div>
            </div>
          ))}
          {cli.fiscal && (
            <div
              style={{
                marginTop: 14,
                padding: 14,
                background: C.tealPale,
                borderRadius: 12,
                display: "flex",
                gap: 10,
              }}
            >
              <Briefcase size={18} color={C.teal} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 13, color: C.teal2 }}>
                Cliente com <b>endereço fiscal ativo</b>. Correspondências recebidas são digitalizadas
                e disponibilizadas aqui.
              </div>
            </div>
          )}
          {acessoClienteApi.configured && <AcessoApp cli={cli} acesso={acesso} podeConvidar={podeConvidar} convite={convite} onConvidar={onConvidar} />}
          <CreditosCliente cli={cli} />
        </Card>

        <Card>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <div style={{ fontFamily: serif, fontSize: 20 }}>Documentos & Correspondências</div>
            <Btn
              variant="teal"
              style={{ padding: "8px 14px", fontSize: 13 }}
              onClick={() =>
                setDocs((d) => [
                  {
                    nome: "Novo documento.pdf",
                    tipo: "Correspondência",
                    data: "28/05/2026",
                    status: "novo",
                  },
                  ...d,
                ])
              }
            >
              <Upload size={15} /> Enviar
            </Btn>
          </div>
          {docs.length === 0 ? (
            <Empty icon={FileText} title="Nenhum documento ainda" />
          ) : (
            docs.map((d, i) => {
              const sc = {
                ok: [C.green, C.greenPale, "Aprovado", FileCheck],
                novo: [C.amber, C.amberPale, "Novo", FileClock],
                pendente: [C.red, C.redPale, "Pendente", AlertCircle],
              }[d.status];
              const Ic = sc[3];
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "13px 0",
                    borderBottom: i < docs.length - 1 ? `1px solid ${C.border2}` : "none",
                  }}
                >
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      background: sc[1],
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <Ic size={18} color={sc[0]} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{d.nome}</div>
                    <div style={{ fontSize: 12, color: C.text3 }}>
                      {d.tipo} · {d.data}
                    </div>
                  </div>
                  <Badge color={sc[0]} bg={sc[1]}>
                    {sc[2]}
                  </Badge>
                  <button style={{ color: C.text4, padding: 6 }} aria-label="Baixar">
                    <Download size={17} />
                  </button>
                </div>
              );
            })
          )}
        </Card>
      </div>
    </div>
  );
}
