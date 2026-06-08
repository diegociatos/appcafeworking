import React, { useState } from "react";
import {
  FileText, Receipt, Plus, Download, XCircle, SlidersHorizontal, CheckCircle2,
  Building2, Percent, ShieldCheck, Coins,
} from "lucide-react";
import { Card, Badge, Btn, PageHead, Modal, Field, Empty } from "../components/ui.jsx";
import { C, serif, sans, fmt, inp } from "../lib/theme.js";
import { useStore } from "../lib/store.jsx";

const STATUS = {
  autorizada: { label: "Autorizada", cor: C.green, bg: C.greenPale },
  processando: { label: "Processando", cor: C.amber, bg: C.amberPale },
  cancelada: { label: "Cancelada", cor: C.text3, bg: C.cream2 },
  erro: { label: "Erro", cor: C.red, bg: C.redPale },
};
const REGIMES = ["Simples Nacional", "Lucro Presumido", "Lucro Real", "MEI"];
const fmtData = (d) => (d ? d.split("-").reverse().join("/") : "—");

export default function NotaFiscal() {
  const store = useStore();
  const { activeUnit, unidadeAtiva } = store;
  const cfg = store.configFiscalDe(activeUnit);
  const notas = store.notasFiscaisDe(activeUnit);
  const [aba, setAba] = useState("notas");
  const [emitir, setEmitir] = useState(false);

  const faturado = notas.filter((n) => n.status === "autorizada").reduce((s, n) => s + n.valor, 0);
  const issTotal = notas.filter((n) => n.status === "autorizada").reduce((s, n) => s + (n.iss || 0), 0);
  const ativa = cfg?.emissaoAtiva;

  return (
    <div>
      <PageHead
        title="Notas Fiscais"
        sub={`Emissão de NFS-e da unidade ${unidadeAtiva?.nome || ""} — cada unidade tem sua configuração fiscal.`}
        action={<Btn onClick={() => setEmitir(true)} disabled={!ativa}><Plus size={16} /> Emitir nota</Btn>}
      />

      <div style={{ display: "flex", gap: 9, alignItems: "flex-start", background: ativa ? C.greenPale : C.amberPale, border: `1px solid ${ativa ? C.green : C.amber}40`, borderRadius: 12, padding: "10px 14px", marginBottom: 18, fontSize: 12.5, color: C.text2 }}>
        <ShieldCheck size={16} color={ativa ? C.green : C.amber} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          {ativa
            ? `Emissão fiscal ativa · ${cfg?.municipio || ""} · ambiente ${cfg?.ambiente === "nacional" ? "Nacional (NFS-e padrão)" : "municipal"}. O certificado digital fica no Vault, nunca no app.`
            : "Configure os dados fiscais desta unidade (aba Configuração) e ative a emissão para emitir notas."}
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, borderBottom: `1px solid ${C.border2}` }}>
        {[["notas", "Notas emitidas"], ["config", "Configuração fiscal"]].map(([id, lb]) => (
          <button key={id} onClick={() => setAba(id)} className="cw-btn"
            style={{ padding: "9px 4px", marginRight: 14, fontSize: 14, fontWeight: 600, color: aba === id ? C.cafe : C.text3, borderBottom: `2px solid ${aba === id ? C.cafe : "transparent"}`, borderRadius: 0 }}>
            {lb}
          </button>
        ))}
      </div>

      {aba === "notas" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 16, marginBottom: 18 }}>
            <Kpi label="Notas emitidas" valor={notas.filter((n) => n.status === "autorizada").length} icon={Receipt} cor={C.teal} />
            <Kpi label="Faturado (NFS-e)" valor={fmt(faturado)} icon={Coins} cor={C.cafe} />
            <Kpi label="ISS recolhido" valor={fmt(issTotal)} icon={Percent} cor={C.amber} />
          </div>
          {notas.length === 0 ? (
            <Card><Empty icon={FileText} title="Nenhuma nota emitida" sub="Emita a primeira NFS-e — ou ela sai sozinha na baixa de uma cobrança." /></Card>
          ) : (
            <Card style={{ padding: 0, overflow: "hidden" }}>
              {notas.map((n, i) => {
                const st = STATUS[n.status] || STATUS.processando;
                return (
                  <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 18px", borderBottom: i < notas.length - 1 ? `1px solid ${C.border2}` : "none", flexWrap: "wrap" }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: C.tealPale, display: "grid", placeItems: "center", flexShrink: 0 }}><FileText size={19} color={C.teal} /></div>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>NFS-e nº {n.numero}</span>
                        <Badge color={st.cor} bg={st.bg}>{st.label}</Badge>
                      </div>
                      <div style={{ fontSize: 11.5, color: C.text3 }}>{n.tomador} · {n.descricao} · {fmtData(n.emitidaEm)}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: serif, fontSize: 17 }}>{fmt(n.valor)}</div>
                      <div style={{ fontSize: 10.5, color: C.text4 }}>ISS {fmt(n.iss || 0)}</div>
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => baixarNota(n, "pdf")} title="PDF" className="cw-btn" style={{ color: C.cafe, padding: 6 }}><Download size={16} /></button>
                      {n.status === "autorizada" && (
                        <button onClick={() => store.cancelarNF(n.id)} title="Cancelar nota" className="cw-btn" style={{ color: C.red, padding: 6 }}><XCircle size={16} /></button>
                      )}
                    </div>
                  </div>
                );
              })}
            </Card>
          )}
          <div style={{ fontSize: 12, color: C.text3, marginTop: 14, fontStyle: "italic", display: "flex", alignItems: "center", gap: 7 }}>
            <CheckCircle2 size={14} /> A nota é emitida automaticamente quando a cobrança (boleto) é paga.
          </div>
        </>
      )}

      {aba === "config" && <ConfigFiscal cfg={cfg} unidadeNome={unidadeAtiva?.nome} onSalvar={(d) => store.updateConfigFiscal(activeUnit, d)} />}

      {emitir && (
        <Modal title="Emitir NFS-e" onClose={() => setEmitir(false)} maxWidth={480}>
          <EmitirNotaForm cfg={cfg} onEmitir={(d) => { store.emitirNFSe(activeUnit, d); setEmitir(false); }} />
        </Modal>
      )}
    </div>
  );
}

function baixarNota(n, tipo) {
  const txt = [
    "CafeWorking · NFS-e (demonstração)",
    "----------------------------------------",
    `Número: ${n.numero}`,
    `Tomador: ${n.tomador} (${n.tomadorDoc})`,
    `Descrição: ${n.descricao}`,
    `Valor: ${fmt(n.valor)} · ISS: ${fmt(n.iss || 0)}`,
    `Emitida em: ${fmtData(n.emitidaEm)} · Status: ${n.status}`,
  ].join("\n");
  const url = URL.createObjectURL(new Blob([txt], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url; a.download = `nfse-${n.numero}.${tipo === "pdf" ? "txt" : "xml"}`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function Kpi({ label, valor, icon: Icon, cor }) {
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 12.5, color: C.text3 }}>{label}</div>
          <div style={{ fontFamily: serif, fontSize: 23, color: C.text, marginTop: 4 }}>{valor}</div>
        </div>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: `${cor}16`, display: "grid", placeItems: "center" }}><Icon size={19} color={cor} /></div>
      </div>
    </Card>
  );
}

function EmitirNotaForm({ cfg, onEmitir }) {
  const [f, setF] = useState({ tomador: "", tomadorDoc: "", descricao: cfg?.descricaoServico || "", valor: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const iss = (+f.valor || 0) * (cfg?.aliquotaISS || 0) / 100;
  const valido = f.tomador.trim() && +f.valor > 0;
  return (
    <>
      <Field label="Tomador (cliente)"><input value={f.tomador} onChange={set("tomador")} style={inp} placeholder="Nome / razão social" /></Field>
      <Field label="CPF / CNPJ do tomador"><input value={f.tomadorDoc} onChange={set("tomadorDoc")} style={inp} placeholder="00.000.000/0001-00" /></Field>
      <Field label="Descrição do serviço"><input value={f.descricao} onChange={set("descricao")} style={inp} placeholder="Ex: Locação de sala / mensalidade coworking" /></Field>
      <Field label="Valor do serviço (R$)"><input type="number" min="0" step="0.01" value={f.valor} onChange={set("valor")} style={inp} placeholder="0,00" /></Field>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: C.text3, background: C.cream2, borderRadius: 9, padding: "9px 12px", marginBottom: 14 }}>
        <span>ISS ({cfg?.aliquotaISS || 0}%)</span><b style={{ color: C.cafe }}>{fmt(iss)}</b>
      </div>
      <Btn style={{ width: "100%", justifyContent: "center", opacity: valido ? 1 : 0.5 }} onClick={() => valido && onEmitir({ ...f, valor: +f.valor })}>
        <FileText size={16} /> Emitir NFS-e
      </Btn>
    </>
  );
}

function ConfigFiscal({ cfg, unidadeNome, onSalvar }) {
  const [f, setF] = useState({
    municipio: cfg?.municipio || "", uf: cfg?.uf || "MG",
    inscricaoMunicipal: cfg?.inscricaoMunicipal || "", regime: cfg?.regime || "Simples Nacional",
    codigoServico: cfg?.codigoServico || "", descricaoServico: cfg?.descricaoServico || "",
    aliquotaISS: cfg?.aliquotaISS ?? 0, ambiente: cfg?.ambiente || "nacional",
    certificadoRef: cfg?.certificadoRef || "", emissaoAtiva: cfg?.emissaoAtiva ?? false,
  });
  const [salvo, setSalvo] = useState(false);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setSalvo(false); };

  return (
    <Card style={{ maxWidth: 620 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: C.cafePale, display: "grid", placeItems: "center" }}><Building2 size={19} color={C.cafe} /></div>
        <div>
          <div style={{ fontFamily: serif, fontSize: 18 }}>Configuração fiscal · {unidadeNome}</div>
          <div style={{ fontSize: 12, color: C.text3 }}>Dados usados na emissão das NFS-e desta unidade.</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <Field label="Município"><input value={f.municipio} onChange={set("municipio")} style={inp} placeholder="Ex: Belo Horizonte" /></Field>
        <Field label="UF"><input value={f.uf} onChange={set("uf")} style={inp} maxLength={2} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Inscrição Municipal (CCM)"><input value={f.inscricaoMunicipal} onChange={set("inscricaoMunicipal")} style={inp} placeholder="0000000/000-0" /></Field>
        <Field label="Regime tributário">
          <select value={f.regime} onChange={set("regime")} style={inp}>{REGIMES.map((r) => <option key={r}>{r}</option>)}</select>
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 90px", gap: 12 }}>
        <Field label="Cód. serviço (LC 116)"><input value={f.codigoServico} onChange={set("codigoServico")} style={inp} placeholder="08.01" /></Field>
        <Field label="Descrição do serviço"><input value={f.descricaoServico} onChange={set("descricaoServico")} style={inp} placeholder="Locação de espaço / coworking" /></Field>
        <Field label="ISS (%)"><input type="number" min="0" step="0.01" value={f.aliquotaISS} onChange={(e) => { setF({ ...f, aliquotaISS: +e.target.value }); setSalvo(false); }} style={inp} /></Field>
      </div>
      <Field label="Ambiente de emissão">
        <div style={{ display: "flex", gap: 8 }}>
          {[["nacional", "NFS-e Nacional (padrão)"], ["municipal", "Sistema municipal (ex.: BHISS)"]].map(([v, lb]) => (
            <button key={v} type="button" onClick={() => { setF({ ...f, ambiente: v }); setSalvo(false); }}
              style={{ flex: 1, padding: "10px 8px", borderRadius: 10, fontFamily: sans, fontSize: 12.5, fontWeight: 600, border: `1px solid ${f.ambiente === v ? C.teal : C.border}`, background: f.ambiente === v ? C.tealPale : C.white, color: f.ambiente === v ? C.teal : C.text2 }}>
              {lb}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Certificado digital (referência no Vault)">
        <input value={f.certificadoRef} onChange={set("certificadoRef")} style={inp} placeholder="ex: cert_nfse_luxemburgo" />
      </Field>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: C.tealPale, borderRadius: 10, padding: "9px 12px", fontSize: 11.5, color: C.teal, marginBottom: 12 }}>
        <ShieldCheck size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>O <b>certificado digital A1 (e-CNPJ)</b> não é enviado aqui — é cadastrado no Vault e referenciado por este nome. A assinatura da nota acontece no backend.</span>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 600, color: C.text, margin: "2px 0 14px", cursor: "pointer" }}>
        <input type="checkbox" checked={f.emissaoAtiva} onChange={(e) => { setF({ ...f, emissaoAtiva: e.target.checked }); setSalvo(false); }} />
        Emissão fiscal ativa nesta unidade
      </label>
      <Btn style={{ width: "100%", justifyContent: "center" }} onClick={() => { onSalvar(f); setSalvo(true); }}>
        <SlidersHorizontal size={16} /> {salvo ? "Configuração salva" : "Salvar configuração fiscal"}
      </Btn>
    </Card>
  );
}
