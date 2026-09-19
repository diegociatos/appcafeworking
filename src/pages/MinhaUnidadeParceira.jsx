import { useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { redeUnidadesApi } from '../lib/redeUnidadesApi.js';
import { ETAPAS_REDE, progressoRede } from '../lib/redeUnidades.js';
import { Card, Btn, PageHead, Field, Badge } from '../components/ui.jsx';
import { inp, C } from '../lib/theme.js';
import DocumentosUnidade from './DocumentosUnidade.jsx';
import { FotosGaleria } from './Unidades.jsx';
import { documentosUnidadeApi, TIPOS_KIT } from '../lib/documentosUnidadeApi.js';
import { supabaseConfigured } from '../lib/supabaseAuth.js';

const SERVICOS = { endereco_fiscal: 'Endereço fiscal', coworking: 'Estação / sala compartilhada', sala_hora: 'Sala de reunião / auditório por hora', sala_privativa: 'Sala privativa' };
export default function MinhaUnidadeParceira({ go }) {
  const { activeUnit, unidadeAtiva, contaDaUnidade, perfil, salasDe } = useStore();
  const [perfis, setPerfis] = useState([]);
  const [dados, setDados] = useState({});
  const [requisitos, setRequisitos] = useState([]);
  const [docs, setDocs] = useState([]);
  const [etapa, setEtapa] = useState(0);
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [carregado, setCarregado] = useState(false);
  const [parecer, setParecer] = useState('');
  const [documentosDa, setDocumentosDa] = useState(null);
  const [versao, setVersao] = useState(0);
  const admin = perfil === 'franqueador';
  const conta = contaDaUnidade(activeUnit);
  const registro = perfis.find((p) => p.unidade_id === activeUnit);
  const unidadeRef = useRef(activeUnit);
  unidadeRef.current = activeUnit;
  useEffect(() => { setEtapa(0); setMsg(''); setDados({}); setDocs([]); }, [activeUnit]);
  useEffect(() => {
    let vivo = true; setCarregado(false); setErro('');
    Promise.all([redeUnidadesApi.listar(), redeUnidadesApi.requisitos()]).then(([p, r]) => {
      if (!vivo) return;
      setPerfis(p || []); setRequisitos(r || []);
      setDados(p.find((x) => x.unidade_id === activeUnit)?.dados || { empresa: conta?.nome || '', responsavel: conta?.master || '', endereco: unidadeAtiva?.endereco || '', cidade: unidadeAtiva?.cidade || '', servicos: ['endereco_fiscal'], fotos: [] });
      setCarregado(true);
    }).catch((e) => vivo && setErro(e.message));
    if (activeUnit && supabaseConfigured) documentosUnidadeApi.listar(activeUnit).then((r) => vivo && setDocs(r || [])).catch((e) => vivo && setErro(e.message));
    return () => { vivo = false; };
  }, [activeUnit, versao]); // eslint-disable-line react-hooks/exhaustive-deps
  const executar = async (acao) => {
    setBusy(true); setErro(''); setMsg('');
    try { await acao(); setMsg('Alteração salva.'); setVersao((v) => v + 1); }
    catch (e) { setErro(e.message); } finally { setBusy(false); }
  };
  const campo = (chave, label, tipo = 'text') => <Field key={chave} label={label}><input aria-label={label} type={tipo} style={inp} maxLength={500} value={dados[chave] || ''} onChange={(e) => setDados({ ...dados, [chave]: e.target.value })} disabled={busy} /></Field>;
  const progresso = progressoRede(dados, docs, requisitos);
  const feitos = progresso.slice(0, 7).filter(Boolean).length;
  const soEnderecoFiscal = dados.servicos?.length === 1 && dados.servicos[0] === 'endereco_fiscal';
  return <div><PageHead title={admin ? 'Análise de unidades parceiras' : 'Configurar unidade'} sub="Dados públicos, imóvel, documentos, espaços e serviços desta unidade." action={!admin && <Badge color={registro?.status === 'publicado' ? C.green : C.amber}>{registro?.status === 'publicado' ? 'Publicada' : feitos + '/7 etapas'}</Badge>} />
    <style>{`.rede-config-grid{display:grid;grid-template-columns:230px minmax(0,1fr);gap:16px;align-items:start}.rede-etapas{display:grid;gap:5px;position:sticky;top:92px}.rede-etapas button{min-height:44px;padding:10px 12px;border-radius:10px;text-align:left}.rede-acoes{display:flex;gap:10px;flex-wrap:wrap}.rede-acoes button{min-height:44px}@media(max-width:800px){.rede-config-grid{grid-template-columns:1fr}.rede-etapas{display:flex;overflow-x:auto;position:static;padding-bottom:4px}.rede-etapas button{flex:0 0 auto}}`}</style>
    {erro && <p role="alert" style={{ color: C.red }}>{erro}</p>}{msg && <p role="status">{msg}</p>}
    {admin ? <Card>{perfis.length === 0 && <p>Nenhuma unidade enviada.</p>}{perfis.map((p) => <div key={p.unidade_id} style={{ borderBottom: `1px solid ${C.border2}`, padding: 16 }}>
      <h3>{p.dados.empresa} · {p.dados.cidade} / {p.dados.uf}</h3><p>{p.status} · {p.dados.endereco} · {p.dados.bairro}</p>
      <p>Serviços: {p.dados.servicos?.map((s) => SERVICOS[s]).join(', ')}</p><p>Horários: {p.dados.horarios}</p>
      <p>Acessibilidade: {p.dados.acessibilidade || 'Não informada'} · Estacionamento: {p.dados.estacionamento || 'Não informado'}</p>
      {(p.dados.fotos || []).map((url) => <a key={url} href={url} target="_blank" rel="noopener noreferrer" style={{ marginRight: 12 }}>Conferir foto</a>)}
      <p>Parecer atual: {p.parecer || 'Sem observações'}</p>
      <Btn variant="ghost" onClick={() => setDocumentosDa(documentosDa === p.unidade_id ? null : p.unidade_id)}>Conferir documentos do imóvel</Btn>
      {documentosDa === p.unidade_id && <DocumentosUnidade unidade={{ id: p.unidade_id, nome: p.dados.empresa }} />}
      {p.status === 'em_analise' && <><label htmlFor={`parecer-${p.unidade_id}`}>Observações da análise</label><textarea id={`parecer-${p.unidade_id}`} style={inp} maxLength={2000} value={parecer} onChange={(e) => setParecer(e.target.value)} />
        <div className="rede-acoes"><Btn disabled={busy} onClick={() => executar(() => redeUnidadesApi.revisar(p.unidade_id, 'publicado', parecer))}>Aprovar e publicar</Btn>
        <Btn variant="ghost" disabled={busy || !parecer.trim()} onClick={() => executar(() => redeUnidadesApi.revisar(p.unidade_id, 'rejeitado', parecer))}>Solicitar correções</Btn></div></>}
    </div>)}<h3>Documentos exigidos pela rede</h3><p>Configuração operacional, não uma lista de exigências legais. Revise por município antes de publicar.</p>
      {requisitos.map((r) => <label key={r.tipo} style={{ display: 'block', padding: 10 }}><input type="checkbox" checked={r.obrigatorio} disabled={busy} onChange={(e) => executar(() => redeUnidadesApi.configurarRequisito(r.tipo, e.target.checked))} /> {TIPOS_KIT[r.tipo]}</label>)}
    </Card> : conta?.tipo !== 'parceiro' ? <Card>Escolha uma unidade de conta parceira no seletor do topo.</Card> : <div className="rede-config-grid">
      <nav className="rede-etapas" aria-label="Etapas de preparação">{ETAPAS_REDE.map((nome, i) => <button key={nome} onClick={() => setEtapa(i)} aria-current={etapa === i ? 'step' : undefined} style={{ background: etapa === i ? C.teal : C.cream, color: etapa === i ? '#fff' : C.text }}>{i + 1}. {nome}{progresso[i] ? ' ✓' : ''}</button>)}</nav>
      <Card><h2>{ETAPAS_REDE[etapa]}</h2>
        {etapa === 0 && <>{campo('empresa', 'Empresa / escritório')}{campo('responsavel', 'Responsável')}<p>Documento e contato da conta continuam no cadastro central; não duplicamos dados bancários aqui.</p></>}
        {etapa === 1 && <>{['endereco', 'cidade', 'uf', 'bairro', 'horarios', 'caracteristicas', 'acessibilidade', 'estacionamento', 'comodidades'].map((k) => campo(k, ({ endereco: 'Endereço completo', cidade: 'Cidade', uf: 'UF', bairro: 'Bairro', horarios: 'Horários de atendimento', caracteristicas: 'Características do imóvel', acessibilidade: 'Acessibilidade', estacionamento: 'Estacionamento', comodidades: 'Comodidades' })[k]))}
          {dados.servicos?.includes('endereco_fiscal') && <div style={{ padding: 14, borderRadius: 12, background: C.cream, marginTop: 8 }}><h3 style={{ marginTop: 0 }}>Operação do endereço fiscal</h3><p style={{ fontSize: 13, color: C.text3 }}>Estas informações ajudam a CafeWorking a validar a capacidade operacional; não substituem a viabilidade de cada atividade no município.</p>{campo('responsavelCorrespondencias', 'Responsável pelas correspondências')}{campo('armazenamentoCorrespondencias', 'Como os documentos e encomendas ficam armazenados')}{campo('capacidadeClientesFiscais', 'Capacidade estimada de clientes de endereço fiscal', 'number')}</div>}
        </>}
        {etapa === 2 && <><p>Envie os documentos já previstos no projeto. A equipe define quais se aplicam à sua unidade.</p><DocumentosUnidade unidade={unidadeAtiva} /></>}
        {etapa === 3 && (soEnderecoFiscal ? <div style={{ padding: 18, borderRadius: 12, background: C.greenPale }}><b>Esta etapa não é necessária agora.</b><p style={{ marginBottom: 0 }}>Sua unidade oferece somente endereço fiscal, portanto não precisa cadastrar sala, estação ou agenda. Você poderá ativar esses serviços depois.</p></div> : <><p>{salasDe(activeUnit).length} espaços cadastrados.</p><Btn onClick={() => go('salas')}>Cadastrar / editar espaços e fotos</Btn><label style={{ display: 'block', padding: 12 }}><input type="checkbox" checked={dados.espacosConferidos === true} onChange={(e) => setDados({ ...dados, espacosConferidos: e.target.checked })} /> Conferi capacidade, preço, disponibilidade e regras dos espaços</label></>)}
        {etapa === 4 && <><p>Envie fotos públicas do imóvel pelo celular. Não inclua documentos ou dados de clientes. O envio usa a galeria existente, com redução de tamanho; salve o rascunho ao concluir. Até 20 fotos.</p><FotosGaleria key={activeUnit} fotos={dados.fotos || []} unidadeId={activeUnit} onChange={(fotos) => { if (unidadeRef.current === activeUnit) setDados((d) => ({ ...d, fotos })); }} /></>}
        {etapa === 5 && <><p><b>Você decide o que esta unidade vai oferecer.</b> Selecione apenas os serviços que consegue operar agora. É possível começar somente com endereço fiscal ou combinar com estações, salas e auditório. Depois, você poderá adicionar novos serviços e enviá-los para aprovação.</p>{Object.entries(SERVICOS).map(([id, nome]) => <label key={id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 14, marginBottom: 8, border: `1px solid ${dados.servicos?.includes(id) ? C.teal : C.border2}`, borderRadius: 12, background: dados.servicos?.includes(id) ? C.tealPale : C.white }}><input type="checkbox" checked={dados.servicos?.includes(id) || false} onChange={(e) => setDados({ ...dados, servicos: e.target.checked ? [...(dados.servicos || []), id] : dados.servicos.filter((s) => s !== id) })} /><span><b>{nome}</b>{id === 'endereco_fiscal' && <small style={{ display: 'block', color: C.text3, marginTop: 3 }}>Pode ser oferecido sozinho ou junto com os demais serviços.</small>}{id !== 'endereco_fiscal' && <small style={{ display: 'block', color: C.text3, marginTop: 3 }}>Ao ativar, o painel libera cadastro de espaços, disponibilidade, preços e reservas.</small>}</span></label>)}</>}
        {etapa === 6 && <><p>Percentuais e carteira de recebimento são configurados pela CafeWorking em Contas. O financeiro existente usa os valores registrados em cada cobrança, sem recalcular com percentuais fixos.</p><Btn onClick={() => go('financeiro')}>Ver extrato de repasses</Btn><label style={{ display: 'block', padding: 12 }}><input type="checkbox" checked={dados.financeiroConferido === true} onChange={(e) => setDados({ ...dados, financeiroConferido: e.target.checked })} /> Conferi os dados com a equipe CafeWorking</label></>}
        {etapa >= 7 && <><p>{progresso.filter(Boolean).length} de 7 etapas conferidas. O admin revisa documentos, informações e recebimento antes da publicação.</p><p>{registro?.parecer || 'Após enviar, acompanhe as observações aqui. Alterar e salvar uma unidade publicada retorna o conteúdo para rascunho.'}</p><Btn disabled={busy || !carregado} onClick={() => executar(() => redeUnidadesApi.salvar(activeUnit, dados, true))}>Enviar para análise</Btn></>}
        {etapa < 7 && etapa !== 2 && <div className="rede-acoes"><Btn disabled={busy || !carregado} onClick={() => executar(() => redeUnidadesApi.salvar(activeUnit, dados))}>{busy ? 'Salvando…' : 'Salvar rascunho'}</Btn><Btn variant="ghost" onClick={() => setEtapa(etapa + 1)}>Próxima etapa</Btn></div>}
      </Card>
    </div>}
  </div>;
}
