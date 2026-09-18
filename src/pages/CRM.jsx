import { useState, useEffect, useRef } from "react";
import AtendimentoLead, { dataAtendimento } from "../components/AtendimentoLead.jsx";
import { crmApi } from "../lib/crmApi.js";
import { getSession } from "../lib/supabaseAuth.js";
import {
  Plus, Instagram, Globe, MessageCircle, Search as SearchIcon,
  Tag, Settings2, Trash2, Check, CheckCircle2,
} from "lucide-react";
import { Card, Badge, Btn, PageHead, Modal, Field } from "../components/ui.jsx";
import { C, serif, sans, fmt, fmtShort, inp } from "../lib/theme.js";
import { UNIDADES } from "../lib/data.js";
import { useStore } from "../lib/store.jsx";

const ORIGEM_ICON = {
  Instagram: Instagram,
  Site: Globe,
  WhatsApp: MessageCircle,
  "Google Ads": SearchIcon,
};

const ORIGEM_COR = {
  Instagram: "#E1306C",
  Site: C.teal,
  WhatsApp: "#25D366",
  "Google Ads": "#4285F4",
};

// Paleta para colorir novas fases do funil
const PALETA = [C.text3, C.blue, C.amber, C.cafe, C.green, C.teal, C.red, C.cafe2, C.teal3];

const origemCor = (o) => ORIGEM_COR[o] || C.cafe2;
const origemIcon = (o) => ORIGEM_ICON[o] || Tag;

export default function CRM({ go }) {
  const { activeUnit, unidadeAtiva, meuPerfil, leads: leadsAll, setLeads, crmEtapas: etapas, setCrmEtapas: setEtapas, crmOrigens: origens, setCrmOrigens: setOrigens, criarClienteConfirmado, planosDe } = useStore();
  const [leadAtendido, setLeadAtendido] = useState(null);
  const [crm, setCrm] = useState({ atendimentos: [], comentarios: [], retornos: [] });
  const [erroAtendimentos, setErroAtendimentos] = useState('');
  const [carregandoAtendimentos, setCarregandoAtendimentos] = useState(crmApi.configured);
  const [erroMovimento, setErroMovimento] = useState('');
  const [movendoLead, setMovendoLead] = useState(null);
  const unidadeRef = useRef(activeUnit);
  const versaoLeitura = useRef(0);
  unidadeRef.current = activeUnit;
  useEffect(() => {
    setLeadAtendido(null);
    if (!crmApi.configured) return;
    let ativo = true;
    setCrm({ atendimentos: [], comentarios: [], retornos: [] });
    setCarregandoAtendimentos(true);
    const carregar = async () => {
      const versao = ++versaoLeitura.current;
      try {
        const dados = await crmApi.carregar(activeUnit);
        if (ativo && versao === versaoLeitura.current) { setCrm(dados); setErroAtendimentos(''); }
      } catch (e) { if (ativo && versao === versaoLeitura.current) setErroAtendimentos(e.message); }
      finally { if (ativo && versao === versaoLeitura.current) setCarregandoAtendimentos(false); }
    };
    carregar();
    const timer = setInterval(carregar, 30000);
    return () => { ativo = false; clearInterval(timer); };
  }, [activeUnit]);
  const registrarAtendimento = async (acao, extra = {}, idLead = leadAtendido?.id) => {
    const unidadeId = activeUnit;
    const leadId = idLead;
    if (crmApi.configured) {
      ++versaoLeitura.current;
      try { await crmApi.registrar(unidadeId, leadId, acao, extra); }
      catch (e) {
        // Atualiza o responsável também quando outro usuário ganhou a disputa.
        const versao = ++versaoLeitura.current;
        try { const dados = await crmApi.carregar(unidadeId); if (unidadeRef.current === unidadeId && versao === versaoLeitura.current) setCrm(dados); } catch { /* erro original continua visível */ }
        throw e;
      }
      const versao = ++versaoLeitura.current;
      try {
        const dados = await crmApi.carregar(unidadeId);
        if (unidadeRef.current === unidadeId && versao === versaoLeitura.current) { setCrm(dados); setErroAtendimentos(''); setCarregandoAtendimentos(false); }
      } catch {
        throw new Error('Registro salvo, mas não foi possível atualizar a tela. Atualize o quadro antes de registrar novamente.');
      }
      return;
    }
    const usuario = getSession()?.user;
    const autorId = usuario?.id || 'demo-usuario';
    const autorNome = meuPerfil.nome || usuario?.email || 'Usuário de demonstração';
    const agora = new Date().toISOString();
    setCrm(prev => {
      if (acao === 'assumir') return { ...prev, atendimentos: [...prev.atendimentos, { unidade_id: unidadeId, lead_id: leadId, responsavel_id: autorId, responsavel_nome: autorNome, assumido_em: agora }] };
      if (acao === 'comentar') {
        const id = crypto.randomUUID();
        const dono = prev.atendimentos.find(a => a.unidade_id === unidadeId && a.lead_id === leadId);
        return { ...prev, comentarios: [...prev.comentarios, { id, unidade_id: unidadeId, lead_id: leadId, autor_id: autorId, autor_nome: autorNome, texto: extra.p_texto.trim(), created_at: agora }], retornos: extra.p_retorno_em ? [{ id: crypto.randomUUID(), unidade_id: unidadeId, lead_id: leadId, comentario_id: id, responsavel_id: dono.responsavel_id, agendado_para: extra.p_retorno_em, status: 'agendado' }, ...prev.retornos] : prev.retornos };
      }
      return { ...prev, retornos: prev.retornos.map(r => r.id === extra.p_retorno_id ? { ...r, status: acao === 'concluir' ? 'concluido' : 'cancelado' } : r) };
    });
  };
  const [convertido, setConvertido] = useState(null); // { cliente, lead }
  const [convertendo, setConvertendo] = useState(null); // id do lead em conversão
  const [erroConversao, setErroConversao] = useState(null); // { id, mensagem }

  /**
   * Converte o lead em cliente. Só marca o lead como fechado e mostra o sucesso
   * DEPOIS que a gravação confirmou — antes a tela dizia "convertido" mesmo
   * quando o banco recusava e o cliente sumia no próximo recarregamento.
   */
  const converterEmCliente = async (l) => {
    if (convertendo) return;
    setConvertendo(l.id);
    setErroConversao(null);
    const planos = planosDe ? planosDe(activeUnit) : [];
    const planoMatch = planos.find((p) => (l.interesse || "").toLowerCase().includes((p.nome || "").toLowerCase()) || (p.nome || "").toLowerCase().includes((l.interesse || "").toLowerCase()));
    try {
      const cli = await criarClienteConfirmado({
        nome: l.nome, plano: planoMatch?.nome || l.interesse || "Plano", unidade: unidadeAtiva?.nome,
        unidadeId: activeUnit,
        tel: l.tel || "", email: l.email || "", cnpj: l.documento || "", contato: l.nome, fiscal: false,
      });
      setLeads((ls) => ls.map((x) => (x.id === l.id ? { ...x, etapa: "fechado" } : x)));
      setConvertido({ cliente: cli, lead: l });
    } catch (e) {
      setErroConversao({
        id: l.id,
        mensagem: e?.message || "Não foi possível criar o cliente agora. O lead continua onde estava; tente de novo.",
      });
    } finally {
      setConvertendo(null);
    }
  };
  // Funil por unidade: cada coworking tem seus próprios leads.
  const leads = leadsAll.filter((l) => l.unidadeId === activeUnit);
  const [modal, setModal] = useState(null);
  const [etapaModal, setEtapaModal] = useState(null); // {} = nova | objeto = editar
  const [drag, setDrag] = useState(null);

  const totalPipeline = leads
    .filter((l) => l.etapa !== "fechado")
    .reduce((s, l) => s + (l.valor * l.prob) / 100, 0);

  const fechados = leads.filter((l) => l.etapa === "fechado");
  // Origem com mais leads (antes o card mostrava "Instagram" fixo).
  const origemCampea = Object.entries(leads.reduce((m, l) => {
    if (l.origem) m[l.origem] = (m[l.origem] || 0) + 1;
    return m;
  }, {})).sort((a, b) => b[1] - a[1])[0] || null;
  const taxa = leads.length > 0 ? Math.round((fechados.length / leads.length) * 100) : 0;

  const onDrop = async (etapa) => {
    if (!drag || movendoLead) return;
    const id = drag;
    const unidadeId = activeUnit;
    setDrag(null); setErroMovimento(''); setMovendoLead(id);
    try {
      // Quem puxou para Em Contato passa a ser o responsável, sem roubar
      // um atendimento já assumido e sem alterar a etapa se o banco recusar.
      if (etapa === 'contato' && !crm.atendimentos.some(a => a.unidade_id === unidadeId && a.lead_id === id)) {
        await registrarAtendimento('assumir', {}, id);
      }
      if (unidadeRef.current === unidadeId) setLeads(ls => ls.map(l => l.id === id && l.unidadeId === unidadeId ? { ...l, etapa } : l));
    } catch (e) { if (unidadeRef.current === unidadeId) setErroMovimento(e.message); }
    finally { setMovendoLead(null); }
  };

  const addOrigem = (nome) => {
    const n = nome.trim();
    if (n && !origens.includes(n)) setOrigens((os) => [...os, n]);
  };

  const saveEtapa = (dados) => {
    if (dados.id) {
      setEtapas((es) => es.map((e) => (e.id === dados.id ? { ...e, ...dados } : e)));
    } else {
      setEtapas((es) => [...es, { ...dados, id: "et" + Date.now() }]);
    }
    setEtapaModal(null);
  };

  const removeEtapa = (id) => {
    const restantes = etapas.filter((e) => e.id !== id);
    if (restantes.length === 0) return; // nunca deixar o funil vazio
    const destino = restantes[0].id;
    setLeads((ls) => ls.map((l) => (l.etapa === id ? { ...l, etapa: destino } : l)));
    setEtapas(restantes);
    setEtapaModal(null);
  };

  return (
    <div>
      <PageHead
        title="CRM · Funil de leads"
        sub="Transforme interessados em contratos. Leads do formulário do site entram sozinhos; os de Instagram, WhatsApp e outras origens são cadastrados aqui."
        action={
          <Btn onClick={() => setModal({})}>
            <Plus size={16} /> Novo lead
          </Btn>
        }
      />

      {erroAtendimentos && <div role="alert" style={{ color: C.red, marginBottom: 16 }}>Não foi possível atualizar responsáveis e retornos: {erroAtendimentos}</div>}
      {erroMovimento && <div role="alert" style={{ color: C.red, marginBottom: 16 }}>{erroMovimento}</div>}

      {/* Resumo do funil */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <Card>
          <div style={{ fontSize: 13, color: C.text3, marginBottom: 6 }}>Pipeline ponderado</div>
          <div style={{ fontFamily: serif, fontSize: 26, color: C.cafe }}>{fmt(totalPipeline)}</div>
          <div style={{ fontSize: 12, color: C.text3, marginTop: 4 }}>
            {leads.filter((l) => l.etapa !== "fechado").length} leads em aberto
          </div>
        </Card>
        <Card>
          <div style={{ fontSize: 13, color: C.text3, marginBottom: 6 }}>Taxa de conversão</div>
          <div style={{ fontFamily: serif, fontSize: 26, color: C.green }}>{taxa}%</div>
          <div style={{ fontSize: 12, color: C.text3, marginTop: 4 }}>
            {fechados.length} fechados de {leads.length}
          </div>
        </Card>
        <Card>
          <div style={{ fontSize: 13, color: C.text3, marginBottom: 6 }}>Receita conquistada</div>
          <div style={{ fontFamily: serif, fontSize: 26, color: C.teal }}>
            {fmt(fechados.reduce((s, l) => s + l.valor, 0))}
          </div>
          <div style={{ fontSize: 12, color: C.text3, marginTop: 4 }}>leads fechados</div>
        </Card>
        <Card>
          <div style={{ fontSize: 13, color: C.text3, marginBottom: 6 }}>Origem campeã</div>
          <div style={{ fontFamily: serif, fontSize: 22, color: C.text }}>{origemCampea ? origemCampea[0] : "—"}</div>
          <div style={{ fontSize: 12, color: C.text3, marginTop: 4 }}>
            {origemCampea ? `${origemCampea[1]} lead${origemCampea[1] > 1 ? "s" : ""}` : "sem leads ainda"}
          </div>
        </Card>
      </div>

      {/* Kanban */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${etapas.length + 1}, minmax(220px, 1fr))`,
          gap: 12,
          overflowX: "auto",
          paddingBottom: 8,
        }}
      >
        {etapas.map((e) => {
          const leadsEtapa = leads.filter((l) => l.etapa === e.id);
          const valorEtapa = leadsEtapa.reduce((s, l) => s + l.valor, 0);
          return (
            <div
              key={e.id}
              onDragOver={(ev) => ev.preventDefault()}
              onDrop={() => onDrop(e.id)}
              style={{ background: C.cream2, borderRadius: 14, padding: 12, minHeight: 280 }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 10,
                  paddingBottom: 10,
                  borderBottom: `2px solid ${e.cor}`,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: serif, fontSize: 15, color: C.text, fontWeight: 500 }}>
                    {e.label}
                  </div>
                  <div style={{ fontSize: 11, color: C.text3 }}>{fmtShort(valorEtapa)}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button
                    onClick={() => setEtapaModal(e)}
                    title="Editar fase"
                    style={{ color: C.text4, display: "grid", placeItems: "center", padding: 2 }}
                    className="cw-btn"
                  >
                    <Settings2 size={14} />
                  </button>
                  <span
                    style={{
                      background: e.cor,
                      color: "#fff",
                      fontSize: 11,
                      fontWeight: 700,
                      minWidth: 22,
                      height: 22,
                      padding: "0 6px",
                      borderRadius: 11,
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    {leadsEtapa.length}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {leadsEtapa.map((l) => {
                  const OI = origemIcon(l.origem);
                  const oc = origemCor(l.origem);
                  const atendimento = crm.atendimentos.find(a => a.unidade_id === activeUnit && a.lead_id === l.id);
                  const retorno = crm.retornos.find(r => r.unidade_id === activeUnit && r.lead_id === l.id && ['agendado','processando','enviado','erro'].includes(r.status));
                  return (
                    <div
                      key={l.id}
                      draggable={!movendoLead}
                      onDragStart={() => setDrag(l.id)}
                      style={{
                        background: "#fff",
                        border: `1px solid ${C.border2}`,
                        borderRadius: 12,
                        padding: 12,
                        cursor: "grab",
                        transition: "all .15s",
                        opacity: drag === l.id ? 0.5 : 1,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{l.nome}</div>
                          {l.empresa && (
                            <div style={{ fontSize: 11, color: C.text4 }}>{l.empresa}</div>
                          )}
                        </div>
                        <div
                          title={l.origem}
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 6,
                            background: `${oc}1a`,
                            display: "grid",
                            placeItems: "center",
                            flexShrink: 0,
                          }}
                        >
                          <OI size={12} color={oc} />
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: C.text3, marginBottom: 8 }}>{l.interesse}</div>
                      <div style={{ fontSize: 11.5, color: C.text3, marginBottom: 8 }}>{carregandoAtendimentos ? 'Carregando responsável…' : atendimento ? `Atendimento: ${atendimento.responsavel_nome}` : 'Sem responsável'}</div>
                      {retorno && <div style={{ fontSize: 11.5, color: retorno.status === 'erro' || new Date(retorno.agendado_para) < new Date() ? C.red : C.teal, marginBottom: 8 }}>Retorno: {dataAtendimento(retorno.agendado_para)}{retorno.status === 'erro' ? ' · lembrete com falha' : ''}</div>}
                      <Btn variant="ghost" disabled={carregandoAtendimentos || !!erroAtendimentos} style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }} onClick={() => setLeadAtendido(l)}>Ver atendimento</Btn>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontSize: 12,
                        }}
                      >
                        <span style={{ color: C.cafe, fontWeight: 600 }}>{fmtShort(l.valor)}</span>
                        <Badge color={l.prob >= 70 ? C.green : l.prob >= 40 ? C.amber : C.text3}>
                          {l.prob}%
                        </Badge>
                      </div>
                      {l.etapa !== "fechado" && (
                        <>
                          <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={() => converterEmCliente(l)}
                            disabled={convertendo === l.id}
                            title="Cria o cliente, vincula a unidade e fecha o lead"
                            style={{ width: "100%", marginTop: 10, padding: "7px 0", borderRadius: 9, border: `1px solid ${C.teal}`, background: C.tealPale, color: C.teal, fontSize: 12, fontWeight: 600, cursor: convertendo === l.id ? "default" : "pointer", opacity: convertendo === l.id ? 0.6 : 1 }}
                          >
                            {convertendo === l.id ? "Criando cliente…" : "+ Converter em cliente"}
                          </button>
                          {erroConversao?.id === l.id && (
                            <div role="alert" style={{ marginTop: 6, fontSize: 11.5, color: C.red, background: C.redPale, borderRadius: 8, padding: "6px 8px", lineHeight: 1.4 }}>
                              {erroConversao.mensagem}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
                {leadsEtapa.length === 0 && (
                  <div
                    style={{
                      padding: 16,
                      textAlign: "center",
                      fontSize: 12,
                      color: C.text4,
                      border: `2px dashed ${C.border2}`,
                      borderRadius: 10,
                    }}
                  >
                    Arraste leads pra cá
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Coluna: adicionar nova fase */}
        <button
          onClick={() => setEtapaModal({})}
          className="cw-btn"
          style={{
            background: "transparent",
            border: `2px dashed ${C.cafeLine}`,
            borderRadius: 14,
            minHeight: 280,
            color: C.cafe,
            fontFamily: sans,
            fontSize: 14,
            fontWeight: 600,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <Plus size={22} />
          Nova fase
        </button>
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: C.text3, fontStyle: "italic" }}>
        💡 Arraste os cards entre as colunas para mover leads. Use o ⚙ para renomear/recolorir uma fase.
      </div>

      {modal && (
        <Modal title="Novo lead" onClose={() => setModal(null)} maxWidth={480}>
          <NovoLead
            etapas={etapas}
            origens={origens}
            onAddOrigem={addOrigem}
            onSave={(novo) => {
              setLeads((ls) => [
                ...ls,
                { id: "l" + Date.now(), unidadeId: activeUnit, ...novo, desde: "Agora" },
              ]);
              setModal(null);
            }}
          />
        </Modal>
      )}

      {leadAtendido && <Modal title={`Atendimento · ${leadAtendido.nome}`} onClose={() => setLeadAtendido(null)} maxWidth={560}>
        <AtendimentoLead key={`${activeUnit}:${leadAtendido.id}`} lead={leadAtendido}
          atendimento={crm.atendimentos.find(a => a.unidade_id === activeUnit && a.lead_id === leadAtendido.id)}
          comentarios={crm.comentarios.filter(c => c.unidade_id === activeUnit && c.lead_id === leadAtendido.id)}
          retornos={crm.retornos.filter(r => r.unidade_id === activeUnit && r.lead_id === leadAtendido.id)}
          onRegistrar={registrarAtendimento} demo={!crmApi.configured} />
      </Modal>}

      {etapaModal && (
        <Modal
          title={etapaModal.id ? "Editar fase do funil" : "Nova fase do funil"}
          onClose={() => setEtapaModal(null)}
        >
          <EtapaForm
            etapa={etapaModal}
            podeExcluir={etapas.length > 1}
            onSave={saveEtapa}
            onDelete={() => removeEtapa(etapaModal.id)}
          />
        </Modal>
      )}

      {convertido && (
        <Modal title="Lead convertido ✓" onClose={() => setConvertido(null)} maxWidth={400}>
          <div style={{ textAlign: "center", padding: "6px 0" }}>
            <CheckCircle2 size={44} color={C.green} />
            <div style={{ fontFamily: serif, fontSize: 18, marginTop: 10 }}>{convertido.cliente?.nome}</div>
            <div style={{ fontSize: 13, color: C.text3, marginTop: 4, marginBottom: 16 }}>
              Cliente criado em <b>{unidadeAtiva?.nome}</b> · plano <b>{convertido.cliente?.plano}</b>. O lead foi marcado como <b>fechado</b>.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn variant="ghost" style={{ flex: 1, justifyContent: "center" }} onClick={() => { setConvertido(null); go && go("clientes"); }}>Ver cliente</Btn>
              <Btn style={{ flex: 1, justifyContent: "center" }} onClick={() => { setConvertido(null); go && go("cobrancas"); }}>Criar cobrança</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function NovoLead({ etapas, origens, onAddOrigem, onSave }) {
  const [f, setF] = useState({
    nome: "",
    empresa: "",
    tel: "",
    email: "",
    origem: origens[0] || "Site",
    interesse: "",
    unidade: UNIDADES[0]?.nome || "",
    etapa: etapas[0]?.id || "novo",
    valor: 0,
    prob: 20,
    obs: "",
  });
  const [addingOrigem, setAddingOrigem] = useState(false);
  const [novaOrigem, setNovaOrigem] = useState("");

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const confirmarOrigem = () => {
    const n = novaOrigem.trim();
    if (!n) return;
    onAddOrigem(n);
    setF((prev) => ({ ...prev, origem: n }));
    setNovaOrigem("");
    setAddingOrigem(false);
  };

  const row = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };

  return (
    <>
      <Field label="Nome">
        <input value={f.nome} onChange={set("nome")} style={inp} placeholder="Nome completo" />
      </Field>

      <div style={row}>
        <Field label="Empresa">
          <input value={f.empresa} onChange={set("empresa")} style={inp} placeholder="Empresa (opcional)" />
        </Field>
        <Field label="Telefone">
          <input value={f.tel} onChange={set("tel")} style={inp} placeholder="(31) 99999-9999" />
        </Field>
      </div>

      <Field label="E-mail">
        <input type="email" value={f.email} onChange={set("email")} style={inp} placeholder="email@empresa.com" />
      </Field>

      <Field label="Origem">
        {!addingOrigem ? (
          <div style={{ display: "flex", gap: 8 }}>
            <select value={f.origem} onChange={set("origem")} style={{ ...inp, flex: 1 }}>
              {origens.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
            <Btn
              variant="soft"
              type="button"
              onClick={() => setAddingOrigem(true)}
              title="Adicionar nova origem"
              style={{ padding: "0 14px" }}
            >
              <Plus size={16} />
            </Btn>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <input
              autoFocus
              value={novaOrigem}
              onChange={(e) => setNovaOrigem(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmarOrigem()}
              style={{ ...inp, flex: 1 }}
              placeholder="Nova origem (ex: Feira, Parceria)"
            />
            <Btn variant="teal" type="button" onClick={confirmarOrigem} style={{ padding: "0 14px" }}>
              <Check size={16} />
            </Btn>
          </div>
        )}
      </Field>

      <Field label="Interesse">
        <input value={f.interesse} onChange={set("interesse")} style={inp} placeholder="Ex: Sala Privativa" />
      </Field>

      <div style={row}>
        <Field label="Unidade">
          <select value={f.unidade} onChange={set("unidade")} style={inp}>
            {UNIDADES.map((u) => (
              <option key={u.id}>{u.nome}</option>
            ))}
          </select>
        </Field>
        <Field label="Etapa do funil">
          <select value={f.etapa} onChange={set("etapa")} style={inp}>
            {etapas.map((e) => (
              <option key={e.id} value={e.id}>{e.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <div style={row}>
        <Field label="Valor estimado (R$)">
          <input type="number" min="0" value={f.valor} onChange={(e) => setF({ ...f, valor: +e.target.value })} style={inp} />
        </Field>
        <Field label="Probabilidade (%)">
          <input
            type="number"
            min="0"
            max="100"
            value={f.prob}
            onChange={(e) => setF({ ...f, prob: Math.max(0, Math.min(100, +e.target.value)) })}
            style={inp}
          />
        </Field>
      </div>

      <Field label="Observações">
        <textarea
          value={f.obs}
          onChange={set("obs")}
          rows={3}
          style={{ ...inp, resize: "vertical", minHeight: 64 }}
          placeholder="Anotações sobre o lead, próximo contato, etc."
        />
      </Field>

      <Btn
        style={{ width: "100%", justifyContent: "center", marginTop: 6 }}
        onClick={() => f.nome.trim() && onSave(f)}
      >
        Adicionar lead
      </Btn>
    </>
  );
}

function EtapaForm({ etapa, podeExcluir, onSave, onDelete }) {
  const [label, setLabel] = useState(etapa.label || "");
  const [cor, setCor] = useState(etapa.cor || PALETA[0]);

  return (
    <>
      <Field label="Nome da fase">
        <input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && label.trim() && onSave({ id: etapa.id, label: label.trim(), cor })}
          style={inp}
          placeholder="Ex: Negociação, Onboarding..."
        />
      </Field>

      <Field label="Cor">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {PALETA.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCor(c)}
              aria-label={c}
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: c,
                border: cor === c ? `3px solid ${C.text}` : `1px solid ${C.border}`,
                display: "grid",
                placeItems: "center",
              }}
            >
              {cor === c && <Check size={14} color="#fff" />}
            </button>
          ))}
        </div>
      </Field>

      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        {etapa.id && podeExcluir && (
          <Btn variant="ghost" type="button" onClick={onDelete} style={{ color: C.red, borderColor: C.redPale }}>
            <Trash2 size={16} /> Excluir
          </Btn>
        )}
        <Btn
          style={{ flex: 1, justifyContent: "center" }}
          onClick={() => label.trim() && onSave({ id: etapa.id, label: label.trim(), cor })}
        >
          {etapa.id ? "Salvar fase" : "Criar fase"}
        </Btn>
      </div>
      {etapa.id && !podeExcluir && (
        <div style={{ fontSize: 11, color: C.text4, marginTop: 8, textAlign: "center" }}>
          O funil precisa ter ao menos uma fase.
        </div>
      )}
    </>
  );
}
