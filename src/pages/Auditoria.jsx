import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, CalendarPlus, UserMinus, FileText, Filter, RefreshCw } from "lucide-react";
import { Card, Badge, PageHead, Empty } from "../components/ui.jsx";
import { C, serif } from "../lib/theme.js";
import { fetchAuditLogsDb } from "../lib/supabaseDb.js";
import { supabaseConfigured } from "../lib/supabaseAuth.js";

// Catálogo de ações conhecidas → rótulo, ícone e cor. Ações novas caem no
// genérico (ponto cinza), então a tela nunca quebra ao surgir um evento novo.
const ACOES = {
  "reserva.criada": { label: "Reserva criada", icon: CalendarPlus, cor: C.teal },
  "usuario.excluido": { label: "Usuário da equipe excluído", icon: UserMinus, cor: C.red },
  "nfse.emitida": { label: "Nota fiscal emitida", icon: FileText, cor: C.cafe },
};
const acaoInfo = (a) => ACOES[a] || { label: a, icon: ShieldCheck, cor: C.text3 };

const fmtData = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
};

// Resume o JSON de detalhe em texto curto (sem despejar o objeto cru).
function resumoDetalhe(d) {
  if (!d || typeof d !== "object") return "";
  const partes = [];
  if (d.cliente_nome) partes.push(d.cliente_nome);
  if (d.tomador) partes.push(d.tomador);
  if (d.email && !d.cliente_nome) partes.push(d.email);
  if (d.numero) partes.push(`nº ${d.numero}`);
  if (d.valor != null) partes.push(`R$ ${Number(d.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
  if (d.removidoLogin != null) partes.push(d.removidoLogin ? "login removido" : "sem login");
  return partes.join(" · ");
}

export default function Auditoria() {
  const [logs, setLogs] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [filtro, setFiltro] = useState("todos");

  const carregar = () => {
    if (!supabaseConfigured) { setLogs([]); return; }
    setCarregando(true);
    fetchAuditLogsDb().then((rows) => setLogs(rows || [])).finally(() => setCarregando(false));
  };
  useEffect(() => { carregar(); }, []);

  const acoesPresentes = useMemo(
    () => Array.from(new Set(logs.map((l) => l.acao))),
    [logs]
  );
  const lista = filtro === "todos" ? logs : logs.filter((l) => l.acao === filtro);

  return (
    <div>
      <PageHead
        title="Auditoria"
        sub="Trilha de ações sensíveis (reservas, exclusões de equipe, notas fiscais). Registro append-only gravado no servidor — não editável pelo app."
        action={
          <button onClick={carregar} className="cw-btn"
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.white, color: C.text2, fontWeight: 600, fontSize: 13 }}>
            <RefreshCw size={15} className={carregando ? "cw-spin" : ""} /> Atualizar
          </button>
        }
      />

      {!supabaseConfigured ? (
        <Card><Empty icon={ShieldCheck} title="Auditoria disponível no ambiente real" sub="Em modo demonstração não há trilha de auditoria. Quando conectado ao banco, os eventos do servidor aparecem aqui." /></Card>
      ) : (
        <>
          {acoesPresentes.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
              <Filter size={14} color={C.text3} />
              {[["todos", `Todos (${logs.length})`], ...acoesPresentes.map((a) => [a, acaoInfo(a).label])].map(([id, lb]) => (
                <button key={id} onClick={() => setFiltro(id)} className="cw-btn"
                  style={{ padding: "5px 11px", borderRadius: 9, fontSize: 12.5, fontWeight: 600, border: `1px solid ${filtro === id ? C.cafe : C.border}`, background: filtro === id ? C.cafe : C.white, color: filtro === id ? "#fff" : C.text2 }}>
                  {lb}
                </button>
              ))}
            </div>
          )}

          {lista.length === 0 ? (
            <Card><Empty icon={ShieldCheck} title={carregando ? "Carregando…" : "Nenhum evento registrado"} sub="Ações como criar reserva, excluir membro da equipe e emitir nota fiscal aparecem aqui assim que acontecem." /></Card>
          ) : (
            <Card style={{ padding: 0, overflow: "hidden" }}>
              {lista.map((l, i) => {
                const ai = acaoInfo(l.acao);
                const Icon = ai.icon;
                const resumo = resumoDetalhe(l.detalhe);
                return (
                  <div key={l.id || i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "13px 18px", borderBottom: i < lista.length - 1 ? `1px solid ${C.border2}` : "none" }}>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: `${ai.cor}16`, display: "grid", placeItems: "center", flexShrink: 0, marginTop: 1 }}>
                      <Icon size={17} color={ai.cor} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{ai.label}</span>
                        {l.entidade && <Badge color={ai.cor}>{l.entidade}</Badge>}
                      </div>
                      {resumo && <div style={{ fontSize: 12.5, color: C.text2, marginTop: 3 }}>{resumo}</div>}
                      <div style={{ fontSize: 11.5, color: C.text4, marginTop: 3 }}>
                        {l.ator_email || "sistema"}{l.ip ? ` · ${l.ip}` : ""}
                      </div>
                    </div>
                    <div style={{ fontFamily: serif, fontSize: 12, color: C.text3, whiteSpace: "nowrap", flexShrink: 0, marginTop: 2 }}>
                      {fmtData(l.created_at)}
                    </div>
                  </div>
                );
              })}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
