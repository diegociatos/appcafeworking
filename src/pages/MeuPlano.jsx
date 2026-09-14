import { useEffect, useRef, useState } from "react";
import { FileText, Upload, ExternalLink, Download, AlertTriangle, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Card, Badge, Btn, PageHead, Modal, Empty } from "../components/ui.jsx";
import { C, serif, fmt, inp } from "../lib/theme.js";
import { assinaturasApi, STATUS_ASSINATURA, STATUS_DOCUMENTOS, dataBR } from "../lib/assinaturasApi.js";

const STATUS_COBRANCA = {
  pendente: ["A vencer", C.amber], pago: ["Paga", C.green], vencido: ["Vencida", C.red],
  cancelado: ["Cancelada", C.text3], estornado: ["Estornada", C.text3],
};

// Área do cliente: o plano contratado, faturas, contrato aceito, documentos e cancelamento.
export default function MeuPlano() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);

  const carregar = () => {
    setCarregando(true);
    setErro("");
    assinaturasApi.minhaAssinatura()
      .then(setDados)
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  };
  useEffect(carregar, []);

  return (
    <div>
      <PageHead title="Meu plano" sub="Situação do plano, faturas, contrato e documentos." />
      {carregando && !dados && <Card><div style={{ color: C.text3, fontSize: 14 }}><Loader2 size={16} className="cw-spin" /> Carregando…</div></Card>}
      {erro && <Card><div role="alert" style={{ color: C.red, fontSize: 14 }}>{erro}</div></Card>}
      {dados && (
        <>
          {dados.pendentes.map((p, i) => (
            <Card key={`p${i}`} style={{ marginBottom: 16, borderLeft: `3px solid ${C.amber}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{p.plano_nome} · aguardando pagamento</div>
                  <div style={{ fontSize: 13, color: C.text3 }}>{fmt(p.valor)} · pedido em {dataBR(p.created_at)}. O plano ativa assim que o pagamento confirmar.</div>
                </div>
                {p.invoice_url && <a href={p.invoice_url} target="_blank" rel="noreferrer"><Btn variant="teal"><ExternalLink size={15} /> Pagar</Btn></a>}
              </div>
            </Card>
          ))}
          {!dados.assinaturas.length && !dados.pendentes.length && (
            <Card><Empty icon={FileText} title="Nenhum plano contratado pelo site" sub="Planos contratados na recepção aparecem em Faturas. Para contratar online, acesse cafeworking.com.br." /></Card>
          )}
          {dados.assinaturas.map((a) => (
            <Assinatura key={a.id} a={a} tipos={dados.tipos_documento} onMudou={carregar} />
          ))}
        </>
      )}
    </div>
  );
}

function Assinatura({ a, tipos, onMudou }) {
  const [cancelar, setCancelar] = useState(false);
  const st = STATUS_ASSINATURA[a.status] || { rotulo: a.status, cor: "text3" };
  const ativa = ["ativa", "inadimplente"].includes(a.status);

  return (
    <Card style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontFamily: serif, fontSize: 24 }}>{a.plano_nome}</div>
          <div style={{ fontSize: 13, color: C.text3 }}>{a.unidade ? `Unidade ${a.unidade} · ` : ""}desde {dataBR(a.inicio)}</div>
        </div>
        <Badge color={C[st.cor]}>{st.rotulo}</Badge>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, margin: "18px 0" }}>
        <Info rotulo={a.recorrencia === "anual" ? "Valor anual" : "Mensalidade"} valor={fmt(a.valor)} />
        {ativa && a.proxima_cobranca && <Info rotulo={a.recorrencia === "anual" ? "Renovação" : "Próxima cobrança"} valor={dataBR(a.proxima_cobranca)} />}
        {a.fidelidade_ate && <Info rotulo="Fidelidade até" valor={dataBR(a.fidelidade_ate)} />}
        {a.status === "cancelando" && <Info rotulo="Encerra em" valor={dataBR(a.cancela_em)} destaque />}
        {a.status === "cancelada" && <Info rotulo="Cancelada em" valor={dataBR(a.cancelada_em)} />}
      </div>

      {a.status === "inadimplente" && (
        <Aviso cor={C.red}>Há uma fatura em atraso. Pague abaixo para manter o plano ativo.</Aviso>
      )}
      {a.status === "cancelando" && (
        <Aviso cor={C.amber}>
          O cancelamento foi pedido e o plano segue ativo até {dataBR(a.cancela_em)}.
          {a.requer_acerto ? " A equipe vai enviar o cálculo do acerto previsto no contrato." : ""}
          {a.categoria === "endereco_fiscal" ? " Lembre de trocar o endereço da empresa nos órgãos em até 30 dias do encerramento." : ""}
        </Aviso>
      )}

      {a.docs_status && a.status !== "cancelada" && <Documentos a={a} tipos={tipos} onMudou={onMudou} />}

      <Secao titulo="Faturas">
        {a.cobrancas.length === 0 ? (
          <div style={{ fontSize: 13, color: C.text3 }}>Nenhuma fatura registrada ainda.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr style={{ textAlign: "left", color: C.text3 }}>
                  <th style={th}>Vencimento</th><th style={th}>Valor</th><th style={th}>Situação</th><th style={th} />
                </tr>
              </thead>
              <tbody>
                {a.cobrancas.map((c) => {
                  const [rot, cor] = STATUS_COBRANCA[c.status] || [c.status, C.text3];
                  return (
                    <tr key={c.id} style={{ borderTop: `1px solid ${C.border2}` }}>
                      <td style={td}>{dataBR(c.vencimento)}</td>
                      <td style={td}>{fmt(c.valor)}</td>
                      <td style={td}><Badge color={cor}>{rot}</Badge></td>
                      <td style={{ ...td, textAlign: "right" }}>
                        {c.invoice_url && ["pendente", "vencido"].includes(c.status) && (
                          <a href={c.invoice_url} target="_blank" rel="noreferrer" style={{ color: C.teal, fontWeight: 600 }}>Pagar</a>
                        )}
                        {c.invoice_url && c.status === "pago" && (
                          <a href={c.invoice_url} target="_blank" rel="noreferrer" style={{ color: C.text3 }}>Recibo</a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      {a.contrato && <Contrato c={a.contrato} />}

      {ativa && (
        <div style={{ borderTop: `1px solid ${C.border2}`, marginTop: 18, paddingTop: 14, textAlign: "right" }}>
          <Btn variant="ghost" onClick={() => setCancelar(true)} style={{ color: C.red }}>Cancelar plano</Btn>
        </div>
      )}
      {cancelar && <CancelarModal a={a} onFechar={() => setCancelar(false)} onFeito={() => { setCancelar(false); onMudou(); }} />}
    </Card>
  );
}

function Documentos({ a, tipos, onMudou }) {
  const [enviando, setEnviando] = useState("");
  const [erro, setErro] = useState("");
  const inputs = useRef({});
  const st = STATUS_DOCUMENTOS[a.docs_status];
  const podeEnviar = a.docs_status !== "aprovado";

  const enviar = async (tipo, arquivo) => {
    if (!arquivo) return;
    setErro("");
    setEnviando(tipo);
    try {
      await assinaturasApi.enviarDocumento(a.id, tipo, arquivo);
      onMudou();
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando("");
      if (inputs.current[tipo]) inputs.current[tipo].value = "";
    }
  };

  return (
    <Secao titulo="Documentos do endereço fiscal" extra={st && <Badge color={C[st.cor]}>{st.rotulo}</Badge>}>
      {a.docs_status === "pendente" && (
        <p style={{ fontSize: 13, color: C.text2, margin: "0 0 12px" }}>
          Envie em PDF, JPG ou PNG (até 8 MB). Empresa já aberta: cartão CNPJ, ato constitutivo e documento dos sócios.
          Empresa a abrir: documento e comprovante de residência dos futuros sócios. A conferência leva até 5 dias úteis.
        </p>
      )}
      {a.docs_status === "enviado" && <p style={{ fontSize: 13, color: C.text2, margin: "0 0 12px" }}>Recebemos seus documentos e estamos conferindo. Você pode enviar mais algum, se faltar.</p>}
      {a.docs_parecer && <Aviso cor={a.docs_status === "aprovado" ? C.green : C.amber}>{a.docs_parecer}</Aviso>}

      {podeEnviar && (
        <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
          {Object.entries(tipos).map(([tipo, rotulo]) => (
            <div key={tipo} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 11, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13.5 }}>{rotulo}</span>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: C.teal, cursor: enviando ? "progress" : "pointer" }}>
                {enviando === tipo ? <><Loader2 size={14} className="cw-spin" /> Enviando…</> : <><Upload size={14} /> Enviar arquivo</>}
                <input
                  ref={(el) => { inputs.current[tipo] = el; }}
                  type="file" accept="application/pdf,image/jpeg,image/png" hidden disabled={!!enviando}
                  onChange={(e) => enviar(tipo, e.target.files?.[0])}
                  aria-label={`Enviar ${rotulo}`}
                />
              </label>
            </div>
          ))}
        </div>
      )}
      {erro && <div role="alert" style={{ fontSize: 13, color: C.red, marginBottom: 10 }}>{erro}</div>}

      {a.documentos.length > 0 && (
        <div style={{ fontSize: 13 }}>
          <div style={{ color: C.text3, marginBottom: 6 }}>Enviados</div>
          {a.documentos.map((d) => (
            <div key={d.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0", borderTop: `1px solid ${C.border2}` }}>
              <span>{tipos[d.tipo] || d.tipo} · {d.nome_arquivo}</span>
              <span style={{ color: C.text3 }}>
                {dataBR(d.created_at)}{d.url && <> · <a href={d.url} target="_blank" rel="noreferrer" style={{ color: C.teal }}>abrir</a></>}
              </span>
            </div>
          ))}
        </div>
      )}
    </Secao>
  );
}

function Contrato({ c }) {
  const baixar = () => {
    const texto = `${c.corpo}\n\n---\nVersão ${c.versao} · aceito em ${new Date(c.aceito_em).toLocaleString("pt-BR")}\nCódigo de integridade (SHA-256): ${c.hash}\n`;
    const url = URL.createObjectURL(new Blob([texto], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `contrato-cafeworking-v${c.versao}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Secao titulo="Contrato">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 13, color: C.text2 }}>{c.titulo} · versão {c.versao} · aceito em {new Date(c.aceito_em).toLocaleString("pt-BR")}</div>
        <Btn variant="ghost" onClick={baixar} style={{ fontSize: 13, padding: "7px 12px" }}><Download size={14} /> Baixar cópia</Btn>
      </div>
      <details>
        <summary style={{ cursor: "pointer", fontSize: 13, color: C.teal, fontWeight: 600 }}>Ler o contrato</summary>
        <div style={{ whiteSpace: "pre-wrap", maxHeight: 360, overflow: "auto", fontSize: 12.5, lineHeight: 1.65, color: C.text2, marginTop: 10, padding: 12, background: C.cream, borderRadius: 10 }}>{c.corpo}</div>
        <div style={{ fontSize: 11, color: C.text4, marginTop: 6, wordBreak: "break-all" }}>Código de integridade: {c.hash}</div>
      </details>
    </Secao>
  );
}

function CancelarModal({ a, onFechar, onFeito }) {
  const sim = a.cancelamento_se_pedir_hoje;
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [feito, setFeito] = useState(null);

  const confirmar = async () => {
    setEnviando(true);
    setErro("");
    try {
      setFeito(await assinaturasApi.cancelar(a.id, motivo));
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

  if (feito) {
    return (
      <Modal title="Pedido registrado" onClose={onFeito} maxWidth={460}>
        <div style={{ display: "flex", gap: 10, fontSize: 14, lineHeight: 1.6, color: C.text2 }}>
          <CheckCircle2 size={20} color={C.green} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            {feito.tipo === "arrependimento"
              ? `Plano cancelado. ${feito.reembolso === "manual" ? "A equipe vai entrar em contato para fazer a devolução." : "A devolução integral foi solicitada e aparece em até 10 dias úteis."}`
              : `Cancelamento agendado. O plano segue ativo até ${dataBR(feito.cancela_em)}.`}
            {" "}Enviamos a confirmação por e-mail.
          </div>
        </div>
        <Btn style={{ width: "100%", marginTop: 18 }} onClick={onFeito}>Fechar</Btn>
      </Modal>
    );
  }

  return (
    <Modal title={`Cancelar ${a.plano_nome}`} onClose={onFechar} maxWidth={480}>
      <div style={{ fontSize: 14, lineHeight: 1.6, color: C.text2 }}>
        {sim?.tipo === "arrependimento" ? (
          <p style={{ marginTop: 0 }}>Você está no prazo de arrependimento de 7 dias. O plano é cancelado <b>agora</b> e o valor pago é <b>devolvido integralmente</b>.</p>
        ) : (
          <p style={{ marginTop: 0 }}>Pelo contrato, o cancelamento tem <b>aviso prévio de 30 dias</b>. O plano segue ativo até <b>{dataBR(sim?.cancelaEm)}</b>{a.recorrencia === "mensal" ? ", e as mensalidades que vencerem até lá continuam devidas" : ""}.</p>
        )}
        {sim?.requerAcerto && (
          <Aviso cor={C.amber}>
            <AlertTriangle size={14} style={{ verticalAlign: "-2px" }} />{" "}
            {sim.motivoAcerto === "anual"
              ? "No plano anual, a equipe calcula a devolução proporcional (valor pago menos o preço mensal cheio de cada mês usado)."
              : `Seu plano tem fidelidade até ${dataBR(a.fidelidade_ate)}. A equipe vai enviar o cálculo da multa prevista no contrato.`}
          </Aviso>
        )}
        {a.categoria === "endereco_fiscal" && (
          <p>Depois do encerramento, você tem 30 dias para trocar o endereço da empresa na Receita, na Junta Comercial e na Prefeitura.</p>
        )}
        <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: C.text3, margin: "12px 0 6px" }} htmlFor="motivo-cancelamento">Quer contar o motivo? (opcional)</label>
        <textarea id="motivo-cancelamento" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={500} style={{ ...inp, height: "auto", resize: "vertical" }} />
        {erro && <div role="alert" style={{ color: C.red, fontSize: 13, marginTop: 10 }}><XCircle size={14} style={{ verticalAlign: "-2px" }} /> {erro}</div>}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <Btn variant="ghost" style={{ flex: 1 }} onClick={onFechar} disabled={enviando}>Voltar</Btn>
        <Btn style={{ flex: 1, background: C.red, boxShadow: "none" }} onClick={confirmar} disabled={enviando}>
          {enviando ? <><Loader2 size={15} className="cw-spin" /> Enviando…</> : "Confirmar cancelamento"}
        </Btn>
      </div>
    </Modal>
  );
}

const th = { padding: "6px 8px", fontWeight: 600, fontSize: 12 };
const td = { padding: "8px" };

function Info({ rotulo, valor, destaque }) {
  return (
    <div style={{ background: destaque ? C.amberPale : C.cream, borderRadius: 12, padding: "10px 14px" }}>
      <div style={{ fontSize: 11.5, color: C.text3 }}>{rotulo}</div>
      <div style={{ fontFamily: serif, fontSize: 19, marginTop: 2 }}>{valor}</div>
    </div>
  );
}

function Aviso({ cor, children }) {
  return <div style={{ fontSize: 13, lineHeight: 1.55, color: C.text2, background: `${cor}14`, borderLeft: `3px solid ${cor}`, borderRadius: 8, padding: "10px 12px", margin: "0 0 14px" }}>{children}</div>;
}

function Secao({ titulo, extra, children }) {
  return (
    <div style={{ borderTop: `1px solid ${C.border2}`, paddingTop: 14, marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>{titulo}</div>
        {extra}
      </div>
      {children}
    </div>
  );
}
