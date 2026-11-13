import { anoDoLancamento, competenciaComAno } from './dateUtils.js';
import { ehNaoComercial, hojeSP, resumoRecebiveis, saldoResidual, vencimentoReal, dataValidaCompleta } from './financeiro.js';

const centavos = v => Math.round(Number(v || 0) * 100);
export function competenciaEfetiva(data) {
  const s = String(data || '').trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const br = iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : s;
  if (!dataValidaCompleta(br)) return null;
  const [, mes, ano] = br.split('/').map(Number);
  return { mes: mes - 1, ano };
}

// Um previsto conciliado já está representado pelo pagamento. Não entra duas
// vezes na DRE. No caixa, o período é o do recebimento efetivo.
export function baseContabil(lancamentos, regime = 'competencia') {
  return lancamentos.filter(l => regime === 'caixa' ? l.status === 'pago' && (!l.dataPagamento || competenciaEfetiva(l.dataPagamento)) : ['pago', 'previsto'].includes(l.status)).map(l => {
    const comp = regime === 'caixa' ? competenciaEfetiva(l.dataPagamento || l.data) : competenciaComAno(l.dataCompetencia);
    return comp ? { ...l, mes: comp.mes, ano: comp.ano } : l;
  });
}
export const mesmaOperacao = (a, b) => ['cobrancaId', 'boletoId', 'reservaId'].some(k => a[k] && b[k] && String(a[k]) === String(b[k]));
function validarPar(previsto, pago, usados) {
  if (!previsto || !pago || previsto.id === pago.id) return 'Selecione dois lançamentos existentes e distintos.';
  if (previsto.status !== 'previsto' || pago.status !== 'pago' || previsto.tipo !== 'entrada' || pago.tipo !== 'entrada') return 'A conciliação exige uma entrada prevista e outra já recebida.';
  if (!previsto.unidadeId || previsto.unidadeId !== pago.unidadeId) return 'Os lançamentos precisam pertencer à mesma unidade.';
  if (ehNaoComercial(previsto) || ehNaoComercial(pago)) return 'Transferências e investimentos não liquidam recebíveis comerciais.';
  if (usados.has(pago.id)) return 'Este pagamento já foi utilizado em outra conciliação.';
  if (centavos(saldoResidual(previsto)) <= 0 || centavos(saldoResidual(previsto)) !== centavos(pago.valor)) return 'Os valores precisam coincidir integralmente; pagamentos parciais exigem análise separada.';
  if (previsto.clienteId && pago.clienteId && previsto.clienteId !== pago.clienteId) return 'Os clientes vinculados são diferentes.';
  if (!mesmaOperacao(previsto, pago)) {
    if (!previsto.clienteId || previsto.clienteId !== pago.clienteId) return 'Não há cliente ou operação comum que justifique o vínculo.';
    const mesValido = l => l.mes != null && l.mes !== '' && Number.isInteger(Number(l.mes)) && +l.mes >= 0 && +l.mes <= 11;
    const anoValido = l => Number.isInteger(Number(l.ano)) && +l.ano >= 2000 && +l.ano <= 2100;
    if (!mesValido(previsto) || !mesValido(pago) || !anoValido(previsto) || !anoValido(pago)) return 'Informe uma competência válida nos dois lançamentos.';
    if (+previsto.mes !== +pago.mes || anoDoLancamento(previsto) !== anoDoLancamento(pago)) return 'Competências diferentes: confira a operação original antes de conciliar.';
  }
  return null;
}
export function validarConciliacao(lancamentos, previstoId, pagoId) {
  const usados = new Set(lancamentos.filter(l => l.conciliadoCom).map(l => l.conciliadoCom));
  return validarPar(lancamentos.find(l => l.id === previstoId), lancamentos.find(l => l.id === pagoId), usados);
}

// Indexa os vínculos uma vez: não percorre a carteira inteira para cada par.
export function sugerirConciliacoes(lancamentos) {
  const usados = new Set(lancamentos.filter(l => l.conciliadoCom).map(l => l.conciliadoCom));
  const pagos = lancamentos.filter(l => l.tipo === 'entrada' && l.status === 'pago' && !usados.has(l.id));
  const candidatos = lancamentos.filter(l => l.tipo === 'entrada' && l.status === 'previsto').map(previsto => ({
    previsto, pagamentos: pagos.filter(p => !validarPar(previsto, p, usados)),
  })).filter(x => x.pagamentos.length);
  const frequencias = new Map();
  candidatos.forEach(x => x.pagamentos.forEach(p => frequencias.set(p.id, (frequencias.get(p.id) || 0) + 1)));
  return candidatos.map(x => ({ ...x, ambiguo: x.pagamentos.length !== 1 || x.pagamentos.some(p => frequencias.get(p.id) > 1) }));
}

export function avaliarProjecao(lancamentos, ano, hoje = hojeSP()) {
  const meses = [];
  for (let mes = ano === hoje.ano ? hoje.mes : 0; mes < 12; mes++) {
    if (ano < hoje.ano) break;
    const previstos = lancamentos.filter(l => anoDoLancamento(l) === ano && +l.mes === mes && (l.status === 'previsto' || (ano === hoje.ano && mes === hoje.mes && l.status === 'pago')));
    if (!previstos.some(l => l.tipo === 'saida' && !ehNaoComercial(l))) meses.push(mes);
  }
  return { mesesSemDespesas: meses, incompleta: meses.length > 0 };
}

export function gerarPendencias({ unidadeId, lancamentos = [], contratos = [], boletos = [], cobrancas = [], clientes = [], hoje = hojeSP() }) {
  if (!unidadeId) return [];
  const locais = lista => lista.filter(x => x.unidadeId === unidadeId);
  lancamentos = locais(lancamentos); contratos = locais(contratos); boletos = locais(boletos); cobrancas = locais(cobrancas); clientes = locais(clientes);
  const itens = [];
  const add = (id, tipo, descricao, detalhe, valor, lancamento) => itens.push({ id, tipo, descricao, detalhe, valor: Number(valor || 0), lancamento });
  for (const l of lancamentos) {
    if (l.dataCompetencia && !competenciaEfetiva(l.dataCompetencia)) add(`competencia:${l.id}`, 'Datas', l.descricao, 'Competência inválida. Confirmar o período no documento original.', l.valor, l);
    if (l.status === 'pago' && l.dataPagamento && !competenciaEfetiva(l.dataPagamento)) add(`pagamento:${l.id}`, 'Datas', l.descricao, 'Data de pagamento inválida. Não presumir outra data.', l.valor, l);
    if (l.status === 'previsto' && !vencimentoReal(l)) add(`data:${l.id}`, 'Datas', l.descricao, 'Vencimento ausente ou inválido. Confirmar no documento de origem.', l.valor, l);
    if (l.tipo === 'entrada' && l.status === 'pago' && !ehNaoComercial(l) && !clientes.some(c => c.id === l.clienteId)) add(`cliente:${l.id}`, 'Clientes', l.descricao, 'Recebimento comercial sem cliente válido. Não representa dívida.', l.valor, l);
    if (['pago', 'previsto'].includes(l.status) && !ehNaoComercial(l) && !l.subcategoria) add(`categoria:${l.id}`, 'Categorias', l.descricao, 'Subcategoria não informada. Revisar sem assumir uma categoria padrão.', l.valor, l);
  }
  for (const x of sugerirConciliacoes(lancamentos)) add(`conc:${x.previsto.id}`, 'Conciliação', x.previsto.descricao, x.ambiguo ? 'Mais de uma correspondência possível ou pagamento disputado por outras parcelas. Revisão obrigatória.' : 'Pagamento compatível encontrado. Conferir comprovante e competência antes de vincular.', x.previsto.valor, x.previsto);
  for (const b of boletos) {
    const ref = b.lancamentoId && lancamentos.find(l => l.id === b.lancamentoId);
    const vinc = ref || lancamentos.find(l => l.boletoId === b.id);
    if (!['pago', 'cancelado'].includes(b.status) && (!vinc || ['pago', 'conciliado'].includes(vinc.status))) add(`bol:${b.id}`, 'Integrações', b.sacado || 'Boleto', vinc ? 'Financeiro liquidado, mas boleto ainda aberto. Conferir retorno bancário.' : 'Boleto sem parcela vinculada. Não somar à carteira sem conferir a origem.', b.valor);
  }
  for (const c of cobrancas) {
    const pagos = lancamentos.filter(l => l.tipo === 'entrada' && l.status === 'pago' && (l.cobrancaId === c.id || (c.reservaId && l.reservaId === c.reservaId)));
    if (pagos.length > 1) add(`online:${c.id}`, 'Integrações', c.descricao || c.cliente, 'Vários lançamentos pagos para a mesma cobrança/reserva. Possível duplicidade; não excluir automaticamente.', c.valor);
    else if (c.status === 'pago' && pagos.length === 1 && centavos(pagos[0].valor) !== centavos(c.valorPago ?? c.valor)) add(`valor-online:${c.id}`, 'Integrações', c.descricao || c.cliente, 'Cobrança e lançamento pago têm valores diferentes. Conferir sinal, complemento, taxas e valor bruto antes de consolidar.', c.valor);
  }
  for (const c of contratos.filter(c => c.status === 'ativo')) {
    const parcelas = lancamentos.filter(l => l.contratoId === c.id && ['pago', 'previsto', 'conciliado'].includes(l.status) && anoDoLancamento(l) === hoje.ano && l.mes === hoje.mes);
    if (!parcelas.length) add(`contrato:${c.id}`, 'Contratos', c.cliente, 'Contrato marcado ativo sem parcela na competência atual. Conferir vigência, periodicidade e renovação.', c.valorMensal);
  }
  return itens;
}

export function clientesVencidos(lancamentos, clientes, hoje = hojeSP()) {
  const vencidos = resumoRecebiveis(lancamentos, hoje).itens.filter(x => x.classe === 'vencido');
  return { identificados: new Set(vencidos.filter(x => clientes.some(c => c.id === x.l.clienteId)).map(x => x.l.clienteId)).size,
    semCliente: vencidos.filter(x => !clientes.some(c => c.id === x.l.clienteId)).length };
}
