import React, { useState } from "react";
import { Plus, Eye, Edit3, Trash2, ShieldCheck, Mail, Building2, Check } from "lucide-react";
import { Card, Badge, Btn, PageHead, Modal, Field, Empty } from "../components/ui.jsx";
import { C, serif, inp } from "../lib/theme.js";
import { useStore, PERFIS } from "../lib/store.jsx";

// Perfis que podem ser atribuídos a um usuário da equipe
const ROLES = ["master", "recepcao", "financeiro"];
const ROLE_LABEL = { master: "Gerente", recepcao: "Recepção", financeiro: "Financeiro" };

const MOD_LABEL = {
  dash: "Dashboard", franqueados: "Franquias", crm: "CRM", unidades: "Unidades",
  reservas: "Reservas", corresp: "Correspondências", pdv: "Cafeteria/PDV", clientes: "Clientes",
  chat: "Chat", financeiro: "Financeiro", eventos: "Eventos", equipe: "Equipe", area: "Portal do cliente",
};

const modulosDoPerfil = (perfil) =>
  (PERFIS[perfil]?.modules || []).map((m) => MOD_LABEL[m] || m);

export default function Equipe({ go }) {
  const {
    usuarios, unidades, unidadesVisiveis, perfil,
    addUsuario, updateUsuario, removeUsuario, verComoUsuario,
  } = useStore();
  const [modal, setModal] = useState(null);

  const visiveis = new Set(unidadesVisiveis.map((u) => u.id));
  const unidadesDoUsuario = (u) => (u.unidadeIds?.length ? u.unidadeIds : (u.unidadeId ? [u.unidadeId] : []));
  const lista = usuarios.filter((u) => unidadesDoUsuario(u).some((id) => visiveis.has(id)));
  const nomeUnidade = (id) => unidades.find((u) => u.id === id)?.nome || "—";
  const rotuloUnidades = (u) => {
    const ids = unidadesDoUsuario(u);
    if (ids.length > 1 && ids.length >= unidadesVisiveis.length) return "Todas as unidades";
    return ids.map(nomeUnidade).join(", ") || "—";
  };

  return (
    <div>
      <PageHead
        title="Equipe e permissões"
        sub="Cadastre os usuários e defina o que cada um pode acessar. A permissão vem do perfil escolhido."
        action={
          <Btn onClick={() => setModal({})}>
            <Plus size={16} /> Novo usuário
          </Btn>
        }
      />

      {lista.length === 0 ? (
        <Card>
          <Empty icon={ShieldCheck} title="Nenhum usuário" sub="Cadastre o primeiro usuário da equipe." />
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {lista.map((u, i) => {
            const cor = PERFIS[u.perfil]?.cor || C.cafe;
            return (
              <div
                key={u.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: 16,
                  borderBottom: i < lista.length - 1 ? `1px solid ${C.border2}` : "none",
                  opacity: u.ativo ? 1 : 0.55,
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{
                    width: 42, height: 42, borderRadius: "50%", background: cor, color: "#fff",
                    display: "grid", placeItems: "center", fontFamily: serif, fontSize: 18, flexShrink: 0,
                  }}
                >
                  {u.nome.charAt(0)}
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{u.nome}</span>
                    <Badge color={cor}>{ROLE_LABEL[u.perfil] || u.perfil}</Badge>
                    {!u.ativo && <Badge color={C.text3}>Inativo</Badge>}
                  </div>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 4, fontSize: 12.5, color: C.text3 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <Mail size={13} /> {u.email}
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <Building2 size={13} /> {rotuloUnidades(u)}
                    </span>
                  </div>
                  <div style={{ fontSize: 11.5, color: C.text4, marginTop: 5 }}>
                    Acessa: {modulosDoPerfil(u.perfil).join(" · ")}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn variant="soft" style={{ padding: "8px 12px", fontSize: 13 }} onClick={() => { verComoUsuario(u); go && go(PERFIS[u.perfil]?.landing || "dash"); }}>
                    <Eye size={14} /> Ver como
                  </Btn>
                  <Btn variant="ghost" style={{ padding: "8px 12px", fontSize: 13 }} onClick={() => setModal(u)}>
                    <Edit3 size={14} /> Editar
                  </Btn>
                  <Btn variant="ghost" style={{ color: C.red, borderColor: C.redPale, padding: "8px 11px" }} onClick={() => removeUsuario(u.id)} title="Excluir">
                    <Trash2 size={14} />
                  </Btn>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {modal && (
        <Modal title={modal.id ? "Editar usuário" : "Novo usuário"} onClose={() => setModal(null)}>
          <UsuarioForm
            inicial={modal}
            unidades={unidadesVisiveis}
            onSave={(dados) => {
              if (modal.id) updateUsuario(modal.id, dados);
              else addUsuario(dados);
              setModal(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function UsuarioForm({ inicial, unidades, onSave }) {
  const [f, setF] = useState({
    nome: inicial.nome || "",
    email: inicial.email || "",
    perfil: inicial.perfil || "recepcao",
    unidadeIds: inicial.unidadeIds?.length ? inicial.unidadeIds : (inicial.unidadeId ? [inicial.unidadeId] : (unidades[0] ? [unidades[0].id] : [])),
    ativo: inicial.ativo !== false,
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const valido = f.nome.trim() && f.email.trim() && f.unidadeIds.length > 0;
  const todas = unidades.length > 0 && unidades.every((u) => f.unidadeIds.includes(u.id));
  const toggleUnidade = (id) =>
    setF((s) => ({ ...s, unidadeIds: s.unidadeIds.includes(id) ? s.unidadeIds.filter((x) => x !== id) : [...s.unidadeIds, id] }));
  const toggleTodas = () =>
    setF((s) => ({ ...s, unidadeIds: todas ? [] : unidades.map((u) => u.id) }));

  const salvar = () => valido && onSave({ ...f, unidadeId: f.unidadeIds[0] });

  return (
    <>
      <Field label="Nome do usuário">
        <input value={f.nome} onChange={set("nome")} style={inp} placeholder="Nome completo" />
      </Field>
      <Field label="E-mail de acesso">
        <input type="email" value={f.email} onChange={set("email")} style={inp} placeholder="email@cafeworking.com.br" />
      </Field>
      <Field label="Unidades de acesso (uma, várias ou todas)">
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 6 }}>
          {unidades.length > 1 && (
            <button type="button" onClick={toggleTodas}
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "9px 10px", borderRadius: 9, background: todas ? `${C.cafe}10` : "transparent", borderBottom: `1px solid ${C.border2}`, marginBottom: 2 }}>
              <span style={{ width: 18, height: 18, borderRadius: 6, flexShrink: 0, border: `2px solid ${todas ? C.cafe : C.gray}`, background: todas ? C.cafe : "transparent", display: "grid", placeItems: "center" }}>
                {todas && <Check size={11} color="#fff" />}
              </span>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>Todas as unidades</span>
            </button>
          )}
          {unidades.map((u) => {
            const sel = f.unidadeIds.includes(u.id);
            return (
              <button key={u.id} type="button" onClick={() => toggleUnidade(u.id)}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 9, background: sel ? `${C.teal}10` : "transparent" }}>
                <span style={{ width: 18, height: 18, borderRadius: 6, flexShrink: 0, border: `2px solid ${sel ? C.teal : C.gray}`, background: sel ? C.teal : "transparent", display: "grid", placeItems: "center" }}>
                  {sel && <Check size={11} color="#fff" />}
                </span>
                <span style={{ fontSize: 13.5, color: C.text2 }}>{u.nome}</span>
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Permissão (perfil de acesso)">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ROLES.map((r) => {
            const sel = f.perfil === r;
            const cor = PERFIS[r].cor;
            return (
              <button
                key={r}
                type="button"
                onClick={() => setF({ ...f, perfil: r })}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  textAlign: "left",
                  padding: "11px 12px",
                  borderRadius: 12,
                  border: `1px solid ${sel ? cor : C.border}`,
                  background: sel ? `${cor}10` : C.white,
                }}
              >
                <span
                  style={{
                    width: 18, height: 18, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                    border: `2px solid ${sel ? cor : C.gray}`, background: sel ? cor : "transparent",
                    display: "grid", placeItems: "center",
                  }}
                >
                  {sel && <Check size={11} color="#fff" />}
                </span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{ROLE_LABEL[r]}</div>
                  <div style={{ fontSize: 11.5, color: C.text3, marginTop: 2 }}>
                    Acessa: {modulosDoPerfil(r).join(" · ")}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </Field>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.text2, marginBottom: 14, cursor: "pointer" }}>
        <input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} />
        Usuário ativo (pode acessar o sistema)
      </label>

      <Btn style={{ width: "100%", justifyContent: "center", opacity: valido ? 1 : 0.6 }} onClick={salvar}>
        {inicial.id ? "Salvar usuário" : "Cadastrar usuário"}
      </Btn>
    </>
  );
}
