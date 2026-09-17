import { useEffect, useState } from "react";
import {
  Globe, Lock, Palette, Save, Upload, Zap, UserCircle,
  Landmark, CreditCard as CardIcon,
  Bell, Mail, Smartphone, Check, Receipt, Download,
} from "lucide-react";
import { Card, Badge, Btn, PageHead, Field, ImageInput, Empty } from "../components/ui.jsx";
import { C, serif, fmt, inp } from "../lib/theme.js";
import { useStore, MODO_REAL } from "../lib/store.jsx";
import Logo from "../components/Logo.jsx";
import { notificacoesApi } from "../lib/notificacoesApi.js";
import { emailMs365Api } from "../lib/emailMs365Api.js";

// Apenas integrações ativas (que funcionam de verdade).
const INTEGRACOES = [
  { nome: "Bancos · Cobrança", desc: "Emissão de boletos e PIX (Inter, Itaú, BTG, Bradesco)", icon: Landmark, cor: C.teal, status: "ativo", link: "boletos", cta: "Abrir Boletos" },
];

export default function Configuracoes({ go }) {
  const { perfil } = useStore();
  const ehFranqueador = perfil === "franqueador";
  // Conta, Assinatura, Segurança e Marca são só vitrine (dados fixos, "Salvar" e
  // toggles que não gravam nada, fatura e cartão de exemplo): ficam só na demonstração.
  const abas = [
    { id: "perfil", label: "Meu perfil", icon: UserCircle },
    ...(!MODO_REAL ? [{ id: "geral", label: ehFranqueador ? "Plataforma" : "Conta", icon: Globe }] : []),
    // Assinatura é a cobrança do coworking pelo uso do CafeWorking.
    // O Administrador (plataforma) é o vendedor, não assina o produto.
    ...(!ehFranqueador && !MODO_REAL ? [{ id: "assinatura", label: "Assinatura", icon: CardIcon }] : []),
    { id: "notificacoes", label: "Notificações", icon: Bell },
    { id: "integracoes", label: "Integrações", icon: Zap },
    ...(!MODO_REAL ? [
      { id: "seguranca", label: "Segurança", icon: Lock },
      { id: "marca", label: "Marca", icon: Palette },
    ] : []),
  ];
  const [aba, setAba] = useState("perfil");

  return (
    <div>
      <PageHead title="Configurações" sub={MODO_REAL ? "Seu perfil, notificações e integrações." : "Seu perfil, assinatura, notificações, integrações, segurança e marca."} />
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
          {ehFranqueador && emailMs365Api.configured && <EmailMicrosoft365 />}
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
      {/* O perfil ainda não é gravado no banco: em produção, dizer a verdade. */}
      <Btn style={{ marginTop: 6 }} onClick={salvar}>
        <Save size={16} /> {MODO_REAL
          ? (salvo ? "Aplicado nesta sessão" : "Aplicar nesta sessão")
          : (salvo ? "Dados salvos" : "Salvar meu perfil")}
      </Btn>
      {MODO_REAL && (
        <div style={{ fontSize: 12, color: C.text4, marginTop: 8 }}>
          Por enquanto estes dados valem só até recarregar a página; o login e o e-mail de acesso não mudam aqui.
        </div>
      )}
    </Card>
  );
}

// ===========================================================================
// Assinatura — cobrança do coworking pelo uso do CafeWorking (SaaS)
// ===========================================================================
const PLANOS = [
  { nome: "Essencial", valor: 297, recursos: ["1 unidade", "Reservas + cafeteria", "Financeiro básico"] },
  { nome: "Pro", valor: 597, recursos: ["Até 3 unidades", "Boletos e cobrança", "DRE e relatórios", "Correspondências digitalizadas"] },
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
      A coluna <b>Push</b> controla os contadores que aparecem no menu do app (PDV, Reservas e Correspondências).
      {MODO_REAL && <> Por enquanto a escolha não é gravada (vale até recarregar) e as colunas E-mail e WhatsApp ainda não mudam nenhum envio.</>}
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
          <Save size={16} /> {MODO_REAL
            ? (salvo ? "Aplicado nesta sessão" : "Aplicar nesta sessão")
            : (salvo ? "Preferências salvas" : "Salvar preferências")}
        </Btn>
        {!salvo && <span style={{ fontSize: 12, color: C.amber }}>{MODO_REAL ? "Alterações não aplicadas" : "Alterações não salvas"}</span>}
      </div>
    </Card>

    <HistoricoEmails />
   </div>
  );
}

const EVENTO_LABEL = {
  boleto_nova: "Boleto · nova cobrança",
  boleto_pago: "Boleto · pagamento confirmado",
  boleto_lembrete: "Lembrete de vencimento",
  cobranca_nova: "Nova cobrança",
  nfse_emitida: "Nota fiscal emitida",
  correspondencia: "Correspondência recebida",
  cafe_pedido: "Cafeteria · pedido recebido",
  cafe_pronto: "Cafeteria · pedido pronto",
  reserva: "Reserva confirmada",
  assinatura_ativa: "Plano ativado",
  renovacao_anual: "Aviso de renovação",
  cancelamento_confirmado: "Cancelamento",
  documentos_aprovados: "Documentos aprovados",
  documentos_reprovados: "Documentos reprovados",
};
const STATUS_EMAIL = {
  enviado: ["Enviado", C.green], fila: ["Enviando", C.amber], erro: ["Não enviado", C.red],
  cancelado: ["Cliente optou por não receber", C.text3], ignorado: ["Cliente optou por não receber", C.text3],
  sem_email: ["Sem e-mail no cadastro", C.red], demonstracao: ["Demonstração", C.text3],
};

// Histórico real (tabela notificacoes, RLS da equipe) somado aos avisos que
// acabaram de ser disparados nesta sessão.
function HistoricoEmails() {
  const { activeUnit, notificacoesEmailDe } = useStore();
  const locais = notificacoesEmailDe(activeUnit);
  const [doBanco, setDoBanco] = useState([]);
  useEffect(() => {
    let vivo = true;
    notificacoesApi.listar(activeUnit).then((l) => { if (vivo) setDoBanco(l); });
    return () => { vivo = false; };
  }, [activeUnit, locais.length]);
  const itens = [
    ...locais.filter((n) => n.status !== "enviado" && n.status !== "erro" && n.status !== "ignorado"),
    ...doBanco.map((n) => ({ id: n.id, assunto: n.assunto || EVENTO_LABEL[n.evento] || n.evento, evento: n.evento, cliente: n.cliente_nome, destinatario: n.destinatario, status: n.status, erro: n.erro, createdAt: n.created_at })),
  ];
  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border2}` }}>
        <div style={{ fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          <Mail size={16} color={C.cafe} /> E-mails enviados ao cliente
          {itens.length > 0 && <Badge color={C.cafe}>{itens.length}</Badge>}
        </div>
        <div style={{ fontSize: 12, color: C.text3, marginTop: 4 }}>
          Cobranças, correspondências, reservas e avisos do plano, com a situação real do envio.
        </div>
      </div>
      {itens.length === 0 ? (
        <Empty icon={Mail} title="Nenhum e-mail ainda" sub="Os avisos enviados aos clientes desta unidade aparecem aqui." />
      ) : (
        itens.map((n, i) => {
          const [rot, cor] = STATUS_EMAIL[n.status] || [n.status, C.text3];
          return (
            <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: i < itens.length - 1 ? `1px solid ${C.border2}` : "none" }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: `${cor}1a`, display: "grid", placeItems: "center", flexShrink: 0 }}>
                <Mail size={16} color={cor} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.assunto}</div>
                <div style={{ fontSize: 12, color: C.text3 }}>
                  {EVENTO_LABEL[n.evento] || n.evento} · para {n.cliente || "cliente"}{n.destinatario ? ` <${n.destinatario}>` : ""}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <Badge color={cor}>{rot}</Badge>
                <div style={{ fontSize: 11, color: C.text4, marginTop: 3 }}>{n.createdAt ? new Date(n.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}</div>
              </div>
            </div>
          );
        })
      )}
    </Card>
  );
}

// ===========================================================================
// E-mail · Microsoft 365 — só admin da plataforma (mesmo fluxo do ContaOne).
// Credenciais do app do Azure → conectar a conta pela tela da Microsoft →
// e-mail de teste → ligar "usar para todos os e-mails". Desligado, segue o Resend.
// ===========================================================================
const REDIRECT_MS365_PADRAO = "https://lmgbysfrbtgqzbtouzft.supabase.co/functions/v1/email-ms365-callback";

function EmailMicrosoft365() {
  const [st, setSt] = useState(null);          // resposta de status
  const [oculto, setOculto] = useState(false); // 403: não é admin da plataforma
  const [form, setForm] = useState({ tenant_id: "", client_id: "", client_secret: "", envia_como: "" });
  const [testeMail, setTesteMail] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);        // { ok, texto }

  const aplicar = (r) => {
    setSt(r);
    const e = r.email || {};
    setForm({ tenant_id: e.tenant_id || "", client_id: e.client_id || "", client_secret: "", envia_como: e.envia_como || "" });
  };
  const carregar = async (silencioso = false) => {
    try {
      const r = await emailMs365Api.status();
      aplicar(r);
      setTesteMail((t) => t || r.adminEmail || "");
    } catch (e) {
      if (e.status === 403) { setOculto(true); return; }
      if (!silencioso) setMsg({ ok: false, texto: e.message });
    }
  };
  useEffect(() => {
    carregar();
    // Voltando da janela da Microsoft, atualiza o status sozinho.
    const aoFocar = () => carregar(true);
    window.addEventListener("focus", aoFocar);
    return () => window.removeEventListener("focus", aoFocar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (oculto) return null;

  const rodar = async (nome, fn, sucesso) => {
    setBusy(nome); setMsg(null);
    try {
      const r = await fn();
      if (r?.email) setSt((s) => ({ ...(s || {}), email: r.email }));
      const texto = typeof sucesso === "function" ? sucesso(r) : sucesso;
      if (texto) setMsg({ ok: true, texto });
      return r;
    } catch (e) {
      setMsg({ ok: false, texto: e.message });
      return null;
    } finally {
      setBusy("");
    }
  };

  const e = st?.email || {};
  const set = (k) => (ev) => setForm({ ...form, [k]: ev.target.value });
  const salvar = () => rodar("salvar", () => emailMs365Api.salvar(form), (r) => {
    setForm((f) => ({ ...f, client_secret: "" }));
    return r.desconectou
      ? "Credenciais salvas. Como o aplicativo mudou, a conta foi desconectada: conecte de novo."
      : "Credenciais salvas.";
  });
  const conectar = async () => {
    // Abre a janela já no clique (senão o bloqueador de pop-up barra) e só depois navega.
    const janela = window.open("", "_blank");
    const r = await rodar("conectar", () => emailMs365Api.urlConexao(), "Conclua o login na janela da Microsoft e volte para esta tela.");
    if (!r?.url) { if (janela) janela.close(); return; }
    if (janela) { janela.opener = null; janela.location.href = r.url; } else window.location.href = r.url;
  };
  const testar = () => rodar("testar", () => emailMs365Api.testar(testeMail), (r) => `E-mail de teste enviado para ${r.para} como ${r.remetente || "a conta conectada"}. Confira a caixa de entrada.`);
  const desconectar = () => {
    if (!window.confirm("Desconectar a conta Microsoft? Os e-mails voltam a sair pelo Resend.")) return;
    rodar("desconectar", () => emailMs365Api.desconectar(), "Conta desconectada. Os e-mails voltaram a sair pelo Resend.");
  };
  const alternar = () => {
    const ligar = !e.ativo;
    if (ligar && !window.confirm(`Todos os e-mails do CafeWorking passarão a sair pela Microsoft 365${e.envia_como ? ` como ${e.envia_como}` : ""}. Você já enviou um e-mail de teste?`)) return;
    rodar("ativar", () => emailMs365Api.ativar(ligar), ligar ? "Microsoft 365 ativada para todos os e-mails." : "Microsoft 365 desligada. Os e-mails voltaram a sair pelo Resend.");
  };

  const quando = e.conectado_em ? new Date(e.conectado_em).toLocaleString("pt-BR") : "";
  const statusBadge = !e.appConfigurado
    ? <Badge color={C.text3} bg={C.cream2}>Não configurado</Badge>
    : !e.conectado
      ? <Badge color={C.amber} bg={C.amberPale}>Aguardando conexão</Badge>
      : e.ativo
        ? <Badge color={C.green} bg={C.greenPale}>Ativo</Badge>
        : <Badge color={C.blue} bg={C.bluePale}>Conectado · desligado</Badge>;

  return (
    <Card style={{ maxWidth: 720, marginTop: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: `${C.blue}1a`, display: "grid", placeItems: "center" }}>
            <Mail size={22} color={C.blue} />
          </div>
          <div>
            <div style={{ fontFamily: serif, fontSize: 18, color: C.text }}>E-mail · Microsoft 365</div>
            <div style={{ fontSize: 13, color: C.text3 }}>Enviar os e-mails aos clientes direto pela caixa do Grupo Ciatos.</div>
          </div>
        </div>
        {st && statusBadge}
      </div>

      {!st && !msg && <div style={{ fontSize: 13, color: C.text3 }}>Carregando…</div>}
      {st?.pendente && (
        <div style={{ fontSize: 13, color: C.amber, background: C.amberPale, borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
          Falta aplicar a migration 20260922120000_email_microsoft no banco.
        </div>
      )}

      {st && (
        <>
          <div style={{ fontSize: 12.5, color: C.text2, background: C.cream, border: `1px solid ${C.border2}`, borderRadius: 10, padding: "10px 12px", margin: "6px 0 14px", lineHeight: 1.55 }}>
            <b>No Azure (Microsoft Entra → Registros de aplicativo → seu app):</b>
            <ol style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              <li>Autenticação → Adicionar plataforma → <b>Web</b> → URI de redirecionamento:
                <div style={{ fontFamily: "monospace", fontSize: 12, wordBreak: "break-all", margin: "3px 0" }}>{st.redirectUri || REDIRECT_MS365_PADRAO}</div>
              </li>
              <li>Permissões de API → Microsoft Graph → <b>delegadas</b>: Mail.Send, User.Read e offline_access.</li>
              <li>A conta que conectar precisa ter permissão <b>"Enviar como"</b> na caixa informada abaixo (Exchange → caixa envio@grupociatos.com.br → Delegação).</li>
            </ol>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
            <Field label="Tenant ID">
              <input value={form.tenant_id} onChange={set("tenant_id")} style={inp} placeholder="00000000-0000-0000-0000-000000000000" autoComplete="off" />
            </Field>
            <Field label="Client ID">
              <input value={form.client_id} onChange={set("client_id")} style={inp} placeholder="00000000-0000-0000-0000-000000000000" autoComplete="off" />
            </Field>
            <Field label="Client Secret">
              <input type="password" value={form.client_secret} onChange={set("client_secret")} style={inp} autoComplete="new-password"
                placeholder={e.temSecret ? "configurado · deixe em branco para manter" : "cole o valor do segredo"} />
            </Field>
            <Field label="Enviar como">
              <input type="email" value={form.envia_como} onChange={set("envia_como")} style={inp} placeholder="envio@grupociatos.com.br" autoComplete="off" />
            </Field>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
            <Btn onClick={salvar} disabled={!!busy}><Save size={16} /> {busy === "salvar" ? "Salvando…" : "Salvar"}</Btn>
            <Btn variant="teal" onClick={conectar} disabled={!!busy || !e.appConfigurado}>
              {busy === "conectar" ? "Abrindo…" : e.conectado ? "Reconectar conta Microsoft" : "Conectar conta Microsoft"}
            </Btn>
            {e.conectado && (
              <Btn variant="ghost" onClick={desconectar} disabled={!!busy} style={{ color: C.red }}>
                {busy === "desconectar" ? "Desconectando…" : "Desconectar"}
              </Btn>
            )}
            <Btn variant="ghost" onClick={() => carregar()} disabled={!!busy}>Atualizar status</Btn>
          </div>

          {e.conectado && (
            <>
              <div style={{ fontSize: 13, color: C.text2, marginTop: 16 }}>
                Conectado como <b>{e.conta_email || e.conta_nome || "conta Microsoft"}</b>{quando ? `, desde ${quando}` : ""}.
                {" "}Os e-mails saem como <b>{e.envia_como || e.conta_email}</b>.
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginTop: 12 }}>
                <Field label="E-mail de teste para" style={{ marginBottom: 0, flex: "1 1 240px" }}>
                  <input type="email" value={testeMail} onChange={(ev) => setTesteMail(ev.target.value)} style={inp} placeholder="voce@exemplo.com" />
                </Field>
                <Btn variant="ghost" onClick={testar} disabled={!!busy || !testeMail}>
                  <Mail size={16} /> {busy === "testar" ? "Enviando…" : "Enviar e-mail de teste"}
                </Btn>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 0 0", marginTop: 14, borderTop: `1px solid ${C.border2}` }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Usar Microsoft 365 para todos os e-mails</div>
                  <div style={{ fontSize: 12, color: C.text3 }}>
                    {e.ativo ? "Ligado: cobranças, avisos e convites saem pela Microsoft." : "Desligado: os e-mails continuam saindo pelo Resend."}
                  </div>
                </div>
                <button
                  onClick={alternar}
                  disabled={!!busy}
                  role="switch"
                  aria-checked={!!e.ativo}
                  aria-label="Usar Microsoft 365 para todos os e-mails"
                  style={{ width: 44, height: 26, borderRadius: 20, background: e.ativo ? C.teal : C.gray, position: "relative", transition: "all .2s", flexShrink: 0, opacity: busy ? 0.6 : 1 }}
                >
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: e.ativo ? 21 : 3, transition: "all .2s", boxShadow: "0 2px 4px rgba(0,0,0,.15)" }} />
                </button>
              </div>
            </>
          )}
        </>
      )}

      {msg && (
        <div style={{ fontSize: 13, marginTop: 14, borderRadius: 10, padding: "10px 12px", color: msg.ok ? C.green : C.red, background: msg.ok ? C.greenPale : C.redPale }}>
          {msg.texto}
        </div>
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
