// ============================================================================
// Direitos do plano do cliente nas telas (Planos → "Direitos do plano").
//
// Os direitos são cadastrados em Planos e ficam no catálogo da unidade. O
// vínculo cliente → plano é pelo NOME (clientes.plano), o mesmo que a tela de
// Clientes já usa para gerar os créditos.
//
// Aqui ficam só regras puras (sem React, sem banco), para o PDV e a Agenda de
// Salas mostrarem o mesmo número que o servidor aplica.
//   • descontoCafe  → % sobre a comanda da cafeteria
//   • cafeIncluso   → um café por dia sem custo
//   • descontoSala  → % sobre o excedente da reserva (o servidor é a fonte da
//                     verdade; aqui é só a prévia da tela)
// ============================================================================

/** Percentual válido (0 a 100, duas casas). Lixo vira 0. */
export function percentualValido(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(Math.min(100, n) * 100) / 100;
}

/** Plano do catálogo que casa com o cadastro do cliente (pelo nome). */
export function planoDoCliente(planos, cliente) {
  const nome = String(cliente?.plano || "").trim();
  if (!nome) return null;
  return (planos || []).find((p) => String(p?.nome || "").trim() === nome) || null;
}

/** Direitos valendo para o cliente ({} quando não houver plano). */
export function direitosDoCliente(planos, cliente) {
  return planoDoCliente(planos, cliente)?.direitos || {};
}

export const descontoSalaPct = (direitos) => percentualValido(direitos?.descontoSala);
export const descontoCafePct = (direitos) => percentualValido(direitos?.descontoCafe);
export const temCafeIncluso = (direitos) => direitos?.cafeIncluso === true;

/** O item da comanda é um café? (categoria ou nome) */
export function ehCafe(item) {
  const texto = `${item?.cat || ""} ${item?.nome || ""}`.toLowerCase();
  return /caf[eé]/.test(texto) && !/cafeteira|c[aá]psula/.test(texto);
}

/**
 * O café incluso do dia já foi usado por este cliente nesta unidade?
 * Olha os pedidos do dia (fuso de Brasília) que marcaram `cafeInclusoValor`.
 */
export function cafeInclusoUsadoHoje(pedidos, clienteId, hojeBR) {
  if (!clienteId) return false;
  const dia = hojeBR || hojeBRT();
  return (pedidos || []).some((p) =>
    p?.clienteId === clienteId
    && Number(p?.cafeInclusoValor || 0) > 0
    && diaDoPedido(p) === dia);
}

/** Hoje (aaaa-mm-dd) no fuso de Brasília. */
export function hojeBRT(agora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(agora);
}

/** Dia (aaaa-mm-dd, Brasília) de um pedido da cafeteria. */
export function diaDoPedido(p) {
  const iso = p?.createdAt || p?.criadoEm;
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : hojeBRT(d);
}

/**
 * Conta da cafeteria com os direitos do plano aplicados.
 *
 * Ordem: primeiro o café incluso (um café por dia, o mais barato da comanda sai
 * de graça), depois o desconto percentual sobre o que sobrou.
 *
 * Devolve { subtotal, cafeInclusoValor, cafeInclusoNome, descontoPct,
 *           descontoValor, total }.
 */
export function contaDaComanda(cart, direitos, { cafeJaUsadoHoje = false } = {}) {
  const itens = cart || [];
  const subtotal = arred(itens.reduce((s, i) => s + Number(i.preco || 0) * Number(i.q || 0), 0));

  let cafeInclusoValor = 0;
  let cafeInclusoNome = "";
  if (temCafeIncluso(direitos) && !cafeJaUsadoHoje) {
    const cafes = itens.filter((i) => ehCafe(i) && Number(i.q || 0) > 0 && Number(i.preco || 0) > 0);
    const barato = cafes.sort((a, b) => Number(a.preco) - Number(b.preco))[0];
    if (barato) { cafeInclusoValor = arred(Number(barato.preco)); cafeInclusoNome = barato.nome; }
  }

  const base = Math.max(0, arred(subtotal - cafeInclusoValor));
  const descontoPct = descontoCafePct(direitos);
  const descontoValor = arred((base * descontoPct) / 100);
  return {
    subtotal, cafeInclusoValor, cafeInclusoNome, descontoPct, descontoValor,
    total: Math.max(0, arred(base - descontoValor)),
  };
}

/** Prévia do excedente da reserva com o desconto de sala do plano. Espelha
 *  _shared/reservaCliente.ts (calcularReserva) — o servidor decide de verdade. */
export function previaExcedente(horas, saldo, valorHora, desconto = 0) {
  const h = Math.max(0, Math.floor(Number(horas) || 0));
  const cobertas = Math.min(Math.max(0, Math.floor(Number(saldo) || 0)), h);
  const excedente = h - cobertas;
  const cheio = arred(excedente * Math.max(0, Number(valorHora) || 0));
  const descontoPct = percentualValido(desconto);
  const descontoValor = Math.round(cheio * descontoPct) / 100;
  return {
    horas: h, cobertas, excedente,
    valorSemDesconto: cheio, descontoPct, descontoValor,
    valorExcedente: arred(cheio - descontoValor),
  };
}

const arred = (n) => Math.round(Number(n || 0) * 100) / 100;
