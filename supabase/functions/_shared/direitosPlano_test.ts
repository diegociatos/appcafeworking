// Testes com banco imitado: nada chama Supabase.
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  descontoSalaDoCliente, direitosDoCliente, maiorDescontoSala, percentualDescontoCafe, percentualDescontoSala,
  temCafeIncluso,
} from "./direitosPlano.ts";
import { calcularReserva, percentualValido } from "./reservaCliente.ts";

type Linha = Record<string, unknown>;

/** supabase-js com o mínimo que direitosPlano usa: select + eq/in/limit/maybeSingle. */
function bancoFalso(tabelas: Record<string, Linha[]>) {
  return {
    from(tabela: string) {
      const linhas = () => (tabelas[tabela] ||= []);
      const filtros: ((l: Linha) => boolean)[] = [];
      let limite = Infinity;
      const casam = () => linhas().filter((l) => filtros.every((f) => f(l))).slice(0, limite);
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => { filtros.push((l) => l[c] === v); return q; },
        in: (c: string, vs: unknown[]) => { filtros.push((l) => vs.includes(l[c])); return q; },
        limit: (n: number) => { limite = n; return q; },
        maybeSingle: () => Promise.resolve({ data: casam()[0] ?? null, error: null }),
        then: (ok: (r: unknown) => unknown) => Promise.resolve({ data: casam(), error: null }).then(ok),
      };
      return q;
    },
  };
}

Deno.test("percentuais: lixo vira 0 e o teto é 100", () => {
  assertEquals(percentualValido(15), 15);
  assertEquals(percentualValido("12.5"), 12.5);
  assertEquals(percentualValido(-3), 0);
  assertEquals(percentualValido(150), 100);
  assertEquals(percentualValido(null), 0);
  assertEquals(percentualValido("abc"), 0);
});

Deno.test("direitos do plano: desconto de sala, de café e café incluso", () => {
  const d = { descontoSala: 20, descontoCafe: 10, cafeIncluso: true };
  assertEquals(percentualDescontoSala(d), 20);
  assertEquals(percentualDescontoCafe(d), 10);
  assert(temCafeIncluso(d));
  assertEquals(percentualDescontoSala({}), 0);
  assertEquals(temCafeIncluso({ cafeIncluso: false }), false);
  assertEquals(temCafeIncluso(null), false);
});

Deno.test("maiorDescontoSala pega o melhor plano do cliente", () => {
  assertEquals(maiorDescontoSala([{ descontoSala: 10 }, { descontoSala: 25 }, {}]), 25);
  assertEquals(maiorDescontoSala([]), 0);
});

Deno.test("calcularReserva aplica o desconto do plano só sobre o excedente", () => {
  assertEquals(calcularReserva(3, 2, 50), {
    horas: 3, cobertas: 2, excedente: 1, valorSemDesconto: 50, descontoPct: 0, descontoValor: 0, valorExcedente: 50,
  });
  assertEquals(calcularReserva(3, 2, 50, 20), {
    horas: 3, cobertas: 2, excedente: 1, valorSemDesconto: 50, descontoPct: 20, descontoValor: 10, valorExcedente: 40,
  });
  // tudo coberto pelo plano: não há o que descontar
  assertEquals(calcularReserva(1, 5, 80, 50).valorExcedente, 0);
  // desconto de 100% zera o excedente
  assertEquals(calcularReserva(2, 0, 85, 100).valorExcedente, 0);
  // centavos arredondados a duas casas
  assertEquals(calcularReserva(1, 0, 33.33, 15).valorExcedente, 28.33);
});

Deno.test("direitosDoCliente: a assinatura ativa tem prioridade sobre o plano do cadastro", async () => {
  const admin = bancoFalso({
    assinaturas: [
      { unidade_id: "lux", cliente_email: "ana@x.com", status: "ativa", direitos: { descontoSala: 30 } },
      { unidade_id: "lux", cliente_email: "ana@x.com", status: "cancelada", direitos: { descontoSala: 90 } },
    ],
    clientes: [{ id: "c1", unidade_id: "lux", email: "ana@x.com", plano: "Coworking" }],
    app_state: [{ unidade_id: "lux", entity: "planos", doc: { nome: "Coworking", direitos: { descontoSala: 5 } } }],
  });
  assertEquals(await descontoSalaDoCliente(admin, "lux", "ana@x.com"), 30);
});

Deno.test("direitosDoCliente: sem assinatura, casa o plano do cadastro pelo nome", async () => {
  const admin = bancoFalso({
    assinaturas: [],
    clientes: [{ id: "c1", unidade_id: "lux", email: "joao@x.com", plano: "Endereço Fiscal" }],
    app_state: [
      { unidade_id: "lux", entity: "planos", doc: { nome: "Endereço Fiscal", direitos: { descontoSala: 15, descontoCafe: 10 } } },
      { unidade_id: "lux", entity: "planos", doc: { nome: "Outro", direitos: { descontoSala: 80 } } },
    ],
  });
  assertEquals(await descontoSalaDoCliente(admin, "lux", "joao@x.com"), 15);
  assertEquals((await direitosDoCliente(admin, "lux", "joao@x.com")).length, 1);
});

Deno.test("direitosDoCliente: cliente sem plano nem assinatura fica sem desconto", async () => {
  const admin = bancoFalso({ assinaturas: [], clientes: [], app_state: [] });
  assertEquals(await descontoSalaDoCliente(admin, "lux", "ninguem@x.com"), 0);
  assertEquals(await descontoSalaDoCliente(admin, "lux", null, null), 0);
});
