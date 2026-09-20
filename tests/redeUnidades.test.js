import test from 'node:test';
import assert from 'node:assert/strict';
import { progressoRede, statusDocumento } from '../src/lib/redeUnidades.js';
test('Endereço fiscal sozinho não exige sala; documentos configurados precisam estar aprovados', () => {
  const dados = { empresa: 'Teste', responsavel: 'Pessoa', endereco: 'Rua', cidade: 'Cidade', uf: 'MG', bairro: 'Centro', horarios: '9–18', servicos: ['endereco_fiscal'], fotos: ['https://example.com/foto.jpg'], financeiroConferido: true };
  assert.deepEqual(progressoRede(dados, [], []), Array(7).fill(true));
  assert.equal(progressoRede(dados, [{ tipo: 'iptu', revisao_status: 'pendente' }], [{ tipo: 'iptu', obrigatorio: true }])[2], false);
  assert.equal(progressoRede({ ...dados, servicos: ['sala_hora'] })[3], false);
  assert.equal(progressoRede({ ...dados, servicos: ['inventado'] })[5], false);
});
test('Validade é estado derivado, sem aprovar automaticamente um documento rejeitado', () => {
  const hoje = new Date('2026-09-18T12:00:00Z');
  assert.equal(statusDocumento({ revisao_status: 'aprovado', validade: '2026-10-01' }, hoje), 'vencendo');
  assert.equal(statusDocumento({ revisao_status: 'aprovado', validade: '2026-09-01' }, hoje), 'vencido');
  assert.equal(statusDocumento({ revisao_status: 'rejeitado', validade: '2026-09-01' }, hoje), 'rejeitado');
});
