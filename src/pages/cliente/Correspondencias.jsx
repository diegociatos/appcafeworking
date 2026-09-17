// Correspondências do cliente: o que a recepção registrou para ele, com data,
// remetente, tipo, situação e o arquivo digitalizado quando houver.
import { useState } from "react";
import { Mail, FileText, AlertCircle, Eye } from "lucide-react";
import { Card, Badge, Btn, PageHead, Empty, Modal } from "../../components/ui.jsx";
import { C } from "../../lib/theme.js";
import { clienteApi, abrirDataUrl } from "../../lib/clienteApi.js";
import { mensagemDe } from "../../lib/erros.js";
import { urlSegura } from "../../lib/html.js";
import { Carregando, ErroCarga, CartaoRecepcao, useDados, dataHoraBR } from "./comum.jsx";

const SITUACAO = {
  aguardando: ["Na recepção", C.amber],
  digitalizada: ["Digitalizada", C.blue],
  notificado: ["Nova", C.teal],
  retirada: ["Retirada", C.green],
};

export default function Correspondencias() {
  const { dados, erro, carregando, recarregar } = useDados((f) => clienteApi.correspondencias(f));
  const [aberta, setAberta] = useState(null); // { item, anexo, erro, carregando }

  const verArquivo = async (item) => {
    setAberta({ item, carregando: true });
    try {
      const { anexo } = await clienteApi.anexoCorrespondencia(item.id);
      setAberta({ item, anexo });
    } catch (e) {
      setAberta({ item, erro: mensagemDe(e) });
    }
  };

  const lista = dados?.correspondencias || [];
  const ehImagem = (a) => a && urlSegura(a.url) && ((a.tipo || "").startsWith("image") || /^data:image/.test(a.url || ""));
  const baixar = (a) => {
    const url = urlSegura(a.url);
    if (!url) { setAberta((p) => ({ ...p, anexo: null, erro: "Não foi possível abrir este arquivo. Peça à recepção." })); return; }
    if (/^data:/.test(url)) abrirDataUrl(url, a.nome);
    else window.open(url, "_blank", "noopener");
  };

  return (
    <div>
      <PageHead title="Correspondências" sub="Cartas e documentos que chegaram para você no CafeWorking. Avisamos por e-mail a cada chegada." />
      {carregando && !dados && <Card><Carregando /></Card>}
      {erro && <div style={{ marginBottom: 16 }}><ErroCarga mensagem={erro} onTentar={recarregar} /></div>}
      {dados && (
        <Card style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
          {lista.length === 0 ? (
            <Empty icon={Mail} title="Nenhuma correspondência" sub="Quando chegar algo para você, aparece aqui e avisamos por e-mail." />
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {lista.map((c, i) => {
                const [rot, cor] = SITUACAO[c.status] || SITUACAO.aguardando;
                return (
                  <li key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderTop: i ? `1px solid ${C.border2}` : "none", flexWrap: "wrap" }}>
                    <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 10, background: c.urgente ? C.redPale : C.tealPale, display: "grid", placeItems: "center", flexShrink: 0 }}>
                      {c.urgente ? <AlertCircle size={18} color={C.red} /> : <FileText size={18} color={C.teal} />}
                    </span>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>{c.remetente || "Remetente não informado"}</div>
                      <div style={{ fontSize: 13, color: C.text3 }}>
                        {c.tipo || "Correspondência"}{c.recebido_em ? ` · recebida em ${dataHoraBR(c.recebido_em, { day: "2-digit", month: "2-digit", year: "numeric" })}` : ""}{c.unidade ? ` · ${c.unidade}` : ""}
                      </div>
                      {c.descricao && <div style={{ fontSize: 13, color: C.text2, marginTop: 4 }}>{c.descricao}</div>}
                    </div>
                    {c.urgente && <Badge color={C.red}>Urgente</Badge>}
                    <Badge color={cor}>{rot}</Badge>
                    {c.tem_anexo && (
                      <Btn variant="ghost" onClick={() => verArquivo(c)} style={{ padding: "7px 12px", fontSize: 13 }}>
                        <Eye size={14} aria-hidden="true" /> Ver arquivo
                      </Btn>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}
      {dados && <CartaoRecepcao compacto titulo="Retirar ou pedir digitalização" texto="O original fica guardado na recepção. Para retirar ou pedir a digitalização, fale com a gente." mensagemWhatsapp="Olá! Quero falar sobre uma correspondência que chegou para mim no CafeWorking." />}

      {aberta && (
        <Modal title={`${aberta.item.tipo || "Correspondência"} · ${aberta.item.remetente || ""}`} onClose={() => setAberta(null)} maxWidth={560}>
          {aberta.carregando && <Carregando texto="Abrindo arquivo…" />}
          {aberta.erro && <ErroCarga mensagem={aberta.erro} />}
          {aberta.anexo && (
            <>
              {ehImagem(aberta.anexo)
                ? <img src={aberta.anexo.url} alt={`Digitalização: ${aberta.item.tipo || "correspondência"} de ${aberta.item.remetente || "remetente"}`} style={{ width: "100%", borderRadius: 12, background: C.cream2 }} />
                : <div style={{ background: C.cream, borderRadius: 12, padding: 24, textAlign: "center", fontSize: 14, color: C.text2 }}><FileText size={36} color={C.teal} aria-hidden="true" /><div style={{ marginTop: 8 }}>{aberta.anexo.nome}</div></div>}
              <Btn style={{ width: "100%", marginTop: 14 }} onClick={() => baixar(aberta.anexo)}>Baixar arquivo</Btn>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
