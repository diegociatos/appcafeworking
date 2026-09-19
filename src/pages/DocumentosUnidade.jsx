// Aba "Documentos do endereço fiscal" da unidade (equipe): IPTU, alvará ou
// dispensa, modelo de anuência, comprovante do imóvel, AVCB e habite-se, com o
// número de cada um (o índice cadastral do IPTU vai para a abertura de empresa). O cliente só recebe estes
// arquivos na área dele quando o endereço fiscal está ativo e os documentos da
// empresa foram aprovados.
import { useEffect, useState } from "react";
import { FileText, Upload, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { Card, Badge, Btn, Field, Empty, ConfirmDialog } from "../components/ui.jsx";
import { C, serif, inp } from "../lib/theme.js";
import { documentosUnidadeApi, TIPOS_KIT, TAMANHO_MAX_KIT, ROTULO_NUMERO_KIT } from "../lib/documentosUnidadeApi.js";
import { mensagemDe } from "../lib/erros.js";
import { statusDocumento } from '../lib/redeUnidades.js';
import { redeRest } from '../lib/redeUnidadesApi.js';
import { fetchIsPlatformAdmin } from '../lib/supabaseDb.js';

const dataBR = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");

export default function DocumentosUnidade({ unidade }) {
  const [docs, setDocs] = useState(null);
  const [admin, setAdmin] = useState(false);
  const [observacoes, setObservacoes] = useState({});
  useEffect(() => { let vivo = true; fetchIsPlatformAdmin().then((r) => vivo && setAdmin(r)); return () => { vivo = false; }; }, []);
  const revisar = async (d, status) => {
    try {
      await redeRest(`unidade_documentos?id=eq.${encodeURIComponent(d.id)}`, { revisao_status: status, revisao_observacoes: observacoes[d.id] ?? d.revisao_observacoes ?? '' }, 'PATCH');
      carregar();
    } catch (e) { setErro(mensagemDe(e)); }
  };
  const [erro, setErro] = useState("");
  const [f, setF] = useState({ tipo: "iptu", titulo: "", numero: "", validade: "", arquivo: null });
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState("");
  const [remover, setRemover] = useState(null);
  const [inputKey, setInputKey] = useState(0);

  const carregar = () => {
    setErro("");
    documentosUnidadeApi.listar(unidade.id).then((l) => setDocs(l || [])).catch((e) => { setDocs([]); setErro(mensagemDe(e)); });
  };
  useEffect(carregar, [unidade.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const enviar = async () => {
    setEnviando(true);
    setMsg("");
    setErro("");
    try {
      await documentosUnidadeApi.enviar(unidade.id, f);
      setF({ tipo: f.tipo, titulo: "", numero: "", validade: "", arquivo: null });
      setInputKey((k) => k + 1);
      setMsg("Documento enviado. Em unidade parceira, a CafeWorking precisa aprová-lo antes de liberar ao cliente.");
      carregar();
    } catch (e) {
      setErro(mensagemDe(e, "Não foi possível enviar o documento."));
    } finally {
      setEnviando(false);
    }
  };

  const abrir = async (d) => {
    const janela = window.open("", "_blank");
    try {
      const url = await documentosUnidadeApi.link(d);
      if (janela) janela.location.href = url; else window.open(url, "_blank", "noopener");
    } catch (e) {
      janela?.close();
      setErro(mensagemDe(e, "Não foi possível abrir o arquivo."));
    }
  };

  const confirmarRemocao = async () => {
    const d = remover;
    setRemover(null);
    try {
      await documentosUnidadeApi.remover(d);
      setMsg("Documento removido.");
      carregar();
    } catch (e) {
      setErro(mensagemDe(e, "Não foi possível remover."));
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 16 }} className="cw-grid-stack">
      <Card>
        <div style={{ fontFamily: serif, fontSize: 19, marginBottom: 6 }}>Enviar documento</div>
        <p style={{ fontSize: 13, color: C.text3, margin: "0 0 14px", lineHeight: 1.5 }}>
          PDF, JPG ou PNG até {TAMANHO_MAX_KIT / 1024 / 1024} MB. Fica guardado em pasta privada; o cliente recebe um link que vale 10 minutos.
        </p>
        <Field label="Tipo">
          <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} style={inp} aria-label="Tipo do documento">
            {Object.entries(TIPOS_KIT).map(([id, rot]) => <option key={id} value={id}>{rot}</option>)}
          </select>
        </Field>
        <Field label="Nome que o cliente vai ver">
          <input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} style={inp} placeholder="Ex.: IPTU 2026 · Rua ..." aria-label="Nome do documento" maxLength={200} />
        </Field>
        <Field label={`${ROTULO_NUMERO_KIT[f.tipo] || "Número / índice cadastral"} ${f.tipo === "iptu" ? "(usado na abertura de empresa)" : "(opcional)"}`}>
          <input value={f.numero} onChange={(e) => setF({ ...f, numero: e.target.value })} style={inp} placeholder={f.tipo === "iptu" ? "Ex.: 008.123.004.0012" : "Número do documento"} aria-label="Número ou índice cadastral" maxLength={100} />
        </Field>
        <Field label="Válido até (opcional)">
          <input type="date" value={f.validade} onChange={(e) => setF({ ...f, validade: e.target.value })} style={inp} aria-label="Válido até" />
        </Field>
        <Field label="Arquivo">
          <input key={inputKey} type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setF({ ...f, arquivo: e.target.files?.[0] || null })} aria-label="Arquivo do documento" style={{ fontSize: 13 }} />
        </Field>
        {erro && <div role="alert" style={{ fontSize: 13, color: C.red, background: C.redPale, borderRadius: 9, padding: "8px 12px", marginBottom: 10 }}>{erro}</div>}
        <div role="status" aria-live="polite">{msg && <div style={{ fontSize: 13, color: C.green, marginBottom: 10 }}>{msg}</div>}</div>
        <Btn onClick={enviar} disabled={enviando || !f.arquivo || !f.titulo.trim()} style={{ width: "100%" }}>
          {enviando ? <><Loader2 size={15} className="cw-spin" /> Enviando…</> : <><Upload size={15} /> Enviar documento</>}
        </Btn>
      </Card>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border2}` }}>
          <div style={{ fontFamily: serif, fontSize: 19 }}>Documentos do endereço fiscal</div>
          <div style={{ fontSize: 13, color: C.text3 }}>Documentos aprovados e válidos são liberados aos clientes elegíveis em {unidade.nome}.</div>
        </div>
        {docs === null ? (
          <div style={{ padding: 20, fontSize: 14, color: C.text3 }}><Loader2 size={15} className="cw-spin" /> Carregando…</div>
        ) : docs.length === 0 ? (
          <Empty icon={FileText} title="Nenhum documento" sub="Sem documentos, o cliente aprovado vê o aviso de que o kit está sendo preparado." />
        ) : (
          docs.map((d, i) => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderTop: i ? `1px solid ${C.border2}` : "none", flexWrap: "wrap" }}>
              <FileText size={18} color={C.teal} aria-hidden="true" />
              <Badge color={statusDocumento(d) === 'aprovado' ? C.green : C.amber}>{statusDocumento(d)}</Badge>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{d.titulo}</div>
                <div style={{ fontSize: 12, color: C.text3 }}>{TIPOS_KIT[d.tipo] || d.tipo}{d.numero ? ` · nº ${d.numero}` : ""} · enviado em {dataBR(d.created_at)}{d.validade ? ` · válido até ${dataBR(d.validade)}` : ""}</div>
                {d.revisao_observacoes && <p>{d.revisao_observacoes}</p>}
                {admin && <><input aria-label={`Observações de ${d.titulo}`} style={inp} maxLength={2000} value={observacoes[d.id] ?? d.revisao_observacoes ?? ''} onChange={(e) => setObservacoes({ ...observacoes, [d.id]: e.target.value })} />
                  {['em_analise', 'aprovado', 'rejeitado'].map((status) => <Btn key={status} variant="ghost" onClick={() => revisar(d, status)}>{status.replace('_', ' ')}</Btn>)}</>}
              </div>
              {d.validade && d.validade < new Date().toISOString().slice(0, 10) && <Badge color={C.red}>Vencido</Badge>}
              <Btn variant="ghost" onClick={() => abrir(d)} style={{ padding: "6px 10px", fontSize: 13 }}><ExternalLink size={14} /> Abrir</Btn>
              <button type="button" onClick={() => setRemover(d)} aria-label={`Remover ${d.titulo}`} title="Remover" style={{ color: C.text3, padding: 6 }}><Trash2 size={16} /></button>
            </div>
          ))
        )}
      </Card>

      <ConfirmDialog
        aberto={!!remover}
        titulo="Remover documento?"
        mensagem={remover ? `"${remover.titulo}" deixa de aparecer para os clientes.` : ""}
        textoConfirmar="Remover"
        onConfirmar={confirmarRemocao}
        onCancelar={() => setRemover(null)}
      />
    </div>
  );
}
