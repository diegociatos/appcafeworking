import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ultimaSolicitacao } from '../src/lib/ultimaSolicitacao.js';

test('resposta atrasada não substitui a agenda da data mais recente', async () => {
  const controle = ultimaSolicitacao();
  let agenda;
  let resolverAntiga;
  const antiga = new Promise(resolve => { resolverAntiga = resolve; });
  const primeiraAtual = controle.iniciar();
  const pendente = antiga.then(valor => { if (primeiraAtual()) agenda = valor; });
  const segundaAtual = controle.iniciar();
  if (segundaAtual()) agenda = 'terça-feira';
  resolverAntiga('segunda-feira');
  await pendente;
  assert.equal(agenda, 'terça-feira');
});

test('saída da tela invalida sucesso, erro e finalização pendentes', () => {
  const controle = ultimaSolicitacao();
  const atual = controle.iniciar();
  assert.equal(atual(), true);
  controle.invalidar();
  assert.equal(atual(), false);
  assert.equal(controle.iniciar()(), true);
});
