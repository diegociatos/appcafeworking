// Testes com banco imitado: nada chama Supabase.
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  ajustarLancamentoNoCancelamento, competenciaBRT, decidirCancelamento, docLancamentoReserva, idLancamentoReserva,
  registrarLancamentoReserva, removerLancamentoReserva, subcategoriaSala,
} from "./lancamentoReserva.ts";

type Linha = Record<string, unknown>;

/** supabase-js com upsert (por chave), delete e select do app_state. */
function bancoFalso(tabelas: Record<string, Linha[]> = {}) {
  const chave = (l: Linha) => `${l.unidade_id}|${l.entity}|${l.item_id}`;
  return {
    tabelas,
    from(tabela: string) {
      const linhas = () => (tabelas[tabela] ||= []);
      const filtros: ((l: Linha) => boolean)[] = [];
      let op: "select" | "delete" = "select";
      const casam = () => linhas().filter((l) => filtros.every((f) => f(l)));
      const q = {
        select: () => q,
        delete: () => { op = "delete"; return q; },
        upsert: (row: Linha) => {
          const i = linhas().findIndex((l) => chave(l) === chave(row));
          if (i >= 0) linhas()[i] = { ...row }; else linhas().push({ ...row });
          return Promise.resolve({ error: null });
        },
        eq: (c: string, v: unknown) => { filtros.push((l) => l[c] === v); return q; },
        // o delete só acontece quando a cadeia é aguardada (como no supabase-js)
        then: (ok: (r: unknown) => unknown) => {
          const alvo = casam();
          if (op === "delete") tabelas[tabela] = linhas().filter((l) => !alvo.includes(l));
          return Promise.resolve({ data: alvo, error: null }).then(ok);
        },
      };
      return q;
    },
  };
}

const BASE = {
  reservaId: "r1", unidadeId: "lux", salaNome: "Sala Ouro", salaTipo: "Reunião",
  clienteNome: "Ana", valor: 120, status: "previsto" as const, quando: "2026-09-17T14:00:00Z",
};

Deno.test("idLancamentoReserva é determinístico (uma reserva, um lançamento)", () => {
  assertEquals(idLancamentoReserva("r1"), "lc_res_r1");
});

Deno.test("competenciaBRT usa o fuso de Brasília na virada do dia", () => {
  // 01/10/2026 00:30 UTC = 30/09/2026 21:30 em Brasília
  assertEquals(competenciaBRT("2026-10-01T00:30:00Z"), { mes: 8, ano: 2026, data: "30/09" });
  assertEquals(competenciaBRT("2026-09-17T14:00:00Z"), { mes: 8, ano: 2026, data: "17/09" });
});

Deno.test("subcategoriaSala segue o plano de contas da recepção", () => {
  assertEquals(subcategoriaSala("Privativa"), "Aluguel de Salas Privativas");
  assertEquals(subcategoriaSala("Reunião"), "Aluguel de Sala de Reunião");
  assertEquals(subcategoriaSala(null), "Aluguel de Sala de Reunião");
});

Deno.test("docLancamentoReserva monta o lançamento no formato do app", () => {
  const doc = docLancamentoReserva(BASE);
  assertEquals(doc.id, "lc_res_r1");
  assertEquals(doc.tipo, "entrada");
  assertEquals(doc.status, "previsto");
  assertEquals(doc.valor, 120);
  assertEquals(doc.mes, 8);
  assertEquals(doc.ano, 2026);
  assertEquals(doc.origem, "reserva");
  assertEquals(doc.reservaId, "r1");
  assertEquals(doc.descricao, "Reserva Sala Ouro · Ana");
  assertEquals(doc.subcategoria, "Aluguel de Sala de Reunião");
});

Deno.test("docLancamentoReserva conta o desconto do plano na descrição", () => {
  assertEquals(docLancamentoReserva({ ...BASE, descontoPct: 20 }).descricao, "Reserva Sala Ouro · Ana (−20% do plano)");
});

Deno.test("registrarLancamentoReserva não duplica: o mesmo id é reescrito", async () => {
  const admin = bancoFalso({ app_state: [] });
  await registrarLancamentoReserva(admin, BASE);
  await registrarLancamentoReserva(admin, BASE);                       // reentrega do webhook
  await registrarLancamentoReserva(admin, { ...BASE, status: "pago" }); // depois pagou
  assertEquals(admin.tabelas.app_state.length, 1);
  const linha = admin.tabelas.app_state[0] as Linha;
  assertEquals(linha.item_id, "lc_res_r1");
  assertEquals((linha.doc as Linha).status, "pago");
});

Deno.test("registrarLancamentoReserva ignora reserva sem valor", async () => {
  const admin = bancoFalso({ app_state: [] });
  assertEquals(await registrarLancamentoReserva(admin, { ...BASE, valor: 0 }), null);
  assertEquals(admin.tabelas.app_state.length, 0);
});

Deno.test("registrarLancamentoReserva pega a conta caixa da unidade", async () => {
  const admin = bancoFalso({
    app_state: [
      { unidade_id: "lux", entity: "contas", item_id: "cb1", doc: { id: "cb1", banco: "Inter" } },
      { unidade_id: "lux", entity: "contas", item_id: "cb2", doc: { id: "cb2", banco: "Caixa da loja" } },
    ],
  });
  const doc = await registrarLancamentoReserva(admin, BASE);
  assertEquals(doc?.contaId, "cb2");
});

Deno.test("removerLancamentoReserva tira só o lançamento da reserva", async () => {
  const admin = bancoFalso({ app_state: [] });
  await registrarLancamentoReserva(admin, BASE);
  await registrarLancamentoReserva(admin, { ...BASE, reservaId: "r2" });
  await removerLancamentoReserva(admin, "lux", "r1");
  assertEquals(admin.tabelas.app_state.length, 1);
  assertEquals((admin.tabelas.app_state[0] as Linha).item_id, "lc_res_r2");
});

Deno.test("decidirCancelamento: só fica no caixa o que de fato entrou", () => {
  assertEquals(decidirCancelamento(false, "nao_se_aplica"), "removido");
  assertEquals(decidirCancelamento(true, "automatico"), "removido");
  assertEquals(decidirCancelamento(true, "manual"), "mantido_pago");
});

Deno.test("ajustarLancamentoNoCancelamento apaga a receita da reserva não paga", async () => {
  const admin = bancoFalso({ app_state: [] });
  await registrarLancamentoReserva(admin, BASE);
  assertEquals(await ajustarLancamentoNoCancelamento(admin, "lux", "r1", false, "nao_se_aplica"), "removido");
  assertEquals(admin.tabelas.app_state.length, 0);

  await registrarLancamentoReserva(admin, { ...BASE, status: "pago" });
  assertEquals(await ajustarLancamentoNoCancelamento(admin, "lux", "r1", true, "manual"), "mantido_pago");
  assert(admin.tabelas.app_state.length === 1);
});
