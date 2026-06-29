import { useState } from "react";
import {
  Plus, MapPin, Edit3, Building2, Trash2, ArrowLeft,
  Coffee, CalendarDays, DoorOpen, Check, ArrowRight, Package,
} from "lucide-react";
import { Card, Badge, Btn, PageHead, Modal, Field, Empty, ImageInput } from "../components/ui.jsx";
import { C, serif, sans, fmt, fmtShort, inp } from "../lib/theme.js";
import { useStore } from "../lib/store.jsx";
import { onboardApi } from "../lib/onboardApi.js";
import { buscarCnpj, buscarCep } from "../lib/lookup.js";

const PALETA = [C.cafe, C.teal, C.cafe2, C.teal3, C.green, C.amber, C.blue, C.red];

export default function Unidades({ go }) {
  const {
    unidades, unidadesVisiveis, viewAs, franqueados, unidadeAtiva,
    activeUnit, setActiveUnit, salasDe, produtosDe, addUnidade, removerUnidade,
  } = useStore();
  const [novaUnidade, setNovaUnidade] = useState(false);
  const [gerenciando, setGerenciando] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erroNova, setErroNova] = useState(null);
  const [excluir, setExcluir] = useState(null);
  const [excluindo, setExcluindo] = useState(false);
  const [erroExcluir, setErroExcluir] = useState(null);

  const confirmarExclusao = async () => {
    if (!excluir) return;
    if (!onboardApi.configured) { removerUnidade(excluir.id); setExcluir(null); return; }
    setErroExcluir(null); setExcluindo(true);
    try {
      await onboardApi.excluirUnidade(excluir.id);
      removerUnidade(excluir.id);
      setExcluir(null);
    } catch (e) {
      setErroExcluir(e.message || "Falha ao excluir.");
    } finally {
      setExcluindo(false);
    }
  };

  // Conta (franqueado) a que a nova unidade pertence: a do master logado, ou
  // a do contexto ativo.
  const contaAlvo = viewAs || unidadeAtiva?.franqueadoId || franqueados[0]?.id || null;

  const salvarUnidade = async (dados) => {
    setErroNova(null);
    const franqueadoId = dados.franqueadoId || contaAlvo;
    if (!onboardApi.configured) {
      const id = addUnidade({ ...dados, franqueadoId });
      setNovaUnidade(false); setActiveUnit(id); setGerenciando(id);
      return;
    }
    if (!franqueadoId) { setErroNova("Não foi possível identificar a conta. Entre numa conta primeiro."); return; }
    setSalvando(true);
    try {
      const res = await onboardApi.criarUnidade({
        nome: dados.nome, endereco: dados.endereco, cidade: dados.cidade, cnpj: dados.cnpj, cor: dados.cor, franqueado_id: franqueadoId,
      });
      const id = addUnidade(res.unidade);
      setNovaUnidade(false); setActiveUnit(id); setGerenciando(id);
    } catch (e) {
      setErroNova(e.message || "Falha ao criar a unidade.");
    } finally {
      setSalvando(false);
    }
  };

  const unidadeGerida = unidades.find((u) => u.id === gerenciando);
  if (unidadeGerida) {
    return <GerenciarUnidade unidade={unidadeGerida} go={go} onBack={() => setGerenciando(null)} />;
  }

  return (
    <div>
      <PageHead
        title="Minhas unidades"
        sub="Cadastre e configure suas unidades (salas, cafeteria e agenda). Para trocar a unidade que você opera, use o seletor no topo."
        action={
          <Btn onClick={() => { setErroNova(null); setNovaUnidade(true); }}>
            <Plus size={16} /> Nova unidade
          </Btn>
        }
      />
      {unidadesVisiveis.map((u, i) => {
        const nSalas = salasDe(u.id).length;
        const nProd = produtosDe(u.id).length;
        const franq = franqueados.find((fr) => fr.id === u.franqueadoId);
        return (
          <Card key={u.id} className={`cw-fade cw-fade-${i + 1}`} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "center" }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 16,
                  background: `${u.cor}16`,
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                }}
              >
                <Building2 size={30} color={u.cor} />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: serif, fontSize: 24, color: C.text }}>{u.nome}</span>
                  {u.id === activeUnit && <Badge color={C.green}>Operando agora</Badge>}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: C.text3,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    marginTop: 3,
                  }}
                >
                  <MapPin size={13} /> {u.endereco}
                </div>
                {franq && (
                  <div style={{ fontSize: 12, color: C.text3, marginTop: 3 }}>
                    Franqueado: <b style={{ color: C.text2 }}>{franq.nome}</b>
                  </div>
                )}
              </div>
              {[
                ["Salas", nSalas],
                ["Produtos", nProd],
                ["Membros", u.membros],
                ["Receita/mês", fmtShort(u.receita)],
              ].map(([l, v], j) => (
                <div key={j} style={{ textAlign: "center", minWidth: 84 }}>
                  <div style={{ fontFamily: serif, fontSize: 22, color: u.cor }}>{v}</div>
                  <div style={{ fontSize: 12, color: C.text3 }}>{l}</div>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8 }}>
                <Btn
                  onClick={() => {
                    setActiveUnit(u.id);
                    setGerenciando(u.id);
                  }}
                >
                  <Edit3 size={15} /> Gerenciar
                </Btn>
                <Btn variant="ghost" title="Excluir unidade" onClick={() => { setErroExcluir(null); setExcluir(u); }}
                  style={{ color: C.red, borderColor: C.redPale, padding: "10px 12px" }}>
                  <Trash2 size={15} />
                </Btn>
              </div>
            </div>
          </Card>
        );
      })}

      {novaUnidade && (
        <Modal title="Nova unidade" onClose={() => !salvando && setNovaUnidade(false)}>
          <UnidadeForm onSave={salvarUnidade} loading={salvando} erro={erroNova} />
        </Modal>
      )}

      {excluir && (
        <Modal title="Excluir unidade" onClose={() => !excluindo && setExcluir(null)}>
          <div style={{ fontSize: 14, color: C.text2, marginBottom: 12 }}>
            Excluir <b>{excluir.nome}</b> e tudo dela (salas, agenda, estoque, clientes, notas, cobranças)?
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: C.redPale, border: `1px solid ${C.red}33`, borderRadius: 10, padding: "9px 12px", fontSize: 12, color: C.text2, marginBottom: 14 }}>
            <Trash2 size={14} color={C.red} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Ação <b>irreversível</b>. A conta e as outras unidades permanecem. Para usar um novo CNPJ, depois crie a unidade de novo informando o CNPJ.</span>
          </div>
          {erroExcluir && <div style={{ fontSize: 12.5, color: C.red, marginBottom: 12 }}>{erroExcluir}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="ghost" onClick={() => !excluindo && setExcluir(null)} style={{ flex: 1, justifyContent: "center" }}>Cancelar</Btn>
            <Btn onClick={confirmarExclusao} style={{ flex: 1, justifyContent: "center", background: C.red, opacity: excluindo ? 0.6 : 1 }}>
              {excluindo ? "Excluindo…" : "Excluir definitivamente"}
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ===========================================================================
// Gerenciar unidade — abas Salas / Cafeteria / Agenda
// ===========================================================================
function GerenciarUnidade({ unidade, go, onBack }) {
  const store = useStore();
  const [tab, setTab] = useState("cafeteria");

  const salas = store.salasDe(unidade.id);
  const produtos = store.produtosDe(unidade.id);

  // Cadastro de salas saiu daqui — agora fica no menu lateral (página "Salas").
  const tabs = [
    { id: "cafeteria", label: "Cafeteria", icon: Coffee, n: produtos.length },
    { id: "agenda", label: "Agenda", icon: CalendarDays },
  ];

  return (
    <div>
      <button
        onClick={onBack}
        className="cw-btn"
        style={{ display: "flex", alignItems: "center", gap: 6, color: C.text3, fontSize: 13, marginBottom: 14 }}
      >
        <ArrowLeft size={16} /> Voltar para unidades
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 22, flexWrap: "wrap" }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: `${unidade.cor}16`,
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          <Building2 size={26} color={unidade.cor} />
        </div>
        <div>
          <h1 style={{ fontFamily: serif, fontSize: "clamp(24px,4vw,30px)", fontWeight: 400, color: C.text, lineHeight: 1.1 }}>
            {unidade.nome}
          </h1>
          <div style={{ fontSize: 13, color: C.text3, display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
            <MapPin size={13} /> {unidade.endereco}
          </div>
        </div>
      </div>

      {/* Abas */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="cw-btn"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 16px",
              borderRadius: 12,
              fontFamily: sans,
              fontSize: 14,
              fontWeight: 600,
              border: `1px solid ${tab === t.id ? unidade.cor : C.border}`,
              background: tab === t.id ? unidade.cor : C.white,
              color: tab === t.id ? "#fff" : C.text2,
            }}
          >
            <t.icon size={16} /> {t.label}
            {t.n != null && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  background: tab === t.id ? "rgba(255,255,255,.25)" : C.cream2,
                  color: tab === t.id ? "#fff" : C.text3,
                  borderRadius: 9,
                  padding: "1px 7px",
                }}
              >
                {t.n}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "cafeteria" && <CafeteriaTab unidade={unidade} produtos={produtos} go={go} />}
      {tab === "agenda" && <AgendaTab unidade={unidade} salas={salas} store={store} go={go} />}
    </div>
  );
}

// --- Aba Salas -------------------------------------------------------------
function _SalasTab({ unidade, salas, store }) {
  const [modal, setModal] = useState(null); // {} novo | sala editar

  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <SecHeader
        titulo="Salas da unidade"
        botao="Nova sala"
        cor={unidade.cor}
        onAdd={() => setModal({})}
      />
      {salas.length === 0 ? (
        <Empty icon={DoorOpen} title="Nenhuma sala" sub="Cadastre a primeira sala desta unidade." />
      ) : (
        salas.map((s, i) => {
          const tipoCor = { Privativa: C.cafe, Reunião: C.teal, Compartilhada: C.blue, Auditório: C.amber, Atendimento: C.text3 }[s.tipo] || C.text3;
          return (
            <div key={s.id} style={{ display: "flex", gap: 14, padding: "14px 20px", borderBottom: i < salas.length - 1 ? `1px solid ${C.border2}` : "none", alignItems: "flex-start" }}>
              {s.foto ? (
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <img src={s.foto} alt={s.nome} onError={(e) => (e.currentTarget.style.display = "none")} style={{ width: 92, height: 66, borderRadius: 10, objectFit: "cover", background: C.cream2 }} />
                  {s.fotos?.length > 1 && <span style={{ position: "absolute", bottom: 4, right: 4, background: "rgba(0,0,0,.6)", color: "#fff", fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 6 }}>+{s.fotos.length - 1}</span>}
                </div>
              ) : (
                <div style={{ width: 92, height: 66, borderRadius: 10, background: C.cream2, display: "grid", placeItems: "center", flexShrink: 0 }}><DoorOpen size={22} color={C.text4} /></div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{s.nome}</span>
                  <Badge color={tipoCor}>{s.tipo}</Badge>
                  {s.contratada
                    ? <Badge color={C.red} bg={C.redPale}>Contratada{s.contratante ? ` · ${s.contratante}` : ""}</Badge>
                    : <Badge color={C.green}>Disponível</Badge>}
                </div>
                <div style={{ fontSize: 12, color: C.text3, marginTop: 3 }}>
                  {s.cap} pessoas{s.bases > 0 ? ` · ${s.bases} bases de trabalho` : ""} · {s.contratada && s.valorMensal ? `${fmt(s.valorMensal)}/mês` : (s.valor || "—")}
                </div>
                {s.descricao && <div style={{ fontSize: 12, color: C.text3, marginTop: 4, lineHeight: 1.45 }}>{s.descricao}</div>}
                {s.comodidades?.length > 0 && (
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
                    {s.comodidades.slice(0, 6).map((c) => <span key={c} style={{ fontSize: 10.5, color: C.teal, background: C.tealPale, padding: "2px 8px", borderRadius: 12 }}>{c}</span>)}
                    {s.comodidades.length > 6 && <span style={{ fontSize: 10.5, color: C.text4, alignSelf: "center" }}>+{s.comodidades.length - 6}</span>}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <button onClick={() => setModal(s)} title="Editar" className="cw-btn" style={{ color: C.text3, padding: 6 }}><Edit3 size={16} /></button>
                <button onClick={() => store.removeSala(s.id)} title="Excluir" className="cw-btn" style={{ color: C.red, padding: 6 }}><Trash2 size={16} /></button>
              </div>
            </div>
          );
        })
      )}

      {modal && (
        <Modal title={modal.id ? "Editar sala" : "Nova sala"} onClose={() => setModal(null)}>
          <SalaForm
            inicial={modal}
            unidade={unidade}
            onSave={(dados) => {
              if (modal.id) store.updateSala(modal.id, dados);
              else store.addSala(unidade.id, dados);
              setModal(null);
            }}
          />
        </Modal>
      )}
    </Card>
  );
}

const COMODIDADES_SALA = ["Ar-condicionado", "TV / Monitor", "Projetor", "Lousa branca", "Wi-Fi dedicado", "Café incluso", "Armário", "Cadeira ergonômica", "Videoconferência", "Sistema de som", "Microfone", "Mesa de reunião", "Palco"];
const TIPOS_SALA = ["Privativa", "Reunião", "Compartilhada", "Auditório", "Atendimento"];
// Períodos de cobrança de um plano de sala (coworking pode ter vários).
const PERIODOS_SALA = [
  { v: "hora", lb: "Por hora" },
  { v: "turno", lb: "Turno (meio período)" },
  { v: "dia", lb: "Diária" },
  { v: "semana", lb: "Semanal" },
  { v: "mes", lb: "Mensal" },
  { v: "ano", lb: "Anual" },
];
const periodoLabel = (v) => (PERIODOS_SALA.find((p) => p.v === v)?.lb || v);

function FotosGaleria({ fotos, onChange }) {
  return (
    <div>
      {fotos.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(92px,1fr))", gap: 8, marginBottom: 8 }}>
          {fotos.map((src, i) => (
            <div key={i} style={{ position: "relative", borderRadius: 10, overflow: "hidden", aspectRatio: "4/3", background: C.cream2 }}>
              <img src={src} alt={"foto " + (i + 1)} onError={(e) => (e.currentTarget.style.display = "none")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <button type="button" onClick={() => onChange(fotos.filter((_, j) => j !== i))} title="Remover" style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 7, background: "rgba(0,0,0,.55)", color: "#fff", display: "grid", placeItems: "center", fontSize: 14, lineHeight: 1 }}>×</button>
              {i === 0 && <span style={{ position: "absolute", bottom: 4, left: 4, background: "rgba(0,0,0,.6)", color: "#fff", fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 6 }}>CAPA</span>}
            </div>
          ))}
        </div>
      )}
      <ImageInput value="" onChange={(v) => { if (v) onChange([...fotos, v]); }} height={100} />
      <div style={{ fontSize: 11, color: C.text4, marginTop: 4 }}>Adicione quantas fotos quiser. A 1ª é a capa (o cliente vê ao reservar).</div>
    </div>
  );
}

export function SalaForm({ inicial, unidade, onSave }) {
  const { clientesDe } = useStore();
  const [f, setF] = useState({
    nome: inicial.nome || "",
    tipo: inicial.tipo || "Privativa",
    cap: inicial.cap || 4,
    bases: inicial.bases || 0,
    descricao: inicial.descricao || "",
    comodidades: inicial.comodidades || [],
    fotos: inicial.fotos || (inicial.foto ? [inicial.foto] : []),
    valor: inicial.valor || "",
    valorHora: inicial.valorHora || 0,
    contratada: inicial.contratada || false,
    contratante: inicial.contratante || "",
    valorMensal: inicial.valorMensal || 0,
    planos: inicial.planos || [],
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const [np, setNp] = useState({ nome: "", periodo: "mes", preco: "" });
  const addPlanoSala = () => {
    if (!np.nome.trim() || !(+np.preco > 0)) return;
    setF((p) => ({ ...p, planos: [...(p.planos || []), { id: "sp" + Date.now(), nome: np.nome.trim(), periodo: np.periodo, preco: +np.preco }] }));
    setNp({ nome: "", periodo: np.periodo, preco: "" });
  };
  const removePlanoSala = (id) => setF((p) => ({ ...p, planos: (p.planos || []).filter((x) => x.id !== id) }));
  const clientesUnidade = clientesDe(unidade?.nome);
  const ehMensal = f.tipo === "Privativa" || f.tipo === "Compartilhada";
  const todasComodidades = Array.from(new Set([...COMODIDADES_SALA, ...f.comodidades]));
  const toggleCom = (c) => setF({ ...f, comodidades: f.comodidades.includes(c) ? f.comodidades.filter((x) => x !== c) : [...f.comodidades, c] });
  const salvar = () => { if (f.nome.trim()) onSave({ ...f, foto: f.fotos[0] || "" }); };

  return (
    <>
      <Field label="Fotos da sala">
        <FotosGaleria fotos={f.fotos} onChange={(fotos) => setF({ ...f, fotos })} />
      </Field>
      <Field label="Nome da sala">
        <input value={f.nome} onChange={set("nome")} style={inp} placeholder="Ex: Sala Privativa 3" />
      </Field>
      <Field label="Tipo de espaço">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {TIPOS_SALA.map((t) => (
            <button key={t} type="button" onClick={() => setF({ ...f, tipo: t })}
              style={{ padding: "8px 12px", borderRadius: 9, fontFamily: sans, fontSize: 13, fontWeight: 600, border: `1px solid ${f.tipo === t ? unidade.cor : C.border}`, background: f.tipo === t ? `${unidade.cor}14` : C.white, color: f.tipo === t ? unidade.cor : C.text2 }}>
              {t}
            </button>
          ))}
        </div>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Capacidade (pessoas)">
          <input type="number" min="1" value={f.cap} onChange={(e) => setF({ ...f, cap: +e.target.value })} style={inp} />
        </Field>
        {ehMensal ? (
          <Field label="Bases de trabalho (estações)">
            <input type="number" min="0" value={f.bases} onChange={(e) => setF({ ...f, bases: +e.target.value })} style={inp} />
          </Field>
        ) : (
          <Field label="Valor por hora (R$)">
            <input type="number" min="0" step="0.01" value={f.valorHora} onChange={(e) => setF({ ...f, valorHora: +e.target.value })} style={inp} />
          </Field>
        )}
      </div>
      <Field label="O que tem nesta sala (descrição)">
        <textarea value={f.descricao} onChange={set("descricao")} rows={3} style={{ ...inp, resize: "vertical", lineHeight: 1.5 }} placeholder="Descreva a sala: mobília, equipamentos, diferenciais..." />
      </Field>
      <Field label="Comodidades">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {todasComodidades.map((c) => {
            const on = f.comodidades.includes(c);
            return (
              <button key={c} type="button" onClick={() => toggleCom(c)}
                style={{ padding: "6px 11px", borderRadius: 20, fontSize: 12, fontWeight: 600, border: `1px solid ${on ? C.teal : C.border}`, background: on ? C.tealPale : C.white, color: on ? C.teal : C.text3 }}>
                {on ? "✓ " : ""}{c}
              </button>
            );
          })}
        </div>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Preço (texto exibido)">
          <input value={f.valor} onChange={set("valor")} style={inp} placeholder={ehMensal ? "Ex: R$ 2.890/mês" : "Ex: R$ 120/h"} />
        </Field>
        {ehMensal ? (
          <Field label="Valor por hora (avulso, opcional)">
            <input type="number" min="0" step="0.01" value={f.valorHora} onChange={(e) => setF({ ...f, valorHora: +e.target.value })} style={inp} />
          </Field>
        ) : (
          <Field label="Valor mensal (se locada)">
            <input type="number" min="0" step="0.01" value={f.valorMensal} onChange={(e) => setF({ ...f, valorMensal: +e.target.value })} style={inp} />
          </Field>
        )}
      </div>
      {!ehMensal && (
        <div style={{ fontSize: 11, color: C.text4, marginTop: -8, marginBottom: 12 }}>
          O valor por hora contabiliza a reserva no financeiro automaticamente.
        </div>
      )}

      {/* Planos / preços da sala (hora, turno, diária, semana, mês, ano) */}
      <div style={{ background: C.cream2, borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>Planos / preços desta sala</div>
        <div style={{ fontSize: 11.5, color: C.text3, margin: "2px 0 10px" }}>
          Cadastre quantos quiser — por hora, turno, diária, semana, mês ou ano (ex.: os planos de coworking da sala compartilhada).
        </div>
        {(f.planos || []).length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
            {f.planos.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: `1px solid ${C.border2}`, borderRadius: 9, padding: "8px 10px" }}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nome}</span>
                <Badge color={C.teal}>{periodoLabel(p.periodo)}</Badge>
                <span style={{ fontFamily: serif, fontSize: 14, color: C.cafe }}>{fmt(p.preco)}</span>
                <button type="button" onClick={() => removePlanoSala(p.id)} title="Remover" aria-label={`Remover plano ${p.nome}`} className="cw-btn" style={{ color: C.red, padding: 4 }}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 0.9fr auto", gap: 8, alignItems: "end" }}>
          <Field label="Nome do plano" style={{ marginBottom: 0 }}>
            <input value={np.nome} onChange={(e) => setNp({ ...np, nome: e.target.value })} style={inp} placeholder="Ex: Turno, Diária, FULL" aria-label="Nome do plano da sala" />
          </Field>
          <Field label="Período" style={{ marginBottom: 0 }}>
            <select value={np.periodo} onChange={(e) => setNp({ ...np, periodo: e.target.value })} style={inp} aria-label="Período do plano">
              {PERIODOS_SALA.map((p) => <option key={p.v} value={p.v}>{p.lb}</option>)}
            </select>
          </Field>
          <Field label="Preço (R$)" style={{ marginBottom: 0 }}>
            <input type="number" min="0" step="0.01" value={np.preco} onChange={(e) => setNp({ ...np, preco: e.target.value })} style={inp} placeholder="0,00" aria-label="Preço do plano" />
          </Field>
          <button type="button" onClick={addPlanoSala} className="cw-btn" style={{ height: 40, padding: "0 12px", borderRadius: 10, background: C.cafePale, color: C.cafe, fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
            <Plus size={15} /> Add
          </button>
        </div>
      </div>

      {/* Locação / contrato mensal */}
      <div style={{ background: C.cream2, borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", fontSize: 14, fontWeight: 600, color: C.text }}>
          <input type="checkbox" checked={f.contratada} onChange={(e) => setF({ ...f, contratada: e.target.checked })} />
          Sala contratada (locação mensal recorrente)
        </label>
        <div style={{ fontSize: 11.5, color: C.text3, marginTop: 4 }}>
          Marque quando a sala já está alugada para um cliente fixo. Ela fica <b>indisponível</b> para novas reservas.
        </div>
        {f.contratada && (
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12, marginTop: 12 }}>
            <Field label="Contratante (cliente)" style={{ marginBottom: 0 }}>
              <input list="sala-clientes" value={f.contratante} onChange={set("contratante")} style={inp} placeholder="Empresa que alugou" />
              <datalist id="sala-clientes">
                {clientesUnidade.map((c) => <option key={c.id} value={c.nome} />)}
              </datalist>
            </Field>
            <Field label="Valor mensal (R$)" style={{ marginBottom: 0 }}>
              <input type="number" min="0" step="0.01" value={f.valorMensal} onChange={(e) => setF({ ...f, valorMensal: +e.target.value })} style={inp} />
            </Field>
          </div>
        )}
      </div>

      <Btn style={{ width: "100%", justifyContent: "center", marginTop: 2 }} onClick={salvar}>
        {inicial.id ? "Salvar sala" : "Adicionar sala"}
      </Btn>
    </>
  );
}

// --- Aba Cafeteria (produtos) ---------------------------------------------
// Os produtos da cafeteria agora são cadastrados em "Produtos e Serviços"
// (catálogo, tipo "produto"). Aqui é só uma prévia + atalho para gerenciar.
function CafeteriaTab({ produtos, go }) {
  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border2}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: serif, fontSize: 17, color: C.text }}>Cardápio da cafeteria</div>
          <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>
            Cadastre em <b>Produtos e Serviços</b> (tipo Produto) — aparecem aqui e no PDV da recepção.
          </div>
        </div>
        <Btn onClick={() => go && go("catalogo")} style={{ padding: "8px 14px", fontSize: 13 }}>
          <Package size={15} /> Gerenciar produtos
        </Btn>
      </div>
      {produtos.length === 0 ? (
        <Empty icon={Coffee} title="Cardápio vazio" sub="Cadastre produtos em Produtos e Serviços." />
      ) : (
        produtos.map((p) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: `1px solid ${C.border2}` }}>
            {p.foto ? (
              <img src={p.foto} alt={p.nome} onError={(e) => (e.currentTarget.style.display = "none")} style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover", flexShrink: 0, background: C.cream2 }} />
            ) : (
              <span style={{ fontSize: 22 }}>{p.emoji}</span>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{p.nome}</div>
              <div style={{ fontSize: 12, color: C.text3 }}>{p.cat} · venda {fmt(p.preco)} · custo {fmt(p.cmv)}</div>
            </div>
          </div>
        ))
      )}
    </Card>
  );
}

function _ProdutoForm({ inicial, onSave }) {
  const [f, setF] = useState({
    nome: inicial.nome || "",
    emoji: inicial.emoji || "☕",
    cat: inicial.cat || "Café",
    preco: inicial.preco || 0,
    cmv: inicial.cmv || 0,
    foto: inicial.foto || "",
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const num = (k) => (e) => setF({ ...f, [k]: +e.target.value });
  return (
    <>
      <Field label="Foto do produto (o cliente vê ao comprar)">
        <ImageInput value={f.foto} onChange={(v) => setF({ ...f, foto: v })} height={130} />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: 12 }}>
        <Field label="Emoji">
          <input value={f.emoji} onChange={set("emoji")} style={{ ...inp, textAlign: "center", fontSize: 20 }} maxLength={2} />
        </Field>
        <Field label="Nome do produto">
          <input value={f.nome} onChange={set("nome")} style={inp} placeholder="Ex: Cappuccino" />
        </Field>
      </div>
      <Field label="Categoria">
        <input value={f.cat} onChange={set("cat")} style={inp} placeholder="Ex: Café, Salgados, Doces, Bebidas" />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Preço de venda (R$)">
          <input type="number" min="0" step="0.5" value={f.preco} onChange={num("preco")} style={inp} />
        </Field>
        <Field label="Custo / CMV (R$)">
          <input type="number" min="0" step="0.1" value={f.cmv} onChange={num("cmv")} style={inp} />
        </Field>
      </div>
      {f.preco > 0 && (
        <div style={{ fontSize: 12, color: C.text3, marginBottom: 12 }}>
          Margem estimada:{" "}
          <b style={{ color: C.green }}>{(((f.preco - f.cmv) / f.preco) * 100).toFixed(0)}%</b>
        </div>
      )}
      <Btn style={{ width: "100%", justifyContent: "center" }} onClick={() => f.nome.trim() && onSave(f)}>
        {inicial.id ? "Salvar produto" : "Adicionar produto"}
      </Btn>
    </>
  );
}

// --- Aba Agenda ------------------------------------------------------------
function AgendaTab({ unidade, salas, store, go }) {
  const salaIds = new Set(salas.map((s) => s.id));
  const totalReservas = store.reservas.filter((r) => salaIds.has(r.sala)).length;

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: C.tealPale,
            display: "grid",
            placeItems: "center",
          }}
        >
          <CalendarDays size={24} color={C.teal} />
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontFamily: serif, fontSize: 19, color: C.text }}>Agenda de salas</div>
          <div style={{ fontSize: 13, color: C.text3, marginTop: 2 }}>
            {salas.length} salas · {totalReservas} reservas na semana
          </div>
        </div>
        <Btn
          variant="teal"
          onClick={() => {
            store.setActiveUnit(unidade.id);
            go && go("reservas");
          }}
        >
          Abrir agenda <ArrowRight size={16} />
        </Btn>
      </div>
      <div style={{ fontSize: 12, color: C.text4, marginTop: 14, fontStyle: "italic" }}>
        A agenda completa (grade por horário, nova reserva) fica no módulo Reservas, já filtrada por esta unidade.
      </div>
    </Card>
  );
}

// --- Subcomponentes reutilizáveis -----------------------------------------
function SecHeader({ titulo, botao, cor, onAdd }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "16px 20px",
        borderBottom: `1px solid ${C.border2}`,
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <span style={{ fontFamily: serif, fontSize: 18, color: C.text }}>{titulo}</span>
      <Btn onClick={onAdd} style={{ background: cor }}>
        <Plus size={16} /> {botao}
      </Btn>
    </div>
  );
}

function _LinhaItem({ emoji, foto, titulo, sub, badge, onEdit, onDelete }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 20px",
        borderBottom: `1px solid ${C.border2}`,
      }}
    >
      {foto ? (
        <img
          src={foto}
          alt={titulo}
          onError={(e) => (e.currentTarget.style.display = "none")}
          style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", flexShrink: 0, background: C.cream2 }}
        />
      ) : emoji ? (
        <span style={{ fontSize: 24 }}>{emoji}</span>
      ) : null}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{titulo}</span>
          {badge}
        </div>
        <div style={{ fontSize: 12, color: C.text3 }}>{sub}</div>
      </div>
      <button onClick={onEdit} title="Editar" className="cw-btn" style={{ color: C.text3, padding: 6 }}>
        <Edit3 size={16} />
      </button>
      <button onClick={onDelete} title="Excluir" className="cw-btn" style={{ color: C.red, padding: 6 }}>
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function UnidadeForm({ onSave, loading, erro }) {
  const [f, setF] = useState({ nome: "", endereco: "", cidade: "", cnpj: "", cor: PALETA[0] });
  const [cep, setCep] = useState("");
  const [buscando, setBuscando] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const valido = f.nome.trim() && f.cidade.trim();
  const onCep = (e) => {
    const v = e.target.value; setCep(v);
    if (v.replace(/\D/g, "").length === 8) {
      setBuscando(true);
      buscarCep(v).then((r) => { if (r) setF((p) => ({ ...p, endereco: p.endereco || [r.logradouro, r.bairro].filter(Boolean).join(", "), cidade: r.cidade || p.cidade })); }).finally(() => setBuscando(false));
    }
  };
  const onCnpj = (e) => {
    const v = e.target.value; setF((p) => ({ ...p, cnpj: v }));
    if (v.replace(/\D/g, "").length === 14) {
      setBuscando(true);
      buscarCnpj(v).then((r) => { if (r) setF((p) => ({ ...p, nome: p.nome || r.nomeFantasia || r.razaoSocial, endereco: p.endereco || [r.logradouro, r.numero, r.bairro].filter(Boolean).join(", "), cidade: p.cidade || r.municipio })); }).finally(() => setBuscando(false));
    }
  };

  return (
    <>
      <div style={{ fontSize: 12.5, color: C.text3, marginBottom: 14 }}>
        A nova unidade entra na <b>sua conta</b> e você já pode operá-la. Cadastre as salas e a cafeteria dela em seguida.
      </div>
      <Field label="Nome da unidade">
        <input value={f.nome} onChange={set("nome")} style={inp} placeholder="Ex: Savassi" />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
        <Field label="CEP">
          <input value={cep} onChange={onCep} style={inp} placeholder="00000-000" inputMode="numeric" aria-label="CEP da unidade" />
        </Field>
        <Field label="Endereço">
          <input value={f.endereco} onChange={set("endereco")} style={inp} placeholder="Rua, número · bairro" />
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Cidade">
          <input value={f.cidade} onChange={set("cidade")} style={inp} placeholder="Ex: Belo Horizonte" />
        </Field>
        <Field label="CNPJ (para emissão de nota)">
          <input value={f.cnpj} onChange={onCnpj} style={inp} placeholder="00.000.000/0001-00 (opcional)" />
        </Field>
      </div>
      {buscando && <div style={{ fontSize: 11, color: C.text4, marginTop: -6, marginBottom: 10 }}>Buscando dados…</div>}
      <Field label="Cor da unidade">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {PALETA.map((c) => (
            <button key={c} type="button" onClick={() => setF({ ...f, cor: c })} aria-label={c}
              style={{ width: 30, height: 30, borderRadius: 8, background: c, border: f.cor === c ? `3px solid ${C.text}` : `1px solid ${C.border}`, display: "grid", placeItems: "center" }}>
              {f.cor === c && <Check size={14} color="#fff" />}
            </button>
          ))}
        </div>
      </Field>
      {erro && <div style={{ fontSize: 12.5, color: C.red, marginBottom: 10 }}>{erro}</div>}
      <Btn style={{ width: "100%", justifyContent: "center", marginTop: 6, opacity: (valido && !loading) ? 1 : 0.6 }} onClick={() => valido && !loading && onSave(f)}>
        {loading ? "Criando…" : "Criar unidade"}
      </Btn>
    </>
  );
}
