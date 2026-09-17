import { useEffect, useState } from "react";
import { Tags, Plus, Edit3, Trash2, Check, X, Repeat, Zap, Globe, RefreshCw, Store, AlertCircle } from "lucide-react";
import { Card, Badge, Btn, PageHead, Modal, Empty, ConfirmDialog } from "../components/ui.jsx";
import { C, serif, fmt } from "../lib/theme.js";
import { useStore } from "../lib/store.jsx";
import { planosNacionaisApi, idDoPlanoNacional } from "../lib/planosNacionaisApi.js";
import { mensagemDe } from "../lib/erros.js";
import { PlanoForm } from "./Planos.jsx";

// ============================================================================
// Tabela nacional (admin da plataforma) — docs/PARCEIROS.md
// Os planos daqui são copiados para todas as unidades das contas parceiras. O
// parceiro não altera preço nem benefícios; pode só pausar na unidade dele.
// Unidade nova de conta parceira recebe a tabela na criação.
// ============================================================================

const CATEGORIA = {
  endereco_fiscal: "Endereço fiscal", coworking: "Coworking", sala_privativa: "Sala privativa", abertura_empresa: "Abertura de empresa",
};

export default function PlanosNacionais() {
  const { franqueados, unidades } = useStore();
  const [planos, setPlanos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [modal, setModal] = useState(null);
  const [excluir, setExcluir] = useState(null);
  const [aplicando, setAplicando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const contasParceiras = franqueados.filter((f) => f.tipo === "parceiro");
  const unidadesParceiras = unidades.filter((u) => contasParceiras.some((f) => f.id === u.franqueadoId));

  const carregar = async () => {
    if (!planosNacionaisApi.configured) { setCarregando(false); return; }
    setCarregando(true); setErro("");
    try {
      setPlanos(await planosNacionaisApi.listar());
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setCarregando(false);
    }
  };
  useEffect(() => { carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const lembrarDeAplicar = "Clique em \"Aplicar a todas as unidades parceiras\" para levar a mudança às unidades.";

  const salvar = async (dados) => {
    setSalvando(true); setErro(""); setAviso("");
    try {
      const id = modal.id || idDoPlanoNacional(dados.nome, planos.map((p) => p.id));
      const gravado = await planosNacionaisApi.salvar({ ...dados, id, ativo: modal.id ? modal.ativo !== false : true });
      setPlanos((ps) => (ps.some((p) => p.id === id) ? ps.map((p) => (p.id === id ? gravado : p)) : [...ps, gravado]));
      setModal(null);
      setAviso(`Plano "${gravado.nome}" salvo. ${lembrarDeAplicar}`);
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setSalvando(false);
    }
  };

  const alternarAtivo = async (p) => {
    setErro(""); setAviso("");
    try {
      const gravado = await planosNacionaisApi.salvar({ ...p, ativo: p.ativo === false });
      setPlanos((ps) => ps.map((x) => (x.id === p.id ? gravado : x)));
      setAviso(`Plano "${p.nome}" ${gravado.ativo ? "reativado" : "pausado"} na tabela. ${lembrarDeAplicar}`);
    } catch (e) {
      setErro(mensagemDe(e));
    }
  };

  const confirmarExclusao = async () => {
    const p = excluir;
    setExcluir(null); setErro(""); setAviso("");
    try {
      await planosNacionaisApi.remover(p.id);
      setPlanos((ps) => ps.filter((x) => x.id !== p.id));
      setAviso(`Plano "${p.nome}" saiu da tabela. Ao aplicar, ele fica inativo e fora do site nas unidades parceiras (assinaturas atuais continuam).`);
    } catch (e) {
      setErro(mensagemDe(e));
    }
  };

  const aplicar = async () => {
    setAplicando(true); setErro(""); setAviso("");
    try {
      const n = await planosNacionaisApi.aplicarEmTodas();
      setAviso(n
        ? `Tabela aplicada: ${n} plano(s) gravado(s) nas unidades parceiras. Pausas feitas pelas unidades foram mantidas.`
        : "Nenhuma unidade parceira recebeu planos (não há conta parceira com unidade ou a tabela está vazia).");
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setAplicando(false);
    }
  };

  return (
    <div>
      <PageHead
        title="Tabela nacional"
        sub="Planos e preços da rede de parceiros. Valem para todas as unidades das contas parceiras; o parceiro não altera preço."
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn variant="soft" onClick={aplicar} disabled={aplicando || !planos.length} style={{ opacity: aplicando || !planos.length ? 0.6 : 1 }}>
              <RefreshCw size={16} /> {aplicando ? "Aplicando…" : "Aplicar a todas as unidades parceiras"}
            </Btn>
            <Btn onClick={() => setModal({})} disabled={!planosNacionaisApi.configured}><Plus size={16} /> Novo plano</Btn>
          </div>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 16, marginBottom: 18 }}>
        <Card><div style={{ fontSize: 12.5, color: C.text3 }}>Planos na tabela</div><div style={{ fontFamily: serif, fontSize: 24, color: C.cafe }}>{planos.length}</div></Card>
        <Card><div style={{ fontSize: 12.5, color: C.text3 }}>Contas parceiras</div><div style={{ fontFamily: serif, fontSize: 24, color: C.teal }}>{contasParceiras.length}</div></Card>
        <Card><div style={{ fontSize: 12.5, color: C.text3 }}>Unidades parceiras</div><div style={{ fontFamily: serif, fontSize: 24, color: C.green }}>{unidadesParceiras.length}</div></Card>
      </div>

      {!planosNacionaisApi.configured && (
        <Card style={{ marginBottom: 16 }}><Empty icon={Store} title="Disponível com o backend ligado" sub="A tabela nacional fica no banco e não existe na demonstração." /></Card>
      )}
      {erro && (
        <div role="alert" style={{ display: "flex", gap: 8, alignItems: "flex-start", background: C.redPale, borderRadius: 10, padding: "10px 14px", fontSize: 13, color: C.red, marginBottom: 14 }}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> {erro}
        </div>
      )}
      {aviso && (
        <div role="status" style={{ display: "flex", gap: 8, alignItems: "flex-start", background: C.greenPale, borderRadius: 10, padding: "10px 14px", fontSize: 13, color: C.text2, marginBottom: 14 }}>
          <Check size={16} color={C.green} style={{ flexShrink: 0, marginTop: 1 }} /> <span style={{ flex: 1 }}>{aviso}</span>
          <button onClick={() => setAviso("")} className="cw-btn" title="Fechar aviso" style={{ color: C.text3, padding: 2 }}><X size={15} /></button>
        </div>
      )}

      {planosNacionaisApi.configured && (carregando ? (
        <Card><div style={{ fontSize: 13, color: C.text3 }}>Carregando a tabela…</div></Card>
      ) : planos.length === 0 ? (
        <Card><Empty icon={Tags} title="Tabela nacional vazia" sub="Cadastre os planos da rede (endereço fiscal, coworking, sala privativa). Depois aplique às unidades parceiras." /></Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 14 }}>
          {planos.map((p) => {
            const inativo = p.ativo === false;
            return (
              <Card key={p.id} style={{ opacity: inativo ? 0.6 : 1, borderLeft: `3px solid ${inativo ? C.text4 : C.cafe}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: serif, fontSize: 18 }}>{p.nome}</span>
                  <Badge color={p.recorrencia === "mensal" ? C.teal : C.amber} bg={p.recorrencia === "mensal" ? C.tealPale : C.amberPale}>
                    {p.recorrencia === "mensal" ? <><Repeat size={11} /> Mensal</> : <><Zap size={11} /> Avulso</>}
                  </Badge>
                  {inativo && <Badge color={C.text3} bg={C.cream2}>Pausado</Badge>}
                  {p.venderNoSite && <Badge color={C.green} bg={C.greenPale}><Globe size={11} /> No site</Badge>}
                </div>
                <div style={{ fontSize: 12, color: C.text4, marginTop: 3 }}>{CATEGORIA[p.categoria] || "Sem categoria"} · {p.id}</div>
                {p.descricao && <div style={{ fontSize: 12.5, color: C.text3, marginTop: 4 }}>{p.descricao}</div>}
                <div style={{ marginTop: 12 }}>
                  {p.sobConsulta
                    ? <span style={{ fontFamily: serif, fontSize: 20, color: C.cafe }}>Sob consulta</span>
                    : <><span style={{ fontFamily: serif, fontSize: 24, color: C.cafe }}>{fmt(p.preco)}</span><span style={{ fontSize: 12, color: C.text3 }}>{p.recorrencia === "mensal" ? " /mês" : ""}</span></>}
                  {Number(p.prazoMinimoMeses) > 0 && <div style={{ fontSize: 11.5, color: C.text3 }}>Fidelidade de {p.prazoMinimoMeses} meses no mensal</div>}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 14, borderTop: `1px solid ${C.border2}`, paddingTop: 12 }}>
                  <Btn variant="ghost" style={{ flex: 1, justifyContent: "center", fontSize: 13 }} onClick={() => setModal(p)}><Edit3 size={14} /> Editar</Btn>
                  <Btn variant="ghost" style={{ fontSize: 13, color: inativo ? C.green : C.amber }} onClick={() => alternarAtivo(p)}>
                    {inativo ? <><Check size={14} /> Ativar</> : <><X size={14} /> Pausar</>}
                  </Btn>
                  <Btn variant="ghost" style={{ color: C.red, padding: "10px 12px" }} aria-label={`Excluir plano ${p.nome}`} onClick={() => setExcluir(p)}><Trash2 size={14} /></Btn>
                </div>
              </Card>
            );
          })}
        </div>
      ))}

      {modal && (
        <Modal title={modal.id ? "Editar plano da tabela nacional" : "Novo plano da tabela nacional"} onClose={() => !salvando && setModal(null)} maxWidth={460}>
          {salvando && <div style={{ fontSize: 12.5, color: C.text3, marginBottom: 10 }}>Salvando…</div>}
          <PlanoForm inicial={modal} onSave={salvar} />
        </Modal>
      )}

      <ConfirmDialog
        aberto={!!excluir}
        titulo="Tirar o plano da tabela nacional?"
        mensagem={excluir ? `"${excluir.nome}" sai da tabela. Ao aplicar, fica inativo e fora do site em todas as unidades parceiras; as assinaturas atuais continuam.` : ""}
        textoConfirmar="Tirar da tabela"
        onConfirmar={confirmarExclusao}
        onCancelar={() => setExcluir(null)}
      />
    </div>
  );
}
