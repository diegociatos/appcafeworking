// Faturas do cliente: cobranças reais (assinatura, reservas, avulsas) e boletos.
// O cliente nunca marca como pago — "Pagar" abre a fatura real do Asaas; a baixa
// chega sozinha quando o pagamento é confirmado.
import { useState } from "react";
import { Wallet, ExternalLink, Copy, FileText, CheckCircle2 } from "lucide-react";
import { Card, Badge, PageHead, Empty } from "../../components/ui.jsx";
import { C, serif, fmt } from "../../lib/theme.js";
import { clienteApi } from "../../lib/clienteApi.js";
import { Carregando, ErroCarga, Aviso, CartaoRecepcao, useDados, dataBR } from "./comum.jsx";

export const SITUACAO_FATURA = {
  aberta: { rotulo: "Em aberto", cor: C.amber },
  vencida: { rotulo: "Vencida", cor: C.red },
  paga: { rotulo: "Paga", cor: C.green },
  estornada: { rotulo: "Estornada", cor: C.text3 },
};

const linkBtn = (cor, fundo, borda) => ({
  display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 12, fontSize: 13, fontWeight: 600,
  color: cor, background: fundo, border: borda ? `1px solid ${borda}` : "none",
});

export default function Faturas() {
  const { dados, erro, carregando, recarregar } = useDados((f) => clienteApi.minhasFaturas(f));
  const [copiado, setCopiado] = useState("");

  const copiar = async (texto, rotulo) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(`${rotulo} copiado.`);
    } catch {
      setCopiado("Não foi possível copiar. Selecione e copie manualmente.");
    }
    setTimeout(() => setCopiado(""), 4000);
  };

  const faturas = dados?.faturas || [];
  const resumo = dados?.resumo;

  return (
    <div>
      <PageHead title="Faturas" sub="Suas cobranças e pagamentos. A confirmação do pagamento chega sozinha, em alguns minutos." />
      {carregando && !dados && <Card><Carregando /></Card>}
      {erro && <div style={{ marginBottom: 16 }}><ErroCarga mensagem={erro} onTentar={recarregar} /></div>}

      {resumo && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
          <Card style={{ padding: 16 }}>
            <div style={{ fontSize: 13, color: C.text3 }}>Em aberto</div>
            <div style={{ fontFamily: serif, fontSize: 26, color: resumo.em_aberto ? C.cafe : C.green, marginTop: 4 }}>
              {resumo.em_aberto ? fmt(resumo.valor_em_aberto) : "Nada a pagar"}
            </div>
          </Card>
          <Card style={{ padding: 16 }}>
            <div style={{ fontSize: 13, color: C.text3 }}>Vencidas</div>
            <div style={{ fontFamily: serif, fontSize: 26, color: resumo.vencidas ? C.red : C.text2, marginTop: 4 }}>{resumo.vencidas}</div>
          </Card>
        </div>
      )}

      {resumo?.vencidas > 0 && (
        <Aviso cor={C.red} role="alert">Você tem fatura vencida. Pague pelo botão "Pagar" para evitar a suspensão do plano. Se já pagou, a confirmação pode levar alguns minutos.</Aviso>
      )}
      <div role="status" aria-live="polite" style={{ minHeight: copiado ? 22 : 0, fontSize: 13, color: C.green, marginBottom: copiado ? 8 : 0 }}>{copiado}</div>

      {dados && (
        <Card style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
          {faturas.length === 0 ? (
            <Empty icon={Wallet} title="Nenhuma fatura por aqui" sub="Quando houver uma cobrança do seu plano ou de uma reserva, ela aparece nesta tela." />
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {faturas.map((f, i) => {
                const st = SITUACAO_FATURA[f.situacao] || SITUACAO_FATURA.aberta;
                const aberta = f.situacao === "aberta" || f.situacao === "vencida";
                const semMeio = aberta && !f.pagar_url && !f.boleto_url && !f.pix_copia_cola && !f.linha_digitavel;
                return (
                  <li key={f.id} style={{ padding: "14px 18px", borderTop: i ? `1px solid ${C.border2}` : "none" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                      <div aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 10, background: C.cafePale, display: "grid", placeItems: "center", flexShrink: 0 }}>
                        {f.situacao === "paga" ? <CheckCircle2 size={18} color={C.green} /> : <Wallet size={18} color={C.cafe} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{f.descricao}</div>
                        <div style={{ fontSize: 13, color: C.text3 }}>
                          {f.vencimento ? `${f.situacao === "paga" ? "Venceu" : "Vence"} em ${dataBR(f.vencimento)}` : "Sem vencimento"}
                          {f.unidade ? ` · ${f.unidade}` : ""}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: serif, fontSize: 19, color: C.cafe }}>{fmt(f.valor)}</div>
                        <Badge color={st.cor}>{st.rotulo}</Badge>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, paddingLeft: 52 }}>
                      {aberta && f.pagar_url && (
                        <a href={f.pagar_url} target="_blank" rel="noreferrer" className="cw-btn" style={linkBtn("#fff", C.teal)}>
                          <ExternalLink size={14} aria-hidden="true" /> Pagar
                        </a>
                      )}
                      {f.boleto_url && aberta && (
                        <a href={f.boleto_url} target="_blank" rel="noreferrer" className="cw-btn" style={linkBtn(C.text2, C.white, C.border)}>
                          <FileText size={14} aria-hidden="true" /> Boleto (PDF)
                        </a>
                      )}
                      {f.pix_copia_cola && (
                        <button type="button" onClick={() => copiar(f.pix_copia_cola, "Código PIX")} className="cw-btn" style={linkBtn(C.text2, C.white, C.border)}>
                          <Copy size={14} aria-hidden="true" /> Copiar PIX
                        </button>
                      )}
                      {f.linha_digitavel && (
                        <button type="button" onClick={() => copiar(f.linha_digitavel, "Linha digitável")} className="cw-btn" style={linkBtn(C.text2, C.white, C.border)}>
                          <Copy size={14} aria-hidden="true" /> Copiar linha digitável
                        </button>
                      )}
                      {f.situacao === "paga" && f.pagar_url && (
                        <a href={f.pagar_url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: C.teal, fontWeight: 600, padding: "8px 0" }}>Ver recibo</a>
                      )}
                      {semMeio && <span style={{ fontSize: 13, color: C.text3, padding: "8px 0" }}>Para pagar esta fatura, fale com a recepção.</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {dados && <CartaoRecepcao compacto titulo="Dúvidas sobre uma cobrança?" texto="A recepção confere pagamentos, segunda via e notas fiscais." mensagemWhatsapp="Olá! Tenho uma dúvida sobre uma fatura do CafeWorking." />}
    </div>
  );
}
