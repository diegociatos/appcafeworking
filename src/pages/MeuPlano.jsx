import { useEffect, useRef, useState } from "react";
import { FileText, Upload, ExternalLink, Download, AlertTriangle, Loader2, CheckCircle2, XCircle, Camera, Briefcase, MessageCircle } from "lucide-react";
import { Card, Badge, Btn, PageHead, Modal, Empty } from "../components/ui.jsx";
import { C, serif, fmt, inp } from "../lib/theme.js";
import { assinaturasApi, STATUS_ASSINATURA, STATUS_DOCUMENTOS, dataBR } from "../lib/assinaturasApi.js";
import { clienteApi } from "../lib/clienteApi.js";
import { mensagemDe } from "../lib/erros.js";
import { CONTATO } from "../lib/contato.js";
import { textoDesde } from "../lib/unidadeNome.js";
import { Aviso as AvisoCliente, CartaoRecepcao, ErroCarga } from "./cliente/comum.jsx";

const STATUS_COBRANCA = {
  pendente: ["A vencer", C.amber], pago: ["Paga", C.green], vencido: ["Vencida", C.red],
  cancelado: ["Cancelada", C.text3], estornado: ["Estornada", C.text3],
};

const MOTIVO_MINIMO = 5;

// Área do cliente: o plano contratado, faturas, contrato aceito, documentos e cancelamento.
// Plano contratado antes da venda online aparece como "plano legado".
export default function MeuPlano({ go }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);

  const carregar = (forcar = true) => {
    setCarregando(true);
    setErro("");
    clienteApi.minhaAssinatura(forcar)
      .then(setDados)
      .catch((e) => setErro(mensagemDe(e)))
      .finally(() => setCarregando(false));
  };
  useEffect(() => carregar(false), []); // eslint-disable-line react-hooks/exhaustive-deps

  const legados = dados?.legados || [];
  const vazio = dados && !dados.assinaturas.length && !dados.pendentes.length && !legados.length;

  return (
    <div>
      <PageHead title="Meu plano" sub="Situação do plano, faturas, contrato e documentos." />
      {carregando && !dados && <Card><div role="status" style={{ color: C.text3, fontSize: 14 }}><Loader2 size={16} className="cw-spin" aria-hidden="true" /> Carregando…</div></Card>}
      {erro && <div style={{ marginBottom: 16 }}><ErroCarga mensagem={erro} onTentar={() => carregar(true)} /></div>}
      {dados && (
        <>
          {dados.pendentes.map((p, i) => (
            <Card key={`p${i}`} style={{ marginBottom: 16, borderLeft: `3px solid ${C.amber}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{p.plano_nome} · aguardando pagamento</div>
                  <div style={{ fontSize: 13, color: C.text3 }}>{fmt(p.valor)} · pedido em {dataBR(p.created_at)}. O plano ativa assim que o pagamento é confirmado.</div>
                </div>
                {p.invoice_url && (
                  <a href={p.invoice_url} target="_blank" rel="noreferrer" className="cw-btn"
                    style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 14, background: C.teal, color: "#fff", fontWeight: 600, fontSize: 14 }}>
                    <ExternalLink size={15} aria-hidden="true" /> Pagar
                  </a>
                )}
              </div>
            </Card>
          ))}

          {legados.map((l) => (
            <Card key={l.id} style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span aria-hidden="true" style={{ width: 44, height: 44, borderRadius: 12, background: C.cafePale, display: "grid", placeItems: "center" }}><Briefcase size={22} color={C.cafe} /></span>
                  <div>
                    <div style={{ fontFamily: serif, fontSize: 24 }}>{l.plano}</div>
                    <div style={{ fontSize: 13, color: C.text3 }}>{l.unidade ? `Unidade ${l.unidade}` : ""}{l.desde ? ` · cliente desde ${textoDesde(l.desde)}` : ""}</div>
                  </div>
                </div>
                <Badge color={l.situacao === "ativo" ? C.green : C.text3}>{l.situacao === "ativo" ? "Ativo" : "Inativo"}</Badge>
              </div>
              <div style={{ marginTop: 16 }}>
                <AvisoCliente>{/^visitante$/i.test(String(l.plano || "").trim())
                  ? "Você ainda não tem um plano contratado. Veja os planos no site ou fale com a recepção para escolher o ideal."
                  : "Seu plano foi contratado antes da contratação online. Para mudar ou cancelar, fale com a recepção."}</AvisoCliente>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Btn variant="ghost" onClick={() => go?.("cli_faturas")}>Ver faturas</Btn>
                <a href={CONTATO.whatsappLink(`Olá! Sou cliente do plano ${l.plano} e quero falar sobre o meu plano.`)} target="_blank" rel="noreferrer" className="cw-btn"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 14, border: `1px solid ${C.border}`, color: C.text2, fontWeight: 600, fontSize: 14 }}>
                  <MessageCircle size={15} aria-hidden="true" /> Falar com a recepção
                </a>
              </div>
            </Card>
          ))}

          {vazio && (
            <>
              <Card style={{ marginBottom: 16 }}><Empty icon={FileText} title="Nenhum plano encontrado" sub="Não encontramos um plano no seu cadastro. Se você é cliente e não vê seu plano aqui, fale com a recepção." /></Card>
              <CartaoRecepcao compacto />
            </>
          )}
          {dados.assinaturas.map((a) => (
            <Assinatura key={a.id} a={a} tipos={dados.tipos_documento} onMudou={() => carregar(true)} />
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
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", color: C.text3 }}>
                  <th scope="col" style={th}>Vencimento</th><th scope="col" style={th}>Valor</th><th scope="col" style={th}>Situação</th><th scope="col" style={th}><span className="cw-sr-only">Ações</span></th>
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

const telaDeToque = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

function Documentos({ a, tipos, onMudou }) {
  const [enviando, setEnviando] = useState("");
  const [progresso, setProgresso] = useState(0);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const inputs = useRef({});
  const st = STATUS_DOCUMENTOS[a.docs_status];
  const podeEnviar = a.docs_status !== "aprovado";
  const toque = telaDeToque();

  const enviar = async (tipo, arquivo, chave) => {
    if (!arquivo) return;
    setErro("");
    setOk("");
    setEnviando(tipo);
    setProgresso(0);
    try {
      await assinaturasApi.enviarDocumento(a.id, tipo, arquivo, setProgresso);
      setOk(`${tipos[tipo] || "Documento"}: enviado.`);
      onMudou();
    } catch (e) {
      setErro(mensagemDe(e, "Não foi possível enviar o arquivo. Tente de novo."));
    } finally {
      setEnviando("");
      if (inputs.current[chave]) inputs.current[chave].value = "";
    }
  };

  const botaoArquivo = { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: C.teal, cursor: enviando ? "progress" : "pointer", padding: "6px 10px", borderRadius: 10, border: `1px solid ${C.tealLine}` };

  return (
    <Secao titulo="Documentos do endereço fiscal" extra={st && <Badge color={C[st.cor]}>{st.rotulo}</Badge>}>
      {a.docs_status === "pendente" && (
        <p style={{ fontSize: 14, color: C.text2, margin: "0 0 12px", lineHeight: 1.55 }}>
          Envie em PDF, JPG ou PNG (até 8 MB por arquivo). Pelo celular, dá para tirar a foto na hora.
          Empresa já aberta: cartão CNPJ, ato constitutivo e documento dos sócios.
          Empresa a abrir: documento e comprovante de residência dos futuros sócios. A conferência leva até 5 dias úteis.
        </p>
      )}
      {a.docs_status === "enviado" && <p style={{ fontSize: 14, color: C.text2, margin: "0 0 12px" }}>Recebemos seus documentos e estamos conferindo. Você pode enviar mais algum, se faltar.</p>}
      {a.docs_parecer && <Aviso cor={a.docs_status === "aprovado" ? C.green : C.amber}>{a.docs_parecer}</Aviso>}

      {podeEnviar && (
        <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
          {Object.entries(tipos).map(([tipo, rotulo]) => (
            <div key={tipo} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", border: `1px solid ${C.border}`, borderRadius: 11, flexWrap: "wrap" }}>
              <span id={`doc-${tipo}`} style={{ fontSize: 14 }}>{rotulo}</span>
              {enviando === tipo ? (
                <span role="status" aria-live="polite" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.text3, minWidth: 160 }}>
                  <Loader2 size={14} className="cw-spin" aria-hidden="true" />
                  <span style={{ flex: 1, height: 6, background: C.cream2, borderRadius: 4, overflow: "hidden" }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progresso} aria-labelledby={`doc-${tipo}`}>
                    <span style={{ display: "block", width: `${progresso}%`, height: "100%", background: C.teal, transition: "width .2s" }} />
                  </span>
                  {progresso}%
                </span>
              ) : (
                <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <label style={botaoArquivo}>
                    <Upload size={14} aria-hidden="true" /> Enviar arquivo
                    <input
                      ref={(el) => { inputs.current[`${tipo}:arquivo`] = el; }}
                      type="file" accept="application/pdf,image/jpeg,image/png,image/heic,image/heif,image/webp" disabled={!!enviando}
                      onChange={(e) => enviar(tipo, e.target.files?.[0], `${tipo}:arquivo`)}
                      aria-label={`Enviar arquivo: ${rotulo}`} className="cw-sr-only"
                    />
                  </label>
                  {toque && (
                    <label style={botaoArquivo}>
                      <Camera size={14} aria-hidden="true" /> Tirar foto
                      <input
                        ref={(el) => { inputs.current[`${tipo}:camera`] = el; }}
                        type="file" accept="image/*" capture="environment" disabled={!!enviando}
                        onChange={(e) => enviar(tipo, e.target.files?.[0], `${tipo}:camera`)}
                        aria-label={`Tirar foto: ${rotulo}`} className="cw-sr-only"
                      />
                    </label>
                  )}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      <div role="status" aria-live="polite">{ok && <div style={{ fontSize: 14, color: C.green, marginBottom: 10 }}>{ok}</div>}</div>
      {erro && <div role="alert" style={{ fontSize: 14, color: C.red, marginBottom: 10 }}>{erro}</div>}

      {a.documentos.length > 0 && (
        <div style={{ fontSize: 14 }}>
          <div style={{ color: C.text3, marginBottom: 6 }}>Enviados</div>
          {a.documentos.map((d) => (
            <div key={d.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0", borderTop: `1px solid ${C.border2}`, flexWrap: "wrap" }}>
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
        <div style={{ fontSize: 14, color: C.text2 }}>{c.titulo} · versão {c.versao} · aceito em {new Date(c.aceito_em).toLocaleString("pt-BR")}</div>
        <Btn variant="ghost" onClick={baixar} style={{ fontSize: 13, padding: "7px 12px" }}><Download size={14} aria-hidden="true" /> Baixar cópia</Btn>
      </div>
      <details>
        <summary style={{ cursor: "pointer", fontSize: 14, color: C.teal, fontWeight: 600 }}>Ler o contrato</summary>
        <div style={{ whiteSpace: "pre-wrap", maxHeight: 360, overflow: "auto", fontSize: 13, lineHeight: 1.65, color: C.text2, marginTop: 10, padding: 12, background: C.cream, borderRadius: 10 }}>{c.corpo}</div>
        <div style={{ fontSize: 12, color: C.text3, marginTop: 6, wordBreak: "break-all" }}>Código de integridade: {c.hash}</div>
      </details>
    </Secao>
  );
}

function CancelarModal({ a, onFechar, onFeito }) {
  const sim = a.cancelamento_se_pedir_hoje;
  const [etapa, setEtapa] = useState("alternativas"); // alternativas | confirmar
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [feito, setFeito] = useState(null);
  const motivoOk = motivo.trim().length >= MOTIVO_MINIMO;

  const confirmar = async () => {
    if (!motivoOk) { setErro("Conte o motivo do cancelamento para continuar."); return; }
    setEnviando(true);
    setErro("");
    try {
      setFeito(await assinaturasApi.cancelar(a.id, motivo.trim()));
    } catch (e) {
      setErro(mensagemDe(e, "Não foi possível registrar o cancelamento. Tente de novo ou fale com a recepção."));
    } finally {
      setEnviando(false);
    }
  };

  if (feito) {
    return (
      <Modal title="Pedido registrado" onClose={onFeito} maxWidth={460}>
        <div role="status" style={{ display: "flex", gap: 10, fontSize: 14, lineHeight: 1.6, color: C.text2 }}>
          <CheckCircle2 size={20} color={C.green} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
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

  if (etapa === "alternativas") {
    return (
      <Modal title="Antes de cancelar" onClose={onFechar} maxWidth={480}>
        <div style={{ fontSize: 14, lineHeight: 1.6, color: C.text2 }}>
          <p style={{ marginTop: 0 }}>Se o plano não está servindo, talvez dê para ajustar sem perder o que você já tem:</p>
          <ul style={{ margin: "0 0 14px", paddingLeft: 18, listStyle: "disc" }}>
            <li><b>Trocar para um plano menor</b>, com valor mais baixo.</li>
            <li><b>Mudar a forma ou a data de pagamento</b>.</li>
            <li><b>Tirar dúvidas</b> sobre o contrato, a fidelidade ou o acerto.</li>
          </ul>
          <div style={{ display: "grid", gap: 8 }}>
            <a href={CONTATO.whatsappLink(`Olá! Tenho o plano ${a.plano_nome} e quero ver a troca para um plano menor antes de cancelar.`)} target="_blank" rel="noreferrer" className="cw-btn"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "11px 16px", borderRadius: 14, background: C.teal, color: "#fff", fontWeight: 600 }}>
              <MessageCircle size={16} aria-hidden="true" /> Quero trocar de plano
            </a>
            <a href={CONTATO.whatsappLink(`Olá! Tenho o plano ${a.plano_nome} e quero conversar antes de cancelar.`)} target="_blank" rel="noreferrer" className="cw-btn"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "11px 16px", borderRadius: 14, border: `1px solid ${C.border}`, color: C.text2, fontWeight: 600 }}>
              Falar com a recepção ({CONTATO.whatsapp})
            </a>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <Btn variant="ghost" style={{ flex: 1 }} onClick={onFechar}>Manter meu plano</Btn>
          <Btn variant="ghost" style={{ flex: 1, color: C.red }} onClick={() => setEtapa("confirmar")}>Continuar com o cancelamento</Btn>
        </div>
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
            <AlertTriangle size={14} style={{ verticalAlign: "-2px" }} aria-hidden="true" />{" "}
            {sim.motivoAcerto === "anual"
              ? "No plano anual, a equipe calcula a devolução proporcional (valor pago menos o preço mensal cheio de cada mês usado)."
              : `Seu plano tem fidelidade até ${dataBR(a.fidelidade_ate)}. A equipe vai enviar o cálculo da multa prevista no contrato.`}
          </Aviso>
        )}
        {a.categoria === "endereco_fiscal" && (
          <p>Depois do encerramento, você tem 30 dias para trocar o endereço da empresa na Receita, na Junta Comercial e na Prefeitura.</p>
        )}
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.text2, margin: "12px 0 6px" }} htmlFor="motivo-cancelamento">Conte o motivo do cancelamento (obrigatório)</label>
        <textarea id="motivo-cancelamento" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={500} required aria-required="true"
          aria-invalid={!!erro && !motivoOk} style={{ ...inp, height: "auto", resize: "vertical" }} />
        {erro && <div role="alert" style={{ color: C.red, fontSize: 14, marginTop: 10 }}><XCircle size={14} style={{ verticalAlign: "-2px" }} aria-hidden="true" /> {erro}</div>}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <Btn variant="ghost" style={{ flex: 1 }} onClick={onFechar} disabled={enviando}>Manter meu plano</Btn>
        <Btn style={{ flex: 1, background: C.red, boxShadow: "none" }} onClick={confirmar} disabled={enviando || !motivoOk}>
          {enviando ? <><Loader2 size={15} className="cw-spin" aria-hidden="true" /> Enviando…</> : "Confirmar cancelamento"}
        </Btn>
      </div>
    </Modal>
  );
}

const th = { padding: "6px 8px", fontWeight: 600, fontSize: 13 };
const td = { padding: "8px" };

function Info({ rotulo, valor, destaque }) {
  return (
    <div style={{ background: destaque ? C.amberPale : C.cream, borderRadius: 12, padding: "10px 14px" }}>
      <div style={{ fontSize: 13, color: C.text3 }}>{rotulo}</div>
      <div style={{ fontFamily: serif, fontSize: 19, marginTop: 2 }}>{valor}</div>
    </div>
  );
}

function Aviso({ cor, children }) {
  return <div style={{ fontSize: 14, lineHeight: 1.55, color: C.text2, background: `${cor}14`, borderLeft: `3px solid ${cor}`, borderRadius: 8, padding: "10px 12px", margin: "0 0 14px" }}>{children}</div>;
}

function Secao({ titulo, extra, children }) {
  return (
    <div style={{ borderTop: `1px solid ${C.border2}`, paddingTop: 14, marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <h3 style={{ fontWeight: 600, fontSize: 16, margin: 0 }}>{titulo}</h3>
        {extra}
      </div>
      {children}
    </div>
  );
}
