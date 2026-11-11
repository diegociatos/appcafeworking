// Impressões (cliente): envia um documento para imprimir na recepção. Contagem
// por folha (frente-e-verso = 1 folha por 2 páginas). Mostra a franquia do plano
// e o saldo do mês; o excedente é cobrado depois (R$ 1,50/folha). Não bloqueia.
import { useEffect, useRef, useState } from "react";
import { Printer, Upload, FileText } from "lucide-react";
import { Card, Btn, PageHead, Empty, Badge } from "../../components/ui.jsx";
import { C, serif, fmt, inp } from "../../lib/theme.js";
import { impressoesApi, lerArquivoBase64, folhasPrevia } from "../../lib/impressoesApi.js";
import { mensagemDe } from "../../lib/erros.js";
import { Carregando, ErroCarga, Aviso, Titulo, dataHoraBR } from "./comum.jsx";

const STATUS = {
  fila: ["Na fila", C.amber],
  enviado: ["Enviada à impressora", C.teal],
  impresso: ["Impressa", C.green],
  falha: ["Falhou", C.red],
  cancelado: ["Cancelada", C.text3],
};
const MAX_MB = 25;

export default function Impressoes() {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [unidadeId, setUnidadeId] = useState("");
  const [documento, setDocumento] = useState("");
  const [arquivo, setArquivo] = useState("");
  const [arquivoNome, setArquivoNome] = useState("");
  const [paginas, setPaginas] = useState(1);
  const [copias, setCopias] = useState(1);
  const [duplex, setDuplex] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState("");
  const [sucesso, setSucesso] = useState("");
  const fileRef = useRef(null);

  const carregar = () => {
    setCarregando(true);
    setErro("");
    return impressoesApi.minhas()
      .then((r) => { setDados(r); if (!unidadeId && r?.unidades?.length === 1) setUnidadeId(r.unidades[0].id); })
      .catch((e) => setErro(mensagemDe(e)))
      .finally(() => setCarregando(false));
  };
  useEffect(() => { carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const escolher = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) { setErroEnvio(`Arquivo muito grande (máximo ${MAX_MB} MB).`); return; }
    setErroEnvio(""); setSucesso("");
    setArquivoNome(file.name); setDocumento(file.name);
    try { setArquivo(await lerArquivoBase64(file)); } catch (err) { setErroEnvio(mensagemDe(err)); }
  };

  const folhas = folhasPrevia(paginas, copias, duplex);
  const unidades = dados?.unidades || [];
  const precisaUnidade = unidades.length > 1 && !unidadeId;
  const podeEnviar = !!arquivo && !!documento.trim() && Number(paginas) >= 1 && Number(copias) >= 1 && !precisaUnidade && !enviando;

  const enviar = async () => {
    if (!podeEnviar) return;
    setEnviando(true); setErroEnvio("");
    try {
      const r = await impressoesApi.enviar({
        unidade_id: unidadeId || undefined, documento_nome: documento.trim(),
        paginas: Number(paginas), copias: Number(copias), duplex, arquivo,
      });
      setSucesso(`Documento enviado — ${r.folhas} folha${r.folhas > 1 ? "s" : ""} na fila da recepção.`);
      setArquivo(""); setArquivoNome(""); setDocumento(""); setPaginas(1); setCopias(1); setDuplex(true);
      if (fileRef.current) fileRef.current.value = "";
      await carregar();
    } catch (e) {
      setErroEnvio(mensagemDe(e, "Não foi possível enviar agora. Tente de novo."));
    } finally {
      setEnviando(false);
    }
  };

  const jobs = dados?.jobs || [];

  return (
    <div>
      <PageHead title="Impressões" sub="Envie um documento para imprimir na recepção. A cobrança é por folha; frente-e-verso vale a metade." />

      {carregando && !dados && <Card><Carregando /></Card>}
      {erro && <div style={{ marginBottom: 16 }}><ErroCarga mensagem={erro} onTentar={carregar} /></div>}

      {dados && (
        <>
          <Card style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 10, background: C.cafePale, display: "grid", placeItems: "center" }}><Printer size={20} color={C.cafe} /></span>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontFamily: serif, fontSize: 18, color: C.text }}>
                  {dados.franquia > 0 ? <>Franquia do plano: <b>{dados.franquia}</b> folhas/mês</> : "Seu plano não inclui franquia de impressão"}
                </div>
                <div style={{ fontSize: 13.5, color: C.text2 }}>
                  Usou {dados.consumidas} folha{dados.consumidas !== 1 ? "s" : ""} em {dados.competencia}.{" "}
                  {dados.saldo >= 0
                    ? <>Restam <b>{dados.saldo}</b>.</>
                    : <>Excedente de <b>{dados.excedente}</b> folha{dados.excedente > 1 ? "s" : ""} × {fmt(dados.preco_folha)} = <b>{fmt(dados.excedente * dados.preco_folha)}</b>, cobrado no fechamento.</>}
                </div>
              </div>
            </div>
          </Card>

          {sucesso && <div style={{ marginBottom: 16 }}><Aviso cor={C.green}>{sucesso}</Aviso></div>}

          <Card style={{ marginBottom: 16 }}>
            <Titulo>Enviar documento</Titulo>
            {unidades.length > 1 && (
              <div style={{ marginBottom: 12 }}>
                <label htmlFor="imp-unidade" style={{ fontSize: 13, fontWeight: 600, color: C.text3, display: "block", marginBottom: 6 }}>Unidade</label>
                <select id="imp-unidade" value={unidadeId} onChange={(e) => setUnidadeId(e.target.value)} style={{ ...inp, maxWidth: 320 }}>
                  <option value="">Escolha a unidade…</option>
                  {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                </select>
              </div>
            )}

            <label className="cw-btn" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 12, fontWeight: 600, fontSize: 14, background: C.cafe, color: "#fff", cursor: "pointer", marginBottom: 10 }}>
              <Upload size={16} aria-hidden="true" /> {arquivoNome ? "Trocar arquivo" : "Escolher arquivo"}
              <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.txt" onChange={escolher} style={{ display: "none" }} />
            </label>
            {arquivoNome && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: C.text2, marginBottom: 12 }}>
                <FileText size={15} color={C.cafe} aria-hidden="true" /> {arquivoNome}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 12, marginBottom: 12 }}>
              <div>
                <label htmlFor="imp-paginas" style={{ fontSize: 13, fontWeight: 600, color: C.text3, display: "block", marginBottom: 6 }}>Páginas do documento</label>
                <input id="imp-paginas" type="number" min="1" max="500" value={paginas} onChange={(e) => setPaginas(e.target.value)} style={inp} />
              </div>
              <div>
                <label htmlFor="imp-copias" style={{ fontSize: 13, fontWeight: 600, color: C.text3, display: "block", marginBottom: 6 }}>Cópias</label>
                <input id="imp-copias" type="number" min="1" max="50" value={copias} onChange={(e) => setCopias(e.target.value)} style={inp} />
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: C.text2, marginBottom: 12, cursor: "pointer" }}>
              <input type="checkbox" checked={duplex} onChange={(e) => setDuplex(e.target.checked)} /> Frente e verso (economiza papel)
            </label>

            <div style={{ background: C.cream, borderRadius: 12, padding: "12px 14px", fontSize: 14, color: C.text2, marginBottom: 12 }}>
              Vai usar <b>{folhas}</b> folha{folhas > 1 ? "s" : ""}.
              {dados.franquia > 0 && dados.saldo - folhas < 0 && (
                <> Parte entra como excedente ({fmt(Math.max(0, folhas - Math.max(0, dados.saldo)) * dados.preco_folha)}), cobrado no fechamento.</>
              )}
            </div>

            {erroEnvio && <div role="alert" style={{ fontSize: 14, color: C.red, background: C.redPale, borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>{erroEnvio}</div>}
            <Btn onClick={enviar} disabled={!podeEnviar} style={{ minWidth: 200 }}>
              {enviando ? "Enviando…" : <><Printer size={16} aria-hidden="true" /> Enviar para impressão</>}
            </Btn>
            {precisaUnidade && <div style={{ fontSize: 13, color: C.text3, marginTop: 6 }}>Escolha a unidade para enviar.</div>}
          </Card>

          <Card>
            <Titulo>Meus envios</Titulo>
            {jobs.length === 0 ? (
              <Empty icon={Printer} title="Nenhum envio" sub="Os documentos que você enviar aparecem aqui." />
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {jobs.map((j) => {
                  const [rot, cor] = STATUS[j.status] || [j.status, C.text3];
                  return (
                    <li key={j.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: `1px solid ${C.border2}`, flexWrap: "wrap" }}>
                      <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 10, background: C.cafePale, display: "grid", placeItems: "center" }}><FileText size={18} color={C.cafe} /></span>
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>{j.documento_nome}</div>
                        <div style={{ fontSize: 13, color: C.text3 }}>
                          {j.folhas} folha{j.folhas > 1 ? "s" : ""} · {j.copias} cópia{j.copias > 1 ? "s" : ""}{j.duplex ? " · frente e verso" : ""}
                          {j.unidade ? ` · ${j.unidade}` : ""} · {dataHoraBR(j.criado_em, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                      <Badge color={cor}>{rot}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
