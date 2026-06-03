import React, { useState } from "react";
import {
  Globe, Users, Lock, Palette, Plus, Save, Upload, Zap, UserCircle,
  Landmark, CreditCard as CardIcon, MessageSquare, CalendarClock, Workflow,
  Bell, Mail, Smartphone, Check, Receipt, Download, ChevronRight,
} from "lucide-react";
import { Card, Badge, Btn, PageHead, Field, ImageInput, Empty } from "../components/ui.jsx";
import { C, serif, sans, fmt, inp } from "../lib/theme.js";
import { useStore } from "../lib/store.jsx";
import Logo from "../components/Logo.jsx";

// Apenas integrações ativas (que funcionam de verdade).
const INTEGRACOES = [
  { nome: "Bancos · Cobrança", desc: "Emissão de boletos e PIX (Inter, Itaú, BTG, Bradesco)", icon: Landmark, cor: C.teal, status: "ativo", link: "boletos", cta: "Abrir Boletos" },
];

export default function Configuracoes({ go }) {
  const { perfil } = useStore();
  const ehFranqueador = perfil === "franqueador";
  const abas = [
    { id: "perfil", label: "Meu perfil", icon: UserCircle },
    { id: "geral", label: ehFranqueador ? "Plataforma" : "Conta", icon: Globe },
    // Assinatura é a cobrança do coworking pelo uso do CafeWorking.
    // O Administrador (plataforma) é o vendedor, não assina o produto.
    ...(!ehFranqueador ? [{ id: "assinatura", label: "Assinatura", icon: CardIcon }] : []),
    { id: "notificacoes", label: "Notificações", icon: Bell },
    { id: "integracoes", label: "Integrações", icon: Zap },
    { id: "seguranca", label: "Segurança", icon: Lock },
    { id: "marca", label: "Marca", icon: Palette },
  ];
  const [aba, setAba] = useState("perfil");

  return (
    <div>
      <PageHead title="Configurações" sub="Seu perfil, assinatura, notificações, integrações, segurança e marca." />
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {abas.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className="cw-btn"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "10px 16px",
              borderRadius: 12,
              fontWeight: 600,
              fontSize: 14,
              border: `1px solid ${aba === a.id ? C.cafe : C.border}`,
              background: aba === a.id ? C.cafe : C.white,
              color: aba === a.id ? "#fff" : C.text2,
            }}
          >
            <a.icon size={16} /> {a.label}
          </button>
        ))}
      </div>

      {aba === "perfil" && <MeuPerfil />}
      {aba === "assinatura" && <Assinatura />}
      {aba === "notificacoes" && <Notificacoes />}

      {aba === "geral" && (
        <Card style={{ maxWidth: 560 }}>
          <Field label="Nome do negócio">
            <input defaultValue="CafeWorking · Grupo Ciatos" style={inp} />
          </Field>
          <Field label="CNPJ">
            <input defaultValue="20.351.761/0001-03" style={inp} />
          </Field>
          <Field label="E-mail de atendimento">
            <input defaultValue="atendimento@cafeworking.com.br" style={inp} />
          </Field>
          <Field label="WhatsApp">
            <input defaultValue="(31) 99712-9789" style={inp} />
          </Field>
          <Field label="Fuso · Moeda">
            <input defaultValue="America/Sao_Paulo · BRL (R$)" style={inp} />
          </Field>
          <Btn style={{ marginTop: 6 }}>
            <Save size={16} /> Salvar alterações
          </Btn>
        </Card>
      )}

      {aba === "integracoes" && (
        <div>
          <div style={{ fontSize: 12.5, color: C.text3, marginBottom: 14, maxWidth: 620 }}>
            Integrações ativas conectadas à sua conta.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>
            {INTEGRACOES.map((I, i) => {
              const ativo = I.status === "ativo";
              return (
                <Card key={i} className={`cw-fade cw-fade-${(i % 4) + 1}`} style={ativo ? {} : { opacity: 0.72 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: `${I.cor}1a`, display: "grid", placeItems: "center" }}>
                      <I.icon size={22} color={I.cor} />
                    </div>
                    <Badge color={ativo ? C.green : C.text3} bg={ativo ? C.greenPale : C.cream2}>
                      {ativo ? "Ativo" : "Em breve"}
                    </Badge>
                  </div>
                  <div style={{ fontFamily: serif, fontSize: 18, color: C.text }}>{I.nome}</div>
                  <div style={{ fontSize: 13, color: C.text3, marginTop: 4 }}>{I.desc}</div>
                  {ativo ? (
                    <Btn variant="ghost" style={{ marginTop: 14, width: "100%", justifyContent: "center" }} onClick={() => go && go(I.link)}>
                      {I.cta || "Abrir"}
                    </Btn>
                  ) : (
                    <Btn variant="ghost" disabled style={{ marginTop: 14, width: "100%", justifyContent: "center", opacity: 0.55, cursor: "default" }}>
                      Em breve
                    </Btn>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {aba === "seguranca" && (
        <Card style={{ maxWidth: 560 }}>
          {[
            ["Autenticação em dois fatores", "Proteja o acesso ao painel", true],
            ["Registro de atividades", "Auditoria de ações da equipe", true],
            ["Sessão expira em 30 min", "Logout automático por inatividade", false],
            ["Confirmação para ações sensíveis", "Excluir cliente, gerar cobrança, etc.", true],
          ].map(([t, s, on], i, arr) => (
            <Toggle key={i} title={t} sub={s} initial={on} last={i === arr.length - 1} />
          ))}
        </Card>
      )}

      {aba === "marca" && (
        <Card style={{ maxWidth: 560 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Cores da marca</div>
          <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
            {[
              ["Café", C.cafe],
              ["Teal", C.teal],
              ["Creme", C.cream],
              ["Texto", C.text],
            ].map(([l, c]) => (
              <div key={l} style={{ textAlign: "center" }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 12,
                    background: c,
                    border: `1px solid ${C.border}`,
                  }}
                />
                <div style={{ fontSize: 12, color: C.text3, marginTop: 6 }}>{l}</div>
                <div style={{ fontSize: 10, color: C.text4, fontFamily: "monospace" }}>{c}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Logomarca</div>
          <div
            style={{
              padding: 24,
              border: `2px dashed ${C.border}`,
              borderRadius: 14,
              textAlign: "center",
            }}
          >
            <Logo size={42} showSub={false} />
            <Btn variant="ghost" style={{ marginTop: 14 }}>
              <Upload size={15} /> Trocar logo
            </Btn>
          </div>
        </Card>
      )}
    </div>
  );
}

function MeuPerfil() {
  const { meuPerfil, updateMeuPerfil } = useStore();
  const [f, setF] = useState({ ...meuPerfil });
  const [salvo, setSalvo] = useState(false);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setSalvo(false); };
  const salvar = () => { updateMeuPerfil(f); setSalvo(true); };

  return (
    <Card style={{ maxWidth: 560 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ flexShrink: 0 }}>
          {f.foto ? (
            <img src={f.foto} alt={f.nome} style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", border: `2px solid ${C.border}` }} />
          ) : (
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: C.cafe, color: "#fff", display: "grid", placeItems: "center", fontFamily: serif, fontSize: 28 }}>
              {(f.nome || "?").charAt(0)}
            </div>
          )}
        </div>
        <div style={{ minWidth: 200 }}>
          <div style={{ fontFamily: serif, fontSize: 20, color: C.text }}>{f.nome || "Seu nome"}</div>
          <div style={{ fontSize: 13, color: C.text3 }}>{f.cargo || "Cargo"}</div>
        </div>
      </div>

      <Field label="Foto do perfil">
        <ImageInput value={f.foto} onChange={(v) => { setF({ ...f, foto: v }); setSalvo(false); }} height={120} />
      </Field>
      <Field label="Nome completo">
        <input value={f.nome} onChange={set("nome")} style={inp} placeholder="Seu nome" />
      </Field>
      <Field label="Cargo / função">
        <input value={f.cargo} onChange={set("cargo")} style={inp} placeholder="Ex: Administrador, Recepção..." />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="E-mail">
          <input value={f.email} onChange={set("email")} style={inp} type="email" />
        </Field>
        <Field label="Telefone / WhatsApp">
          <input value={f.telefone} onChange={set("telefone")} style={inp} />
        </Field>
      </div>
      <Btn style={{ marginTop: 6 }} onClick={salvar}>
        <Save size={16} /> {salvo ? "Dados salvos" : "Salvar meu perfil"}
      </Btn>
    </Card>
  );
}

// ===========================================================================
// Assinatura — cobrança do coworking pelo uso do CafeWorking (SaaS)
// ===========================================================================
const PLANOS = [
  { nome: "Essencial", valor: 297, recursos: ["1 unidade", "Reservas + cafeteria", "Financeiro básico"] },
  { nome: "Pro", valor: 597, recursos: ["Até 3 unidades", "Boletos e cobrança", "DRE e relatórios", "Chat e correspondências"] },
  { nome: "Enterprise", valor: 1290, recursos: ["Unidades ilimitadas", "Multiconta", "API e automações", "Suporte dedicado"] },
];

const FATURAS = [
  { mes: "Maio/2026", data: "05/05/2026", status: "pago" },
  { mes: "Abril/2026", data: "05/04/2026", status: "pago" },
  { mes: "Março/2026", data: "05/03/2026", status: "pago" },
];

function Assinatura() {
  const { franqueadoAtivo } = useStore();
  const planoNome = franqueadoAtivo?.plano || "Pro";
  const mensal = franqueadoAtivo?.mensalidade || 597;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 760 }}>
      {/* Plano atual */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12.5, color: C.text3 }}>Plano atual</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
              <span style={{ fontFamily: serif, fontSize: 26 }}>{planoNome}</span>
              <Badge color={C.green} bg={C.greenPale}>Ativa</Badge>
            </div>
            <div style={{ fontSize: 13, color: C.text3, marginTop: 6 }}>
              Próxima cobrança em <b style={{ color: C.text2 }}>05/07/2026</b> · cartão final <b>4242</b>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: serif, fontSize: 28, color: C.cafe }}>{fmt(mensal)}</div>
            <div style={{ fontSize: 11.5, color: C.text4 }}>por mês</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          <Btn variant="ghost"><CardIcon size={15} /> Gerenciar pagamento</Btn>
          <Btn variant="ghost"><Download size={15} /> Baixar contrato</Btn>
        </div>
      </Card>

      {/* Planos disponíveis */}
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Mudar de plano</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12 }}>
          {PLANOS.map((p) => {
            const atual = p.nome === planoNome;
            return (
              <Card key={p.nome} style={{ border: `1.5px solid ${atual ? C.cafe : C.border2}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: serif, fontSize: 18 }}>{p.nome}</span>
                  {atual && <Badge color={C.cafe}>Atual</Badge>}
                </div>
                <div style={{ fontFamily: serif, fontSize: 22, color: C.cafe, margin: "6px 0 10px" }}>{fmt(p.valor)}<span style={{ fontSize: 12, color: C.text4 }}>/mês</span></div>
                {p.recursos.map((r) => (
                  <div key={r} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: C.text3, marginBottom: 5 }}>
                    <Check size={14} color={C.green} /> {r}
                  </div>
                ))}
                <Btn variant={atual ? "ghost" : "primary"} style={{ width: "100%", justifyContent: "center", marginTop: 10 }} {...(atual ? { disabled: true } : {})}>
                  {atual ? "Plano atual" : "Mudar para " + p.nome}
                </Btn>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Histórico de faturas */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border2}`, fontSize: 14, fontWeight: 600 }}>Histórico de faturas</div>
        {FATURAS.map((f, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 20px", borderBottom: i < FATURAS.length - 1 ? `1px solid ${C.border2}` : "none" }}>
            <Receipt size={18} color={C.text3} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{f.mes}</div>
              <div style={{ fontSize: 11.5, color: C.text4 }}>Pago em {f.data}</div>
            </div>
            <div style={{ fontFamily: serif, fontSize: 15 }}>{fmt(mensal)}</div>
            <Badge color={C.green} bg={C.greenPale}>Pago</Badge>
            <button className="cw-btn" title="Baixar nota" style={{ color: C.text3, padding: 6 }}><Download size={15} /></button>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ===========================================================================
// Notificações — canais (e-mail / WhatsApp / push) por tipo de evento
// ===========================================================================
const CANAIS = [
  { id: "email", label: "E-mail", icon: Mail },
  { id: "whats", label: "WhatsApp", icon: Smartphone },
  { id: "push", label: "Push", icon: Bell },
];
const EVENTOS = [
  { id: "reserva", label: "Nova reserva", sub: "Cliente reserva uma sala", on: { email: true, whats: true, push: true } },
  { id: "corresp", label: "Nova correspondência", sub: "Documento recebido para um cliente", on: { email: true, whats: false, push: true } },
  { id: "chat", label: "Mensagem no chat", sub: "Cliente fala com a recepção", on: { email: false, whats: true, push: true } },
  { id: "pedido", label: "Pedido na cafeteria", sub: "Novo pedido feito pelo app", on: { email: false, whats: false, push: true } },
  { id: "boleto", label: "Boleto pago ou vencido", sub: "Baixa automática e atrasos", on: { email: true, whats: true, push: false } },
  { id: "fatura", label: "Fatura da assinatura", sub: "Cobrança mensal do CafeWorking", on: { email: true, whats: false, push: false } },
  { id: "resumo", label: "Resumo financeiro semanal", sub: "Entradas, saídas e saldo", on: { email: true, whats: false, push: false } },
];

function Notificacoes() {
  const { notificacaoPrefs, updateNotificacaoPrefs } = useStore();
  // Inicia dos padrões e aplica por cima o que já foi salvo no store.
  const [prefs, setPrefs] = useState(() => {
    const o = {};
    EVENTOS.forEach((e) => CANAIS.forEach((c) => (o[`${e.id}.${c.id}`] = e.on[c.id])));
    return { ...o, ...notificacaoPrefs };
  });
  const [salvo, setSalvo] = useState(true);
  const toggle = (k) => { setPrefs((p) => ({ ...p, [k]: !p[k] })); setSalvo(false); };
  const salvar = () => { updateNotificacaoPrefs(prefs); setSalvo(true); };
  const col = "1fr 64px 84px 64px";

  return (
   <div style={{ maxWidth: 660, display: "flex", flexDirection: "column", gap: 18 }}>
    <div style={{ fontSize: 13, color: C.text3 }}>
      <b>Avisos da equipe</b> — quem do time é notificado, e por qual canal, a cada evento.
      A coluna <b>Push</b> controla os contadores que aparecem no menu do app (PDV, Chat, Reservas e Correspondências).
    </div>
    <Card style={{ padding: 0, overflow: "hidden" }}>
      {/* cabeçalho de canais */}
      <div style={{ display: "grid", gridTemplateColumns: col, gap: 8, padding: "14px 20px", borderBottom: `1px solid ${C.border2}`, background: C.cream, alignItems: "center" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.text3, letterSpacing: 0.3 }}>EVENTO</div>
        {CANAIS.map((c) => (
          <div key={c.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, color: C.text3 }}>
            <c.icon size={15} />
            <span style={{ fontSize: 10, fontWeight: 700 }}>{c.label}</span>
          </div>
        ))}
      </div>

      {EVENTOS.map((e, i) => (
        <div key={e.id} style={{ display: "grid", gridTemplateColumns: col, gap: 8, padding: "13px 20px", borderBottom: i < EVENTOS.length - 1 ? `1px solid ${C.border2}` : "none", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{e.label}</div>
            <div style={{ fontSize: 11.5, color: C.text4 }}>{e.sub}</div>
          </div>
          {CANAIS.map((c) => {
            const k = `${e.id}.${c.id}`;
            const on = prefs[k];
            return (
              <div key={c.id} style={{ display: "flex", justifyContent: "center" }}>
                <button onClick={() => toggle(k)} className="cw-btn" title={`${c.label}: ${on ? "ativado" : "desativado"}`}
                  style={{ width: 30, height: 30, borderRadius: 8, display: "grid", placeItems: "center", background: on ? C.cafe : C.cream2, color: on ? "#fff" : C.text4, border: `1px solid ${on ? C.cafe : C.border}` }}>
                  {on ? <Check size={15} /> : <span style={{ width: 9, height: 2, background: C.text4, borderRadius: 2 }} />}
                </button>
              </div>
            );
          })}
        </div>
      ))}

      <div style={{ padding: "14px 20px", borderTop: `1px solid ${C.border2}`, display: "flex", alignItems: "center", gap: 12 }}>
        <Btn onClick={salvar} style={salvo ? { opacity: 0.85 } : {}}>
          <Save size={16} /> {salvo ? "Preferências salvas" : "Salvar preferências"}
        </Btn>
        {!salvo && <span style={{ fontSize: 12, color: C.amber }}>Alterações não salvas</span>}
      </div>
    </Card>

    <HistoricoEmails />
   </div>
  );
}

const EVENTO_LABEL = {
  boleto_nova: "Boleto · nova cobrança",
  boleto_pago: "Boleto · pagamento confirmado",
  correspondencia: "Correspondência recebida",
  cafe_pedido: "Cafeteria · pedido recebido",
  cafe_pronto: "Cafeteria · pedido pronto",
};

function HistoricoEmails() {
  const { activeUnit, notificacoesEmailDe } = useStore();
  const itens = notificacoesEmailDe(activeUnit);
  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border2}` }}>
        <div style={{ fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          <Mail size={16} color={C.cafe} /> E-mails enviados ao cliente
          {itens.length > 0 && <Badge color={C.cafe}>{itens.length}</Badge>}
        </div>
        <div style={{ fontSize: 11.5, color: C.text4, marginTop: 4 }}>
          Disparados por boleto, correspondência e cafeteria. Em produção saem pela Edge Function (Resend); aqui é o registro de demonstração.
        </div>
      </div>
      {itens.length === 0 ? (
        <Empty icon={Mail} title="Nenhum e-mail ainda" sub="Emita um boleto, notifique uma correspondência ou registre um pedido para ver o disparo aqui." />
      ) : (
        itens.map((n, i) => (
          <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: i < itens.length - 1 ? `1px solid ${C.border2}` : "none" }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: C.greenPale, display: "grid", placeItems: "center", flexShrink: 0 }}>
              <Mail size={16} color={C.green} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.assunto}</div>
              <div style={{ fontSize: 11.5, color: C.text3 }}>
                {EVENTO_LABEL[n.evento] || n.evento} · para {n.cliente} &lt;{n.destinatario}&gt;
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <Badge color={C.green} bg={C.greenPale}>Enviado</Badge>
              <div style={{ fontSize: 10.5, color: C.text4, marginTop: 3 }}>{(n.createdAt || "").slice(11, 16)}</div>
            </div>
          </div>
        ))
      )}
    </Card>
  );
}

function Toggle({ title, sub, initial, last }) {
  const [on, setOn] = useState(initial);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 0",
        borderBottom: last ? "none" : `1px solid ${C.border2}`,
      }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 12, color: C.text3 }}>{sub}</div>
      </div>
      <button
        onClick={() => setOn(!on)}
        style={{
          width: 44,
          height: 26,
          borderRadius: 20,
          background: on ? C.teal : C.gray,
          position: "relative",
          transition: "all .2s",
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: "#fff",
            position: "absolute",
            top: 3,
            left: on ? 21 : 3,
            transition: "all .2s",
            boxShadow: "0 2px 4px rgba(0,0,0,.15)",
          }}
        />
      </button>
    </div>
  );
}
