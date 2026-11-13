import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avaliarProjecao, baseContabil, gerarPendencias, sugerirConciliacoes, validarConciliacao, clientesVencidos } from '../src/lib/conferenciaFinanceira.js';
import { vencimentoReal, chaveDia } from '../src/lib/financeiro.js';
import { receitaOnlineNoMes } from '../src/lib/recebimentosOnline.js';
import { indicadoresUnidade } from '../src/lib/indicadoresUnidade.js';

const previsto = { id: 'p', unidadeId: 'u', tipo: 'entrada', status: 'previsto', clienteId: 'c', mes: 10, ano: 2026, valor: 100, categoria: 'Receita Operacional Bruta', dataVencimento: '10/11/2026' };
const pago = { ...previsto, id: 'r', status: 'pago', dataPagamento: '12/11/2026' };
const hoje = { ano: 2026, mes: 10, dia: 13, chave: chaveDia(2026, 10, 13) };

test('um recebimento não pode quitar duas parcelas; sugestões disputadas são ambíguas', () => {
  const segundo = { ...previsto, id: 'p2' };
  const lista = [previsto, segundo, pago];
  assert.equal(validarConciliacao(lista, 'p', 'r'), null);
  assert.equal(sugerirConciliacoes(lista).length, 2);
  assert.ok(sugerirConciliacoes(lista).every(x => x.ambiguo));
  assert.match(validarConciliacao([{ ...previsto, status: 'conciliado', conciliadoCom: 'r' }, segundo, pago], 'p2', 'r'), /já foi utilizado/);
});
test('conciliação rejeita outra unidade, competência ou cliente e movimentos não comerciais', () => {
  for (const alteracao of [{ unidadeId: 'outra' }, { clienteId: 'outro' }, { mes: 9 }, { categoria: 'Conta Movimentação' }, { valor: 50 }]) {
    assert.ok(validarConciliacao([previsto, { ...pago, ...alteracao }], 'p', 'r'));
  }
  assert.ok(validarConciliacao([previsto, pago], 'p', 'inexistente'));
});
test('datas explícitas inválidas não são reinterpretadas com outra competência', () => {
  for (const dataVencimento of ['31/02/2026', '2026-02-31', '20/99', '2026-13-02']) assert.equal(vencimentoReal({ ...previsto, data: '10/11/2026', dataVencimento }), null);
  assert.equal(vencimentoReal({ data: '10', mes: null, ano: 2026 }), null);
  assert.equal(vencimentoReal({ data: '10', mes: 14, ano: 2026 }), null);
  assert.equal(vencimentoReal({ data: '20/09', mes: 10, ano: 2026 }), null);
  assert.equal(vencimentoReal({ dataVencimento: '2026-11-10' }).chave, 20261110);
});
test('reserva paga uma vez no financeiro não é somada novamente no Asaas', () => {
  const c = { id: 'cob', unidadeId: 'u', reservaId: 'res', status: 'pago', valor: 100, pagoEm: '2026-11-12T12:00:00Z' };
  assert.equal(receitaOnlineNoMes([c], [{ ...pago, reservaId: 'res' }], 2026, 10).valor, 0);
  assert.equal(receitaOnlineNoMes([c], [{ ...pago, reservaId: 'res', unidadeId: 'outra' }], 2026, 10).valor, 100);
  assert.equal(receitaOnlineNoMes([c], [{ ...pago, reservaId: 'res', status: 'previsto' }], 2026, 10).valor, 100);
  assert.equal(receitaOnlineNoMes([c], [{ ...pago, cobrancaId: 'cob' }], 2026, 10).valor, 0);
});
test('central separa movimentos não comerciais e não modifica os dados', () => {
  const lista = [{ ...pago, clienteId: null }, { ...pago, id: 't', clienteId: null, categoria: 'Conta Movimentação' }];
  const antes = JSON.stringify(lista);
  assert.equal(gerarPendencias({ unidadeId: 'u', lancamentos: lista, hoje }).filter(x => x.tipo === 'Clientes').length, 1);
  assert.equal(JSON.stringify(lista), antes);
});
test('projeção avalia meses futuros mesmo com despesas já pagas no ano', () => {
  const r = avaliarProjecao([{ ...pago, tipo: 'saida' }], 2026, hoje);
  assert.deepEqual(r.mesesSemDespesas, [11]);
  assert.equal(avaliarProjecao([{ ...previsto, tipo: 'saida' }, { ...previsto, mes: 11, tipo: 'saida' }], 2026, hoje).incompleta, false);
});
test('indicadores respeitam unidade e data efetiva de pagamento e excluem transferências', () => {
  const r = indicadoresUnidade({ unidadeId: 'u', clientes: [{ id: 'c', unidadeId: 'u' }, { id: 'x', unidadeId: 'outra' }], lancamentos: [
    { ...pago, mes: 9 }, { ...pago, id: 'x', unidadeId: 'outra' }, { ...pago, id: 't', categoria: 'Conta Movimentação' },
  ], ano: 2026, mes: 10 });
  assert.deepEqual(r, { membros: 1, receita: 100 });
});
test('títulos sem cliente não viram clientes identificados em atraso', () => {
  assert.deepEqual(clientesVencidos([previsto, { ...previsto, id: 's', clienteId: null }], [{ id: 'c' }], hoje), { identificados: 1, semCliente: 1 });
});
test('DRE não duplica conciliados nem cancelados; caixa atravessa a virada do ano pela data paga', () => {
  const ls = [{ ...previsto, status: 'conciliado', conciliadoCom: 'r' }, { ...pago, dataPagamento: '02/01/2027' }, { ...previsto, id: 'cancelado', status: 'cancelado' }];
  assert.equal(baseContabil(ls).length, 1);
  assert.equal(baseContabil(ls, 'caixa')[0].ano, 2027);
  assert.equal(baseContabil(ls, 'caixa')[0].mes, 0);
  assert.equal(ls[1].ano, 2026);
});
