// Preferências de e-mail do cliente, gravadas no servidor. Avisos de pagamento,
// contrato e correspondência sempre saem; lembretes, reservas e novidades o
// cliente escolhe. É também a tela do link "Escolher quais e-mails receber".
import { useEffect, useState } from "react";
import { CreditCard, FileText, CalendarDays, Bell, Mail, ScrollText } from "lucide-react";
import { Card, Badge, PageHead } from "../../components/ui.jsx";
import { C, serif } from "../../lib/theme.js";
import { clienteApi } from "../../lib/clienteApi.js";
import { emailDaSessao } from "../../lib/supabaseAuth.js";
import { mensagemDe } from "../../lib/erros.js";
import { Carregando, ErroCarga, Interruptor } from "./comum.jsx";

const PADRAO = { lembretes: true, reservas: true, novidades: false };

const OPCIONAIS = [
  { id: "lembretes", titulo: "Lembretes de vencimento", sub: "Aviso alguns dias antes de uma fatura vencer", icon: Bell },
  { id: "reservas", titulo: "Confirmação de reservas", sub: "E-mail a cada reserva de sala feita", icon: CalendarDays },
  { id: "novidades", titulo: "Novidades e eventos", sub: "Eventos, promoções e comunicados do CafeWorking", icon: Mail },
];
const SEMPRE = [
  { titulo: "Cobranças e pagamentos", sub: "Nova cobrança, fatura vencida e pagamento confirmado", icon: CreditCard },
  { titulo: "Correspondências", sub: "Quando chega carta ou documento para você", icon: FileText },
  { titulo: "Plano e contrato", sub: "Ativação, renovação, cancelamento e documentos", icon: ScrollText },
];

export default function Notificacoes() {
  const [prefs, setPrefs] = useState(null);
  const [erro, setErro] = useState("");
  const [status, setStatus] = useState("");
  const [salvando, setSalvando] = useState("");

  const carregar = () => {
    setErro("");
    clienteApi.preferencias().then((p) => setPrefs({ ...PADRAO, ...(p || {}) })).catch((e) => setErro(mensagemDe(e)));
  };
  useEffect(carregar, []);

  const mudar = async (id, valor) => {
    const anterior = prefs;
    const novo = { ...prefs, [id]: valor };
    setPrefs(novo);
    setSalvando(id);
    setStatus("");
    try {
      await clienteApi.salvarPreferencias({ lembretes: novo.lembretes, reservas: novo.reservas, novidades: novo.novidades });
      setStatus("Preferência salva.");
    } catch (e) {
      setPrefs(anterior);
      setStatus(mensagemDe(e, "Não foi possível salvar. Tente de novo."));
    } finally {
      setSalvando("");
    }
  };

  return (
    <div>
      <PageHead title="Notificações" sub="Escolha quais e-mails você quer receber." />
      <Card style={{ maxWidth: 640, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border2}` }}>
          <div style={{ fontFamily: serif, fontSize: 19 }}>E-mails</div>
          <div style={{ fontSize: 13, color: C.text3, marginTop: 3 }}>Enviamos para <b>{emailDaSessao() || "o seu e-mail de acesso"}</b>.</div>
        </div>
        {erro && <div style={{ padding: 16 }}><ErroCarga mensagem={erro} onTentar={carregar} /></div>}
        {!prefs && !erro && <div style={{ padding: 16 }}><Carregando /></div>}
        {prefs && OPCIONAIS.map((o) => (
          <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: `1px solid ${C.border2}` }}>
            <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 10, background: C.cafePale, display: "grid", placeItems: "center", flexShrink: 0 }}><o.icon size={18} color={C.cafe} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div id={`pref-${o.id}`} style={{ fontSize: 15, fontWeight: 600 }}>{o.titulo}</div>
              <div style={{ fontSize: 13, color: C.text3 }}>{o.sub}</div>
            </div>
            <Interruptor ligado={prefs[o.id]} onChange={(v) => mudar(o.id, v)} rotuloId={`pref-${o.id}`} desabilitado={salvando === o.id} />
          </div>
        ))}
        <div role="status" aria-live="polite" style={{ padding: status ? "10px 20px" : 0, fontSize: 13, color: /salva/.test(status) ? C.green : C.red }}>{status}</div>
        <div style={{ padding: "14px 20px", background: C.cream }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text2, marginBottom: 8 }}>Sempre enviados (avisos importantes do seu contrato)</div>
          {SEMPRE.map((s) => (
            <div key={s.titulo} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
              <s.icon size={16} color={C.text3} aria-hidden="true" />
              <div style={{ flex: 1, fontSize: 14 }}>{s.titulo} <span style={{ fontSize: 13, color: C.text3 }}>· {s.sub}</span></div>
              <Badge color={C.text3} bg={C.cream2}>Sempre ativo</Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
