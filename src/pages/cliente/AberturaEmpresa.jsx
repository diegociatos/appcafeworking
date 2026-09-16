// ============================================================================
// Área do cliente · Abertura da empresa
//
// Com o processo com o cliente (aguardando_cliente ou pendente_cliente):
// formulário em etapas (Empresa, Sócios, Local, gov.br, Revisão e envio), com
// rascunho salvo sozinho e anexos com progresso. As pendências da revisão vêm
// das mesmas regras que o servidor cobra no envio (_shared/abertura.ts).
//
// Depois do envio: andamento, pendência destacada, histórico e, ao concluir,
// o cartão "Sua empresa" com os dados e os documentos para baixar.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2, Users, MapPin, ShieldCheck, ClipboardCheck, ChevronLeft, ChevronRight, Plus, Trash2, Loader2, CheckCircle2,
  AlertTriangle, Send, Search, FileText, Briefcase,
} from "lucide-react";
import { Card, Badge, Btn, PageHead, Empty, ConfirmDialog } from "../../components/ui.jsx";
import { C, serif, inp } from "../../lib/theme.js";
import { mensagemDe } from "../../lib/erros.js";
import { buscarCep } from "../../lib/lookup.js";
import {
  aberturasApi, ATUACAO, cpfValido, dataBR, DOCS_CLIENTE, ESTADOS_CIVIS, formatarCPF, limiteSocios, NIVEIS_GOVBR,
  pendenciasDoEnvio, REGIMES_BENS, socioVazio, sociosSemGovbrParaAssinar, STATUS_ABERTURA_UI, STATUS_EDITAVEL_CLIENTE,
  TIPOS_EMPRESA, TIPOS_IMOVEL, UFS,
} from "../../lib/aberturasApi.js";
import {
  CartaoEmpresa, EnvioArquivo, Historico, KitLista, ListaDocumentos, ResumoDados, Secao,
} from "../../components/AberturaPartes.jsx";
import { Aviso, CartaoRecepcao, Carregando, ErroCarga, NumeroCopiavel, useDados } from "./comum.jsx";

const ETAPAS = [
  { id: "empresa", rotulo: "Empresa", icon: Building2 },
  { id: "socios", rotulo: "Sócios", icon: Users },
  { id: "local", rotulo: "Local", icon: MapPin },
  { id: "govbr", rotulo: "gov.br", icon: ShieldCheck },
  { id: "revisao", rotulo: "Revisão e envio", icon: ClipboardCheck },
];

const ESPERA_AUTOSAVE_MS = 1200;

export default function AberturaEmpresa() {
  const lista = useDados((f) => aberturasApi.minhas(f));
  const aberturas = lista.dados?.aberturas || [];
  const [escolhida, setEscolhida] = useState(null);
  const ativa = escolhida || aberturas.find((a) => a.status !== "cancelada")?.id || aberturas[0]?.id;

  return (
    <div>
      <PageHead title="Abertura da empresa" sub="Preencha os dados, anexe os documentos e acompanhe o registro com a contabilidade." />
      {lista.carregando && !lista.dados && <Card><Carregando /></Card>}
      {lista.erro && <div style={{ marginBottom: 16 }}><ErroCarga mensagem={lista.erro} onTentar={lista.recarregar} /></div>}
      {lista.dados && !aberturas.length && (
        <>
          <Card style={{ marginBottom: 16 }}>
            <Empty icon={Briefcase} title="Nenhum processo de abertura" sub="A abertura começa depois da contratação e da confirmação do pagamento. Se você já contratou e não vê o processo aqui, fale com a recepção." />
          </Card>
          <CartaoRecepcao compacto />
        </>
      )}
      {aberturas.length > 1 && (
        <div role="tablist" aria-label="Processos de abertura" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {aberturas.map((a) => {
            const st = STATUS_ABERTURA_UI[a.status];
            const sel = a.id === ativa;
            return (
              <button key={a.id} role="tab" aria-selected={sel} type="button" onClick={() => setEscolhida(a.id)} className="cw-btn"
                style={{ padding: "8px 12px", borderRadius: 12, border: `1px solid ${sel ? C.cafe : C.border}`, background: sel ? C.cafePale : C.white, fontSize: 13, textAlign: "left" }}>
                <b>{a.razao_social || a.plano_nome || "Abertura"}</b> · {st?.cliente} · {dataBR(a.created_at)}
              </button>
            );
          })}
        </div>
      )}
      {ativa && <Processo key={ativa} id={ativa} onMudou={() => lista.recarregar()} />}
    </div>
  );
}

function Processo({ id, onMudou }) {
  const [det, setDet] = useState(null);
  const [erro, setErro] = useState("");
  const carregar = useCallback(() => {
    setErro("");
    return aberturasApi.detalhe(id, { comoCliente: true }).then(setDet).catch((e) => setErro(mensagemDe(e)));
  }, [id]);
  useEffect(() => { carregar(); }, [carregar]);

  if (erro && !det) return <ErroCarga mensagem={erro} onTentar={carregar} />;
  if (!det) return <Card><Carregando /></Card>;

  const recarregarTudo = () => { carregar(); onMudou?.(); };
  return STATUS_EDITAVEL_CLIENTE.includes(det.abertura.status)
    ? <Formulario key={`${det.abertura.id}:${det.abertura.status}`} det={det} onEnviado={recarregarTudo} onDesatualizado={carregar} />
    : <Acompanhamento det={det} recarregar={carregar} />;
}

// ---------------------------------------------------------------------------
// Formulário
// ---------------------------------------------------------------------------

function completar(dados) {
  const d = dados && typeof dados === "object" ? dados : {};
  const e = d.empresa || {};
  const socios = Array.isArray(d.socios) && d.socios.length ? d.socios : [socioVazio()];
  return {
    empresa: {
      tipo: e.tipo || "", nomes: [0, 1, 2].map((i) => e.nomes?.[i] || ""), nome_fantasia: e.nome_fantasia || "",
      atividades: e.atividades || "", capital_social: e.capital_social ?? "", atuacao: e.atuacao || [], faturamento_mensal: e.faturamento_mensal ?? "",
    },
    socios: socios.map((s) => ({ ...socioVazio(), ...s, endereco: { ...socioVazio().endereco, ...(s.endereco || {}) } })),
    local: {
      cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "", indice_cadastral: "", area_m2: "",
      tipo_imovel: "", imovel_de_socio: null, ...(d.local || {}),
    },
  };
}

const horaCurta = (d) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function Formulario({ det, onEnviado, onDesatualizado }) {
  const a = det.abertura;
  const [dados, setDados] = useState(() => completar(a.dados));
  const [docs, setDocs] = useState(det.documentos || []);
  const [etapa, setEtapa] = useState("empresa");
  const [salvo, setSalvo] = useState({ estado: "ok", em: null }); // ok | sujo | salvando | erro
  const timer = useRef(null);
  const dadosRef = useRef(dados);
  const salvando = useRef(null);
  const ultimoSalvo = useRef(JSON.stringify(dados));
  const topo = useRef(null);

  const salvar = useCallback(async () => {
    clearTimeout(timer.current);
    if (salvando.current) await salvando.current.catch(() => {});
    const enviado = dadosRef.current;
    const texto = JSON.stringify(enviado);
    setSalvo((s) => ({ ...s, estado: "salvando" }));
    salvando.current = aberturasApi.salvarRascunho(a.id, enviado);
    try {
      await salvando.current;
      ultimoSalvo.current = texto;
      setSalvo({ estado: dadosRef.current === enviado ? "ok" : "sujo", em: new Date() });
    } catch (e) {
      setSalvo((s) => ({ ...s, estado: "erro", msg: mensagemDe(e, "Não foi possível salvar agora.") }));
      if (e.status === 409) onDesatualizado?.();
      throw e;
    } finally {
      salvando.current = null;
    }
  }, [a.id, onDesatualizado]);

  useEffect(() => {
    dadosRef.current = dados;
    if (JSON.stringify(dados) === ultimoSalvo.current) return;
    setSalvo((s) => ({ ...s, estado: "sujo" }));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { salvar().catch(() => {}); }, ESPERA_AUTOSAVE_MS);
  }, [dados, salvar]);
  useEffect(() => () => clearTimeout(timer.current), []);

  /** Antes de anexar: o servidor precisa conhecer o sócio. */
  const garantirSalvo = useCallback(async () => {
    if (salvo.estado !== "ok" || salvando.current) await salvar();
  }, [salvo.estado, salvar]);

  // Sai da página com alteração não salva: tenta salvar.
  useEffect(() => {
    const aviso = (ev) => { if (salvo.estado === "sujo" || salvo.estado === "salvando") { ev.preventDefault(); ev.returnValue = ""; } };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [salvo.estado]);

  const pendencias = useMemo(() => pendenciasDoEnvio(dados, docs, a.usa_endereco_unidade, det.hoje), [dados, docs, a.usa_endereco_unidade, det.hoje]);
  const pendPorEtapa = (id) => pendencias.filter((p) => p.etapa === id).length;

  const setEmpresa = (patch) => setDados((d) => ({ ...d, empresa: { ...d.empresa, ...patch } }));
  const setLocal = (patch) => setDados((d) => ({ ...d, local: { ...d.local, ...patch } }));
  const setSocio = (i, patch) => setDados((d) => ({ ...d, socios: d.socios.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));

  const irPara = (id) => {
    setEtapa(id);
    topo.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const idx = ETAPAS.findIndex((e) => e.id === etapa);
  const docProps = {
    aberturaId: a.id, docs, antes: garantirSalvo,
    onEnviado: (doc) => setDocs((l) => [...l, doc]),
    onRemovido: (docId) => setDocs((l) => l.filter((x) => x.id !== docId)),
  };

  return (
    <div ref={topo} style={{ scrollMarginTop: 80 }}>
      {a.status === "pendente_cliente" && (
        <div role="alert" style={{ background: C.redPale, border: `1px solid ${C.red}33`, borderLeft: `4px solid ${C.red}`, borderRadius: 14, padding: "14px 16px", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, color: C.red, marginBottom: 6 }}>
            <AlertTriangle size={18} aria-hidden="true" /> A contabilidade pediu um ajuste
          </div>
          <div style={{ fontSize: 15, color: C.text, whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{a.pendencia}</div>
          <div style={{ fontSize: 13, color: C.text3, marginTop: 8 }}>Corrija abaixo e envie de novo na etapa Revisão e envio.</div>
        </div>
      )}

      <Card style={{ marginBottom: 14, padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <div style={{ fontSize: 13, color: C.text3 }}>
            {a.plano_nome ? <>Plano <b style={{ color: C.text2 }}>{a.plano_nome}</b> · </> : null}
            {a.usa_endereco_unidade ? `Empresa no endereço fiscal do CafeWorking ${det.unidade?.nome || ""}` : "Empresa em endereço próprio"}
          </div>
          <IndicadorSalvo salvo={salvo} onTentar={() => salvar().catch(() => {})} />
        </div>
        <nav aria-label="Etapas do formulário" style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
          {ETAPAS.map((e, i) => {
            const sel = e.id === etapa;
            const n = e.id === "revisao" ? 0 : pendPorEtapa(e.id);
            return (
              <button key={e.id} type="button" onClick={() => irPara(e.id)} aria-current={sel ? "step" : undefined} className="cw-btn"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", padding: "8px 12px", borderRadius: 11, fontSize: 13, fontWeight: 600, border: `1px solid ${sel ? C.cafe : C.border}`, background: sel ? C.cafe : C.white, color: sel ? "#fff" : C.text2 }}>
                <e.icon size={14} aria-hidden="true" /> {i + 1}. {e.rotulo}
                {n > 0 && <span aria-label={`${n} pendência(s)`} style={{ fontSize: 11, minWidth: 18, height: 18, borderRadius: 9, display: "grid", placeItems: "center", background: sel ? "rgba(255,255,255,.25)" : C.amberPale, color: sel ? "#fff" : C.amber }}>{n}</span>}
                {n === 0 && e.id !== "revisao" && <CheckCircle2 size={13} color={sel ? "#fff" : C.green} aria-label="completa" />}
              </button>
            );
          })}
        </nav>
      </Card>

      <Card>
        {etapa === "empresa" && <EtapaEmpresa e={dados.empresa} set={setEmpresa} />}
        {etapa === "socios" && <EtapaSocios dados={dados} setDados={setDados} setSocio={setSocio} docProps={docProps} />}
        {etapa === "local" && <EtapaLocal det={det} l={dados.local} set={setLocal} docProps={docProps} />}
        {etapa === "govbr" && <EtapaGovbr socios={dados.socios} setSocio={setSocio} />}
        {etapa === "revisao" && (
          <EtapaRevisao det={det} dados={dados} docs={docs} pendencias={pendencias} irPara={irPara} docProps={docProps}
            antesDeEnviar={() => clearTimeout(timer.current)} onEnviado={onEnviado} />
        )}

        {etapa !== "revisao" && (
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 20, borderTop: `1px solid ${C.border2}`, paddingTop: 14, flexWrap: "wrap" }}>
            <Btn variant="ghost" onClick={() => irPara(ETAPAS[Math.max(0, idx - 1)].id)} disabled={idx === 0} style={{ opacity: idx === 0 ? 0.5 : 1 }}>
              <ChevronLeft size={15} aria-hidden="true" /> Voltar
            </Btn>
            <Btn onClick={() => irPara(ETAPAS[idx + 1].id)}>
              Próxima: {ETAPAS[idx + 1].rotulo} <ChevronRight size={15} aria-hidden="true" />
            </Btn>
          </div>
        )}
      </Card>

      {det.eventos?.length > 1 && (
        <Card style={{ marginTop: 16 }}>
          <details>
            <summary style={{ cursor: "pointer", fontWeight: 600, color: C.teal }}>Histórico do processo</summary>
            <div style={{ marginTop: 12 }}><Historico eventos={det.eventos} /></div>
          </details>
        </Card>
      )}
    </div>
  );
}

function IndicadorSalvo({ salvo, onTentar }) {
  const base = { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5 };
  if (salvo.estado === "salvando") return <span role="status" style={{ ...base, color: C.text3 }}><Loader2 size={13} className="cw-spin" aria-hidden="true" /> Salvando…</span>;
  if (salvo.estado === "sujo") return <span role="status" style={{ ...base, color: C.text3 }}>Alterações ainda não salvas</span>;
  if (salvo.estado === "erro") {
    return (
      <span role="alert" style={{ ...base, color: C.red }}>
        {salvo.msg || "Não foi possível salvar."}
        <button type="button" onClick={onTentar} style={{ color: C.teal, fontWeight: 600, textDecoration: "underline" }}>Tentar de novo</button>
      </span>
    );
  }
  return <span role="status" style={{ ...base, color: C.green }}><CheckCircle2 size={13} aria-hidden="true" /> {salvo.em ? `Rascunho salvo às ${horaCurta(salvo.em)}` : "Rascunho salvo"}</span>;
}

// ---------------------------------------------------------------------------
// Campos
// ---------------------------------------------------------------------------

function Campo({ rotulo, id, children, dica, obrigatorio = true, erro, col }) {
  return (
    <div style={{ marginBottom: 12, gridColumn: col }}>
      <label htmlFor={id} style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.text2, marginBottom: 5 }}>
        {rotulo}{!obrigatorio && <span style={{ fontWeight: 400, color: C.text4 }}> (opcional)</span>}
      </label>
      {children}
      {dica && !erro && <div style={{ fontSize: 12, color: C.text3, marginTop: 4, lineHeight: 1.45 }}>{dica}</div>}
      {erro && <div style={{ fontSize: 12, color: C.red, marginTop: 4 }}>{erro}</div>}
    </div>
  );
}

const grade = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", columnGap: 14 };
const inpCampo = { ...inp, fontSize: 15 };

function Opcoes({ nome, valor, opcoes, onChange, colunas = "repeat(auto-fit, minmax(200px, 1fr))", multipla = false }) {
  return (
    <div role={multipla ? "group" : "radiogroup"} aria-label={nome} style={{ display: "grid", gridTemplateColumns: colunas, gap: 8 }}>
      {Object.entries(opcoes).map(([id, rot]) => {
        const sel = multipla ? (valor || []).includes(id) : valor === id;
        return (
          <label key={id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, border: `1px solid ${sel ? C.cafe : C.border}`, background: sel ? C.cafePale : C.white, cursor: "pointer", fontSize: 14 }}>
            <input
              type={multipla ? "checkbox" : "radio"} name={nome} checked={sel}
              onChange={() => onChange(multipla ? (sel ? valor.filter((v) => v !== id) : [...(valor || []), id]) : id)}
              style={{ accentColor: C.cafe, width: 17, height: 17, flexShrink: 0 }}
            />
            {rot}
          </label>
        );
      })}
    </div>
  );
}

function Titulo({ children, sub }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <h2 style={{ fontFamily: serif, fontSize: 22, fontWeight: 500, margin: 0 }}>{children}</h2>
      {sub && <p style={{ fontSize: 14, color: C.text3, margin: "4px 0 0", lineHeight: 1.5 }}>{sub}</p>}
    </div>
  );
}

function EtapaEmpresa({ e, set }) {
  const mei = e.tipo === "mei";
  return (
    <div>
      <Titulo sub="Se tiver dúvida sobre o tipo, escolha o que parece mais próximo: a contabilidade confere e orienta antes do registro.">Sobre a empresa</Titulo>
      <Campo rotulo="Tipo de empresa" id="tipo-empresa">
        <Opcoes nome="Tipo de empresa" valor={e.tipo} opcoes={TIPOS_EMPRESA} onChange={(tipo) => set({ tipo })} />
      </Campo>
      {!mei && (
        <Campo rotulo="3 opções de nome, em ordem de preferência" id="nome-1" dica="A Junta Comercial aprova o primeiro nome livre. Evite nomes iguais a marcas conhecidas.">
          <div style={{ display: "grid", gap: 8 }}>
            {[0, 1, 2].map((i) => (
              <input key={i} id={`nome-${i + 1}`} value={e.nomes[i]} maxLength={150} style={inpCampo} placeholder={`Opção ${i + 1}`}
                aria-label={`Opção de nome ${i + 1}`} onChange={(ev) => set({ nomes: e.nomes.map((n, j) => (j === i ? ev.target.value : n)) })} />
            ))}
          </div>
        </Campo>
      )}
      <Campo rotulo={mei ? "Nome fantasia do MEI" : "Nome fantasia"} id="fantasia" obrigatorio={mei} dica={mei ? "É o nome comercial que aparece para os seus clientes." : "Nome comercial, se for diferente da razão social."}>
        <input id="fantasia" value={e.nome_fantasia} maxLength={150} style={inpCampo} onChange={(ev) => set({ nome_fantasia: ev.target.value })} />
      </Campo>
      <Campo rotulo="O que a empresa vai fazer" id="atividades" dica="Descreva com suas palavras os produtos e serviços. A contabilidade escolhe os códigos de atividade (CNAE).">
        <textarea id="atividades" value={e.atividades} maxLength={3000} rows={4} style={{ ...inpCampo, resize: "vertical" }} onChange={(ev) => set({ atividades: ev.target.value })} />
      </Campo>
      <div style={grade}>
        {!mei && (
          <Campo rotulo="Capital social (R$)" id="capital" dica="Valor que os sócios investem na empresa ao abrir.">
            <input id="capital" inputMode="decimal" value={e.capital_social} style={inpCampo} placeholder="Ex.: 10.000,00" onChange={(ev) => set({ capital_social: ev.target.value })} />
          </Campo>
        )}
        <Campo rotulo="Faturamento mensal estimado (R$)" id="faturamento" obrigatorio={false}>
          <input id="faturamento" inputMode="decimal" value={e.faturamento_mensal} style={inpCampo} placeholder="Ex.: 15.000,00" onChange={(ev) => set({ faturamento_mensal: ev.target.value })} />
        </Campo>
      </div>
      <Campo rotulo="Como a empresa vai atuar (marque todas que valem)" id="atuacao">
        <Opcoes nome="Forma de atuação" valor={e.atuacao} opcoes={ATUACAO} multipla onChange={(atuacao) => set({ atuacao })} colunas="1fr" />
      </Campo>
    </div>
  );
}

function EtapaSocios({ dados, setDados, setSocio, docProps }) {
  const socios = dados.socios;
  const lim = limiteSocios(dados.empresa.tipo);
  const unico = lim.max === 1;
  const soma = Math.round(socios.reduce((t, s) => t + (Number(String(s.participacao ?? "").replace(",", ".")) || 0), 0) * 100) / 100;
  const [remover, setRemover] = useState(null);

  const adicionar = () => setDados((d) => ({ ...d, socios: [...d.socios, socioVazio()] }));
  const confirmarRemocao = () => {
    const i = remover;
    setRemover(null);
    setDados((d) => ({ ...d, socios: d.socios.filter((_, j) => j !== i) }));
  };

  return (
    <div>
      <Titulo sub={unico ? "Dados do titular da empresa. Os documentos podem ser foto nítida ou PDF." : "Dados de cada sócio. Os documentos podem ser foto nítida ou PDF."}>
        {unico ? "Titular" : "Sócios"}
      </Titulo>
      {unico && socios.length > 1 && <Aviso cor={C.amber}>{TIPOS_EMPRESA[dados.empresa.tipo]} tem um único titular. Remova os sócios a mais ou troque o tipo de empresa.</Aviso>}
      {socios.map((s, i) => (
        <Socio key={s.id} s={s} i={i} total={socios.length} set={(patch) => setSocio(i, patch)} onRemover={() => setRemover(i)} docProps={docProps} />
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
        {socios.length < lim.max ? (
          <Btn variant="ghost" onClick={adicionar}><Plus size={15} aria-hidden="true" /> Adicionar sócio</Btn>
        ) : <span />}
        {socios.length > 1 && (
          <span role="status" style={{ fontSize: 14, fontWeight: 600, color: soma === 100 ? C.green : C.amber }}>
            Soma das participações: {String(soma).replace(".", ",")}%
          </span>
        )}
      </div>
      <ConfirmDialog
        aberto={remover !== null}
        titulo="Remover sócio?"
        mensagem="Os dados e os anexos deste sócio serão apagados."
        textoConfirmar="Remover"
        onConfirmar={confirmarRemocao}
        onCancelar={() => setRemover(null)}
      />
    </div>
  );
}

function Socio({ s, i, total, set, onRemover, docProps }) {
  const pre = `socio-${s.id}`;
  const [buscandoCep, setBuscandoCep] = useState(false);
  const cpfDigitos = String(s.cpf || "").replace(/\D/g, "");
  const cpfErro = cpfDigitos.length === 11 && !cpfValido(cpfDigitos) ? "CPF inválido. Confira os números." : "";
  const casado = s.estado_civil === "casado" || s.estado_civil === "uniao_estavel";
  const setEnd = (patch) => set({ endereco: { ...s.endereco, ...patch } });

  const preencherCep = async (valor) => {
    const d = String(valor).replace(/\D/g, "");
    setEnd({ cep: d });
    if (d.length !== 8) return;
    setBuscandoCep(true);
    const r = await buscarCep(d);
    setBuscandoCep(false);
    if (r) set({ endereco: { ...s.endereco, cep: d, logradouro: r.logradouro || s.endereco.logradouro, bairro: r.bairro || s.endereco.bairro, cidade: r.cidade || s.endereco.cidade, uf: r.uf || s.endereco.uf } });
  };

  const docsSocio = (categoria) => docProps.docs.filter((d) => d.categoria === categoria && d.socio_id === s.id);

  return (
    <fieldset style={{ border: `1px solid ${C.border}`, borderRadius: 16, padding: "14px 14px 4px", margin: "0 0 14px", minWidth: 0 }}>
      <legend style={{ padding: "0 6px", fontFamily: serif, fontSize: 18 }}>{total > 1 ? `Sócio ${i + 1}` : "Titular"}{s.nome ? ` · ${s.nome.split(" ")[0]}` : ""}</legend>
      {total > 1 && (
        <div style={{ textAlign: "right", marginTop: -6 }}>
          <button type="button" onClick={onRemover} style={{ display: "inline-flex", alignItems: "center", gap: 5, color: C.red, fontSize: 13, fontWeight: 600, padding: 4 }}>
            <Trash2 size={14} aria-hidden="true" /> Remover sócio
          </button>
        </div>
      )}
      <div style={grade}>
        <Campo rotulo="Nome completo" id={`${pre}-nome`} col="1 / -1">
          <input id={`${pre}-nome`} value={s.nome} maxLength={200} autoComplete="name" style={inpCampo} onChange={(e) => set({ nome: e.target.value })} />
        </Campo>
        <Campo rotulo="CPF" id={`${pre}-cpf`} erro={cpfErro}>
          <input id={`${pre}-cpf`} inputMode="numeric" value={cpfDigitos.length === 11 ? formatarCPF(cpfDigitos) : s.cpf} maxLength={14} style={{ ...inpCampo, borderColor: cpfErro ? C.red : undefined }}
            aria-invalid={!!cpfErro} onChange={(e) => set({ cpf: e.target.value.replace(/\D/g, "").slice(0, 11) })} placeholder="000.000.000-00" />
        </Campo>
        <Campo rotulo="Data de nascimento" id={`${pre}-nasc`}>
          <input id={`${pre}-nasc`} type="date" value={s.nascimento} style={inpCampo} onChange={(e) => set({ nascimento: e.target.value })} />
        </Campo>
        <Campo rotulo="RG" id={`${pre}-rg`}>
          <input id={`${pre}-rg`} value={s.rg} maxLength={30} style={inpCampo} onChange={(e) => set({ rg: e.target.value })} />
        </Campo>
        <Campo rotulo="Órgão emissor" id={`${pre}-org`}>
          <input id={`${pre}-org`} value={s.rg_orgao} maxLength={30} style={inpCampo} placeholder="Ex.: SSP/MG" onChange={(e) => set({ rg_orgao: e.target.value })} />
        </Campo>
        <Campo rotulo="Estado civil" id={`${pre}-civil`}>
          <select id={`${pre}-civil`} value={s.estado_civil} style={inpCampo} onChange={(e) => set({ estado_civil: e.target.value, regime_bens: e.target.value === "casado" || e.target.value === "uniao_estavel" ? s.regime_bens : "" })}>
            <option value="">Escolha…</option>
            {Object.entries(ESTADOS_CIVIS).map(([id, r]) => <option key={id} value={id}>{r}</option>)}
          </select>
        </Campo>
        {casado && (
          <Campo rotulo="Regime de bens" id={`${pre}-regime`}>
            <select id={`${pre}-regime`} value={s.regime_bens} style={inpCampo} onChange={(e) => set({ regime_bens: e.target.value })}>
              <option value="">Escolha…</option>
              {Object.entries(REGIMES_BENS).map(([id, r]) => <option key={id} value={id}>{r}</option>)}
            </select>
          </Campo>
        )}
        <Campo rotulo="Profissão" id={`${pre}-prof`}>
          <input id={`${pre}-prof`} value={s.profissao} maxLength={100} style={inpCampo} onChange={(e) => set({ profissao: e.target.value })} />
        </Campo>
        <Campo rotulo="E-mail" id={`${pre}-email`}>
          <input id={`${pre}-email`} type="email" value={s.email} maxLength={200} autoComplete="email" style={inpCampo} onChange={(e) => set({ email: e.target.value })} />
        </Campo>
        <Campo rotulo="Telefone com DDD" id={`${pre}-tel`}>
          <input id={`${pre}-tel`} type="tel" inputMode="tel" value={s.telefone} maxLength={16} autoComplete="tel" style={inpCampo} placeholder="(31) 99999-0000" onChange={(e) => set({ telefone: e.target.value.replace(/\D/g, "").slice(0, 13) })} />
        </Campo>
      </div>

      <div style={{ fontSize: 14, fontWeight: 600, color: C.text2, margin: "4px 0 8px" }}>Endereço residencial</div>
      <div style={grade}>
        <Campo rotulo="CEP" id={`${pre}-cep`} dica={buscandoCep ? "Buscando endereço…" : "Preenchemos a rua e a cidade pelo CEP."}>
          <input id={`${pre}-cep`} inputMode="numeric" value={s.endereco.cep} maxLength={9} style={inpCampo} onChange={(e) => preencherCep(e.target.value)} placeholder="00000-000" />
        </Campo>
        <Campo rotulo="Rua / avenida" id={`${pre}-rua`}>
          <input id={`${pre}-rua`} value={s.endereco.logradouro} maxLength={200} style={inpCampo} onChange={(e) => setEnd({ logradouro: e.target.value })} />
        </Campo>
        <Campo rotulo="Número" id={`${pre}-num`}>
          <input id={`${pre}-num`} value={s.endereco.numero} maxLength={20} style={inpCampo} onChange={(e) => setEnd({ numero: e.target.value })} />
        </Campo>
        <Campo rotulo="Complemento" id={`${pre}-compl`} obrigatorio={false}>
          <input id={`${pre}-compl`} value={s.endereco.complemento} maxLength={100} style={inpCampo} onChange={(e) => setEnd({ complemento: e.target.value })} />
        </Campo>
        <Campo rotulo="Bairro" id={`${pre}-bairro`}>
          <input id={`${pre}-bairro`} value={s.endereco.bairro} maxLength={100} style={inpCampo} onChange={(e) => setEnd({ bairro: e.target.value })} />
        </Campo>
        <Campo rotulo="Cidade" id={`${pre}-cidade`}>
          <input id={`${pre}-cidade`} value={s.endereco.cidade} maxLength={100} style={inpCampo} onChange={(e) => setEnd({ cidade: e.target.value })} />
        </Campo>
        <Campo rotulo="UF" id={`${pre}-uf`}>
          <select id={`${pre}-uf`} value={s.endereco.uf} style={inpCampo} onChange={(e) => setEnd({ uf: e.target.value })}>
            <option value="">UF</option>
            {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
          </select>
        </Campo>
      </div>

      <div style={grade}>
        {total > 1 && (
          <Campo rotulo="Participação no capital (%)" id={`${pre}-part`}>
            <input id={`${pre}-part`} inputMode="decimal" value={s.participacao ?? ""} maxLength={6} style={inpCampo} placeholder="Ex.: 50" onChange={(e) => set({ participacao: e.target.value })} />
          </Campo>
        )}
        <div style={{ marginBottom: 12, display: "flex", alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, cursor: "pointer", padding: "10px 0" }}>
            <input type="checkbox" checked={!!s.administrador} onChange={(e) => set({ administrador: e.target.checked })} style={{ accentColor: C.cafe, width: 18, height: 18 }} />
            Vai administrar a empresa (assina pela empresa)
          </label>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginBottom: 12 }}>
        {["socio_identidade", "socio_residencia"].map((categoria) => (
          <div key={categoria} style={{ border: `1px dashed ${C.gray}`, borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{DOCS_CLIENTE[categoria]}</div>
            <div style={{ fontSize: 12, color: C.text3, marginBottom: 8 }}>
              {categoria === "socio_identidade" ? "Frente e verso, legível e dentro da validade." : "Conta de luz, água, telefone ou internet dos últimos 3 meses."}
            </div>
            <ListaDocumentos docs={docsSocio(categoria)} aberturaId={docProps.aberturaId} mostrarTipo={false} vazio="Nenhum arquivo ainda."
              podeRemover={(d) => d.meu} onRemovido={docProps.onRemovido} />
            <div style={{ marginTop: 8 }}>
              <EnvioArquivo aberturaId={docProps.aberturaId} lado="cliente" categoria={categoria} socioId={s.id} rotulo={`${DOCS_CLIENTE[categoria]} de ${s.nome || "sócio"}`}
                antes={docProps.antes} onEnviado={docProps.onEnviado} />
            </div>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

function EtapaLocal({ det, l, set, docProps }) {
  const a = det.abertura;
  const [buscandoCep, setBuscandoCep] = useState(false);

  if (a.usa_endereco_unidade) {
    const iptu = (det.kit || []).find((k) => k.tipo === "iptu");
    return (
      <div>
        <Titulo sub="Sua empresa vai usar o endereço fiscal do CafeWorking. Você não precisa enviar nada do imóvel.">Local da empresa</Titulo>
        <div style={{ background: C.tealPale, borderRadius: 14, padding: 16 }}>
          <div style={{ fontFamily: serif, fontSize: 19 }}>CafeWorking {det.unidade?.nome}</div>
          {det.unidade?.endereco && <div style={{ fontSize: 14, color: C.text2, marginTop: 2 }}>{det.unidade.endereco}{det.unidade.cidade ? ` · ${det.unidade.cidade}` : ""}</div>}
          {iptu?.numero && <div style={{ marginTop: 8 }}><NumeroCopiavel rotulo="Índice cadastral do IPTU" numero={iptu.numero} /></div>}
          <div style={{ marginTop: 10 }}>
            {det.kit?.length ? <KitLista kit={det.kit} /> : <div style={{ fontSize: 13, color: C.text3 }}>A equipe inclui o IPTU da unidade para a contabilidade.</div>}
          </div>
        </div>
      </div>
    );
  }

  const preencherCep = async (valor) => {
    const d = String(valor).replace(/\D/g, "");
    set({ cep: d });
    if (d.length !== 8) return;
    setBuscandoCep(true);
    const r = await buscarCep(d);
    setBuscandoCep(false);
    if (r) set({ cep: d, logradouro: r.logradouro || l.logradouro, bairro: r.bairro || l.bairro, cidade: r.cidade || l.cidade, uf: r.uf || l.uf });
  };
  const docsCat = (categoria) => docProps.docs.filter((d) => d.categoria === categoria);
  const blocoDoc = (categoria, obrigatorio, dica) => (
    <div key={categoria} style={{ border: `1px dashed ${C.gray}`, borderRadius: 12, padding: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{DOCS_CLIENTE[categoria]}{!obrigatorio && <span style={{ fontWeight: 400, color: C.text4 }}> (opcional)</span>}</div>
      {dica && <div style={{ fontSize: 12, color: C.text3, marginBottom: 8 }}>{dica}</div>}
      <ListaDocumentos docs={docsCat(categoria)} aberturaId={docProps.aberturaId} mostrarTipo={false} vazio="Nenhum arquivo ainda." podeRemover={(d) => d.meu} onRemovido={docProps.onRemovido} />
      <div style={{ marginTop: 8 }}>
        <EnvioArquivo aberturaId={docProps.aberturaId} lado="cliente" categoria={categoria} rotulo={DOCS_CLIENTE[categoria]} antes={docProps.antes} onEnviado={docProps.onEnviado} />
      </div>
    </div>
  );

  return (
    <div>
      <Titulo sub="Endereço onde a empresa vai funcionar. A prefeitura confere se a atividade é permitida no local.">Local da empresa</Titulo>
      <div style={grade}>
        <Campo rotulo="CEP" id="local-cep" dica={buscandoCep ? "Buscando endereço…" : undefined}>
          <input id="local-cep" inputMode="numeric" value={l.cep} maxLength={9} style={inpCampo} onChange={(e) => preencherCep(e.target.value)} placeholder="00000-000" />
        </Campo>
        <Campo rotulo="Rua / avenida" id="local-rua">
          <input id="local-rua" value={l.logradouro} maxLength={200} style={inpCampo} onChange={(e) => set({ logradouro: e.target.value })} />
        </Campo>
        <Campo rotulo="Número" id="local-num">
          <input id="local-num" value={l.numero} maxLength={20} style={inpCampo} onChange={(e) => set({ numero: e.target.value })} />
        </Campo>
        <Campo rotulo="Complemento" id="local-compl" obrigatorio={false}>
          <input id="local-compl" value={l.complemento} maxLength={100} style={inpCampo} onChange={(e) => set({ complemento: e.target.value })} />
        </Campo>
        <Campo rotulo="Bairro" id="local-bairro">
          <input id="local-bairro" value={l.bairro} maxLength={100} style={inpCampo} onChange={(e) => set({ bairro: e.target.value })} />
        </Campo>
        <Campo rotulo="Cidade" id="local-cidade">
          <input id="local-cidade" value={l.cidade} maxLength={100} style={inpCampo} onChange={(e) => set({ cidade: e.target.value })} />
        </Campo>
        <Campo rotulo="UF" id="local-uf">
          <select id="local-uf" value={l.uf} style={inpCampo} onChange={(e) => set({ uf: e.target.value })}>
            <option value="">UF</option>
            {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Índice cadastral do IPTU" id="local-indice" dica="Fica no carnê do IPTU, perto do nome do proprietário.">
          <input id="local-indice" value={l.indice_cadastral} maxLength={60} style={inpCampo} onChange={(e) => set({ indice_cadastral: e.target.value })} />
        </Campo>
        <Campo rotulo="Área utilizada (m²)" id="local-area">
          <input id="local-area" inputMode="decimal" value={l.area_m2 ?? ""} maxLength={10} style={inpCampo} onChange={(e) => set({ area_m2: e.target.value })} />
        </Campo>
      </div>
      <Campo rotulo="O imóvel é" id="local-tipo">
        <Opcoes nome="Tipo do imóvel" valor={l.tipo_imovel} opcoes={TIPOS_IMOVEL} onChange={(tipo_imovel) => set({ tipo_imovel })} colunas="repeat(auto-fit, minmax(140px, 1fr))" />
      </Campo>
      <Campo rotulo="O imóvel é de um dos sócios?" id="local-dono">
        <Opcoes nome="O imóvel é de um dos sócios" valor={l.imovel_de_socio === true ? "sim" : l.imovel_de_socio === false ? "nao" : ""} opcoes={{ sim: "Sim", nao: "Não" }}
          onChange={(v) => set({ imovel_de_socio: v === "sim" })} colunas="repeat(auto-fit, minmax(140px, 1fr))" />
      </Campo>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
        {blocoDoc("iptu", true, "Carnê ou certidão do IPTU em que apareça o índice cadastral.")}
        {l.imovel_de_socio === false && blocoDoc("autorizacao_proprietario", true, "Declaração assinada pelo proprietário autorizando a empresa no endereço.")}
        {blocoDoc("avcb", false, "Se o imóvel já tiver o auto de vistoria do Corpo de Bombeiros.")}
      </div>
    </div>
  );
}

function EtapaGovbr({ socios, setSocio }) {
  return (
    <div>
      <Titulo sub="Os atos de abertura são assinados pela conta gov.br de cada sócio. Para assinar, a conta precisa ser prata ou ouro.">Conta gov.br</Titulo>
      <Aviso>
        Para ver o nível, entre no aplicativo ou no site gov.br e abra <b>Segurança da conta</b> (ou <b>Privacidade</b>, em versões antigas).
        Conta bronze sobe para prata validando o rosto no app gov.br ou pelo internet banking de um banco credenciado.
      </Aviso>
      {socios.map((s, i) => (
        <Campo key={s.id} rotulo={`Nível da conta gov.br · ${s.nome || (socios.length > 1 ? `Sócio ${i + 1}` : "Titular")}`} id={`govbr-${s.id}`}>
          <Opcoes nome={`Nível gov.br de ${s.nome || `sócio ${i + 1}`}`} valor={s.govbr} opcoes={NIVEIS_GOVBR} onChange={(govbr) => setSocio(i, { govbr })} colunas="repeat(auto-fit, minmax(120px, 1fr))" />
          {(s.govbr === "bronze" || s.govbr === "nao_sei") && (
            <div role="note" style={{ fontSize: 13, color: C.amber, marginTop: 6 }}>
              <AlertTriangle size={13} style={{ verticalAlign: "-2px" }} aria-hidden="true" /> Com conta bronze não dá para assinar. Suba para prata ou ouro antes do registro para não atrasar a abertura.
            </div>
          )}
        </Campo>
      ))}
    </div>
  );
}

const ROTULO_ETAPA = { empresa: "Empresa", socios: "Sócios", local: "Local", govbr: "gov.br" };

function EtapaRevisao({ det, dados, docs, pendencias, irPara, docProps, antesDeEnviar, onEnviado }) {
  const a = det.abertura;
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [pendServidor, setPendServidor] = useState([]);
  const semAssinatura = sociosSemGovbrParaAssinar(dados);
  const lista = pendServidor.length ? pendServidor : pendencias;

  const enviar = async () => {
    setConfirmar(false);
    setErro("");
    setPendServidor([]);
    setEnviando(true);
    antesDeEnviar();
    try {
      await aberturasApi.enviar(a.id, dados);
      onEnviado();
    } catch (e) {
      setErro(mensagemDe(e, "Não foi possível enviar agora. Tente de novo."));
      if (e.pendencias) setPendServidor(e.pendencias);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div>
      <Titulo sub="Confira tudo antes de enviar. Depois do envio, os dados só mudam se a contabilidade pedir um ajuste.">Revisão e envio</Titulo>
      {lista.length > 0 ? (
        <div role="region" aria-label="Pendências" style={{ background: C.amberPale, borderRadius: 14, padding: "12px 14px", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: C.text, marginBottom: 6 }}>Falta{lista.length > 1 ? "m" : ""} {lista.length} ite{lista.length > 1 ? "ns" : "m"} para enviar</div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {lista.map((p, i) => (
              <li key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", padding: "5px 0", borderTop: i ? `1px solid ${C.amber}22` : "none", flexWrap: "wrap" }}>
                <span style={{ fontSize: 14, color: C.text2 }}>{p.mensagem}</span>
                {ROTULO_ETAPA[p.etapa] && (
                  <button type="button" onClick={() => irPara(p.etapa)} style={{ fontSize: 13, color: C.teal, fontWeight: 600, whiteSpace: "nowrap" }}>Ir para {ROTULO_ETAPA[p.etapa]}</button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <Aviso cor={C.green}><CheckCircle2 size={15} style={{ verticalAlign: "-3px" }} aria-hidden="true" /> Tudo preenchido. Confira o resumo e envie para a contabilidade.</Aviso>
      )}
      {semAssinatura.length > 0 && (
        <Aviso cor={C.amber}>Conta gov.br sem nível para assinar: {semAssinatura.join(", ")}. Dá para enviar, mas o registro só avança com conta prata ou ouro.</Aviso>
      )}

      <ResumoDados dados={dados} docs={docs} usaEnderecoUnidade={a.usa_endereco_unidade} unidade={det.unidade} kit={det.kit} aberturaId={a.id}
        acoesDoc={{ podeRemover: (d) => d.meu, onRemovido: docProps.onRemovido }} />

      <Secao titulo="Outro documento" id="rev-outro" extra={<span style={{ fontSize: 12, color: C.text4 }}>opcional</span>}>
        <p style={{ fontSize: 13, color: C.text3, margin: "0 0 8px" }}>Algo que ajude a contabilidade: certidão de casamento, registro profissional, contrato de locação…</p>
        <EnvioArquivo aberturaId={a.id} lado="cliente" categoria="outro_cliente" rotulo="Outro documento" antes={docProps.antes} onEnviado={docProps.onEnviado} />
      </Secao>

      {erro && <div role="alert" style={{ fontSize: 14, color: C.red, background: C.redPale, borderRadius: 10, padding: "10px 12px", marginTop: 16 }}>{erro}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 20, borderTop: `1px solid ${C.border2}`, paddingTop: 14, flexWrap: "wrap" }}>
        <Btn variant="ghost" onClick={() => irPara("govbr")}><ChevronLeft size={15} aria-hidden="true" /> Voltar</Btn>
        <Btn onClick={() => setConfirmar(true)} disabled={enviando || pendencias.length > 0} style={{ opacity: enviando || pendencias.length ? 0.55 : 1 }}>
          {enviando ? <><Loader2 size={15} className="cw-spin" aria-hidden="true" /> Enviando…</> : <><Send size={15} aria-hidden="true" /> Enviar para a contabilidade</>}
        </Btn>
      </div>
      <ConfirmDialog
        aberto={confirmar}
        perigo={false}
        titulo={a.status === "pendente_cliente" ? "Reenviar para a contabilidade?" : "Enviar para a contabilidade?"}
        mensagem="Depois do envio, os dados ficam com a contabilidade para conferência e só voltam para você se for preciso algum ajuste."
        textoConfirmar="Enviar"
        onConfirmar={enviar}
        onCancelar={() => setConfirmar(false)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Acompanhamento (depois do envio)
// ---------------------------------------------------------------------------

const PASSOS = [
  { id: 1, icon: Send, titulo: "Dados enviados", sub: "Você preencheu e anexou os documentos." },
  { id: 2, icon: Search, titulo: "Conferência da contabilidade", sub: "A Ciatos Contabilidade confere os dados e prepara o registro." },
  { id: 3, icon: FileText, titulo: "Registro nos órgãos", sub: "Junta Comercial, Receita Federal e prefeitura (Redesim)." },
  { id: 4, icon: CheckCircle2, titulo: "Empresa aberta", sub: "CNPJ, contrato social e inscrições disponíveis aqui." },
];
const PASSO_DO_STATUS = { em_analise: 2, em_registro: 3, concluida: 4 };

function Acompanhamento({ det, recarregar }) {
  const a = det.abertura;
  const st = STATUS_ABERTURA_UI[a.status] || {};
  const atual = PASSO_DO_STATUS[a.status] || 1;
  const concluida = a.status === "concluida";
  const docsEmpresa = (det.documentos || []).filter((d) => d.lado === "contabilidade");
  const docsCliente = (det.documentos || []).filter((d) => d.lado === "cliente");

  return (
    <div>
      {concluida && (
        <Card style={{ marginBottom: 16, borderLeft: `4px solid ${C.green}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.green, fontWeight: 700, marginBottom: 10 }}>
            <CheckCircle2 size={18} aria-hidden="true" /> Sua empresa
          </div>
          <CartaoEmpresa resultado={a.resultado} />
          <Secao titulo="Documentos da empresa" id="docs-empresa">
            <ListaDocumentos docs={docsEmpresa} aberturaId={a.id} vazio="Os documentos aparecem aqui assim que a contabilidade anexar." />
            <p style={{ fontSize: 12, color: C.text3, margin: "8px 0 0" }}>
              Por segurança, os links valem por {det.validade_link_minutos || 10} minutos. <button type="button" onClick={recarregar} style={{ color: C.teal, fontWeight: 600, textDecoration: "underline" }}>Gerar novos links</button>
            </p>
          </Secao>
        </Card>
      )}

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: serif, fontSize: 22 }}>{concluida ? "Abertura concluída" : "Andamento da abertura"}</div>
            <div style={{ fontSize: 13, color: C.text3 }}>{a.enviado_em ? `Dados enviados em ${dataBR(a.enviado_em)}` : ""}{a.plano_nome ? ` · ${a.plano_nome}` : ""}</div>
          </div>
          <Badge color={C[st.cor] || C.text3}>{st.cliente || a.status}</Badge>
        </div>
        {a.status === "cancelada" ? (
          <Aviso cor={C.text3}>Este processo de abertura foi cancelado. Se tiver dúvida, fale com a recepção.</Aviso>
        ) : (
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
            {PASSOS.map((p) => {
              const feito = p.id < atual || (concluida && p.id === atual);
              const agora = p.id === atual && !concluida;
              const cor = feito ? C.green : agora ? C.cafe : C.text4;
              return (
                <li key={p.id} aria-current={agora ? "step" : undefined} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: "50%", border: `2px solid ${cor}`, background: feito ? C.greenPale : C.white, display: "grid", placeItems: "center", flexShrink: 0 }}>
                    <p.icon size={16} color={cor} />
                  </span>
                  <span>
                    <span style={{ display: "block", fontSize: 15, fontWeight: 600, color: agora || feito ? C.text : C.text3 }}>{p.titulo}{feito ? " · concluído" : agora ? " · agora" : ""}</span>
                    <span style={{ fontSize: 13, color: C.text3 }}>{p.sub}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <h2 style={{ fontFamily: serif, fontSize: 20, fontWeight: 500, margin: "0 0 12px" }}>Histórico</h2>
        <Historico eventos={det.eventos} />
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 600, color: C.teal }}>Dados enviados ({docsCliente.length} anexo{docsCliente.length === 1 ? "" : "s"})</summary>
          <ResumoDados dados={a.dados} docs={docsCliente} usaEnderecoUnidade={a.usa_endereco_unidade} unidade={det.unidade} kit={det.kit} aberturaId={a.id} />
        </details>
      </Card>
      <CartaoRecepcao compacto titulo="Dúvidas sobre a abertura?" mensagemWhatsapp="Olá! Tenho uma dúvida sobre a abertura da minha empresa no CafeWorking." />
    </div>
  );
}
