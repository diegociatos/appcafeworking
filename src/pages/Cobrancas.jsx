import React, { useState, useEffect } from "react";
import { CreditCard, Plus, Barcode, QrCode, Link2, CheckCircle2, Copy, ExternalLink, AlertTriangle, Wallet } from "lucide-react";
import { Card, Badge, Btn, PageHead, Modal, Field, Empty } from "../components/ui.jsx";
import { C, serif, fmt, inp } from "../lib/theme.js";
import { useStore } from "../lib/store.jsx";
import { asaasApi } from "../lib/asaasApi.js";
import { fetchCobrancasDb } from "../lib/supabaseDb.js";

const STATUS = {
  pendente: { label: "Aguardando", cor: C.amber, bg: C.amberPale },
  pago: { label: "Pago", cor: C.green, bg: C.greenPale },
  vencido: { label: "Vencido", cor: C.red, bg: C.redPale },
  cancelado: { label: "Cancelado", cor: C.text3, bg: C.cream2 },
  estornado: { label: "Estornado", cor: C.red, bg: C.redPale },
};
const TIPOS = [
  { v: "UNDEFINED", lb: "Cliente escolhe", ic: Wallet, hint: "Boleto, PIX ou cartão na mesma fatura" },
  { v: "BOLETO", lb: "Boleto", ic: Barcode, hint: "" },
  { v: "PIX", lb: "PIX", ic: QrCode, hint: "" },
  { v: "CREDIT_CARD", lb: "Cartão de crédito", ic: CreditCard, hint: "" },
];
const fmtData = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—");
const mapCob = (c) => ({
  id: c.id, cliente: c.cliente, valor: Number(c.valor || 0), vencimento: c.vencimento,
  tipo: c.tipo, status: c.status, invoiceUrl: c.invoice_url, boletoUrl: c.boleto_url,
  pixPayload: c.pix_payload, descricao: c.descricao,
});

export default function Cobrancas() {
  const { activeUnit, unidadeAtiva, clientesDe } = useStore();
  const [lista, setLista] = useState([]);
  const [novo, setNovo] = useState(false);
  const [detalhe, setDetalhe] = useState(null);

  useEffect(() => {
    let vivo = true;
    if (asaasApi.configured) fetchCobrancasDb().then((rows) => { if (vivo) setLista((rows || []).map(mapCob).filter((c) => true)); });
    return () => { vivo = false; };
  }, [activeUnit]);

  const cobrancas = lista; // já filtradas por RLS (unidades do usuário)
  const recebido = cobrancas.filter((c) => c.status === "pago").reduce((s, c) => s + c.valor, 0);
  const aberto = cobrancas.filter((c) => c.status === "pendente").reduce((s, c) => s + c.valor, 0);

  return (
    <div>
      <PageHead
        title="Cobranças"
        sub={`Receba por boleto, PIX ou cartão (Asaas) · ${unidadeAtiva?.nome || ""}.`}
        action={<Btn onClick={() => setNovo(true)}><Plus size={16} /> Nova cobrança</Btn>}
      />

      {!asaasApi.configured && (
        <div style={{ display: "flex", gap: 9, background: C.amberPale, border: `1px solid ${C.amber}40`, borderRadius: 12, padding: "10px 14px", marginBottom: 18, fontSize: 12.5, color: C.text2 }}>
          <AlertTriangle size={16} color={C.amber} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>Modo demonstração — conecte o Supabase e cadastre sua chave Asaas no Vault (<code>asaas_{activeUnit}</code>) para cobrar de verdade.</span>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 16, marginBottom: 18 }}>
        <Kpi label="Recebido" valor={fmt(recebido)} cor={C.green} icon={CheckCircle2} />
        <Kpi label="Em aberto" valor={fmt(aberto)} cor={C.amber} icon={Wallet} />
        <Kpi label="Cobranças" valor={cobrancas.length} cor={C.teal} icon={CreditCard} />
      </div>

      {cobrancas.length === 0 ? (
        <Card><Empty icon={CreditCard} title="Nenhuma cobrança" sub="Crie a primeira cobrança — o cliente paga por boleto, PIX ou cartão." /></Card>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {cobrancas.map((c, i) => {
            const st = STATUS[c.status] || STATUS.pendente;
            return (
              <div key={c.id} onClick={() => setDetalhe(c)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 18px", borderBottom: i < cobrancas.length - 1 ? `1px solid ${C.border2}` : "none", cursor: "pointer", flexWrap: "wrap" }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: C.cafePale, display: "grid", placeItems: "center", flexShrink: 0 }}><CreditCard size={19} color={C.cafe} /></div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{c.cliente}</span>
                    <Badge color={st.cor} bg={st.bg}>{st.label}</Badge>
                  </div>
                  <div style={{ fontSize: 11.5, color: C.text3 }}>{c.descricao || "Cobrança"} · vence {fmtData(c.vencimento)}</div>
                </div>
                <div style={{ fontFamily: serif, fontSize: 17 }}>{fmt(c.valor)}</div>
              </div>
            );
          })}
        </Card>
      )}

      {novo && (
        <Modal title="Nova cobrança" onClose={() => setNovo(false)} maxWidth={480}>
          <CobrancaForm unidadeId={activeUnit} clientes={clientesDe(unidadeAtiva?.nome)} onCriada={(c) => { setLista((l) => [c, ...l]); setNovo(false); setDetalhe(c); }} />
        </Modal>
      )}
      {detalhe && (
        <Modal title="Cobrança" onClose={() => setDetalhe(null)} maxWidth={460}>
          <DetalheCobranca c={detalhe} />
        </Modal>
      )}
    </div>
  );
}

function Kpi({ label, valor, cor, icon: Icon }) {
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 12.5, color: C.text3 }}>{label}</div>
          <div style={{ fontFamily: serif, fontSize: 23, marginTop: 4 }}>{valor}</div>
        </div>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: `${cor}16`, display: "grid", placeItems: "center" }}><Icon size={19} color={cor} /></div>
      </div>
    </Card>
  );
}

function CobrancaForm({ unidadeId, clientes, onCriada }) {
  const [f, setF] = useState({ clienteId: clientes[0]?.id || "", nome: "", doc: "", email: "", valor: "", vencimento: "", descricao: "", tipo: "UNDEFINED" });
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);
  const cli = clientes.find((c) => c.id === f.clienteId);
  const nome = cli?.nome || f.nome.trim();
  const doc = cli?.cnpj || f.doc.trim();
  const valido = nome && doc && +f.valor > 0;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const criar = () => {
    setErro(null);
    if (!valido) return setErro("Preencha cliente, documento e valor.");
    setBusy(true);
    asaasApi.criarCobranca({
      unidade_id: unidadeId, cliente: nome, cliente_documento: doc, cliente_email: cli?.email || f.email,
      valor: +f.valor, vencimento: f.vencimento || undefined, descricao: f.descricao, tipo: f.tipo,
    })
      .then(({ cobranca }) => onCriada({
        id: cobranca.id, cliente: cobranca.cliente, valor: Number(cobranca.valor), vencimento: cobranca.vencimento,
        tipo: cobranca.tipo, status: cobranca.status, invoiceUrl: cobranca.invoice_url, boletoUrl: cobranca.boleto_url,
        pixPayload: cobranca.pix_payload, descricao: cobranca.descricao,
      }))
      .catch((e) => setErro(e.message))
      .finally(() => setBusy(false));
  };

  return (
    <>
      {clientes.length > 0 && (
        <Field label="Cliente">
          <select value={f.clienteId} onChange={set("clienteId")} style={inp}>
            <option value="">— avulso (digitar) —</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </Field>
      )}
      {!f.clienteId && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Nome"><input value={f.nome} onChange={set("nome")} style={inp} placeholder="Nome do pagador" /></Field>
          <Field label="CPF/CNPJ"><input value={f.doc} onChange={set("doc")} style={inp} placeholder="só números" /></Field>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Valor (R$)"><input type="number" min="0" step="0.01" value={f.valor} onChange={set("valor")} style={inp} placeholder="0,00" /></Field>
        <Field label="Vencimento"><input type="date" value={f.vencimento} onChange={set("vencimento")} style={inp} /></Field>
      </div>
      <Field label="Descrição"><input value={f.descricao} onChange={set("descricao")} style={inp} placeholder="Ex: Mensalidade Junho" /></Field>
      <Field label="Forma de pagamento">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {TIPOS.map((t) => (
            <button key={t.v} type="button" onClick={() => setF({ ...f, tipo: t.v })}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 10px", borderRadius: 10, border: `1px solid ${f.tipo === t.v ? C.cafe : C.border}`, background: f.tipo === t.v ? C.cafePale : C.white, color: f.tipo === t.v ? C.cafe : C.text2, fontSize: 12.5, fontWeight: 600 }}>
              <t.ic size={15} /> {t.lb}
            </button>
          ))}
        </div>
      </Field>
      {erro && <div style={{ fontSize: 12.5, color: C.red, marginBottom: 10 }}>{erro}</div>}
      <Btn style={{ width: "100%", justifyContent: "center", opacity: busy ? 0.6 : 1 }} onClick={() => !busy && criar()}>
        {busy ? "Criando…" : "Gerar cobrança"}
      </Btn>
    </>
  );
}

function DetalheCobranca({ c }) {
  const [cop, setCop] = useState("");
  const copiar = (txt, tag) => { navigator.clipboard?.writeText(txt); setCop(tag); setTimeout(() => setCop(""), 1500); };
  const st = STATUS[c.status] || STATUS.pendente;
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontFamily: serif, fontSize: 24 }}>{fmt(c.valor)}</span>
        <Badge color={st.cor} bg={st.bg}>{st.label}</Badge>
      </div>
      <div style={{ fontSize: 13, color: C.text2, marginBottom: 14 }}>{c.cliente} · {c.descricao || "Cobrança"} · vence {fmtData(c.vencimento)}</div>

      {c.invoiceUrl && (
        <a href={c.invoiceUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
          <Btn style={{ width: "100%", justifyContent: "center", marginBottom: 10 }}><ExternalLink size={15} /> Abrir link de pagamento (boleto/PIX/cartão)</Btn>
        </a>
      )}
      {c.pixPayload && (
        <Btn variant="ghost" style={{ width: "100%", justifyContent: "center", marginBottom: 10 }} onClick={() => copiar(c.pixPayload, "pix")}>
          <Copy size={15} /> {cop === "pix" ? "PIX copiado!" : "Copiar PIX copia-e-cola"}
        </Btn>
      )}
      {c.boletoUrl && (
        <a href={c.boletoUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
          <Btn variant="ghost" style={{ width: "100%", justifyContent: "center" }}><Barcode size={15} /> Abrir boleto (PDF)</Btn>
        </a>
      )}
      {c.invoiceUrl && (
        <Btn variant="ghost" style={{ width: "100%", justifyContent: "center", marginTop: 10 }} onClick={() => copiar(c.invoiceUrl, "link")}>
          <Link2 size={15} /> {cop === "link" ? "Link copiado!" : "Copiar link para enviar ao cliente"}
        </Btn>
      )}
    </>
  );
}
