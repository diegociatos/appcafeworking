import React, { useState } from "react";
import {
  FileText, Receipt, Plus, Download, XCircle, SlidersHorizontal, CheckCircle2,
  Building2, Percent, ShieldCheck, Coins, KeyRound, UploadCloud, AlertTriangle,
} from "lucide-react";
import { Card, Badge, Btn, PageHead, Modal, Field, Empty, FileInput } from "../components/ui.jsx";
import { C, serif, sans, fmt, inp } from "../lib/theme.js";
import { useStore } from "../lib/store.jsx";
import { nfseApi } from "../lib/nfseApi.js";

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
            ? <>Emissão ativa · {cfg?.municipio || ""} · {cfg?.emissor === "bhiss" ? "BHISS (municipal)" : "NFS-e Nacional"} · <b style={{ color: cfg?.ambiente === "producao" ? C.amber : C.teal }}>{cfg?.ambiente === "producao" ? "Produção" : "Produção restrita (testes)"}</b>. O certificado fica no Vault, nunca no app.</>
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

      {aba === "config" && (
        <div style={{ display: "grid", gap: 16 }}>
          <CertificadoCard cfg={cfg} unidadeNome={unidadeAtiva?.nome} onEnviar={(d) => store.salvarCertificadoFiscal(activeUnit, d)} />
          <ConfigFiscal cfg={cfg} unidadeNome={unidadeAtiva?.nome} unidadeId={activeUnit} onSalvar={(d) => store.salvarConfigFiscal(activeUnit, d)} />
        </div>
      )}

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
  const [f, setF] = useState({ tomador: "", tomadorDoc: "", tomadorEmail: "", descricao: cfg?.descricaoServico || "", valor: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const iss = (+f.valor || 0) * (cfg?.aliquotaISS || 0) / 100;
  const valido = f.tomador.trim() && +f.valor > 0;
  return (
    <>
      <Field label="Tomador (cliente)"><input value={f.tomador} onChange={set("tomador")} style={inp} placeholder="Nome / razão social" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="CPF / CNPJ do tomador"><input value={f.tomadorDoc} onChange={set("tomadorDoc")} style={inp} placeholder="00.000.000/0001-00" /></Field>
        <Field label="E-mail (recebe a nota)"><input type="email" value={f.tomadorEmail} onChange={set("tomadorEmail")} style={inp} placeholder="cliente@email.com" /></Field>
      </div>
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

function CertificadoCard({ cfg, unidadeNome, onEnviar }) {
  const [file, setFile] = useState(null);
  const [senha, setSenha] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // {tipo:'ok'|'erro', texto}
  const jaTem = Boolean(cfg?.certificadoEnviadoEm);

  const enviar = () => {
    setMsg(null);
    if (!file?.url) return setMsg({ tipo: "erro", texto: "Anexe o arquivo .pfx do certificado." });
    if (!senha) return setMsg({ tipo: "erro", texto: "Informe a senha do certificado." });
    setBusy(true);
    Promise.resolve(onEnviar({ pfxBase64: file.url, senha }))
      .then((r) => {
        setMsg({ tipo: "ok", texto: r?.demo ? "Certificado recebido (modo demonstração — não foi transmitido)." : "Certificado salvo com segurança no cofre (Vault)." });
        setFile(null); setSenha("");
      })
      .catch((e) => setMsg({ tipo: "erro", texto: e.message || "Falha ao enviar o certificado." }))
      .finally(() => setBusy(false));
  };

  return (
    <Card style={{ maxWidth: 620 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: C.tealPale, display: "grid", placeItems: "center" }}><KeyRound size={19} color={C.teal} /></div>
        <div>
          <div style={{ fontFamily: serif, fontSize: 18 }}>Certificado digital A1 · {unidadeNome}</div>
          <div style={{ fontSize: 12, color: C.text3 }}>Necessário para assinar e transmitir as notas (e-CNPJ).</div>
        </div>
      </div>

      {jaTem && (
        <div style={{ display: "flex", alignItems: "center", gap: 9, background: C.greenPale, border: `1px solid ${C.green}33`, borderRadius: 10, padding: "10px 13px", marginBottom: 14, fontSize: 12.5, color: C.text2 }}>
          <CheckCircle2 size={16} color={C.green} style={{ flexShrink: 0 }} />
          <span>
            Certificado ativo{cfg.certificadoTitular ? ` · ${cfg.certificadoTitular}` : ""}
            {cfg.certificadoValidade ? ` · válido até ${cfg.certificadoValidade.split("-").reverse().join("/")}` : ""}. Envie novamente só para substituir.
          </span>
        </div>
      )}

      <Field label="Arquivo do certificado (.pfx / .p12)">
        <FileInput value={file} onChange={setFile} accept=".pfx,.p12,application/x-pkcs12" label="Anexar certificado A1" />
      </Field>
      <Field label="Senha do certificado">
        <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} style={inp} placeholder="••••••••" autoComplete="off" />
      </Field>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: C.cream2, borderRadius: 10, padding: "9px 12px", fontSize: 11.5, color: C.text3, margin: "2px 0 14px" }}>
        <ShieldCheck size={14} color={C.teal} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>O arquivo é enviado direto ao backend e guardado <b>criptografado no Vault</b> — não fica no navegador nem no banco comum. A senha trafega apenas nesta gravação.</span>
      </div>

      {msg && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, marginBottom: 12, color: msg.tipo === "ok" ? C.green : C.red }}>
          {msg.tipo === "ok" ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />} {msg.texto}
        </div>
      )}

      <Btn style={{ width: "100%", justifyContent: "center", opacity: busy ? 0.6 : 1 }} onClick={() => !busy && enviar()}>
        <UploadCloud size={16} /> {busy ? "Enviando…" : jaTem ? "Substituir certificado" : "Enviar certificado"}
      </Btn>
    </Card>
  );
}

function ConfigFiscal({ cfg, unidadeNome, unidadeId, onSalvar }) {
  const [f, setF] = useState({
    municipio: cfg?.municipio || "", codigoMunicipio: cfg?.codigoMunicipio || "", uf: cfg?.uf || "MG", cnpj: cfg?.cnpj || "",
    inscricaoMunicipal: cfg?.inscricaoMunicipal || "", regime: cfg?.regime || "Simples Nacional",
    codigoServico: cfg?.codigoServico || "", descricaoServico: cfg?.descricaoServico || "",
    aliquotaISS: cfg?.aliquotaISS ?? 0,
    emissor: cfg?.emissor || "nacional",          // nacional (SEFIN) | bhiss (BH)
    ambiente: cfg?.ambiente || "homologacao",      // homologacao (testes) | producao
    emissaoAtiva: cfg?.emissaoAtiva ?? false,
    // NFS-e Nacional (códigos tributários — fixos por unidade)
    codigoTributacaoNacional: cfg?.codigoTributacaoNacional || "",
    codigoServicoMunicipal: cfg?.codigoServicoMunicipal || "",
    nbs: cfg?.nbs || "",
    regimeEspecial: cfg?.regimeEspecial || "nenhum",
    aliquotaSimples: cfg?.aliquotaSimples ?? 0,
    issRetido: cfg?.issRetido ?? false,
    exigibilidadeIss: cfg?.exigibilidadeIss || "exigivel",
  });
  const [maisFiscal, setMaisFiscal] = useState((cfg?.emissor || "nacional") === "nacional");
  const [salvo, setSalvo] = useState(false);
  const [testando, setTestando] = useState(false);
  const [teste, setTeste] = useState(null);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setSalvo(false); };
  const testar = () => {
    setTeste(null); setTestando(true);
    nfseApi.testar(unidadeId)
      .then((r) => setTeste(r))
      .catch((e) => setTeste({ erro: e.message }))
      .finally(() => setTestando(false));
  };

  return (
    <Card style={{ maxWidth: 620 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: C.cafePale, display: "grid", placeItems: "center" }}><Building2 size={19} color={C.cafe} /></div>
        <div>
          <div style={{ fontFamily: serif, fontSize: 18 }}>Configuração fiscal · {unidadeNome}</div>
          <div style={{ fontSize: 12, color: C.text3 }}>Dados usados na emissão das NFS-e desta unidade.</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Btn variant="ghost" onClick={() => !testando && testar()} style={{ opacity: testando ? 0.6 : 1 }}>
          <ShieldCheck size={15} /> {testando ? "Testando…" : "Testar conexão / convênio"}
        </Btn>
        <span style={{ fontSize: 11.5, color: C.text4 }}>Consulta o convênio do município e descobre o endpoint nacional — não emite nota.</span>
      </div>
      {teste && (
        <div style={{ background: C.cream2, borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 12 }}>
          {teste.erro ? (
            <div style={{ color: C.red, display: "flex", alignItems: "center", gap: 6 }}><AlertTriangle size={14} /> {teste.erro}</div>
          ) : (
            <>
              <div style={{ marginBottom: 6, color: C.text3 }}>
                Município <b>{teste.codMun}</b> · ambiente <b>{teste.ambiente}</b> · certificado {teste.temCertificado ? (teste.certificadoMtls ? "ativo (mTLS)" : "presente (PFX)") : "ausente"}
              </div>
              {(teste.resultados || []).map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderTop: i ? `1px solid ${C.border2}` : "none" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: r.status && r.status !== 0 ? (r.ok ? C.green : C.amber) : C.red }} />
                  <code style={{ fontSize: 10.5, color: C.text2, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.base}</code>
                  <b style={{ color: r.ok ? C.green : C.text3 }}>{r.status || "sem resposta"}</b>
                </div>
              ))}
              <div style={{ marginTop: 6, color: C.text4, fontSize: 11 }}>
                Verde/âmbar = o host respondeu (endpoint certo). Vermelho = não respondeu. Me mande este resultado que eu travo o host de emissão.
              </div>
            </>
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr 64px", gap: 12 }}>
        <Field label="Município"><input value={f.municipio} onChange={set("municipio")} style={inp} placeholder="Ex: Belo Horizonte" /></Field>
        <Field label="Código IBGE (cLocEmi)"><input value={f.codigoMunicipio} onChange={set("codigoMunicipio")} style={inp} placeholder="3106200" inputMode="numeric" /></Field>
        <Field label="UF"><input value={f.uf} onChange={set("uf")} style={inp} maxLength={2} /></Field>
      </div>
      <div style={{ fontSize: 11, color: C.text4, margin: "-4px 0 10px" }}>
        Código IBGE de 7 dígitos do município emissor (obrigatório no padrão nacional). Belo Horizonte = <b>3106200</b>.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Field label="CNPJ do prestador"><input value={f.cnpj} onChange={set("cnpj")} style={inp} placeholder="00.000.000/0001-00" /></Field>
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

      {/* Códigos do NFS-e Nacional (fixos por unidade) */}
      <button type="button" onClick={() => setMaisFiscal((v) => !v)}
        style={{ background: "none", border: "none", color: C.cafe, fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: "2px 0 8px" }}>
        {maisFiscal ? "− Ocultar" : "+ Mostrar"} códigos do NFS-e Nacional (com o contador)
      </button>
      {maisFiscal && (
        <div style={{ background: C.cream2, borderRadius: 12, padding: 12, marginBottom: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Cód. Tributação Nacional"><input value={f.codigoTributacaoNacional} onChange={set("codigoTributacaoNacional")} style={inp} placeholder="ex: 080101" /></Field>
            <Field label="Cód. Serviço Municipal"><input value={f.codigoServicoMunicipal} onChange={set("codigoServicoMunicipal")} style={inp} placeholder="código da prefeitura" /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Field label="NBS"><input value={f.nbs} onChange={set("nbs")} style={inp} placeholder="ex: 1.0601" /></Field>
            <Field label="Alíq. Simples (%)"><input type="number" min="0" step="0.0001" value={f.aliquotaSimples} onChange={(e) => { setF({ ...f, aliquotaSimples: +e.target.value }); setSalvo(false); }} style={inp} /></Field>
            <Field label="Regime especial">
              <select value={f.regimeEspecial} onChange={set("regimeEspecial")} style={inp}>
                {["nenhum", "Microempresa Municipal", "Estimativa", "Sociedade de Profissionais", "Cooperativa", "MEI", "ME/EPP Simples Nacional"].map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Exigibilidade do ISSQN">
              <select value={f.exigibilidadeIss} onChange={set("exigibilidadeIss")} style={inp}>
                {[["exigivel", "Exigível"], ["suspensa", "Suspensa"], ["imune", "Imune"], ["exportacao", "Exportação"], ["nao_incidencia", "Não incidência"]].map(([v, lb]) => <option key={v} value={v}>{lb}</option>)}
              </select>
            </Field>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.text2, alignSelf: "end", paddingBottom: 12, cursor: "pointer" }}>
              <input type="checkbox" checked={f.issRetido} onChange={(e) => { setF({ ...f, issRetido: e.target.checked }); setSalvo(false); }} />
              ISSQN retido pelo tomador
            </label>
          </div>
          <div style={{ fontSize: 11, color: C.text4 }}>Preencha estes códigos com o seu contador — eles são fixos para o serviço de locação/coworking e entram em todas as notas.</div>
        </div>
      )}
      <Field label="Emissor / padrão da nota">
        <div style={{ display: "flex", gap: 8 }}>
          {[["nacional", "NFS-e Nacional (padrão)"], ["bhiss", "Sistema municipal (BHISS · BH)"]].map(([v, lb]) => (
            <button key={v} type="button" onClick={() => { setF({ ...f, emissor: v }); setSalvo(false); }}
              style={{ flex: 1, padding: "10px 8px", borderRadius: 10, fontFamily: sans, fontSize: 12.5, fontWeight: 600, border: `1px solid ${f.emissor === v ? C.teal : C.border}`, background: f.emissor === v ? C.tealPale : C.white, color: f.emissor === v ? C.teal : C.text2 }}>
              {lb}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Ambiente">
        <div style={{ display: "flex", gap: 8 }}>
          {[["homologacao", "Produção restrita (testes)", C.teal], ["producao", "Produção (vale fiscalmente)", C.amber]].map(([v, lb, cor]) => (
            <button key={v} type="button" onClick={() => { setF({ ...f, ambiente: v }); setSalvo(false); }}
              style={{ flex: 1, padding: "10px 8px", borderRadius: 10, fontFamily: sans, fontSize: 12.5, fontWeight: 600, border: `1px solid ${f.ambiente === v ? cor : C.border}`, background: f.ambiente === v ? `${cor}14` : C.white, color: f.ambiente === v ? cor : C.text2 }}>
              {lb}
            </button>
          ))}
        </div>
      </Field>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: f.ambiente === "producao" ? C.amberPale : C.tealPale, border: `1px solid ${(f.ambiente === "producao" ? C.amber : C.teal)}33`, borderRadius: 10, padding: "9px 12px", fontSize: 11.5, color: C.text2, marginBottom: 12 }}>
        {f.ambiente === "producao"
          ? <><AlertTriangle size={14} color={C.amber} style={{ flexShrink: 0, marginTop: 1 }} /><span><b>Atenção:</b> em Produção as notas têm <b>valor fiscal real</b> (vão para a Receita/prefeitura). Use <b>Produção restrita</b> para testar antes — as notas de teste não têm validade fiscal.</span></>
          : <><ShieldCheck size={14} color={C.teal} style={{ flexShrink: 0, marginTop: 1 }} /><span>Em <b>Produção restrita</b> você testa a emissão ponta a ponta (assinatura, transmissão) sem gerar nota com valor fiscal. Comece sempre por aqui.</span></>}
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
