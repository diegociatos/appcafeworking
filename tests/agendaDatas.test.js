import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDataAgenda, moverPeriodoAgenda } from '../src/lib/agendaDatas.js';
import { temConflito } from '../src/lib/reservas.js';

test('data futura mantém dia local e aceita ano bissexto', () => {
  const d = parseDataAgenda('2028-02-29');
  assert.equal(d.getFullYear(), 2028);
  assert.equal(d.getMonth(), 1);
  assert.equal(d.getDate(), 29);
  assert.equal(d.getHours(), 0);
  assert.equal(parseDataAgenda('2027-02-29'), null);
  assert.equal(parseDataAgenda(''), null);
});

test('navegação mensal não pula fevereiro e atravessa anos', () => {
  assert.equal(moverPeriodoAgenda(new Date(2027, 0, 31), 'mes', 1).getMonth(), 1);
  assert.equal(moverPeriodoAgenda(new Date(2027, 11, 31), 'mes', 1).getFullYear(), 2028);
  assert.equal(moverPeriodoAgenda(new Date(2028, 1, 29), 'ano', 1).getMonth(), 1);
});

test('conflitos respeitam data futura, não apenas dia da semana', () => {
  let id = 0;
  const reserva = (dia) => ({ id: ++id, sala: 'sala1', startAt: `${dia}T10:00:00-03:00`, endAt: `${dia}T11:00:00-03:00`, status: 'confirmada' });
  assert.ok(temConflito(reserva('2027-01-04'), [reserva('2027-01-04')]));
  assert.ok(!temConflito(reserva('2027-01-04'), [reserva('2026-12-28')]));
});
