import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gerarPendencias, validarConciliacao } from '../src/lib/conferenciaFinanceira.js';
import { vencimentoReal } from '../src/lib/financeiro.js';
import { receitaOnlineNoMes } from '../src/lib/recebimentosOnline.js';
import { indicadoresUnidade } from '../src/lib/indicadoresUnidade.js';
test('vencimento explícito parcial tem prioridade sobre data de lançamento', () => {
  for (const dataVencimento of ['15', '15/11']) assert.equal(vencimentoReal({ dataVencimento, data: '10/11/2026', mes: 10, ano: 2026 }).chave, 20261115);
});
test('vínculo de conciliação continua reservado até desconciliação explícita', () => {
  const p = { id: 'p', unidadeId: 'u', tipo: 'entrada', status: 'previsto', clienteId: 'c', mes: '10', ano: 2026, valor: 100 };
  const r = { ...p, id: 'r', mes: 10, status: 'pago' };
  assert.equal(validarConciliacao([p, r], 'p', 'r'), null);
  assert.ok(validarConciliacao([p, r, { id: 'antigo', status: 'pago', conciliadoCom: 'r' }], 'p', 'r'));
  assert.ok(validarConciliacao([{ ...p, mes: undefined }, { ...r, mes: undefined }], 'p', 'r'));
});
test('sinal e complemento vinculados à mesma reserva não duplicam receita', () => {
  const c = { unidadeId: 'u', reservaId: '9', status: 'pago', pagoEm: '2026-11-12T12:00:00Z' };
  const cs = [{ ...c, id: 'sinal', valor: 40 }, { ...c, id: 'saldo', reservaId: 9, valor: 60 }];
  const ls = [{ unidadeId: 'u', reservaId: '9', tipo: 'entrada', status: 'pago', valor: 100 }];
  assert.equal(receitaOnlineNoMes(cs, ls, 2026, 10).valor, 0);
});
test('central não revela pendências de outra unidade; unidade ausente não agrega registros órfãos', () => {
  assert.deepEqual(gerarPendencias({ unidadeId: 'u', boletos: [{ id: 'b', unidadeId: 'outra', status: 'registrado' }], contratos: [{ unidadeId: 'outra', status: 'ativo' }] }), []);
  assert.deepEqual(indicadoresUnidade({ lancamentos: [{ tipo: 'entrada', status: 'pago', valor: 100, mes: 10, ano: 2026 }], ano: 2026, mes: 10 }), { membros: 0, receita: 0 });
});
test('pagamento com data impossível vai à revisão e não vira receita de outra competência', () => {
  const l = { id: 'x', unidadeId: 'u', tipo: 'entrada', status: 'pago', valor: 100, mes: 10, ano: 2026, dataPagamento: '31/02/2026' };
  assert.equal(indicadoresUnidade({ unidadeId: 'u', lancamentos: [l], ano: 2026, mes: 10 }).receita, 0);
  assert.ok(gerarPendencias({ unidadeId: 'u', lancamentos: [l] }).some(x => x.tipo === 'Datas'));
});
