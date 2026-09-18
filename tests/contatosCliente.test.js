import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarEmailsCliente } from '../src/lib/contatosCliente.js';
test('normaliza contatos e elimina cópias duplicadas e principal', () => {
  assert.deepEqual(validarEmailsCliente(' Principal@example.com ', ['PRINCIPAL@example.com', ' financeiro@example.com ', 'FINANCEIRO@example.com', '']), {email:'principal@example.com', emailsAdicionais:['financeiro@example.com']});
});
test('recusa múltiplos endereços em um campo e adicionais sem titular', () => {
  assert.throws(() => validarEmailsCliente('a@example.com;b@example.com'), /válido/);
  assert.throws(() => validarEmailsCliente('', ['b@example.com']), /principal/);
  assert.throws(() => validarEmailsCliente('a@example.com', Array.from({length:11},(_,i)=>`e${i}@example.com`)), /10/);
});
test('permite remover todos os contatos adicionais e manter cadastros sem email', () => {
  assert.deepEqual(validarEmailsCliente(''), {email:'',emailsAdicionais:[]});
  assert.deepEqual(validarEmailsCliente('a@example.com', []), {email:'a@example.com',emailsAdicionais:[]});
});
