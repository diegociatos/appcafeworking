import { useState } from "react";
import { Tags, Plus, Edit3, Trash2, Check, X, FileText, Repeat, Zap, ShoppingBag, Globe } from "lucide-react";
import { Card, Badge, Btn, PageHead, Modal, Field, Empty, ConfirmDialog } from "../components/ui.jsx";
import { C, serif, sans, fmt, inp } from "../lib/theme.js";
import { useStore } from "../lib/store.jsx";

export default function Planos() {
  const { activeUnit, unidadeAtiva, planosDe, addPlano, updatePlano, removePlano, configVenda, setConfigVenda } = useStore();
  const planos = planosDe(activeUnit, true); // inclui inativos para gerir
  const [modal, setModal] = useState(null); // {} novo | plano editar
  const [excluir, setExcluir] = useState(null); // plano a excluir

  const ativos = planos.filter((p) => p.ativo !== false);
  const comPreco = ativos.filter((p) => !p.sobConsulta);
  const ticketMedio = comPreco.length ? comPreco.reduce((s, p) => s + p.preco, 0) / comPreco.length : 0;
  const mrr = comPreco.filter((p) => p.recorrencia === "mensal").reduce((s, p) => s + p.preco, 0);

  return (
    <div>
      <PageHead
        title="Planos e serviços"
        sub={`O que ${unidadeAtiva?.nome || "sua unidade"} vende. Usado nas cobranças e no autocadastro do cliente.`}
        action={<Btn onClick={() => setModal({})}><Plus size={16} /> Novo plano</Btn>}
      />

      <Card style={{ marginBottom: 18, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontWeight: 600 }}>Desconto do plano anual</div>
          <div style={{ fontSize: 12.5, color: C.text3 }}>Vale para todos os planos mensais no site: 12 mensalidades menos este percentual, no PIX, boleto ou cartão à vista.</div>
        </div>
        <input type="number" min="0" max="50" step="1" value={configVenda.descontoAnualPct}
          onChange={(e) => setConfigVenda({ descontoAnualPct: Math.min(50, Math.max(0, Math.floor(+e.target.value || 0))) })}
          style={{ ...inp, width: 90 }} aria-label="Desconto do plano anual em porcentagem" />
        <span style={{ color: C.text3 }}>%</span>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 16, marginBottom: 18 }}>
        <Kpi label="Planos ativos" valor={ativos.length} cor={C.cafe} icon={Tags} />
        <Kpi label="Ticket médio" valor={fmt(ticketMedio)} cor={C.teal} icon={ShoppingBag} />
        <Kpi label="Receita recorrente / plano" valor={fmt(mrr)} cor={C.green} icon={Repeat} sub="Soma dos mensais" />
      </div>

      {planos.length === 0 ? (
        <Card><Empty icon={Tags} title="Nenhum plano cadastrado" sub="Cadastre o que você vende (Endereço Fiscal, Coworking, Sala Privativa…). O cliente escolhe um deles no cadastro e na cobrança." /></Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 14 }}>
          {planos.map((p) => {
            const inativo = p.ativo === false;
            return (
              <Card key={p.id} style={{ opacity: inativo ? 0.6 : 1, borderLeft: `3px solid ${inativo ? C.text4 : C.cafe}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: serif, fontSize: 18 }}>{p.nome}</span>
                      <Badge color={p.recorrencia === "mensal" ? C.teal : C.amber} bg={p.recorrencia === "mensal" ? C.tealPale : C.amberPale}>
                        {p.recorrencia === "mensal" ? <><Repeat size={11} /> Mensal</> : <><Zap size={11} /> Avulso</>}
                      </Badge>
                      {inativo && <Badge color={C.text3} bg={C.cream2}>Inativo</Badge>}
                      {p.venderNoSite && <Badge color={C.green} bg={C.greenPale}><Globe size={11} /> No site</Badge>}
                    </div>
                    {p.descricao && <div style={{ fontSize: 12.5, color: C.text3, marginTop: 4 }}>{p.descricao}</div>}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: 12 }}>
                  <div>
                    {p.sobConsulta ? (
                      <span style={{ fontFamily: serif, fontSize: 20, color: C.cafe }}>Sob consulta</span>
                    ) : (
                      <>
                        <span style={{ fontFamily: serif, fontSize: 24, color: C.cafe }}>{fmt(p.preco)}</span>
                        <span style={{ fontSize: 12, color: C.text3 }}>{p.recorrencia === "mensal" ? " /mês" : ""}</span>
                      </>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {p.emiteNF && <span title="Emite nota fiscal" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: C.teal, background: C.tealPale, padding: "3px 8px", borderRadius: 8 }}><FileText size={12} /> NF</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 14, borderTop: `1px solid ${C.border2}`, paddingTop: 12 }}>
                  <Btn variant="ghost" style={{ flex: 1, justifyContent: "center", fontSize: 13 }} onClick={() => setModal(p)}><Edit3 size={14} /> Editar</Btn>
                  <Btn variant="ghost" style={{ fontSize: 13, color: inativo ? C.green : C.amber }} onClick={() => updatePlano(p.id, { ativo: inativo })}>
                    {inativo ? <><Check size={14} /> Ativar</> : <><X size={14} /> Pausar</>}
                  </Btn>
                  <Btn variant="ghost" style={{ color: C.red, padding: "10px 12px" }} aria-label={`Excluir plano ${p.nome}`} onClick={() => setExcluir(p)}><Trash2 size={14} /></Btn>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {modal && (
        <Modal title={modal.id ? "Editar plano" : "Novo plano"} onClose={() => setModal(null)} maxWidth={460}>
          <PlanoForm inicial={modal} onSave={(d) => { if (modal.id) updatePlano(modal.id, d); else addPlano(activeUnit, d); setModal(null); }} />
        </Modal>
      )}

      <ConfirmDialog
        aberto={!!excluir}
        titulo="Excluir plano?"
        mensagem={excluir ? `O plano "${excluir.nome}" será removido do catálogo. Esta ação não pode ser desfeita.` : ""}
        onConfirmar={() => { removePlano(excluir.id); setExcluir(null); }}
        onCancelar={() => setExcluir(null)}
      />
    </div>
  );
}

function PlanoForm({ inicial, onSave }) {
  const [f, setF] = useState({
    nome: inicial.nome || "", preco: inicial.preco ?? "", recorrencia: inicial.recorrencia || "mensal",
    emiteNF: inicial.emiteNF !== false, descricao: inicial.descricao || "",
    categoria: inicial.categoria || "", venderNoSite: inicial.venderNoSite === true,
    sobConsulta: inicial.sobConsulta === true, destaque: inicial.destaque || "",
    beneficiosTexto: (inicial.beneficios || []).join("\n"),
    prazoMinimoMeses: inicial.prazoMinimoMeses ?? 0, ordem: inicial.ordem ?? "",
    direitos: {
      horasReuniao: 0, horasCoworking: 0, dayPass: 0, correspondencias: 0,
      cafeIncluso: false, descontoSala: 0, descontoCafe: 0, ...(inicial.direitos || {}),
    },
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setD = (k) => (e) => setF({ ...f, direitos: { ...f.direitos, [k]: e.target.type === "checkbox" ? e.target.checked : +e.target.value } });
  const setB = (k) => (e) => setF({ ...f, [k]: e.target.checked });
  const valido = f.nome.trim() && (f.sobConsulta || +f.preco > 0) && (!f.venderNoSite || f.categoria);
  const salvar = () => {
    if (!valido) return;
    const { beneficiosTexto, ...resto } = f;
    onSave({
      ...resto,
      preco: f.sobConsulta ? 0 : +f.preco,
      prazoMinimoMeses: Math.max(0, Math.floor(+f.prazoMinimoMeses || 0)),
      ordem: f.ordem === "" ? "" : Math.floor(+f.ordem),
      destaque: f.destaque.trim(),
      beneficios: beneficiosTexto.split("\n").map((b) => b.trim()).filter(Boolean),
    });
  };

  return (
    <>
      <Field label="Nome do plano"><input value={f.nome} onChange={set("nome")} style={inp} placeholder="Ex: Endereço Fiscal" autoFocus /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Preço (R$)"><input type="number" min="0" step="0.01" value={f.sobConsulta ? "" : f.preco} onChange={set("preco")} disabled={f.sobConsulta} style={{ ...inp, opacity: f.sobConsulta ? 0.5 : 1 }} placeholder={f.sobConsulta ? "Sob consulta" : "0,00"} /></Field>
        <Field label="Cobrança">
          <div style={{ display: "flex", gap: 8 }}>
            {[["mensal", "Mensal"], ["avulso", "Avulso"]].map(([v, lb]) => (
              <button key={v} type="button" onClick={() => setF({ ...f, recorrencia: v })}
                style={{ flex: 1, padding: "10px 0", borderRadius: 10, fontFamily: sans, fontSize: 13, fontWeight: 600, border: `1px solid ${f.recorrencia === v ? C.cafe : C.border}`, background: f.recorrencia === v ? C.cafePale : C.white, color: f.recorrencia === v ? C.cafe : C.text2 }}>
                {lb}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <Field label="Descrição (aparece para o cliente)"><input value={f.descricao} onChange={set("descricao")} style={inp} placeholder="O que está incluso" /></Field>
      <div style={{ background: C.cream2, borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, fontWeight: 600, marginBottom: 10 }}><Globe size={15} color={C.cafe} /> Site</div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={f.venderNoSite} onChange={setB("venderNoSite")} /> Publicar no site (cafeworking.com.br)
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={f.sobConsulta} onChange={setB("sobConsulta")} /> Preço sob consulta (o site mostra "Pedir proposta")
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Categoria" style={{ marginBottom: 0 }}>
            <select value={f.categoria} onChange={set("categoria")} style={inp}>
              <option value="">Sem categoria</option>
              <option value="endereco_fiscal">Endereço fiscal</option>
              <option value="coworking">Coworking</option>
              <option value="sala_privativa">Sala privativa</option>
              <option value="abertura_empresa">Abertura de empresa</option>
            </select>
          </Field>
          <Field label="Selo do card" style={{ marginBottom: 0 }}>
            <input value={f.destaque} onChange={set("destaque")} style={inp} placeholder="Mais procurado" maxLength={30} />
          </Field>
          <Field label="Fidelidade no mensal (meses)" style={{ marginBottom: 0 }}>
            <input type="number" min="0" value={f.prazoMinimoMeses} onChange={set("prazoMinimoMeses")} style={inp} />
          </Field>
          <Field label="Ordem na vitrine" style={{ marginBottom: 0 }}>
            <input type="number" min="0" value={f.ordem} onChange={set("ordem")} style={inp} placeholder="1" />
          </Field>
        </div>
        <Field label="O que inclui (um item por linha)" style={{ marginTop: 10, marginBottom: 0 }}>
          <textarea value={f.beneficiosTexto} onChange={set("beneficiosTexto")} rows={4} style={{ ...inp, height: "auto", resize: "vertical" }} placeholder={"Endereço para CNPJ\nRecebimento de correspondências"} />
        </Field>
        {f.venderNoSite && !f.categoria && <div style={{ fontSize: 12, color: C.red, marginTop: 8 }}>Escolha a categoria para publicar no site.</div>}
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "10px 12px", border: `1px solid ${C.border}`, borderRadius: 11, marginBottom: 14, background: f.emiteNF ? C.tealPale : C.white }}>
        <input type="checkbox" checked={f.emiteNF} onChange={(e) => setF({ ...f, emiteNF: e.target.checked })} />
        <FileText size={16} color={C.teal} />
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>Emitir nota fiscal (NFS-e) ao receber</span>
      </label>
      <div style={{ background: C.cream2, borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 2 }}>Direitos do plano (créditos mensais)</div>
        <div style={{ fontSize: 11.5, color: C.text3, marginBottom: 10 }}>Gerados a cada ciclo. O cliente consome ao reservar; excedente vira cobrança.</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Horas sala de reunião / mês" style={{ marginBottom: 0 }}><input type="number" min="0" value={f.direitos.horasReuniao} onChange={setD("horasReuniao")} style={inp} /></Field>
          <Field label="Horas coworking / mês" style={{ marginBottom: 0 }}><input type="number" min="0" value={f.direitos.horasCoworking} onChange={setD("horasCoworking")} style={inp} /></Field>
          <Field label="Day-pass / mês" style={{ marginBottom: 0 }}><input type="number" min="0" value={f.direitos.dayPass} onChange={setD("dayPass")} style={inp} /></Field>
          <Field label="Correspondências / mês" style={{ marginBottom: 0 }}><input type="number" min="0" value={f.direitos.correspondencias} onChange={setD("correspondencias")} style={inp} /></Field>
          <Field label="Desconto sala (%)" style={{ marginBottom: 0 }}><input type="number" min="0" max="100" value={f.direitos.descontoSala} onChange={setD("descontoSala")} style={inp} /></Field>
          <Field label="Desconto cafeteria (%)" style={{ marginBottom: 0 }}><input type="number" min="0" max="100" value={f.direitos.descontoCafe} onChange={setD("descontoCafe")} style={inp} /></Field>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.text2, marginTop: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={f.direitos.cafeIncluso} onChange={setD("cafeIncluso")} /> Café incluso
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.text2, marginTop: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={f.direitos.aberturaEmpresa === true} onChange={setD("aberturaEmpresa")} /> Inclui abertura da empresa (a equipe recebe aviso na venda)
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.text2, marginTop: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={f.direitos.certificadoDigital === true} onChange={setD("certificadoDigital")} /> Inclui certificado digital e-CNPJ A1
        </label>
      </div>
      <Btn style={{ width: "100%", justifyContent: "center", opacity: valido ? 1 : 0.5 }} onClick={salvar}>
        {inicial.id ? "Salvar plano" : "Criar plano"}
      </Btn>
    </>
  );
}

function Kpi({ label, valor, cor, icon: Icon, sub }) {
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 12.5, color: C.text3 }}>{label}</div>
          <div style={{ fontFamily: serif, fontSize: 23, marginTop: 4 }}>{valor}</div>
          {sub && <div style={{ fontSize: 11, color: C.text4, marginTop: 2 }}>{sub}</div>}
        </div>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: `${cor}16`, display: "grid", placeItems: "center" }}><Icon size={19} color={cor} /></div>
      </div>
    </Card>
  );
}
