// Pré-visualização da área do cliente para a equipe (menu "Área Cliente").
//
// Mostra as mesmas telas que o cliente vê. Elas buscam os dados no servidor com
// o login de quem está usando o app: para a equipe aparecem vazias, porque a
// equipe não é cliente. Nada aqui dá baixa em fatura nem mostra documento de
// exemplo — o cliente só vê o que existe de verdade.
import { useState } from "react";
import { Eye, Home, ScrollText, CalendarDays, Wallet, Mail, Building2, MessageSquare, Bell, UserCircle, Coffee } from "lucide-react";
import { PageHead } from "../components/ui.jsx";
import { C } from "../lib/theme.js";
import { useStore } from "../lib/store.jsx";
import Inicio from "./cliente/Inicio.jsx";
import Faturas from "./cliente/Faturas.jsx";
import Reservar from "./cliente/Reservar.jsx";
import Correspondencias from "./cliente/Correspondencias.jsx";
import EnderecoFiscal from "./cliente/EnderecoFiscal.jsx";
import FaleConosco from "./cliente/FaleConosco.jsx";
import Notificacoes from "./cliente/Notificacoes.jsx";
import MinhaConta from "./cliente/MinhaConta.jsx";
import MeuPlano from "./MeuPlano.jsx";
import Cafeteria from "./cliente/Cafeteria.jsx";

export const TELAS_AREA_CLIENTE = [
  { id: "cli_inicio", label: "Início", icon: Home, Tela: Inicio },
  { id: "cli_plano", label: "Meu plano", icon: ScrollText, Tela: MeuPlano },
  { id: "cli_reservar", label: "Reservar sala", icon: CalendarDays, Tela: Reservar },
  { id: "cli_cafeteria", label: "Cafeteria", icon: Coffee, Tela: Cafeteria },
  { id: "cli_faturas", label: "Faturas", icon: Wallet, Tela: Faturas },
  { id: "cli_docs", label: "Correspondências", icon: Mail, Tela: Correspondencias },
  { id: "cli_fiscal", label: "Endereço fiscal", icon: Building2, Tela: EnderecoFiscal },
  { id: "cli_contato", label: "Fale com a recepção", icon: MessageSquare, Tela: FaleConosco },
  { id: "cli_notif", label: "Notificações", icon: Bell, Tela: Notificacoes },
  { id: "cli_conta", label: "Minha conta", icon: UserCircle, Tela: MinhaConta },
];

export default function AreaCliente() {
  const { meuPerfil } = useStore();
  const [tela, setTela] = useState("cli_inicio");
  const atual = TELAS_AREA_CLIENTE.find((t) => t.id === tela) || TELAS_AREA_CLIENTE[0];
  const Tela = atual.Tela;

  return (
    <div>
      <PageHead title="Área do Cliente" sub="Como o cliente enxerga o portal: plano, faturas, reservas, correspondências e endereço fiscal." />
      <div role="note" style={{ background: C.teal, borderRadius: 16, padding: "12px 18px", marginBottom: 18, display: "flex", alignItems: "center", gap: 10, color: "#fff", fontSize: 14 }}>
        <Eye size={16} aria-hidden="true" />
        <span>Pré-visualização. As telas usam os dados de quem está logado; como você é da equipe, elas aparecem vazias.</span>
      </div>
      <div role="tablist" aria-label="Telas da área do cliente" style={{ display: "flex", gap: 8, marginBottom: 22, flexWrap: "wrap" }}>
        {TELAS_AREA_CLIENTE.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tela === t.id} onClick={() => setTela(t.id)} className="cw-btn"
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 12, fontSize: 14, fontWeight: 600, border: `1px solid ${tela === t.id ? C.cafe : C.border}`, background: tela === t.id ? C.cafe : C.white, color: tela === t.id ? "#fff" : C.text2 }}>
            <t.icon size={16} aria-hidden="true" /> {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        <Tela go={setTela} nome={meuPerfil?.nome} />
      </div>
    </div>
  );
}
