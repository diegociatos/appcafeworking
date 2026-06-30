import { useState } from "react";
import {
  Plus, Users, Briefcase, ChevronRight, ChevronLeft, FileText,
  Building, Mail, Phone, Upload, Download, FileCheck, FileClock,
  AlertCircle, MapPin, Edit3, Trash2,
} from "lucide-react";
import { Card, Badge, Btn, PageHead, Empty, Modal, Field, ConfirmDialog } from "../components/ui.jsx";
import { C, serif, inp } from "../lib/theme.js";
import { useStore } from "../lib/store.jsx";
import { buscarCnpj, buscarCep } from "../lib/lookup.js";

export default function Clientes() {
  const { clientes, addCliente, updateCliente, removeCliente, unidades } = useStore();
  const [sel, setSel] = useState(null);
  const [editar, setEditar] = useState(null); // null | {} novo | cliente em edição
  const [excluir, setExcluir] = useState(null);
  const cli = clientes.find((c) => c.id === sel);
  if (cli) return <ClienteDetalhe cli={cli} onBack={() => setSel(null)} onEditar={() => { setSel(null); setEditar(cli); }} onExcluir={() => { setSel(null); setExcluir(cli); }} />;

  return (
    <div>
      <PageHead
        title="Clientes"
        sub="Contratos, planos, documentos, faturas, reservas e histórico completo."
        action={
          <Btn onClick={() => setEditar({})}>
            <Plus size={16} /> Novo cliente
          </Btn>
        }
      />
      {clientes.length === 0 ? (
        <Card><Empty icon={Users} title="Nenhum cliente" sub="Cadastre o primeiro cliente do coworking." /></Card>
      ) : (
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {clientes.map((c, i) => {
          const novos = c.docs.filter((d) => d.status === "novo").length;
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
                borderBottom: i < clientes.length - 1 ? `1px solid ${C.border2}` : "none",
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
                  CNPJ {c.cnpj} · desde {c.desde}
                </div>
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
              </div>
              <div style={{ display: "flex", gap: 2 }} onClick={(e) => e.stopPropagation()}>
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
          <NovoClienteForm inicial={editar} unidades={unidades} onSalvar={(dados) => { if (editar.id) updateCliente(editar.id, dados); else addCliente(dados); setEditar(null); }} />
        </Modal>
      )}

      <ConfirmDialog
        aberto={!!excluir}
        titulo="Excluir cliente?"
        mensagem={excluir ? `O cliente "${excluir.nome}" será removido. Esta ação não pode ser desfeita.` : ""}
        onConfirmar={() => { removeCliente(excluir.id); setExcluir(null); }}
        onCancelar={() => setExcluir(null)}
      />
    </div>
  );
}

function NovoClienteForm({ inicial = {}, unidades, onSalvar }) {
  const [f, setF] = useState({
    nome: inicial.nome || "", cnpj: inicial.cnpj || "", plano: inicial.plano || "Sala Privativa",
    unidade: inicial.unidade || unidades[0]?.nome || "", fiscal: inicial.fiscal || false,
    contato: inicial.contato || "", email: inicial.email || "", tel: inicial.tel || "",
    cep: inicial.cep || "", endereco: inicial.endereco || "", numero: inicial.numero || "",
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const [buscando, setBuscando] = useState(false);
  const valido = f.nome.trim();
  const onCnpj = (e) => {
    const v = e.target.value; setF((p) => ({ ...p, cnpj: v }));
    if (v.replace(/\D/g, "").length === 14) {
      setBuscando(true);
      buscarCnpj(v).then((r) => { if (r) setF((p) => ({
        ...p,
        nome: p.nome || r.razaoSocial,
        email: p.email || r.email,
        tel: p.tel || r.telefone,
        cep: p.cep || r.cep,
        numero: p.numero || r.numero,
        endereco: p.endereco || [r.logradouro, r.bairro, [r.municipio, r.uf].filter(Boolean).join("/")].filter(Boolean).join(", "),
      })); }).finally(() => setBuscando(false));
    }
  };
  const onCep = (e) => {
    const v = e.target.value; setF((p) => ({ ...p, cep: v }));
    if (v.replace(/\D/g, "").length === 8) {
      setBuscando(true);
      buscarCep(v).then((r) => { if (r) setF((p) => ({ ...p, endereco: p.endereco || [r.logradouro, r.bairro, [r.cidade, r.uf].filter(Boolean).join("/")].filter(Boolean).join(", ") })); }).finally(() => setBuscando(false));
    }
  };
  return (
    <>
      <Field label="Nome / razão social"><input value={f.nome} onChange={set("nome")} style={inp} placeholder="Ex: Mendes Advocacia" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="CPF / CNPJ"><input value={f.cnpj} onChange={onCnpj} style={inp} placeholder="00.000.000/0001-00" /></Field>
        <Field label="Unidade">
          <select value={f.unidade} onChange={set("unidade")} style={inp}>
            {unidades.map((u) => <option key={u.id} value={u.nome}>{u.nome}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Plano / contrato"><input value={f.plano} onChange={set("plano")} style={inp} placeholder="Ex: Sala Privativa, Endereço Fiscal" /></Field>
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
        <Field label="Endereço"><input value={f.endereco} onChange={set("endereco")} style={inp} placeholder="Rua, bairro, cidade" /></Field>
        <Field label="Número"><input value={f.numero} onChange={set("numero")} style={inp} placeholder="Nº" aria-label="Número do endereço" /></Field>
      </div>
      {buscando && <div style={{ fontSize: 11, color: C.text4, marginTop: -6, marginBottom: 10 }}>Buscando dados…</div>}
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.text2, margin: "4px 0 14px", cursor: "pointer" }}>
        <input type="checkbox" checked={f.fiscal} onChange={(e) => setF({ ...f, fiscal: e.target.checked })} /> Usa endereço fiscal (recebe correspondências)
      </label>
      <Btn style={{ width: "100%", justifyContent: "center", opacity: valido ? 1 : 0.5 }} onClick={() => valido && onSalvar({ ...f, desde: inicial.desde || String(new Date().getFullYear()) })}>
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
    </div>
  );
}

function ClienteDetalhe({ cli, onBack, onEditar, onExcluir }) {
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
