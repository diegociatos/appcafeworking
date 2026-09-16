import { useState } from "react";
import {
  Barcode, Plus, Landmark, Copy, Check, Download, XCircle, CircleDollarSign,
  QrCode, Building2, ShieldCheck, Trash2, Info, RefreshCw, Plug, CheckCircle2, ExternalLink,
} from "lucide-react";
import { Card, Badge, Btn, PageHead, Modal, Field, Empty } from "../components/ui.jsx";
import { C, serif, sans, fmt, inp } from "../lib/theme.js";
import { useStore } from "../lib/store.jsx";
import { supabaseConfigured, boletosApi } from "../lib/boletosApi.js";
import { buscarCnpj, buscarCep } from "../lib/lookup.js";
import { oauthConfigured, conectarNoBanco } from "../lib/bankOauth.js";
import { integracaoApi } from "../lib/asaasApi.js";

// Metadados dos bancos suportados
export const BANCOS = {
  inter: { label: "Banco Inter", cor: "#FF7A00", pix: true },
  itau: { label: "Itaú", cor: "#EC7000", pix: true },
  btg: { label: "BTG", cor: "#1B2A4A", pix: true },
  bradesco: { label: "Bradesco", cor: "#CC092F", pix: true },
};

const STATUS = {
  emitido: { label: "Emitido", cor: C.amber, bg: C.amberPale },
  registrado: { label: "Registrado", cor: C.blue, bg: C.bluePale },
  pago: { label: "Pago", cor: C.green, bg: C.greenPale },
  vencido: { label: "Vencido", cor: C.red, bg: C.redPale },
  cancelado: { label: "Cancelado", cor: C.text3, bg: C.cream2 },
  erro: { label: "Erro", cor: C.red, bg: C.redPale },
};

const fmtData = (d) => (d ? d.split("-").reverse().join("/") : "—");

export default function Boletos() {
  const store = useStore();
  const { activeUnit, unidadeAtiva } = store;
  const contas = store.bankAccountsDe(activeUnit);
  const boletos = store.boletosDe(activeUnit);

  const [aba, setAba] = useState("boletos");
  const [contaSel, setContaSel] = useState(contas[0]?.id || "");
  const [emitModal, setEmitModal] = useState(false);
  const [contaModal, setContaModal] = useState(null);
  const [integracao, setIntegracao] = useState(null);

  return (
    <div>
      <PageHead
        title="Boletos"
        sub={`Emissão de boletos bancários da unidade ${unidadeAtiva?.nome || ""} — pela conta do franqueado ou do franqueador.`}
        action={
          <Btn onClick={() => setEmitModal(true)} disabled={!contas.length}>
            <Plus size={16} /> Emitir boleto
          </Btn>
        }
      />

      {/* Aviso de arquitetura (segurança) */}
      <div style={{ display: "flex", gap: 9, alignItems: "flex-start", background: C.tealPale, border: `1px solid ${C.tealLine}`, borderRadius: 12, padding: "10px 14px", marginBottom: 18, fontSize: 12.5, color: C.teal }}>
        <ShieldCheck size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          {supabaseConfigured
            ? "Conectado: a emissão roda nas Edge Functions do Supabase — credenciais e certificados mTLS ficam no Vault, nunca no navegador."
            : "Modo demonstração. Em produção, a emissão ocorre nas Edge Functions do Supabase (Deno); as credenciais e certificados mTLS ficam no Vault, nunca no front-end."}
        </span>
      </div>

      {/* Seletor de conta emissora (franqueado x franqueador) */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.text4, letterSpacing: 0.4, marginBottom: 8 }}>
          CONTA EMISSORA
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {contas.map((c) => {
            const b = BANCOS[c.banco];
            const ativa = contaSel === c.id;
            return (
              <button key={c.id} onClick={() => setContaSel(c.id)} className="cw-btn"
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12,
                  border: `1.5px solid ${ativa ? b.cor : C.border}`, background: ativa ? `${b.cor}10` : C.white, textAlign: "left",
                }}>
                <span style={{ width: 30, height: 30, borderRadius: 8, background: `${b.cor}1a`, display: "grid", placeItems: "center", flexShrink: 0 }}>
                  <Landmark size={16} color={b.cor} />
                </span>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>{c.apelido}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                    <Badge color={c.tipo === "franqueador" ? C.teal : C.cafe}>{c.tipo === "franqueador" ? "Franqueador" : "Franqueado"}</Badge>
                    <span style={{ fontSize: 10.5, color: c.ambiente === "prod" ? C.green : C.amber, fontWeight: 700 }}>{c.ambiente === "prod" ? "PROD" : "SANDBOX"}</span>
                  </div>
                </div>
              </button>
            );
          })}
          <button onClick={() => setContaModal({})} className="cw-btn"
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 12, border: `1.5px dashed ${C.border}`, color: C.text3, fontWeight: 600, fontSize: 13 }}>
            <Plus size={16} /> Nova conta bancária
          </button>
        </div>
      </div>

      {/* Abas */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, borderBottom: `1px solid ${C.border2}` }}>
        {[["boletos", "Boletos emitidos"], ["contas", "Contas bancárias"]].map(([id, lb]) => (
          <button key={id} onClick={() => setAba(id)} className="cw-btn"
            style={{ padding: "9px 4px", marginRight: 14, fontSize: 14, fontWeight: 600, color: aba === id ? C.cafe : C.text3, borderBottom: `2px solid ${aba === id ? C.cafe : "transparent"}`, borderRadius: 0 }}>
            {lb}
          </button>
        ))}
      </div>

      {aba === "boletos" && (
        <ListaBoletos
          boletos={boletos}
          contas={contas}
          conectado={supabaseConfigured}
          onCancelar={(b) => store.cancelarBoleto(b.id)}
          onBaixar={(b) => store.baixarBoleto(b.id)}
          onSincronizar={(b) => store.sincronizarBoleto(b.id)}
        />
      )}
      {aba === "contas" && (
        <ListaContas contas={contas} onNova={() => setContaModal({})} onRemover={(c) => store.removeBankAccount(c.id)} onIntegracao={(c) => setIntegracao(c)} />
      )}

      {emitModal && (
        <Modal title="Emitir boleto" onClose={() => setEmitModal(false)} maxWidth={520}>
          <EmitirForm
            contas={contas}
            contaPadrao={contaSel}
            onEmitir={(dados) => { store.emitirBoleto(activeUnit, dados); setEmitModal(false); }}
          />
        </Modal>
      )}
      {contaModal && (
        <Modal title="Nova conta bancária" onClose={() => setContaModal(null)} maxWidth={520}>
          <ContaForm unidadeId={activeUnit} onSalvar={(dados) => { store.addBankAccount(activeUnit, dados); setContaModal(null); }} />
        </Modal>
      )}
      {integracao && (
        <Modal title="Integração com o banco (API)" onClose={() => setIntegracao(null)} maxWidth={540}>
          <IntegracaoBanco
            conta={contas.find((c) => c.id === integracao.id) || integracao}
            onConectar={() => store.conectarBanco(integracao.id)}
            onDesconectar={() => store.desconectarBanco(integracao.id)}
            onToggle={(patch) => store.updateBankAccount(integracao.id, patch)}
          />
        </Modal>
      )}
    </div>
  );
}

// ===========================================================================
function ListaBoletos({ boletos, contas, conectado, onCancelar, onBaixar, onSincronizar }) {
  if (!boletos.length) {
    return <Card><Empty icon={Barcode} title="Nenhum boleto emitido" sub="Clique em “Emitir boleto” para gerar o primeiro." /></Card>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {boletos.map((b) => {
        const conta = contas.find((c) => c.id === b.bankAccountId);
        const banco = BANCOS[conta?.banco] || { label: "Banco", cor: C.text3, pix: false };
        const st = STATUS[b.status] || STATUS.emitido;
        return (
          <Card key={b.id} style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", flexWrap: "wrap" }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: `${banco.cor}1a`, display: "grid", placeItems: "center", flexShrink: 0 }}>
                <Landmark size={19} color={banco.cor} />
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>{b.sacado}</div>
                <div style={{ fontSize: 11.5, color: C.text3 }}>{b.sacadoDocumento} · {banco.label} · venc. {fmtData(b.vencimento)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: serif, fontSize: 19, color: C.text }}>{fmt(b.valor)}</div>
                <Badge color={st.cor} bg={st.bg}>{st.label}</Badge>
              </div>
            </div>

            {/* Linha digitável + PIX */}
            <div style={{ padding: "0 18px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
              {b.linhaDigitavel && <CopyRow icon={Barcode} label="Linha digitável" value={b.linhaDigitavel} mono />}
              {b.pixCopiaCola && <CopyRow icon={QrCode} label="PIX copia e cola" value={b.pixCopiaCola} />}
            </div>

            {/* Ações */}
            <div style={{ display: "flex", gap: 8, padding: "12px 18px", borderTop: `1px solid ${C.border2}`, background: C.cream, flexWrap: "wrap" }}>
              <BotaoBaixar boleto={b} />
              {b.status !== "pago" && b.status !== "cancelado" && (
                <>
                  {conectado ? (
                    <button onClick={() => onSincronizar(b)} className="cw-btn" title="Consultar situação no banco"
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 9, fontSize: 13, fontWeight: 600, color: C.teal, border: `1px solid ${C.border}` }}>
                      <RefreshCw size={15} /> Atualizar status
                    </button>
                  ) : (
                    <button onClick={() => onBaixar(b)} className="cw-btn" title="Simular baixa (webhook) — modo demonstração"
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 9, fontSize: 13, fontWeight: 600, color: C.green, border: `1px solid ${C.border}` }}>
                      <CircleDollarSign size={15} /> Registrar pagamento
                    </button>
                  )}
                  <button onClick={() => onCancelar(b)} className="cw-btn"
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 9, fontSize: 13, fontWeight: 600, color: C.red, border: `1px solid ${C.border}` }}>
                    <XCircle size={15} /> Cancelar
                  </button>
                </>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function CopyRow({ icon: Icon, label, value, mono }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = () => {
    navigator.clipboard?.writeText(value).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    });
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: C.white, border: `1px solid ${C.border2}`, borderRadius: 10, padding: "8px 12px" }}>
      <Icon size={15} color={C.text3} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10.5, color: C.text4, fontWeight: 700, letterSpacing: 0.3 }}>{label.toUpperCase()}</div>
        <div style={{ fontSize: 12.5, color: C.text2, fontFamily: mono ? "monospace" : sans, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
      </div>
      <button onClick={copiar} className="cw-btn" title="Copiar" style={{ color: copiado ? C.green : C.text3, padding: 6, flexShrink: 0 }}>
        {copiado ? <Check size={16} /> : <Copy size={16} />}
      </button>
    </div>
  );
}

function BotaoBaixar({ boleto }) {
  const baixar = () => {
    if (boleto.pdfUrl) { window.open(boleto.pdfUrl, "_blank"); return; }
    // Demo: gera um comprovante .txt (em produção, pdf_url aponta pro PDF do banco no Storage).
    const txt = [
      "CafeWorking · Boleto (demonstração)",
      "----------------------------------------",
      `Sacado: ${boleto.sacado} (${boleto.sacadoDocumento})`,
      `Valor: ${fmt(boleto.valor)}`,
      `Vencimento: ${fmtData(boleto.vencimento)}`,
      `Nosso número: ${boleto.nossoNumero || "-"}`,
      `Linha digitável: ${boleto.linhaDigitavel || "-"}`,
      boleto.pixCopiaCola ? `PIX: ${boleto.pixCopiaCola}` : "",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([txt], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url; a.download = `boleto-${boleto.id}.txt`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };
  return (
    <button onClick={baixar} className="cw-btn"
      style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 9, fontSize: 13, fontWeight: 600, color: C.cafe, border: `1px solid ${C.border}` }}>
      <Download size={15} /> {boleto.pdfUrl ? "Baixar PDF" : "Comprovante"}
    </button>
  );
}

// ===========================================================================
function ListaContas({ contas, onRemover, onIntegracao }) {
  if (!contas.length) {
    return <Card><Empty icon={Landmark} title="Nenhuma conta bancária" sub="Cadastre a conta do franqueado ou do franqueador para emitir boletos." /></Card>;
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 14 }}>
      {contas.map((c) => {
        const b = BANCOS[c.banco];
        const conectado = c.conexao?.status === "conectado";
        return (
          <Card key={c.id} style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ width: 42, height: 42, borderRadius: 11, background: `${b.cor}1a`, display: "grid", placeItems: "center" }}>
                <Landmark size={20} color={b.cor} />
              </div>
              <button onClick={() => onRemover(c)} className="cw-btn" title="Remover" style={{ color: C.red, padding: 6 }}>
                <Trash2 size={15} />
              </button>
            </div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{c.apelido}</div>
            <div style={{ fontSize: 12.5, color: C.text3, marginTop: 2 }}>{b.label}{c.conta ? ` · ag ${c.agencia} · cc ${c.conta}` : ""}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              <Badge color={c.tipo === "franqueador" ? C.teal : C.cafe}>{c.tipo === "franqueador" ? "Franqueador" : "Franqueado"}</Badge>
              <Badge color={c.ambiente === "prod" ? C.green : C.amber} bg={c.ambiente === "prod" ? C.greenPale : C.amberPale}>{c.ambiente === "prod" ? "Produção" : "Sandbox"}</Badge>
              <Badge color={conectado ? C.green : C.text3} bg={conectado ? C.greenPale : C.cream2}>
                {conectado ? "● Conectado" : "○ Não conectado"}
              </Badge>
            </div>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border2}`, fontSize: 11.5, color: C.text3, flex: 1 }}>
              <div>{c.beneficiarioNome}</div>
              <div style={{ color: C.text4 }}>{c.beneficiarioDocumento}</div>
            </div>
            <Btn variant="ghost" onClick={() => onIntegracao(c)} style={{ width: "100%", justifyContent: "center", marginTop: 12 }}>
              <Plug size={15} /> Integração com o banco
            </Btn>
          </Card>
        );
      })}
    </div>
  );
}

// ===========================================================================
function Permissao({ ok, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, padding: "3px 0" }}>
      {ok ? <CheckCircle2 size={15} color={C.green} /> : <XCircle size={15} color={C.amber} />}
      <span style={{ color: ok ? C.text2 : C.text3 }}>{label}</span>
      <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, letterSpacing: 0.3, color: ok ? C.green : C.amber }}>{ok ? "VALIDADO" : "PENDENTE"}</span>
    </div>
  );
}

function Switch({ on, onClick, label, sub }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "9px 0" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{label}</div>
        {sub && <div style={{ fontSize: 11.5, color: C.text4 }}>{sub}</div>}
      </div>
      <button onClick={onClick} title={on ? "Ativado" : "Desativado"} style={{ width: 42, height: 24, borderRadius: 20, background: on ? C.green : C.gray, position: "relative", flexShrink: 0, transition: "all .2s" }}>
        <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "all .2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
      </button>
    </div>
  );
}

function IntegracaoBanco({ conta, onConectar, onDesconectar, onToggle }) {
  const b = BANCOS[conta.banco] || { label: "Banco", cor: C.text3, pix: false };
  const cx = conta.conexao || { status: "desconectado" };
  const conectado = cx.status === "conectado";
  // Inter/Itaú/Bradesco usam client_credentials + certificado (mTLS): NÃO há
  // tela de consentimento/redirect — as credenciais (Client ID/Secret + cert/
  // chave) são cadastradas ao criar/editar a conta e ficam no cofre (Vault).
  // Só o BTG usa o fluxo OAuth de consentimento (Open Finance).
  const mtls = conta.banco !== "btg";
  const usaOAuth = !mtls && oauthConfigured(conta.banco);
  const [testando, setTestando] = useState(false);
  const [resultado, setResultado] = useState(null); // { ok, detalhe }
  const conectar = () => {
    if (usaOAuth) { conectarNoBanco(conta.banco, conta.id); return; } // BTG: redireciona ao consentimento
    if (mtls && boletosApi.configured) {
      setTestando(true); setResultado(null);
      boletosApi.testar(conta.id)
        .then((r) => { setResultado(r); if (r?.ok) onConectar(); })
        .catch((e) => setResultado({ ok: false, detalhe: e.message }))
        .finally(() => setTestando(false));
      return;
    }
    onConectar(); // demo (sem backend): simula validado
  };
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <span style={{ width: 44, height: 44, borderRadius: 11, background: `${b.cor}1a`, display: "grid", placeItems: "center" }}><Landmark size={22} color={b.cor} /></span>
        <div>
          <div style={{ fontFamily: serif, fontSize: 18 }}>{conta.apelido}</div>
          <div style={{ fontSize: 12, color: C.text3 }}>{b.label}{conta.conta ? ` · ag ${conta.agencia} · cc ${conta.conta}` : ""}</div>
        </div>
      </div>

      <div style={{ background: C.cream, borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, letterSpacing: 0.4, marginBottom: 6 }}>PERMISSÕES NO BANCO</div>
        <Permissao ok={cx.boleto} label="Boletos — consultar e emitir" />
        {b.pix !== false && <Permissao ok={cx.pix} label="PIX Cobrança — consultar e emitir" />}
        <div style={{ fontSize: 11.5, color: conectado ? C.green : C.text3, marginTop: 8 }}>
          {conectado
            ? `✓ ${mtls ? "Credenciais validadas" : "Conta conectada"}${cx.conectadoEm ? ` em ${cx.conectadoEm.split("-").reverse().join("/")}` : ""}.`
            : mtls ? "Credenciais ainda não validadas — cadastre Client ID/Secret + certificado ao editar a conta." : "Conta ainda não autorizada — conecte para emitir cobranças."}
        </div>
      </div>

      {conectado ? (
        <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
          <Btn variant="ghost" onClick={conectar} disabled={testando} style={{ flex: 1, justifyContent: "center", opacity: testando ? 0.6 : 1 }}><RefreshCw size={15} /> {testando ? "Testando…" : mtls ? "Testar conexão" : "Reconectar"}</Btn>
          <Btn variant="ghost" onClick={onDesconectar} style={{ color: C.red, borderColor: C.redPale }}>Desconectar</Btn>
        </div>
      ) : (
        <Btn onClick={conectar} disabled={testando} style={{ width: "100%", justifyContent: "center", background: b.cor, marginBottom: 6, opacity: testando ? 0.6 : 1 }}>
          {testando ? <><RefreshCw size={16} /> Testando…</> : mtls ? <><RefreshCw size={16} /> Validar credenciais</> : <><ExternalLink size={16} /> Conectar com o {b.label}</>}
        </Btn>
      )}

      {resultado && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: resultado.ok ? C.greenPale : C.redPale, color: resultado.ok ? C.green : C.red, borderRadius: 10, padding: "9px 12px", fontSize: 12, marginBottom: 6 }}>
          {resultado.ok ? <CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: 1 }} /> : <XCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />}
          <span>{resultado.ok ? (resultado.detalhe || "Conexão validada com sucesso.") : `Falha: ${resultado.detalhe || "credenciais inválidas ou não cadastradas."}`}</span>
        </div>
      )}

      <div style={{ borderTop: `1px solid ${C.border2}`, marginTop: 12, paddingTop: 4 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, letterSpacing: 0.4, margin: "6px 0" }}>INTEGRAÇÕES AUTOMÁTICAS</div>
        <Switch on={conta.autoRegistrar !== false} onClick={() => onToggle({ autoRegistrar: !(conta.autoRegistrar !== false) })} label="Registrar automaticamente os boletos gerados" sub="Cada boleto é registrado no banco na hora da emissão." />
        {b.pix !== false && <Switch on={conta.gerarPix !== false} onClick={() => onToggle({ gerarPix: !(conta.gerarPix !== false) })} label="Gerar boletos de cobrança com PIX" sub="Boleto híbrido (boleto + PIX no mesmo documento)." />}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: C.tealPale, borderRadius: 10, padding: "9px 12px", fontSize: 11.5, color: C.teal, marginTop: 14 }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>{mtls
          ? `O ${b.label} usa Client ID/Secret + certificado (mTLS) — não há tela de consentimento. As credenciais são cadastradas ao criar/editar esta conta e ficam guardadas no cofre (Vault). Ambiente Produção exige credenciais geradas no Internet Banking PJ real.`
          : usaOAuth
            ? `Ao conectar, você vai para o ${b.label} autorizar o CafeWorking (Boletos${b.pix !== false ? " + PIX" : ""}) — igual ao consentimento do Open Finance.`
            : `Demonstração. Em produção, o ${b.label} abre a tela de consentimento (app parceiro: client_id + redirect aprovados).`}</span>
      </div>
    </>
  );
}

// ===========================================================================
function EmitirForm({ contas, contaPadrao, onEmitir }) {
  const [f, setF] = useState({
    bankAccountId: contaPadrao || contas[0]?.id || "",
    sacado: "",
    sacadoDocumento: "",
    email: "",
    cep: "", logradouro: "", numero: "", bairro: "", cidade: "", uf: "",
    valor: "",
    vencimento: "",
    instrucoes: "",
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const [buscando, setBuscando] = useState(false);
  const [erroBusca, setErroBusca] = useState("");
  const valido = f.bankAccountId && f.sacado.trim() && f.sacadoDocumento.trim() && +f.valor > 0 && f.vencimento;

  // Busca dados da empresa pelo CNPJ (14 dígitos) e preenche sacado/e-mail/endereço.
  const buscarDoc = (v) => {
    const doc = String(v || "").replace(/\D/g, "");
    if (doc.length !== 14) { setErroBusca("Informe um CNPJ com 14 dígitos para buscar."); return; }
    setErroBusca(""); setBuscando(true);
    buscarCnpj(v).then((r) => {
      if (!r) { setErroBusca("CNPJ não encontrado."); return; }
      setF((p) => ({
        ...p,
        sacado: r.razaoSocial || r.nomeFantasia || p.sacado,
        email: p.email || r.email || "",
        cep: p.cep || r.cep || "",
        logradouro: p.logradouro || r.logradouro || "",
        numero: p.numero || r.numero || "",
        bairro: p.bairro || r.bairro || "",
        cidade: p.cidade || r.municipio || "",
        uf: p.uf || r.uf || "",
      }));
    }).catch(() => setErroBusca("Não foi possível buscar agora.")).finally(() => setBuscando(false));
  };
  const onDoc = (e) => { const v = e.target.value; setF((p) => ({ ...p, sacadoDocumento: v })); if (v.replace(/\D/g, "").length === 14) buscarDoc(v); };
  const onCep = (e) => {
    const v = e.target.value; setF((p) => ({ ...p, cep: v }));
    if (v.replace(/\D/g, "").length === 8) { setBuscando(true); buscarCep(v).then((r) => { if (r) setF((p) => ({ ...p, logradouro: p.logradouro || r.logradouro || "", bairro: p.bairro || r.bairro || "", cidade: p.cidade || r.cidade || "", uf: p.uf || r.uf || "" })); }).finally(() => setBuscando(false)); }
  };

  return (
    <>
      <Field label="Conta emissora">
        <select value={f.bankAccountId} onChange={set("bankAccountId")} style={inp}>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>{c.apelido} · {c.tipo === "franqueador" ? "Franqueador" : "Franqueado"}</option>
          ))}
        </select>
      </Field>
      <Field label="CPF / CNPJ do sacado">
        <div style={{ display: "flex", gap: 6 }}>
          <input value={f.sacadoDocumento} onChange={onDoc} style={{ ...inp, flex: 1 }} placeholder="000.000.000-00" inputMode="numeric" />
          <button type="button" onClick={() => buscarDoc(f.sacadoDocumento)} disabled={buscando} className="cw-btn" style={{ padding: "0 14px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.cafePale, color: C.cafe, fontWeight: 600, fontSize: 12.5, whiteSpace: "nowrap", opacity: buscando ? 0.6 : 1 }}>{buscando ? "…" : "Buscar"}</button>
        </div>
        {erroBusca && <div style={{ fontSize: 11.5, color: C.red, marginTop: 4 }}>{erroBusca}</div>}
      </Field>
      <Field label="Sacado (pagador)">
        <input value={f.sacado} onChange={set("sacado")} style={inp} placeholder="Nome ou razão social" />
      </Field>
      <Field label="E-mail do sacado">
        <input type="email" value={f.email} onChange={set("email")} style={inp} placeholder="contato@empresa.com.br" />
        <div style={{ fontSize: 11, color: C.text4, marginTop: 4 }}>O boleto é enviado para este e-mail.</div>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 0.8fr", gap: 12 }}>
        <Field label="CEP"><input value={f.cep} onChange={onCep} style={inp} placeholder="00000-000" inputMode="numeric" /></Field>
        <Field label="Endereço"><input value={f.logradouro} onChange={set("logradouro")} style={inp} placeholder="Rua / Av." /></Field>
        <Field label="Número"><input value={f.numero} onChange={set("numero")} style={inp} placeholder="Nº" /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.4fr 0.6fr", gap: 12 }}>
        <Field label="Bairro"><input value={f.bairro} onChange={set("bairro")} style={inp} placeholder="Bairro" /></Field>
        <Field label="Cidade"><input value={f.cidade} onChange={set("cidade")} style={inp} placeholder="Cidade" /></Field>
        <Field label="UF"><input value={f.uf} onChange={set("uf")} style={inp} placeholder="UF" maxLength={2} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Valor (R$)">
          <input type="number" min="0" step="0.01" value={f.valor} onChange={set("valor")} style={inp} placeholder="0,00" />
        </Field>
        <Field label="Vencimento">
          <input type="date" value={f.vencimento} onChange={set("vencimento")} style={inp} />
        </Field>
      </div>
      <Field label="Instruções (opcional)">
        <input value={f.instrucoes} onChange={set("instrucoes")} style={inp} placeholder="Ex: Mensalidade sala privativa - Junho" />
      </Field>
      <Btn style={{ width: "100%", justifyContent: "center", marginTop: 4, opacity: valido ? 1 : 0.5 }}
        onClick={() => valido && onEmitir({ ...f, valor: +f.valor, sacadoEmail: f.email, sacadoCep: f.cep, sacadoLogradouro: f.logradouro, sacadoNumero: f.numero, sacadoBairro: f.bairro, sacadoCidade: f.cidade, sacadoUf: f.uf })}>
        <Barcode size={16} /> Emitir boleto
      </Btn>
    </>
  );
}

// ===========================================================================
function ContaForm({ onSalvar, unidadeId }) {
  const [f, setF] = useState({
    banco: "inter",
    tipo: "franqueado",
    ambiente: "sandbox",
    apelido: "",
    beneficiarioNome: "",
    beneficiarioDocumento: "",
    pixChave: "",
    clientId: "",
    clientSecret: "",
    certPem: "",
    keyPem: "",
    certNome: "", keyNome: "",
    formatoCert: "separado", // separado (.crt + .key) | pfx (.pfx/.p12 com senha)
    pfxBase64: "", pfxNome: "", pfxSenha: "",
    colar: false,
  });
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const mtls = f.banco !== "btg"; // Inter/Itaú/Bradesco exigem certificado mTLS
  const certOk = !mtls || (f.formatoCert === "pfx" ? Boolean(f.pfxBase64) : Boolean(f.certPem.trim() && f.keyPem.trim()));
  const valido = f.apelido.trim() && f.clientId.trim() && f.clientSecret.trim() && certOk;

  // Lê o arquivo anexado. .crt/.cer/.pem/.key viram texto PEM (DER binário é convertido); .pfx vira base64.
  const lerArquivo = async (arquivo, tipo) => {
    setErro(null);
    if (!arquivo) return;
    if (arquivo.size > 200_000) { setErro("Arquivo grande demais para um certificado (máx. 200 KB)."); return; }
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const base64 = () => { let s = ""; bytes.forEach((b) => { s += String.fromCharCode(b); }); return btoa(s); };
    if (tipo === "pfx") { setF((p) => ({ ...p, pfxBase64: base64(), pfxNome: arquivo.name })); return; }
    const texto = new TextDecoder().decode(bytes);
    if (tipo === "cert") {
      const pem = texto.includes("BEGIN CERTIFICATE")
        ? texto.trim()
        : `-----BEGIN CERTIFICATE-----\n${base64().match(/.{1,64}/g).join("\n")}\n-----END CERTIFICATE-----`;
      setF((p) => ({ ...p, certPem: pem, certNome: arquivo.name }));
    } else {
      if (!/BEGIN (RSA |EC |ENCRYPTED )?PRIVATE KEY/.test(texto)) { setErro("Esse arquivo não parece uma chave privada (.key ou .pem)."); return; }
      setF((p) => ({ ...p, keyPem: texto.trim(), keyNome: arquivo.name }));
    }
  };

  const salvar = () => {
    setErro(null);
    if (!valido) return;
    const ref = `${f.banco}_${unidadeId}`;
    const dados = {
      banco: f.banco, tipo: f.tipo, ambiente: f.ambiente, apelido: f.apelido,
      beneficiarioNome: f.beneficiarioNome, beneficiarioDocumento: f.beneficiarioDocumento,
      pixChave: f.pixChave, credenciaisRef: ref,
    };
    if (!integracaoApi.configured) { onSalvar(dados); return; }
    setBusy(true);
    integracaoApi.salvarBanco(unidadeId, f.banco, {
      client_id: f.clientId.trim(), client_secret: f.clientSecret.trim(),
      ...(mtls && f.formatoCert === "pfx"
        ? { pfx_base64: f.pfxBase64, pfx_senha: f.pfxSenha }
        : { cert_pem: f.certPem.trim() || undefined, key_pem: f.keyPem.trim() || undefined }),
    })
      .then(() => onSalvar(dados))
      .catch((e) => setErro(e.message))
      .finally(() => setBusy(false));
  };

  return (
    <>
      <Field label="Banco">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {Object.entries(BANCOS).map(([id, b]) => (
            <button key={id} type="button" onClick={() => setF({ ...f, banco: id })}
              style={{ flex: "1 1 45%", padding: "10px 0", borderRadius: 10, fontFamily: sans, fontSize: 13.5, fontWeight: 600, border: `1.5px solid ${f.banco === id ? b.cor : C.border}`, background: f.banco === id ? `${b.cor}12` : C.white, color: f.banco === id ? b.cor : C.text2 }}>
              {b.label}
            </button>
          ))}
        </div>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Titular">
          <select value={f.tipo} onChange={set("tipo")} style={inp}>
            <option value="franqueado">Franqueado (coworking)</option>
            <option value="franqueador">Franqueador (plataforma)</option>
          </select>
        </Field>
        <Field label="Ambiente">
          <select value={f.ambiente} onChange={set("ambiente")} style={inp}>
            <option value="sandbox">Sandbox (homologação)</option>
            <option value="prod">Produção</option>
          </select>
        </Field>
      </div>
      <Field label="Apelido da conta">
        <input value={f.apelido} onChange={set("apelido")} style={inp} placeholder="Ex: Inter · Grupo Ciatos" />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Beneficiário (cedente)">
          <input value={f.beneficiarioNome} onChange={set("beneficiarioNome")} style={inp} placeholder="Razão social" />
        </Field>
        <Field label="CNPJ do beneficiário">
          <input value={f.beneficiarioDocumento} onChange={set("beneficiarioDocumento")} style={inp} placeholder="00.000.000/0001-00" />
        </Field>
      </div>
      {BANCOS[f.banco]?.pix && (
        <Field label="Chave PIX (boleto híbrido)">
          <input value={f.pixChave} onChange={set("pixChave")} style={inp} placeholder="email@empresa.com / CNPJ" />
        </Field>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Client ID (do banco)">
          <input value={f.clientId} onChange={set("clientId")} style={inp} placeholder="client_id" autoComplete="off" />
        </Field>
        <Field label="Client Secret">
          <input type="password" value={f.clientSecret} onChange={set("clientSecret")} style={inp} placeholder="••••••••" autoComplete="off" />
        </Field>
      </div>
      {mtls && (
        <>
          <Field label="Certificado do banco (obrigatório para Inter, Itaú e Bradesco)">
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              {[["separado", "Arquivos .crt e .key"], ["pfx", "Arquivo .pfx / .p12"]].map(([v, lb]) => (
                <button key={v} type="button" onClick={() => setF({ ...f, formatoCert: v })}
                  style={{ flex: 1, padding: "9px 0", borderRadius: 10, fontFamily: sans, fontSize: 13, fontWeight: 600, border: `1.5px solid ${f.formatoCert === v ? C.teal : C.border}`, background: f.formatoCert === v ? C.tealPale : C.white, color: f.formatoCert === v ? C.teal : C.text2 }}>
                  {lb}
                </button>
              ))}
            </div>
            {f.formatoCert === "pfx" ? (
              <div style={{ display: "grid", gap: 10 }}>
                <AnexoCertificado rotulo="Anexar o arquivo .pfx / .p12" accept=".pfx,.p12,application/x-pkcs12" nome={f.pfxNome} onArquivo={(a) => lerArquivo(a, "pfx")} />
                <input type="password" value={f.pfxSenha} onChange={set("pfxSenha")} style={inp} placeholder="Senha do certificado" autoComplete="new-password" />
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                <AnexoCertificado rotulo="Anexar certificado (.crt, .cer ou .pem)" accept=".crt,.cer,.pem,application/x-x509-ca-cert" nome={f.certNome} onArquivo={(a) => lerArquivo(a, "cert")} />
                <AnexoCertificado rotulo="Anexar chave privada (.key ou .pem)" accept=".key,.pem" nome={f.keyNome} onArquivo={(a) => lerArquivo(a, "key")} />
                <button type="button" onClick={() => setF({ ...f, colar: !f.colar })} style={{ fontSize: 12.5, color: C.teal, fontWeight: 600, textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                  {f.colar ? "Esconder campos de texto" : "Prefere colar o conteúdo do certificado?"}
                </button>
                {f.colar && (
                  <>
                    <textarea value={f.certPem} onChange={(e) => setF({ ...f, certPem: e.target.value, certNome: "" })} rows={2} style={{ ...inp, resize: "vertical", fontFamily: "monospace", fontSize: 11 }} placeholder="-----BEGIN CERTIFICATE-----" />
                    <textarea value={f.keyPem} onChange={(e) => setF({ ...f, keyPem: e.target.value, keyNome: "" })} rows={2} style={{ ...inp, resize: "vertical", fontFamily: "monospace", fontSize: 11 }} placeholder="-----BEGIN PRIVATE KEY-----" />
                  </>
                )}
              </div>
            )}
            <div style={{ fontSize: 12, color: C.text3, marginTop: 8 }}>
              O Inter entrega o certificado de integração num .zip com os arquivos .crt e .key. Anexe os dois.
            </div>
          </Field>
        </>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: C.tealPale, borderRadius: 10, padding: "9px 12px", fontSize: 11.5, color: C.teal, marginBottom: 12 }}>
        <ShieldCheck size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>As credenciais são enviadas direto ao backend e guardadas <b>criptografadas no cofre</b> — não ficam no navegador. <b>Dica:</b> para receber por cartão/PIX/boleto sem parceria bancária, use a aba <b>Cobranças (Asaas)</b>.</span>
      </div>
      {erro && <div style={{ fontSize: 12.5, color: C.red, marginBottom: 10 }}>{erro}</div>}
      <Btn style={{ width: "100%", justifyContent: "center", opacity: (valido && !busy) ? 1 : 0.5 }} onClick={() => !busy && salvar()}>
        <Building2 size={16} /> {busy ? "Salvando…" : "Cadastrar conta"}
      </Btn>
    </>
  );
}

// Botão de anexo do certificado: mostra o nome do arquivo escolhido.
function AnexoCertificado({ rotulo, accept, nome, onArquivo }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: `1.5px dashed ${nome ? C.teal : C.border}`, background: nome ? C.tealPale : C.white, cursor: "pointer", fontSize: 13, color: nome ? C.teal : C.text2 }}>
      {nome ? <CheckCircle2 size={16} /> : <Plus size={16} />}
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nome ? `${nome} · trocar` : rotulo}</span>
      <input type="file" accept={accept} style={{ display: "none" }} onChange={(e) => { onArquivo(e.target.files?.[0]); e.target.value = ""; }} />
    </label>
  );
}
