// Endereço fiscal: passo a passo real (enviar documentos → conferência →
// liberação) e, quando liberado, os documentos do imóvel por link temporário.
import { Building2, FileText, ExternalLink, Upload, Search, CheckCircle2 } from "lucide-react";
import { Card, Badge, Btn, PageHead, Empty } from "../../components/ui.jsx";
import { C, serif } from "../../lib/theme.js";
import { clienteApi } from "../../lib/clienteApi.js";
import { Carregando, ErroCarga, Aviso, CartaoRecepcao, useDados, dataBR } from "./comum.jsx";

const TIPO_DOC = {
  iptu: "IPTU do imóvel",
  alvara: "Alvará ou dispensa de alvará",
  anuencia_modelo: "Modelo da declaração de anuência",
  comprovante_imovel: "Comprovante do imóvel",
  outro: "Documento",
};

const PASSOS = [
  { id: 1, icon: Upload, titulo: "Envie os documentos da empresa", sub: "Cartão CNPJ, contrato social e documento dos sócios, em Meu plano." },
  { id: 2, icon: Search, titulo: "Conferência pela equipe", sub: "Até 5 dias úteis. Avisamos por e-mail." },
  { id: 3, icon: CheckCircle2, titulo: "Documentos do imóvel liberados", sub: "IPTU, alvará e modelo de anuência para registrar o endereço." },
];
const PASSO_DA_ETAPA = { enviar_documentos: 1, reprovado: 1, em_conferencia: 2, pagamento_pendente: 3, preparando: 3, liberado: 3 };

function Passos({ atual, concluido }) {
  return (
    <ol style={{ listStyle: "none", margin: "0 0 16px", padding: 0, display: "grid", gap: 10 }}>
      {PASSOS.map((p) => {
        const feito = p.id < atual || (concluido && p.id === atual);
        const agora = p.id === atual && !concluido;
        const cor = feito ? C.green : agora ? C.cafe : C.text4;
        return (
          <li key={p.id} aria-current={agora ? "step" : undefined} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: "50%", border: `2px solid ${cor}`, background: feito ? C.greenPale : C.white, display: "grid", placeItems: "center", flexShrink: 0 }}>
              <p.icon size={16} color={cor} />
            </span>
            <span>
              <span style={{ display: "block", fontSize: 15, fontWeight: 600, color: agora || feito ? C.text : C.text3 }}>
                {p.titulo}{feito ? " · concluído" : agora ? " · agora" : ""}
              </span>
              <span style={{ fontSize: 13, color: C.text3 }}>{p.sub}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default function EnderecoFiscal({ go }) {
  const { dados, erro, carregando, recarregar } = useDados((f) => clienteApi.kitEndereco(f));
  const unidades = dados?.unidades || [];

  return (
    <div>
      <PageHead title="Endereço fiscal" sub="Andamento da liberação e documentos do imóvel para registrar o endereço da sua empresa." />
      {carregando && !dados && <Card><Carregando /></Card>}
      {erro && <div style={{ marginBottom: 16 }}><ErroCarga mensagem={erro} onTentar={recarregar} /></div>}
      {dados && unidades.length === 0 && (
        <Card style={{ marginBottom: 16 }}><Empty icon={Building2} title="Sem endereço fiscal ativo" sub="Não encontramos um plano de endereço fiscal ativo no seu cadastro. Se isso não estiver certo, fale com a recepção." /></Card>
      )}
      {unidades.map((u) => (
        <Card key={u.unidade_id} style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <div>
              <div style={{ fontFamily: serif, fontSize: 22 }}>{u.plano}</div>
              {u.unidade && <div style={{ fontSize: 13, color: C.text3 }}>Unidade {u.unidade}</div>}
            </div>
            {u.etapa === "liberado" && <Badge color={C.green}>Documentos liberados</Badge>}
          </div>

          {u.etapa === "legado" ? (
            <Aviso>Seu endereço fiscal foi contratado antes da contratação online. Para receber os documentos do imóvel ou tirar dúvidas, fale com a recepção.</Aviso>
          ) : (
            <Passos atual={PASSO_DA_ETAPA[u.etapa] || 1} concluido={u.etapa === "liberado"} />
          )}

          {u.etapa === "enviar_documentos" && (
            <Btn onClick={() => go("cli_plano")}><Upload size={15} aria-hidden="true" /> Enviar documentos</Btn>
          )}
          {u.etapa === "reprovado" && (
            <Aviso cor={C.red}>Não foi possível aprovar os documentos.{u.parecer ? ` Motivo: ${u.parecer}` : ""} Fale com a recepção para entender os próximos passos.</Aviso>
          )}
          {u.etapa === "em_conferencia" && (
            <Aviso>Recebemos seus documentos e estamos conferindo. Se faltar algo, avisamos por e-mail.</Aviso>
          )}
          {u.etapa === "pagamento_pendente" && (
            <>
              <Aviso cor={C.red}>Há uma fatura em atraso. Os documentos do imóvel voltam a ficar disponíveis assim que o pagamento for confirmado.</Aviso>
              <Btn variant="teal" onClick={() => go("cli_faturas")}>Ver faturas</Btn>
            </>
          )}
          {u.etapa === "preparando" && (
            <Aviso>Seus documentos foram aprovados. Estamos preparando os documentos do imóvel; eles aparecem aqui assim que estiverem prontos. Se precisar com urgência, fale com a recepção.</Aviso>
          )}
          {u.etapa === "liberado" && (
            <>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {u.documentos.map((d, i) => (
                  <li key={d.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: i ? `1px solid ${C.border2}` : "none", flexWrap: "wrap" }}>
                    <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 9, background: C.tealPale, display: "grid", placeItems: "center", flexShrink: 0 }}><FileText size={17} color={C.teal} /></span>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>{d.titulo}</div>
                      <div style={{ fontSize: 13, color: C.text3 }}>{TIPO_DOC[d.tipo] || "Documento"}{d.validade ? ` · válido até ${dataBR(d.validade)}` : ""}</div>
                    </div>
                    <a href={d.url} target="_blank" rel="noreferrer" className="cw-btn"
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 12, fontSize: 13, fontWeight: 600, color: C.text2, border: `1px solid ${C.border}`, background: C.white }}>
                      <ExternalLink size={14} aria-hidden="true" /> Abrir
                    </a>
                  </li>
                ))}
              </ul>
              <p style={{ fontSize: 13, color: C.text3, margin: "10px 0 0" }}>
                Por segurança, os links valem por {dados.validade_link_minutos || 10} minutos. Se um link não abrir, <button type="button" onClick={recarregar} style={{ color: C.teal, fontWeight: 600, textDecoration: "underline" }}>gere novos links</button>.
              </p>
            </>
          )}
        </Card>
      ))}
      {dados && <CartaoRecepcao compacto titulo="Dúvidas sobre o endereço fiscal?" mensagemWhatsapp="Olá! Tenho uma dúvida sobre o meu endereço fiscal no CafeWorking." />}
    </div>
  );
}
