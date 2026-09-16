// ============================================================================
// Peças comuns das telas do cliente: carregamento, erro com "tentar de novo",
// aviso, seção, interruptor acessível, número copiável e o cartão "Fale com a
// recepção".
// Fontes a partir de 12px, botões de verdade e rótulos para leitor de tela.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, MessageCircle, Mail, Clock, Copy, Check } from "lucide-react";
import { Card, Btn } from "../../components/ui.jsx";
import { C, serif } from "../../lib/theme.js";
import { mensagemDe } from "../../lib/erros.js";
import { CONTATO } from "../../lib/contato.js";

/** Carrega dados de uma função da API com estados de carregando/erro e recarga. */
export function useDados(carregar, deps = []) {
  const [estado, setEstado] = useState({ dados: null, erro: "", carregando: true });
  const vivo = useRef(true);
  const executar = useCallback((forcar = false) => {
    setEstado((s) => ({ ...s, erro: "", carregando: true }));
    return Promise.resolve()
      .then(() => carregar(forcar))
      .then((dados) => { if (vivo.current) setEstado({ dados, erro: "", carregando: false }); return dados; })
      .catch((e) => { if (vivo.current) setEstado((s) => ({ ...s, erro: mensagemDe(e), carregando: false })); });
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    vivo.current = true;
    executar(false);
    return () => { vivo.current = false; };
  }, [executar]);
  return { ...estado, recarregar: () => executar(true) };
}

export function Carregando({ texto = "Carregando…" }) {
  return (
    <div role="status" aria-live="polite" style={{ display: "flex", alignItems: "center", gap: 8, color: C.text3, fontSize: 14, padding: "8px 0" }}>
      <Loader2 size={16} className="cw-spin" aria-hidden="true" /> {texto}
    </div>
  );
}

export function ErroCarga({ mensagem, onTentar }) {
  return (
    <div role="alert" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", fontSize: 14, color: C.red, background: C.redPale, borderRadius: 12, padding: "12px 14px" }}>
      <span>{mensagem}</span>
      {onTentar && (
        <Btn variant="ghost" onClick={onTentar} style={{ padding: "7px 12px", fontSize: 13 }}>
          <RefreshCw size={14} aria-hidden="true" /> Tentar de novo
        </Btn>
      )}
    </div>
  );
}

export function Aviso({ cor = C.teal, children, role }) {
  return (
    <div role={role} style={{ fontSize: 14, lineHeight: 1.55, color: C.text2, background: `${cor}14`, borderLeft: `3px solid ${cor}`, borderRadius: 8, padding: "10px 12px", margin: "0 0 14px" }}>
      {children}
    </div>
  );
}

export function Titulo({ children, id }) {
  return <h2 id={id} style={{ fontFamily: serif, fontSize: 20, fontWeight: 500, color: C.text, margin: "0 0 12px" }}>{children}</h2>;
}

/** Interruptor liga/desliga com role="switch" e rótulo associado. */
export function Interruptor({ ligado, onChange, rotuloId, desabilitado }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!ligado}
      aria-labelledby={rotuloId}
      disabled={desabilitado}
      onClick={() => !desabilitado && onChange(!ligado)}
      style={{ width: 48, height: 28, borderRadius: 20, background: ligado ? C.cafe : C.gray, position: "relative", transition: "background .2s", cursor: desabilitado ? "not-allowed" : "pointer", opacity: desabilitado ? 0.6 : 1, flexShrink: 0 }}
    >
      <span aria-hidden="true" style={{ position: "absolute", top: 4, left: ligado ? 24 : 4, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
    </button>
  );
}

/** Canais reais de atendimento (substitui o chat que não funcionava). */
export function CartaoRecepcao({ titulo = "Fale com a recepção", texto, mensagemWhatsapp, compacto }) {
  return (
    <Card style={{ padding: compacto ? 16 : 22 }}>
      <Titulo>{titulo}</Titulo>
      {texto && <p style={{ fontSize: 14, color: C.text2, margin: "0 0 14px", lineHeight: 1.55 }}>{texto}</p>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <a href={CONTATO.whatsappLink(mensagemWhatsapp)} target="_blank" rel="noreferrer" className="cw-btn cw-btn-teal"
          style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 14, background: C.teal, color: "#fff", fontWeight: 600, fontSize: 14 }}>
          <MessageCircle size={16} aria-hidden="true" /> WhatsApp {CONTATO.whatsapp}
        </a>
        <a href={`mailto:${CONTATO.email}`} className="cw-btn cw-btn-ghost"
          style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 14, border: `1px solid ${C.border}`, background: C.white, color: C.text2, fontWeight: 600, fontSize: 14 }}>
          <Mail size={16} aria-hidden="true" /> {CONTATO.email}
        </a>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: C.text3, marginTop: 12 }}>
        <Clock size={14} aria-hidden="true" /> Atendimento: {CONTATO.horario}.
      </div>
    </Card>
  );
}

/** Número do documento (índice cadastral do IPTU...) com botão de copiar. */
export function NumeroCopiavel({ rotulo, numero }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(numero);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 13, color: C.text2, marginTop: 3 }}>
      {rotulo}: <b style={{ fontFamily: "monospace", fontSize: 14, userSelect: "all" }}>{numero}</b>
      <button type="button" onClick={copiar} aria-label={`Copiar ${rotulo.toLowerCase()}`} title="Copiar"
        style={{ display: "inline-flex", alignItems: "center", gap: 4, color: copiado ? C.green : C.teal, fontSize: 12, fontWeight: 600, padding: "2px 6px", borderRadius: 6 }}>
        {copiado ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />} {copiado ? "Copiado" : "Copiar"}
      </button>
    </span>
  );
}

export const dataBR = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "—");

export function dataHoraBR(iso, opcoes = {}) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", ...opcoes });
}
