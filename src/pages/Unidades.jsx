import React, { useState } from "react";
import {
  Plus, MapPin, Edit3, Building2, Trash2, ArrowLeft,
  Coffee, CalendarDays, DoorOpen, Check, ArrowRight, Package,
} from "lucide-react";
import { Card, Badge, Btn, PageHead, Modal, Field, Empty, ImageInput } from "../components/ui.jsx";
import { C, serif, sans, fmt, fmtShort, inp } from "../lib/theme.js";
import { useStore } from "../lib/store.jsx";
import { CLIENTES } from "../lib/data.js";

const PALETA = [C.cafe, C.teal, C.cafe2, C.teal3, C.green, C.amber, C.blue, C.red];

export default function Unidades({ go }) {
  const {
    unidades, unidadesVisiveis, viewAs, franqueados,
    activeUnit, setActiveUnit, salasDe, produtosDe, addUnidade, addFranqueado,
  } = useStore();
  const [novaUnidade, setNovaUnidade] = useState(false);
  const [gerenciando, setGerenciando] = useState(null);

  const unidadeGerida = unidades.find((u) => u.id === gerenciando);
  if (unidadeGerida) {
    return <GerenciarUnidade unidade={unidadeGerida} go={go} onBack={() => setGerenciando(null)} />;
  }

  return (
    <div>
      <PageHead
        title="Unidades"
        sub={
          viewAs
            ? "Suas unidades. Selecione uma para gerenciar salas, cafeteria e agenda."
            : "Próprias e franqueadas. Selecione uma para gerenciar, ou cadastre uma nova."
        }
        action={
          !viewAs && (
            <Btn onClick={() => setNovaUnidade(true)}>
              <Plus size={16} /> Nova unidade
            </Btn>
          )
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
                  {u.tipo === "franqueada" ? (
                    <Badge color="#B8862F">Franqueada</Badge>
                  ) : (
                    <Badge color={C.teal}>Própria</Badge>
                  )}
                  {u.id === activeUnit && <Badge color={C.green}>Ativa</Badge>}
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
              <Btn
                onClick={() => {
                  setActiveUnit(u.id);
                  setGerenciando(u.id);
                }}
              >
                <Edit3 size={15} /> Gerenciar
              </Btn>
            </div>
          </Card>
        );
      })}

      {novaUnidade && (
        <Modal title="Nova unidade" onClose={() => setNovaUnidade(false)}>
          <UnidadeForm
            franqueados={franqueados}
            addFranqueado={addFranqueado}
            onSave={(dados) => {
              const id = addUnidade(dados);
              setNovaUnidade(false);
              setActiveUnit(id);
              setGerenciando(id);
            }}
          />
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
  const [tab, setTab] = useState("salas");

  const salas = store.salasDe(unidade.id);
  const produtos = store.produtosDe(unidade.id);

  const tabs = [
    { id: "salas", label: "Salas", icon: DoorOpen, n: salas.length },
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

      {tab === "salas" && <SalasTab unidade={unidade} salas={salas} store={store} />}
      {tab === "cafeteria" && <CafeteriaTab unidade={unidade} produtos={produtos} go={go} />}
      {tab === "agenda" && <AgendaTab unidade={unidade} salas={salas} store={store} go={go} />}
    </div>
  );
}

// --- Aba Salas -------------------------------------------------------------
function SalasTab({ unidade, salas, store }) {
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
        salas.map((s) => (
          <LinhaItem
            key={s.id}
            foto={s.foto}
            titulo={s.nome}
            badge={s.contratada
              ? <Badge color={C.red} bg={C.redPale}>Contratada{s.contratante ? ` · ${s.contratante}` : ""}</Badge>
              : <Badge color={C.green}>Disponível</Badge>}
            sub={s.contratada
              ? `${s.tipo} · ${s.cap} lugares · locação mensal ${s.valorMensal ? fmt(s.valorMensal) : s.valor || ""}`
              : `${s.tipo} · ${s.cap} lugares · ${s.valor || "—"}`}
            onEdit={() => setModal(s)}
            onDelete={() => store.removeSala(s.id)}
          />
        ))
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

function SalaForm({ inicial, unidade, onSave }) {
  const [f, setF] = useState({
    nome: inicial.nome || "",
    tipo: inicial.tipo || "Reunião",
    cap: inicial.cap || 4,
    valor: inicial.valor || "",
    valorHora: inicial.valorHora || 0,
    foto: inicial.foto || "",
    contratada: inicial.contratada || false,
    contratante: inicial.contratante || "",
    valorMensal: inicial.valorMensal || 0,
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const clientesUnidade = CLIENTES.filter((c) => c.unidade === unidade?.nome);
  return (
    <>
      <Field label="Foto da sala (o cliente vê ao reservar)">
        <ImageInput value={f.foto} onChange={(v) => setF({ ...f, foto: v })} />
      </Field>
      <Field label="Nome da sala">
        <input value={f.nome} onChange={set("nome")} style={inp} placeholder="Ex: Sala Privativa 3" />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Tipo">
          <select value={f.tipo} onChange={set("tipo")} style={inp}>
            {["Reunião", "Atendimento", "Evento", "Privativa", "Coworking"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Capacidade">
          <input type="number" min="1" value={f.cap} onChange={(e) => setF({ ...f, cap: +e.target.value })} style={inp} />
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Valor (texto exibido)">
          <input value={f.valor} onChange={set("valor")} style={inp} placeholder="Ex: R$ 120/h" />
        </Field>
        <Field label="Valor por hora (R$)">
          <input type="number" min="0" step="0.01" value={f.valorHora} onChange={(e) => setF({ ...f, valorHora: +e.target.value })} style={inp} />
        </Field>
      </div>
      <div style={{ fontSize: 11, color: C.text4, marginTop: -8, marginBottom: 12 }}>
        O valor por hora é usado para contabilizar a reserva no financeiro automaticamente.
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

      <Btn style={{ width: "100%", justifyContent: "center", marginTop: 2 }} onClick={() => f.nome.trim() && onSave(f)}>
        {inicial.id ? "Salvar sala" : "Adicionar sala"}
      </Btn>
    </>
  );
}

// --- Aba Cafeteria (produtos) ---------------------------------------------
// Os produtos da cafeteria agora são cadastrados em "Produtos e Serviços"
// (catálogo, tipo "produto"). Aqui é só uma prévia + atalho para gerenciar.
function CafeteriaTab({ unidade, produtos, go }) {
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

function ProdutoForm({ inicial, onSave }) {
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

function LinhaItem({ emoji, foto, titulo, sub, badge, onEdit, onDelete }) {
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

function UnidadeForm({ franqueados, addFranqueado, onSave }) {
  const [f, setF] = useState({
    nome: "",
    endereco: "",
    cor: PALETA[0],
    tipo: "propria",
    franqueadoId: franqueados[0]?.id || "",
  });
  // se não há franqueados, criar nova unidade franqueada exige cadastrar um
  const [novoFranq, setNovoFranq] = useState(franqueados.length === 0);
  const [nf, setNf] = useState({ nome: "", documento: "", email: "" });
  const setN = (k) => (e) => setNf({ ...nf, [k]: e.target.value });

  const submit = () => {
    if (!f.nome.trim()) return;
    let franqueadoId = null;
    if (f.tipo === "franqueada") {
      if (novoFranq) {
        if (!nf.nome.trim() || !nf.documento.trim() || !nf.email.trim()) return;
        franqueadoId = addFranqueado(nf);
      } else {
        if (!f.franqueadoId) return;
        franqueadoId = f.franqueadoId;
      }
    }
    onSave({ nome: f.nome, endereco: f.endereco, cor: f.cor, tipo: f.tipo, franqueadoId });
  };

  return (
    <>
      <Field label="Tipo de unidade">
        <div style={{ display: "flex", gap: 8 }}>
          {[
            ["propria", "Própria", C.teal],
            ["franqueada", "Franqueada", "#B8862F"],
          ].map(([val, label, cor]) => (
            <button
              key={val}
              type="button"
              onClick={() => setF({ ...f, tipo: val })}
              style={{
                flex: 1,
                padding: "10px 0",
                borderRadius: 10,
                fontFamily: sans,
                fontSize: 14,
                fontWeight: 600,
                border: `1px solid ${f.tipo === val ? cor : C.border}`,
                background: f.tipo === val ? cor : C.white,
                color: f.tipo === val ? "#fff" : C.text2,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </Field>

      {f.tipo === "franqueada" && (
        <div style={{ background: C.cream2, borderRadius: 12, padding: 14, marginBottom: 14 }}>
          {!novoFranq && franqueados.length > 0 ? (
            <>
              <Field label="Franqueado (usuário master)" style={{ marginBottom: 8 }}>
                <select value={f.franqueadoId} onChange={(e) => setF({ ...f, franqueadoId: e.target.value })} style={inp}>
                  {franqueados.map((fr) => (
                    <option key={fr.id} value={fr.id}>{fr.nome} — {fr.documento}</option>
                  ))}
                </select>
              </Field>
              <button
                type="button"
                onClick={() => setNovoFranq(true)}
                style={{ fontSize: 13, color: C.cafe, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5 }}
              >
                <Plus size={14} /> Cadastrar novo franqueado
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text3, marginBottom: 10, letterSpacing: 0.3 }}>
                NOVO FRANQUEADO (USUÁRIO MASTER)
              </div>
              <Field label="Nome" style={{ marginBottom: 8 }}>
                <input value={nf.nome} onChange={setN("nome")} style={inp} placeholder="Responsável pela franquia" />
              </Field>
              <Field label="CPF ou CNPJ" style={{ marginBottom: 8 }}>
                <input value={nf.documento} onChange={setN("documento")} style={inp} placeholder="000.000.000-00 ou 00.000.000/0000-00" />
              </Field>
              <Field label="E-mail de acesso" style={{ marginBottom: franqueados.length > 0 ? 8 : 0 }}>
                <input type="email" value={nf.email} onChange={setN("email")} style={inp} placeholder="email@franquia.com.br" />
              </Field>
              {franqueados.length > 0 && (
                <button
                  type="button"
                  onClick={() => setNovoFranq(false)}
                  style={{ fontSize: 13, color: C.text3, fontWeight: 600 }}
                >
                  ← Escolher um franqueado existente
                </button>
              )}
            </>
          )}
        </div>
      )}

      <Field label="Nome da unidade">
        <input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} style={inp} placeholder="Ex: Savassi" />
      </Field>
      <Field label="Endereço">
        <input value={f.endereco} onChange={(e) => setF({ ...f, endereco: e.target.value })} style={inp} placeholder="Rua, número · Cidade/UF" />
      </Field>
      <Field label="Cor da unidade">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {PALETA.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setF({ ...f, cor: c })}
              aria-label={c}
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: c,
                border: f.cor === c ? `3px solid ${C.text}` : `1px solid ${C.border}`,
                display: "grid",
                placeItems: "center",
              }}
            >
              {f.cor === c && <Check size={14} color="#fff" />}
            </button>
          ))}
        </div>
      </Field>
      <Btn style={{ width: "100%", justifyContent: "center", marginTop: 6 }} onClick={submit}>
        Criar unidade
      </Btn>
    </>
  );
}
