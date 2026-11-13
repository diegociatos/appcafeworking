import { useMemo, useState } from 'react';
import { Card, Btn } from '../components/ui.jsx';
import { C, fmt, inp } from '../lib/theme.js';
import { avaliarProjecao, gerarPendencias } from '../lib/conferenciaFinanceira.js';
import { hojeSP } from '../lib/financeiro.js';

export default function ConferenciaFinanceira({ unidadeId, lancamentos, contratos, boletos, cobrancas, clientes, onAbrir }) {
  const [tipo, setTipo] = useState('Todos');
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(0);
  const pendencias = useMemo(() => gerarPendencias({ unidadeId, lancamentos, contratos, boletos, cobrancas, clientes }), [unidadeId, lancamentos, contratos, boletos, cobrancas, clientes]);
  const projecao = avaliarProjecao(lancamentos, hojeSP().ano);
  const filtradas = pendencias.filter(p => (tipo === 'Todos' || p.tipo === tipo) && `${p.descricao} ${p.detalhe}`.toLocaleLowerCase('pt-BR').includes(busca.toLocaleLowerCase('pt-BR')));
  const limite = 25;
  const atual = Math.min(pagina, Math.max(0, Math.ceil(filtradas.length / limite) - 1));
  return <>
    <Card style={{ marginBottom: 16 }}>
      <h2 style={{ marginTop: 0 }}>Central de conferência financeira</h2>
      <p>Confira as pendências desta unidade antes de cobrar, dar baixa ou alterar classificações. Os alertas são sugestões de revisão e não confirmam dívida nem autorizam ajustes.</p>
      <p><b>{pendencias.length} pendências</b> · Os valores de alertas diferentes podem se referir ao mesmo lançamento e não devem ser somados.</p>
      {projecao.incompleta && <p role="status" style={{ color: C.amber }}>Projeção incompleta: {projecao.mesesSemDespesas.length} mês(es) do restante do ano sem despesas comerciais previstas. Confira os compromissos antes de decidir sobre distribuição de resultado.</p>}
      <p style={{ color: C.text3, fontSize: 13 }}>Esta central organiza a conferência. Não faz baixas, vínculos ou aprovações automáticas. Ajustes que dependem da gestão devem ser documentados antes de executar.</p>
    </Card>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
      <select aria-label="Tipo de pendência" value={tipo} onChange={e => { setTipo(e.target.value); setPagina(0); }} style={{ ...inp, width: 'auto' }}>{['Todos', 'Datas', 'Clientes', 'Categorias', 'Conciliação', 'Integrações', 'Contratos'].map(t => <option key={t}>{t}</option>)}</select>
      <input aria-label="Buscar pendências" placeholder="Buscar descrição ou motivo…" value={busca} onChange={e => { setBusca(e.target.value); setPagina(0); }} style={{ ...inp, flex: 1, minWidth: 200 }} />
    </div>
    {filtradas.slice(atual * limite, (atual + 1) * limite).map(p => <Card key={p.id} style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><b>{p.tipo} · {p.descricao || 'Sem descrição'}</b><span>{fmt(p.valor)}</span></div>
      <p style={{ fontSize: 13 }}>{p.detalhe}</p>
      {p.lancamento && <Btn variant="soft" onClick={() => onAbrir(p.lancamento)}>Conferir lançamento</Btn>}
    </Card>)}
    {!filtradas.length && <Card>Nenhuma pendência encontrada pelos critérios automáticos. Isso não substitui a conferência dos extratos e contratos.</Card>}
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 }}>
      <Btn variant="soft" disabled={atual === 0} onClick={() => setPagina(atual - 1)}>Anterior</Btn>
      <span>{filtradas.length} pendência(s) · página {atual + 1} de {Math.max(1, Math.ceil(filtradas.length / limite))}</span>
      <Btn variant="soft" disabled={(atual + 1) * limite >= filtradas.length} onClick={() => setPagina(atual + 1)}>Próxima</Btn>
    </div>
  </>;
}
