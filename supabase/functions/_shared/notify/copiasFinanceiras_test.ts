import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { enviarCopiasFinanceiras } from "./index.ts";

Deno.test("cópias consultam somente a unidade e o email exato, sem ampliar login", async () => {
  const filtros: unknown[] = [], envios: unknown[] = [];
  const query = {
    select() { return this; }, eq(k: string, v: string) { filtros.push([k,v]); return this; },
    ilike(k: string, v: string) { filtros.push([k,v]); return this; },
    limit(n: number) { assertEquals(n,2); return Promise.resolve({ data:[{emails_adicionais:['financeiro@example.com','FINANCEIRO@example.com']}], error:null }); },
  };
  const admin = { from(t: string) { assertEquals(t,'clientes'); return query; } } as unknown as Parameters<typeof enviarCopiasFinanceiras>[0];
  await enviarCopiasFinanceiras(admin, { unidade_id:'u1', evento:'nfse_emitida', email:'nome_teste@example.com' }, async (_admin, opts) => { envios.push(opts); return {ok:true}; });
  assertEquals(filtros, [['unidade_id','u1'],['email','nome\\_teste@example.com']]);
  assertEquals(envios, [{unidade_id:'u1',evento:'nfse_emitida',email:'financeiro@example.com',canal:'email',copiaFinanceira:true}]);
});
Deno.test("cadastro ambíguo ou coluna ainda ausente não expande destinatários", async () => {
  for (const resposta of [{data:[{},{}],error:null}, {data:null,error:{message:'coluna ausente'}}]) {
    const query = { select(){return this;},eq(){return this;},ilike(){return this;},limit(){return Promise.resolve(resposta);} };
    const admin = {from(){return query;}} as unknown as Parameters<typeof enviarCopiasFinanceiras>[0];
    let envios = 0;
    await enviarCopiasFinanceiras(admin, {unidade_id:'u1',evento:'boleto_nova',email:'a@example.com'}, async () => {envios++;return {ok:true};});
    assertEquals(envios,0);
  }
});
