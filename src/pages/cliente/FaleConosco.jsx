// Fale com a recepção: canais reais (WhatsApp e e-mail) no lugar do chat que
// aceitava mensagem e não entregava.
import { PageHead } from "../../components/ui.jsx";
import { CartaoRecepcao } from "./comum.jsx";

export default function FaleConosco() {
  return (
    <div>
      <PageHead title="Fale com a recepção" sub="Dúvidas, reservas, correspondências e pagamentos." />
      <div style={{ maxWidth: 640 }}>
        <CartaoRecepcao titulo="Atendimento CafeWorking" texto="Escreva pelo canal que preferir. Respondemos no horário de atendimento." />
      </div>
    </div>
  );
}
