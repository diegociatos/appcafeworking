import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import { MSG_SO_FINANCEIRO, papelDoFinanceiro, podeMexerNoDinheiro, recusaSemFinanceiro } from "./permissoes.ts";

Deno.test("dinheiro: só master e financeiro", () => {
  assert(papelDoFinanceiro("master"));
  assert(papelDoFinanceiro("financeiro"));
  assertFalse(papelDoFinanceiro("recepcao"));
  assertFalse(papelDoFinanceiro("contabilidade"));
  assertFalse(papelDoFinanceiro("cliente"));
  assertFalse(papelDoFinanceiro(undefined));
});

// Imitação mínima do supabase-js: devolve as linhas pedidas por tabela.
function adminFalso(tabelas: Record<string, Record<string, unknown>[]>) {
  return {
    from(tabela: string) {
      const filtros: Record<string, unknown> = {};
      const q = {
        select: () => q,
        eq: (col: string, val: unknown) => { filtros[col] = val; return q; },
        linhas: () => (tabelas[tabela] || []).filter((l) => Object.entries(filtros).every(([k, v]) => l[k] === v)),
        maybeSingle: () => Promise.resolve({ data: q.linhas()[0] ?? null }),
        then: (ok: (r: { data: unknown[] }) => unknown) => Promise.resolve({ data: q.linhas() }).then(ok),
      };
      return q;
    },
  } as any;
}

Deno.test("podeMexerNoDinheiro: admin da plataforma, master/financeiro da unidade; recepção e contabilidade não", async () => {
  const admin = adminFalso({
    platform_admins: [{ user_id: "adm" }],
    unidade_members: [
      { user_id: "fin", unidade_id: "u1", role: "financeiro" },
      { user_id: "mst", unidade_id: "u1", role: "master" },
      { user_id: "rec", unidade_id: "u1", role: "recepcao" },
      { user_id: "cont", unidade_id: "u1", role: "contabilidade" },
      { user_id: "mix", unidade_id: "u1", role: "recepcao" },
      { user_id: "mix", unidade_id: "u2", role: "financeiro" },
    ],
  });
  assert(await podeMexerNoDinheiro(admin, "adm", "u1"));
  assert(await podeMexerNoDinheiro(admin, "fin", "u1"));
  assert(await podeMexerNoDinheiro(admin, "mst", "u1"));
  assertFalse(await podeMexerNoDinheiro(admin, "rec", "u1"));
  assertFalse(await podeMexerNoDinheiro(admin, "cont", "u1"));
  assertFalse(await podeMexerNoDinheiro(admin, "fin", "u2"));
  assertFalse(await podeMexerNoDinheiro(admin, "mix", "u1"));
  assert(await podeMexerNoDinheiro(admin, "mix", "u2"));
  assertFalse(await podeMexerNoDinheiro(admin, null, "u1"));
});

Deno.test("recusa: 403 com mensagem humana", async () => {
  const r = recusaSemFinanceiro("Emitir nota fiscal");
  assertEquals(r.status, 403);
  const corpo = await r.json();
  assertEquals(corpo.codigo, "SO_FINANCEIRO");
  assertEquals(corpo.error, "Emitir nota fiscal: só o master ou o financeiro da unidade pode fazer isso. Peça a alguém do financeiro.");
  assertEquals((await recusaSemFinanceiro().json()).error, MSG_SO_FINANCEIRO);
});
