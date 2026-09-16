// ============================================================================
// Peças da abertura de empresa usadas pela tela do cliente (cliente/
// AberturaEmpresa.jsx) e pela tela da contabilidade/equipe (Aberturas.jsx):
// envio de arquivo com progresso, lista de documentos, resumo dos dados
// enviados, histórico e o cartão "Sua empresa".
// ============================================================================

import { useRef, useState } from "react";
import { Upload, Camera, Loader2, FileText, ExternalLink, Trash2, Copy, Check } from "lucide-react";
import { C, serif } from "../lib/theme.js";
import { mensagemDe } from "../lib/erros.js";
import {
  aberturasApi, ATUACAO, AUTOR_EVENTO, dataBR, dataHoraBR, DOCS_CLIENTE, DOCS_CONTABILIDADE, ESTADOS_CIVIS, formatarCEP,
  formatarCNAE, formatarCNPJ, formatarCPF, NIVEIS_GOVBR, REGIMES_BENS, REGIMES_TRIBUTARIOS, TIPOS_EMPRESA, TIPOS_IMOVEL,
} from "../lib/aberturasApi.js";

const telaDeToque = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
const fmtMoeda = (n) => (n === null || n === undefined || n === "" ? "—"
  : "R$ " + Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtTelefone = (t) => String(t || "").replace(/^(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3");

export const rotuloDoc = (d) => (d.lado === "contabilidade" ? DOCS_CONTABILIDADE : DOCS_CLIENTE)[d.categoria] || "Documento";

/** Botão de envio (arquivo e, no celular, câmera) com barra de progresso. */
export function EnvioArquivo({ aberturaId, lado, categoria, socioId = null, rotulo, antes, onEnviado, desabilitado }) {
  const [progresso, setProgresso] = useState(null);
  const [erro, setErro] = useState("");
  const inputs = useRef({});
  const toque = telaDeToque();
  const idBase = `up-${categoria}-${socioId || "x"}`;

  const enviar = async (arquivo, chave) => {
    if (!arquivo) return;
    setErro("");
    setProgresso(0);
    try {
      if (antes) await antes();
      const r = await aberturasApi.enviarDocumento(aberturaId, { lado, categoria, socioId }, arquivo, setProgresso);
      if (r?.documento) onEnviado?.(r.documento);
    } catch (e) {
      setErro(mensagemDe(e, "Não foi possível enviar o arquivo. Tente de novo."));
    } finally {
      setProgresso(null);
      if (inputs.current[chave]) inputs.current[chave].value = "";
    }
  };

  const estilo = {
    display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: C.teal,
    cursor: progresso !== null || desabilitado ? "not-allowed" : "pointer", padding: "7px 11px", borderRadius: 10,
    border: `1px solid ${C.tealLine}`, background: C.white, opacity: desabilitado ? 0.6 : 1,
  };

  return (
    <div>
      {progresso !== null ? (
        <span role="status" aria-live="polite" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.text3, minWidth: 180 }}>
          <Loader2 size={14} className="cw-spin" aria-hidden="true" />
          <span role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progresso} aria-label={`Enviando ${rotulo}`}
            style={{ flex: 1, height: 6, background: C.cream2, borderRadius: 4, overflow: "hidden" }}>
            <span style={{ display: "block", width: `${progresso}%`, height: "100%", background: C.teal, transition: "width .2s" }} />
          </span>
          {progresso}%
        </span>
      ) : (
        <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <label style={estilo} htmlFor={`${idBase}-arq`}>
            <Upload size={14} aria-hidden="true" /> Anexar arquivo
            <input id={`${idBase}-arq`} ref={(el) => { inputs.current.arquivo = el; }} type="file" className="cw-sr-only"
              accept="application/pdf,image/jpeg,image/png,image/heic,image/heif,image/webp" disabled={desabilitado}
              onChange={(e) => enviar(e.target.files?.[0], "arquivo")} aria-label={`Anexar arquivo: ${rotulo}`} />
          </label>
          {toque && (
            <label style={estilo} htmlFor={`${idBase}-cam`}>
              <Camera size={14} aria-hidden="true" /> Tirar foto
              <input id={`${idBase}-cam`} ref={(el) => { inputs.current.camera = el; }} type="file" accept="image/*" capture="environment"
                className="cw-sr-only" disabled={desabilitado} onChange={(e) => enviar(e.target.files?.[0], "camera")} aria-label={`Tirar foto: ${rotulo}`} />
            </label>
          )}
        </span>
      )}
      {erro && <div role="alert" style={{ fontSize: 13, color: C.red, marginTop: 6 }}>{erro}</div>}
    </div>
  );
}

/** Lista de documentos com abrir e (para quem enviou, com o processo aberto) remover. */
export function ListaDocumentos({ docs, aberturaId, podeRemover, onRemovido, vazio = "Nenhum arquivo anexado.", mostrarTipo = true }) {
  const [removendo, setRemovendo] = useState("");
  const [erro, setErro] = useState("");
  const remover = async (d) => {
    setErro("");
    setRemovendo(d.id);
    try {
      await aberturasApi.removerDocumento(aberturaId, d.id);
      onRemovido?.(d.id);
    } catch (e) {
      setErro(mensagemDe(e, "Não foi possível remover."));
    } finally {
      setRemovendo("");
    }
  };
  if (!docs.length) return <div style={{ fontSize: 13, color: C.text4 }}>{vazio}</div>;
  return (
    <div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {docs.map((d, i) => (
          <li key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i ? `1px solid ${C.border2}` : "none", flexWrap: "wrap" }}>
            <FileText size={16} color={C.teal} aria-hidden="true" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 150 }}>
              <div style={{ fontSize: 14, fontWeight: 600, wordBreak: "break-word" }}>{mostrarTipo ? rotuloDoc(d) : d.nome_arquivo}</div>
              <div style={{ fontSize: 12, color: C.text3, wordBreak: "break-word" }}>{mostrarTipo ? `${d.nome_arquivo} · ` : ""}{dataBR(d.created_at)}</div>
            </div>
            {d.url ? (
              <a href={d.url} target="_blank" rel="noreferrer" className="cw-btn"
                style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 10, fontSize: 13, fontWeight: 600, color: C.text2, border: `1px solid ${C.border}`, background: C.white }}>
                <ExternalLink size={13} aria-hidden="true" /> Abrir
              </a>
            ) : (
              <span style={{ fontSize: 12, color: C.green }}>Enviado</span>
            )}
            {podeRemover?.(d) && (
              <button type="button" onClick={() => remover(d)} disabled={removendo === d.id} aria-label={`Remover ${d.nome_arquivo}`} title="Remover"
                style={{ color: C.text3, padding: 6, display: "grid", placeItems: "center" }}>
                {removendo === d.id ? <Loader2 size={15} className="cw-spin" /> : <Trash2 size={15} />}
              </button>
            )}
          </li>
        ))}
      </ul>
      {erro && <div role="alert" style={{ fontSize: 13, color: C.red, marginTop: 4 }}>{erro}</div>}
    </div>
  );
}

/** Texto com botão de copiar (CPF, CNPJ, índice cadastral...). */
export function Copiavel({ valor, children }) {
  const [ok, setOk] = useState(false);
  if (!valor) return <span>—</span>;
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(String(valor));
      setOk(true);
      setTimeout(() => setOk(false), 1800);
    } catch { /* sem permissão de área de transferência */ }
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
      <span style={{ userSelect: "all", wordBreak: "break-word" }}>{children ?? valor}</span>
      <button type="button" onClick={copiar} title="Copiar" aria-label="Copiar" style={{ color: ok ? C.green : C.text4, padding: 3, display: "grid", placeItems: "center" }}>
        {ok ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </span>
  );
}

function Linha({ rotulo, children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(110px, 170px) 1fr", gap: 10, padding: "5px 0", fontSize: 14, alignItems: "baseline" }}>
      <span style={{ color: C.text3, fontSize: 13 }}>{rotulo}</span>
      <span style={{ color: C.text, wordBreak: "break-word" }}>{children || "—"}</span>
    </div>
  );
}

export function Secao({ titulo, extra, children, id }) {
  return (
    <section aria-labelledby={id} style={{ borderTop: `1px solid ${C.border2}`, paddingTop: 14, marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <h3 id={id} style={{ fontWeight: 600, fontSize: 16, margin: 0 }}>{titulo}</h3>
        {extra}
      </div>
      {children}
    </section>
  );
}

const enderecoTexto = (e) => {
  if (!e) return "";
  const l1 = [e.logradouro, e.numero].filter(Boolean).join(", ");
  return [l1 + (e.complemento ? ` (${e.complemento})` : ""), e.bairro, [e.cidade, e.uf].filter(Boolean).join("/"), e.cep ? `CEP ${formatarCEP(e.cep)}` : ""]
    .filter(Boolean).join(" · ");
};

/**
 * Dados do formulário só para leitura, com os anexos de cada sócio e do imóvel.
 * `copiar`: mostra botão de copiar nos campos que a contabilidade redigita.
 */
export function ResumoDados({ dados, docs = [], usaEnderecoUnidade, unidade, kit = [], copiar = false, aberturaId, acoesDoc }) {
  const d = dados || {};
  const e = d.empresa || {};
  const socios = Array.isArray(d.socios) ? d.socios : [];
  const l = d.local || {};
  const C_ = ({ v, children }) => (copiar ? <Copiavel valor={v}>{children}</Copiavel> : <>{children ?? v}</>);
  const docsDe = (filtro) => docs.filter(filtro);

  return (
    <div>
      <Secao titulo="Empresa" id="resumo-empresa">
        <Linha rotulo="Tipo">{TIPOS_EMPRESA[e.tipo]}</Linha>
        {e.tipo !== "mei" && (
          <Linha rotulo="Opções de nome">
            {(e.nomes || []).filter(Boolean).length
              ? <ol style={{ margin: 0, paddingLeft: 18 }}>{e.nomes.filter(Boolean).map((n, i) => <li key={i}><C_ v={n} /></li>)}</ol>
              : null}
          </Linha>
        )}
        <Linha rotulo="Nome fantasia">{e.nome_fantasia ? <C_ v={e.nome_fantasia} /> : null}</Linha>
        <Linha rotulo="Atividades"><span style={{ whiteSpace: "pre-wrap" }}>{e.atividades}</span></Linha>
        {e.tipo !== "mei" && <Linha rotulo="Capital social">{fmtMoeda(e.capital_social)}</Linha>}
        <Linha rotulo="Forma de atuação">{(e.atuacao || []).map((a) => ATUACAO[a]).filter(Boolean).join("; ")}</Linha>
        <Linha rotulo="Faturamento mensal">{e.faturamento_mensal ? fmtMoeda(e.faturamento_mensal) : "Não informado"}</Linha>
      </Secao>

      <Secao titulo={socios.length > 1 ? `Sócios (${socios.length})` : "Titular"} id="resumo-socios">
        {socios.map((s, i) => (
          <div key={s.id || i} style={{ background: C.cream, borderRadius: 12, padding: "10px 14px", marginBottom: 10 }}>
            <div style={{ fontFamily: serif, fontSize: 17, marginBottom: 4 }}>{s.nome || `Sócio ${i + 1}`}{s.administrador ? " · administrador" : ""}</div>
            <Linha rotulo="CPF"><C_ v={s.cpf}>{formatarCPF(s.cpf)}</C_></Linha>
            <Linha rotulo="RG">{s.rg ? <><C_ v={s.rg} /> {s.rg_orgao ? `· ${s.rg_orgao}` : ""}</> : null}</Linha>
            <Linha rotulo="Nascimento">{s.nascimento ? dataBR(s.nascimento) : null}</Linha>
            <Linha rotulo="Estado civil">{[ESTADOS_CIVIS[s.estado_civil], REGIMES_BENS[s.regime_bens]].filter(Boolean).join(" · ")}</Linha>
            <Linha rotulo="Profissão">{s.profissao}</Linha>
            <Linha rotulo="Endereço"><C_ v={enderecoTexto(s.endereco)} /></Linha>
            <Linha rotulo="Contato">{[s.email, fmtTelefone(s.telefone)].filter(Boolean).join(" · ")}</Linha>
            {socios.length > 1 && <Linha rotulo="Participação">{s.participacao !== null && s.participacao !== undefined ? `${String(s.participacao).replace(".", ",")}%` : null}</Linha>}
            <Linha rotulo="Conta gov.br">{NIVEIS_GOVBR[s.govbr]}</Linha>
            <div style={{ marginTop: 6 }}>
              <ListaDocumentos docs={docsDe((x) => x.socio_id === s.id)} aberturaId={aberturaId} vazio="Sem anexos." {...(acoesDoc || {})} />
            </div>
          </div>
        ))}
        {!socios.length && <div style={{ fontSize: 14, color: C.text3 }}>Nenhum sócio informado.</div>}
      </Secao>

      <Secao titulo="Local da empresa" id="resumo-local">
        {usaEnderecoUnidade ? (
          <>
            <Linha rotulo="Endereço">Endereço fiscal do CafeWorking{unidade?.nome ? ` ${unidade.nome}` : ""}{unidade?.endereco ? ` · ${unidade.endereco}` : ""}</Linha>
            {kit.filter((k) => k.tipo === "iptu").map((k) => (
              <Linha key={k.id} rotulo="Índice cadastral">{k.numero ? <Copiavel valor={k.numero} /> : "não cadastrado no kit"}</Linha>
            ))}
            {kit.length > 0 && <div style={{ marginTop: 6 }}><KitLista kit={kit} /></div>}
            {copiar && !kit.some((k) => k.tipo === "iptu") && <div style={{ fontSize: 13, color: C.amber }}>O IPTU da unidade ainda não está no kit de documentos.</div>}
          </>
        ) : (
          <>
            <Linha rotulo="Endereço"><C_ v={enderecoTexto(l)} /></Linha>
            <Linha rotulo="Índice cadastral">{l.indice_cadastral ? <C_ v={l.indice_cadastral} /> : null}</Linha>
            <Linha rotulo="Área utilizada">{l.area_m2 ? `${String(l.area_m2).replace(".", ",")} m²` : null}</Linha>
            <Linha rotulo="Imóvel">{TIPOS_IMOVEL[l.tipo_imovel]}</Linha>
            <Linha rotulo="É de um sócio?">{l.imovel_de_socio === true ? "Sim" : l.imovel_de_socio === false ? "Não" : null}</Linha>
            <div style={{ marginTop: 6 }}>
              <ListaDocumentos docs={docsDe((x) => x.lado === "cliente" && ["iptu", "avcb", "autorizacao_proprietario"].includes(x.categoria))} aberturaId={aberturaId} vazio="Sem anexos do imóvel." {...(acoesDoc || {})} />
            </div>
          </>
        )}
      </Secao>

      {docsDe((x) => x.categoria === "outro_cliente").length > 0 && (
        <Secao titulo="Outros documentos" id="resumo-outros">
          <ListaDocumentos docs={docsDe((x) => x.categoria === "outro_cliente")} aberturaId={aberturaId} {...(acoesDoc || {})} />
        </Secao>
      )}
    </div>
  );
}

const TIPO_KIT = { iptu: "IPTU da unidade", avcb: "AVCB", habite_se: "Habite-se", alvara: "Alvará" };

export function KitLista({ kit }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {kit.map((k) => (
        <li key={k.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", flexWrap: "wrap" }}>
          <FileText size={16} color={C.teal} aria-hidden="true" />
          <span style={{ flex: 1, minWidth: 150, fontSize: 14 }}>
            <b>{TIPO_KIT[k.tipo] || k.titulo}</b>{k.titulo && TIPO_KIT[k.tipo] ? ` · ${k.titulo}` : ""}{k.numero ? ` · nº ${k.numero}` : ""}
          </span>
          {k.url && (
            <a href={k.url} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 600, color: C.teal }}>
              <ExternalLink size={13} aria-hidden="true" /> Abrir
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Histórico do processo (o servidor já tira o que é interno para o cliente). */
export function Historico({ eventos, mostrarEmail = false }) {
  if (!eventos?.length) return <div style={{ fontSize: 13, color: C.text4 }}>Sem movimentações.</div>;
  const itens = [...eventos].reverse();
  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {itens.map((ev, i) => {
        const cor = ev.tipo === "correcao_pedida" ? C.red : ev.tipo === "concluida" ? C.green : ev.tipo === "cancelada" ? C.text3 : ev.interno ? C.text4 : C.cafe;
        return (
          <li key={ev.id} style={{ display: "flex", gap: 12, paddingBottom: i === itens.length - 1 ? 0 : 12 }}>
            <span aria-hidden="true" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ width: 11, height: 11, borderRadius: "50%", background: cor, marginTop: 5 }} />
              {i < itens.length - 1 && <span style={{ flex: 1, width: 2, background: C.border, marginTop: 3 }} />}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: C.text3 }}>
                {dataHoraBR(ev.created_at)} · {AUTOR_EVENTO[ev.autor_papel] || "CafeWorking"}{mostrarEmail && ev.autor_email ? ` (${ev.autor_email})` : ""}
                {ev.interno ? " · interno" : ""}
              </div>
              <div style={{ fontSize: 14, color: C.text, whiteSpace: "pre-wrap", wordBreak: "break-word", ...(ev.tipo === "correcao_pedida" ? { background: C.redPale, borderRadius: 8, padding: "6px 10px", marginTop: 3 } : {}) }}>
                {ev.tipo === "correcao_pedida" ? `Ajuste pedido: ${ev.texto}` : ev.texto}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Dados da empresa aberta (resultado registrado pela contabilidade). */
export function CartaoEmpresa({ resultado, copiar = true }) {
  const r = resultado || {};
  return (
    <div>
      <div style={{ fontFamily: serif, fontSize: 22, lineHeight: 1.2 }}>{r.razao_social || "—"}</div>
      <div style={{ fontSize: 15, color: C.text2, margin: "4px 0 10px" }}>CNPJ {copiar ? <Copiavel valor={formatarCNPJ(r.cnpj)} /> : formatarCNPJ(r.cnpj)}</div>
      <Linha rotulo="Data de abertura">{r.data_abertura ? dataBR(r.data_abertura) : null}</Linha>
      <Linha rotulo="Regime tributário">{REGIMES_TRIBUTARIOS[r.regime_tributario]}</Linha>
      <Linha rotulo="Inscrição municipal">{r.inscricao_municipal ? <Copiavel valor={r.inscricao_municipal} /> : null}</Linha>
      {r.inscricao_estadual && <Linha rotulo="Inscrição estadual"><Copiavel valor={r.inscricao_estadual} /></Linha>}
      {r.nire && <Linha rotulo="NIRE"><Copiavel valor={r.nire} /></Linha>}
      <Linha rotulo="CNAE principal">{r.cnae_principal ? formatarCNAE(r.cnae_principal) : null}</Linha>
      {r.cnaes_secundarios?.length > 0 && <Linha rotulo="CNAEs secundários">{r.cnaes_secundarios.map(formatarCNAE).join(", ")}</Linha>}
      {r.observacoes && <Linha rotulo="Observações"><span style={{ whiteSpace: "pre-wrap" }}>{r.observacoes}</span></Linha>}
    </div>
  );
}
