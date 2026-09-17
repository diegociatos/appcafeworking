import { useEffect, useMemo, useState } from "react";
import {
  Handshake, CheckCircle2, XCircle, Clock, AlertCircle, Check, X, RefreshCw, Store, Mail, Phone,
  MapPin, FileText, Wallet, Mail as MailIcon, TrendingUp, PiggyBank, Users,
} from "lucide-react";
import { Card, Badge, Btn, PageHead, Modal, Empty, Field } from "../components/ui.jsx";
import { C, serif, fmt, inp } from "../lib/theme.js";
import { useStore } from "../lib/store.jsx";
import { mensagemDe } from "../lib/erros.js";
import { checklistDoParceiro, parceirosApi, SERVICOS_PARCEIRO } from "../lib/parceirosApi.js";

// ============================================================================
// Parceiros (admin da plataforma) — docs/PARCEIROS.md, fases 2 e 3.
//
// Candidaturas do "Seja parceiro CafeWorking" (site) por situação, com aprovar
// e recusar. Aprovar cria conta, unidade "CafeWorking <Cidade>" com a tabela
// nacional, login do responsável e registra o aceite do contrato de parceria —
// tudo na Edge Function aprovar-parceiro, que é idempotente.
//
// O parceiro NÃO fica ativo aqui: ele só vende quando a carteira Asaas for
// informada em Contas. A tela mostra esse checklist e os indicadores da rede.
// ============================================================================

const SITUACOES = [
  ["nova", "Novas", C.amber, C.amberPale],
  ["em_analise", "Em análise", C.blue, C.bluePale],
  ["aprovada", "Aprovadas", C.green, C.greenPale],
  ["recusada", "Recusadas", C.red, C.redPale],
];
const rotuloSituacao = (s) => SITUACOES.find(([v]) => v === s)?.[1]?.replace(/s$/, "") || s;
const corSituacao = (s) => SITUACOES.find(([v]) => v === s)?.[2] || C.text3;

const dataBR = (iso) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const docFormatado = (d) => String(d || "").replace(/^(\w{2})(\w{3})(\w{3})(\w{4})(\w{2})$/, "$1.$2.$3/$4-$5")
  .replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");

export default function Parceiros({ go }) {
  const { franqueados, unidades, salasDe } = useStore();
  const [candidaturas, setCandidaturas] = useState([]);
  const [indicadores, setIndicadores] = useState([]);
  const [atrasos, setAtrasos] = useState([]);
  const [docsPorUnidade, setDocsPorUnidade] = useState({});
  const [contratoParceria, setContratoParceria] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [trabalhando, setTrabalhando] = useState("");
  const [recusa, setRecusa] = useState(null);   // candidatura + motivo
  const [resultado, setResultado] = useState(null); // retorno da aprovação
  const [filtro, setFiltro] = useState("nova");

  const carregar = async () => {
    if (!parceirosApi.configured) { setCarregando(false); return; }
    setCarregando(true); setErro("");
    try {
      const [lista, kpis, fora, contrato] = await Promise.all([
        parceirosApi.candidaturas(),
        parceirosApi.indicadores(),
        parceirosApi.foraDoPrazo(null),
        parceirosApi.contratoParceriaPublicado().catch(() => null),
      ]);
      setCandidaturas(lista);
      setIndicadores(kpis);
      setAtrasos(fora);
      setContratoParceria(contrato);
      setDocsPorUnidade(await parceirosApi.documentosPorUnidade(lista.map((c) => c.unidadeId)).catch(() => ({})));
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setCarregando(false);
    }
  };
  useEffect(() => { carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const porSituacao = useMemo(() => {
    const mapa = Object.fromEntries(SITUACOES.map(([id]) => [id, []]));
    for (const c of candidaturas) (mapa[c.situacao] = mapa[c.situacao] || []).push(c);
    return mapa;
  }, [candidaturas]);

  const contaDe = (contaId) => franqueados.find((f) => f.id === contaId) || null;

  const checklistDe = (cand) => {
    const conta = contaDe(cand.contaId);
    const fotos = cand.unidadeId ? salasDe(cand.unidadeId).filter((s) => (s.fotos || []).length).length : 0;
    return checklistDoParceiro({
      walletId: conta?.asaasWalletId,
      tiposDeDocumento: docsPorUnidade[cand.unidadeId] || [],
      salasComFoto: fotos,
      temContratoParceria: Boolean(contratoParceria),
    });
  };

  const agir = async (cand, acao) => {
    setTrabalhando(cand.id + acao); setErro(""); setAviso("");
    try {
      if (acao === "analisar") {
        await parceirosApi.analisar(cand.id);
        setAviso(`"${cand.escritorio}" marcado como em análise.`);
      } else {
        const r = await parceirosApi.aprovar(cand.id);
        setResultado({ ...r, candidatura: cand });
      }
      await carregar();
      if (acao === "aprovar") setFiltro("aprovada");
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setTrabalhando("");
    }
  };

  const confirmarRecusa = async () => {
    const { candidatura, motivo } = recusa;
    setTrabalhando(candidatura.id + "recusar"); setErro("");
    try {
      const r = await parceirosApi.recusar(candidatura.id, motivo);
      setRecusa(null);
      setAviso(r.email_enviado
        ? `Candidatura de "${candidatura.escritorio}" recusada e o candidato foi avisado por e-mail.`
        : `Candidatura de "${candidatura.escritorio}" recusada, mas o e-mail ao candidato não saiu. Avise pelo WhatsApp.`);
      await carregar();
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setTrabalhando("");
    }
  };

  const lista = porSituacao[filtro] || [];

  return (
    <div>
      <PageHead
        title="Parceiros"
        sub="Candidaturas do “Seja parceiro CafeWorking” e a saúde da rede. A CafeWorking vende; o parceiro fornece o espaço e recebe 75%."
        action={
          <Btn variant="soft" onClick={carregar} disabled={carregando}>
            <RefreshCw size={16} /> {carregando ? "Atualizando…" : "Atualizar"}
          </Btn>
        }
      />

      {!parceirosApi.configured && (
        <Card style={{ marginBottom: 16 }}>
          <Empty icon={Store} title="Disponível com o backend ligado" sub="As candidaturas ficam no banco e não existem na demonstração." />
        </Card>
      )}

      {erro && (
        <div role="alert" style={{ display: "flex", gap: 8, alignItems: "flex-start", background: C.redPale, borderRadius: 10, padding: "10px 14px", fontSize: 13, color: C.red, marginBottom: 14 }}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> {erro}
        </div>
      )}
      {aviso && (
        <div role="status" style={{ display: "flex", gap: 8, alignItems: "flex-start", background: C.greenPale, borderRadius: 10, padding: "10px 14px", fontSize: 13, color: C.text2, marginBottom: 14 }}>
          <Check size={16} color={C.green} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ flex: 1 }}>{aviso}</span>
          <button onClick={() => setAviso("")} className="cw-btn" title="Fechar aviso" style={{ color: C.text3, padding: 2 }}><X size={15} /></button>
        </div>
      )}

      {parceirosApi.configured && !contratoParceria && (
        <Card style={{ marginBottom: 16, borderLeft: `3px solid ${C.amber}` }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, color: C.text2 }}>
            <FileText size={16} color={C.amber} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              <b>Falta publicar o contrato de parceria.</b> Nenhuma versão vigente da categoria “parceria” foi publicada,
              então a aprovação não registra o aceite do parceiro. As minutas estão em <code>docs/contratos-parceiros/</code>
              e precisam da revisão da Ciatos Jurídico antes de virar o texto oficial.
            </span>
          </div>
        </Card>
      )}

      {/* filtros por situação */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {SITUACOES.map(([id, label, cor]) => {
          const n = (porSituacao[id] || []).length;
          const ativo = filtro === id;
          return (
            <button key={id} onClick={() => setFiltro(id)} className="cw-btn"
              style={{ padding: "8px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600, border: `1px solid ${ativo ? cor : C.border}`, background: ativo ? cor : C.white, color: ativo ? "#fff" : C.text2 }}>
              {label} ({n})
            </button>
          );
        })}
      </div>

      {carregando ? (
        <Card><div style={{ fontSize: 13, color: C.text3 }}>Carregando as candidaturas…</div></Card>
      ) : lista.length === 0 ? (
        <Card>
          <Empty icon={Handshake} title={`Nenhuma candidatura ${rotuloSituacao(filtro).toLowerCase()}`}
            sub="Os pedidos chegam pela página “Seja parceiro CafeWorking” do site." />
        </Card>
      ) : (
        lista.map((c) => (
          <CandidaturaCard
            key={c.id} cand={c} checklist={checklistDe(c)} conta={contaDe(c.contaId)}
            unidade={unidades.find((u) => u.id === c.unidadeId) || null}
            trabalhando={trabalhando}
            onAnalisar={() => agir(c, "analisar")}
            onAprovar={() => agir(c, "aprovar")}
            onRecusar={() => setRecusa({ candidatura: c, motivo: "" })}
            go={go}
          />
        ))
      )}

      <IndicadoresDaRede indicadores={indicadores} atrasos={atrasos} carregando={carregando} />

      {recusa && (
        <Modal title="Recusar candidatura" onClose={() => !trabalhando && setRecusa(null)}>
          <div style={{ fontSize: 13.5, color: C.text2, marginBottom: 12 }}>
            O motivo abaixo vai <b>inteiro no e-mail</b> para {recusa.candidatura.responsavel} ({recusa.candidatura.email}).
            Escreva em linguagem de cliente.
          </div>
          <Field label="Motivo da recusa">
            <textarea value={recusa.motivo} onChange={(e) => setRecusa({ ...recusa, motivo: e.target.value })}
              rows={4} maxLength={1000} style={{ ...inp, resize: "vertical", minHeight: 90 }}
              placeholder="Ex.: no momento já temos uma unidade parceira nesta cidade." />
          </Field>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="ghost" onClick={() => !trabalhando && setRecusa(null)} style={{ flex: 1, justifyContent: "center" }}>Cancelar</Btn>
            <Btn onClick={confirmarRecusa} disabled={recusa.motivo.trim().length < 10 || !!trabalhando}
              style={{ flex: 1, justifyContent: "center", background: C.red, opacity: recusa.motivo.trim().length < 10 || trabalhando ? 0.6 : 1 }}>
              {trabalhando ? "Recusando…" : "Recusar e avisar"}
            </Btn>
          </div>
        </Modal>
      )}

      {resultado && (
        <Modal title="Parceiro aprovado ✓" onClose={() => setResultado(null)} maxWidth={520}>
          <ResultadoAprovacao dados={resultado} onClose={() => setResultado(null)} go={go} />
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function CandidaturaCard({ cand, checklist, conta, unidade, trabalhando, onAnalisar, onAprovar, onRecusar, go }) {
  const ocupado = trabalhando.startsWith(cand.id);
  const pendentes = checklist.filter((i) => !i.ok);
  const podeVender = conta?.parceiroStatus === "ativo" && Boolean(conta?.asaasWalletId);

  return (
    <Card style={{ marginBottom: 16, borderLeft: `3px solid ${corSituacao(cand.situacao)}` }}>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontFamily: serif, fontSize: 20, color: C.text }}>{cand.escritorio}</span>
            <Badge color={corSituacao(cand.situacao)}>{rotuloSituacao(cand.situacao)}</Badge>
            <span style={{ fontSize: 12, color: C.text4 }}>pedido em {dataBR(cand.criadaEm)}</span>
          </div>

          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 8, fontSize: 13, color: C.text3 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <FileText size={14} /> {cand.tipoPessoa === "PF" ? "CPF" : "CNPJ"}: {docFormatado(cand.documento)}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><MailIcon size={14} /> {cand.email}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Phone size={14} /> {cand.whatsapp}</span>
          </div>
          <div style={{ fontSize: 13, color: C.text2, marginTop: 6 }}>
            Responsável: <b>{cand.responsavel}</b>
          </div>
          <div style={{ display: "inline-flex", alignItems: "flex-start", gap: 6, fontSize: 13, color: C.text3, marginTop: 6 }}>
            <MapPin size={14} style={{ marginTop: 2, flexShrink: 0 }} />
            <span>{cand.endereco} — {cand.cidade}/{cand.uf}</span>
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
            {cand.servicos.map((s) => (
              <span key={s} style={{ fontSize: 12, fontWeight: 600, color: C.text2, background: C.cream2, borderRadius: 8, padding: "4px 10px" }}>
                {SERVICOS_PARCEIRO[s] || s}
              </span>
            ))}
            <span style={{ fontSize: 12, color: C.text3, padding: "4px 4px" }}>{cand.salas} sala(s)</span>
          </div>

          {cand.observacoes && (
            <div style={{ fontSize: 12.5, color: C.text3, marginTop: 10, whiteSpace: "pre-wrap" }}>{cand.observacoes}</div>
          )}
          {cand.aceiteTexto && (
            <div style={{ fontSize: 11.5, color: C.text4, marginTop: 8 }}>Aceite no site: {cand.aceiteTexto}</div>
          )}
          {cand.situacao === "recusada" && (
            <div style={{ fontSize: 12.5, color: C.red, marginTop: 10 }}>
              Recusada em {dataBR(cand.decididaEm)}: {cand.motivo}
            </div>
          )}

          {cand.situacao === "aprovada" && (
            <div style={{ marginTop: 14, background: C.cream2, borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 13, color: C.text2 }}>
                Conta <b>{conta?.nome || cand.contaId}</b> · unidade <b>{unidade?.nome || cand.unidadeId}</b>
                {" · "}{podeVender
                  ? <span style={{ color: C.green, fontWeight: 600 }}>vendendo pelo site</span>
                  : <span style={{ color: C.amber, fontWeight: 600 }}>ainda não vende</span>}
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text2, margin: "10px 0 6px" }}>
                {pendentes.length ? `Falta ${pendentes.length} item(ns) para liberar a venda:` : "Checklist completo."}
              </div>
              {checklist.map((i) => (
                <div key={i.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: i.ok ? C.text3 : C.text2, padding: "3px 0" }}>
                  {i.ok ? <CheckCircle2 size={14} color={C.green} style={{ flexShrink: 0, marginTop: 2 }} />
                        : <Clock size={14} color={i.trava ? C.red : C.amber} style={{ flexShrink: 0, marginTop: 2 }} />}
                  <span><b>{i.titulo}</b> — {i.detalhe}{i.trava && !i.ok ? " (trava a venda)" : ""}</span>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <Btn variant="ghost" onClick={() => go && go("franqueados")} style={{ fontSize: 13 }}>
                  <Wallet size={14} /> Abrir Contas
                </Btn>
                <Btn variant="ghost" onClick={() => go && go("unidades")} style={{ fontSize: 13 }}>
                  <Store size={14} /> Abrir Unidades
                </Btn>
              </div>
            </div>
          )}
        </div>

        {cand.situacao !== "aprovada" && cand.situacao !== "recusada" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 190 }}>
            {cand.situacao === "nova" && (
              <Btn variant="soft" onClick={onAnalisar} disabled={ocupado} style={{ justifyContent: "center" }}>
                <Clock size={15} /> Marcar em análise
              </Btn>
            )}
            <Btn onClick={onAprovar} disabled={ocupado} style={{ justifyContent: "center", opacity: ocupado ? 0.6 : 1 }}>
              <CheckCircle2 size={15} /> {trabalhando === cand.id + "aprovar" ? "Aprovando…" : "Aprovar"}
            </Btn>
            <Btn variant="ghost" onClick={onRecusar} disabled={ocupado}
              style={{ justifyContent: "center", color: C.red, borderColor: C.redPale }}>
              <XCircle size={15} /> Recusar
            </Btn>
          </div>
        )}
      </div>
    </Card>
  );
}

function ResultadoAprovacao({ dados, onClose, go }) {
  const { conta, unidade, login, pendencias = [], contrato_publicado: contrato, planos_aplicados: planos, email_enviado: email } = dados;
  return (
    <>
      <div style={{ fontSize: 13.5, color: C.text2, marginBottom: 14 }}>
        A conta <b>{conta?.nome}</b> e a unidade <b>{unidade?.nome}</b> foram criadas, com a tabela nacional aplicada
        {planos ? ` (${planos} plano(s))` : ""}.
      </div>
      <div style={{ background: C.cream2, borderRadius: 12, padding: 14, marginBottom: 14, fontSize: 13.5 }}>
        <Linha rotulo="Conta" valor={conta?.id} />
        <Linha rotulo="Unidade" valor={unidade?.id} />
        <Linha rotulo="Login do responsável" valor={login?.email} />
        <Linha rotulo="E-mail de boas-vindas" valor={email ? "enviado com o link de criar a senha" : "NÃO saiu — reenvie pela tela"} />
        <Linha rotulo="Aceite do contrato" valor={contrato ? "registrado" : "sem contrato de parceria publicado"} />
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: C.amberPale, border: `1px solid ${C.amber}33`, borderRadius: 10, padding: "10px 12px", fontSize: 12.5, color: C.text2, marginBottom: 14 }}>
        <AlertCircle size={15} color={C.amber} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          O parceiro está em <b>análise</b> e ainda <b>não vende</b>. Informe a carteira Asaas (walletId) em
          {" "}<b>Contas</b> e mude a situação para <b>Ativo</b>.
          {pendencias.length > 0 && (
            <>
              <br /><br />Também falta:
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {pendencias.map((p) => <li key={p}>{p}</li>)}
              </ul>
            </>
          )}
        </span>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Btn variant="ghost" onClick={() => { onClose(); go && go("franqueados"); }} style={{ flex: 1, justifyContent: "center" }}>
          <Wallet size={15} /> Informar a carteira
        </Btn>
        <Btn onClick={onClose} style={{ flex: 1, justifyContent: "center" }}>Concluir</Btn>
      </div>
    </>
  );
}

function Linha({ rotulo, valor }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "5px 0" }}>
      <span style={{ color: C.text3 }}>{rotulo}</span>
      <b style={{ color: C.text, wordBreak: "break-all", textAlign: "right" }}>{valor || "—"}</b>
    </div>
  );
}

function IndicadoresDaRede({ indicadores, atrasos, carregando }) {
  if (carregando) return null;
  const col = { padding: "8px 10px", fontSize: 13, borderBottom: `1px solid ${C.border2}` };
  const num = { ...col, textAlign: "right", fontVariantNumeric: "tabular-nums" };

  return (
    <div style={{ marginTop: 26 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <TrendingUp size={18} color={C.cafe} />
        <span style={{ fontFamily: serif, fontSize: 20 }}>Indicadores da rede</span>
      </div>

      {indicadores.length === 0 ? (
        <Card><Empty icon={Handshake} title="Nenhuma conta parceira ainda" sub="Ao aprovar uma candidatura, o parceiro aparece aqui." /></Card>
      ) : (
        <Card style={{ overflowX: "auto", marginBottom: 16 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr style={{ textAlign: "left", fontSize: 12, color: C.text3 }}>
                <th style={col}>Parceiro</th>
                <th style={col}>Situação</th>
                <th style={num}><Users size={12} style={{ verticalAlign: -1 }} /> Clientes</th>
                <th style={num}>Receita do mês</th>
                <th style={num}>Parte do parceiro</th>
                <th style={num}><PiggyBank size={12} style={{ verticalAlign: -1 }} /> Garantia</th>
                <th style={num}><Mail size={12} style={{ verticalAlign: -1 }} /> Fora do prazo</th>
              </tr>
            </thead>
            <tbody>
              {indicadores.map((i) => (
                <tr key={i.contaId}>
                  <td style={col}><b>{i.conta}</b><div style={{ fontSize: 11.5, color: C.text4 }}>{i.unidades} unidade(s)</div></td>
                  <td style={col}>
                    <Badge color={i.parceiroStatus === "ativo" ? C.green : i.parceiroStatus === "suspenso" || i.parceiroStatus === "encerrado" ? C.red : C.amber}>
                      {i.parceiroStatus === "ativo" ? "Ativo" : i.parceiroStatus === "suspenso" ? "Suspenso" : i.parceiroStatus === "encerrado" ? "Encerrado" : "Em análise"}
                    </Badge>
                    {!i.temCarteira && <div style={{ fontSize: 11.5, color: C.red, marginTop: 3 }}>sem carteira Asaas</div>}
                  </td>
                  <td style={num}>{i.clientesAtivos}</td>
                  <td style={num}>{fmt(i.receitaMes)}</td>
                  <td style={{ ...num, color: C.cafe }}>{fmt(i.parteParceiroMes)}</td>
                  <td style={{ ...num, color: C.amber }}>{fmt(i.garantiaSaldo)}</td>
                  <td style={{ ...num, color: i.correspAtrasadas ? C.red : C.text3, fontWeight: i.correspAtrasadas ? 700 : 400 }}>
                    {i.correspAtrasadas}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 11.5, color: C.text4, marginTop: 10 }}>
            Receita do mês = cobranças pagas neste mês nas unidades do parceiro. Garantia = retenções menos estornos, devoluções e usos.
          </div>
        </Card>
      )}

      {atrasos.length > 0 && (
        <Card style={{ borderLeft: `3px solid ${C.red}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Mail size={16} color={C.red} />
            <span style={{ fontFamily: serif, fontSize: 17 }}>Correspondências fora do prazo de 1 dia útil</span>
          </div>
          {atrasos.map((a) => (
            <div key={a.unidadeId + a.itemId} style={{ fontSize: 12.5, color: C.text2, padding: "5px 0", borderBottom: `1px solid ${C.border2}` }}>
              <b>{a.unidade}</b> · {a.cliente} · {a.remetente} — recebida em {dataBR(a.recebidoEm)}, prazo venceu em {dataBR(a.prazoEm)}
              {a.dias > 0 ? ` (${a.dias} dia(s) além)` : ""}
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: C.text4, marginTop: 10 }}>
            A rotina diária avisa o parceiro e a CafeWorking uma vez por correspondência.
          </div>
        </Card>
      )}
    </div>
  );
}
