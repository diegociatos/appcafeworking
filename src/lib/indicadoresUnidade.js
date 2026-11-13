import { anoDoLancamento } from './dateUtils.js';
import { ehNaoComercial } from './financeiro.js';
import { competenciaEfetiva } from './conferenciaFinanceira.js';
import { receitaOnlineNoMes } from './recebimentosOnline.js';

export function indicadoresUnidade({ unidadeId, clientes = [], lancamentos = [], cobrancas = [], ano, mes }) {
  if (!unidadeId) return { membros: 0, receita: 0 };
  const lancs = lancamentos.filter(l => l.unidadeId === unidadeId);
  const online = cobrancas.filter(c => c.unidadeId === unidadeId);
  const receita = lancs.filter(l => {
    if (l.dataPagamento && !competenciaEfetiva(l.dataPagamento)) return false;
    const comp = competenciaEfetiva(l.dataPagamento || l.data) || { mes: l.mes, ano: anoDoLancamento(l) };
    return l.tipo === 'entrada' && l.status === 'pago' && !ehNaoComercial(l) && comp.ano === ano && comp.mes === mes;
  }).reduce((s, l) => s + Number(l.valor || 0), 0) + receitaOnlineNoMes(online, lancs, ano, mes).valor;
  return { membros: clientes.filter(c => c.unidadeId === unidadeId && c.status !== 'inativo').length,
    receita: Math.round(receita * 100) / 100 };
}
