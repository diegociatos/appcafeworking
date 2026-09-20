import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { processarRetornos, tokenRetornosValido } from './crmRetornos.ts';

function banco(opcoes: { acesso?: boolean; inativo?: boolean; fechado?: boolean; falhaGravar?: boolean } = {}) {
  let retirada = false;
  const updates: Record<string, unknown>[] = [];
  const filtros: string[][] = [];
  const retorno = { id:'r1',unidade_id:'lux',lead_id:'l1',comentario_id:'c1',responsavel_id:'u1',agendado_para:'2026-09-18T12:00:00Z' };
  const admin = {
    rpc: () => { const data = retirada ? [] : [retorno]; retirada=true; return Promise.resolve({data,error:null}); },
    auth: { admin: { getUserById: (id: string) => {
      assertEquals(id,'u1'); return Promise.resolve({data:{user:{email:'responsavel@example.com'}},error:null});
    } } },
    from: (table: string) => {
      const consulta = {
        select: () => consulta,
        eq: (col: string,valor: string) => { filtros.push([table,col,valor]); return consulta; },
        neq: (col: string,valor: string) => { filtros.push([table,col,valor]); return consulta; },
        update: (valor: Record<string,unknown>) => { updates.push(valor); return consulta; },
        maybeSingle: () => Promise.resolve(table==='app_state' ? {data:{doc:{nome:'Gabriela',email:'cliente@example.com',etapa:opcoes.fechado?'fechado':'contato'}},error:null} : {data:{texto:'Conversamos sobre sala privativa.',autor_nome:'Ana'},error:null}),
        then: (resolver: (v: unknown) => unknown) => resolver({data: table==='unidade_members' ? (opcoes.acesso===false?[]:[{user_id:'u1'}]) : table==='usuarios' ? [{ativo:!opcoes.inativo}] : [], error:table==='crm_retornos' && opcoes.falhaGravar ? new Error('rede'):null}),
      };
      return consulta;
    },
  } as unknown as SupabaseClient;
  return { admin, updates, filtros };
}

Deno.test('cron exige token configurado; token vazio nunca autoriza',()=>{
  assertEquals(tokenRetornosValido(null,''),false);
  assertEquals(tokenRetornosValido('',''),false);
  assertEquals(tokenRetornosValido('x'.repeat(32),'x'.repeat(32)),true);
  assertEquals(tokenRetornosValido('y'.repeat(32),'x'.repeat(32)),false);
});
Deno.test('lembrete vai ao responsável; execução repetida não envia novamente',async()=>{
  const b=banco(); let enviados=0;
  const enviar: Parameters<typeof processarRetornos>[2] = async (_admin,opts) => {
    enviados++; assertEquals(opts.email,'responsavel@example.com'); assertEquals(opts.unidade_id,'lux');
    assertEquals(opts.evento,'aviso_equipe'); assertEquals(opts.dados?.retorno_id,'r1');
    assertEquals(opts.dados?.link,'https://app.example.com/?p=crm'); return {ok:true};
  };
  assertEquals(await processarRetornos(b.admin,'https://app.example.com',enviar),{enviados:1,erros:0,cancelados:0});
  await processarRetornos(b.admin,'https://app.example.com',enviar);
  assertEquals(enviados,1); assertEquals(b.updates[0].status,'enviado');
  assertEquals(b.filtros.some(f=>f.join(':')==='unidade_members:unidade_id:lux'),true);
  assertEquals(b.filtros.some(f=>f.join(':')==='unidade_members:role:cliente'),true);
});
Deno.test('responsável sem acesso ou inativo não recebe dados do cliente',async()=>{
  for(const opcoes of [{acesso:false},{inativo:true}]){
    const b=banco(opcoes); let envios=0;
    assertEquals((await processarRetornos(b.admin,'https://app.example.com',()=>{envios++;return Promise.resolve({ok:true});})).erros,1);
    assertEquals(envios,0); assertEquals(b.updates[0].status,'erro');
  }
});
Deno.test('lead fechado cancela lembrete sem enviar',async()=>{
  const b=banco({fechado:true}); let envios=0;
  assertEquals((await processarRetornos(b.admin,'https://app.example.com',()=>{envios++;return Promise.resolve({ok:true});})).cancelados,1);
  assertEquals(envios,0);assertEquals(b.updates[0].status,'cancelado');
});
Deno.test('falha de provedor é registrada; não é reenviada automaticamente',async()=>{
  const b=banco(); let envios=0;
  const enviar=()=>{envios++;return Promise.resolve({ok:false,erro:'recusado'});};
  await processarRetornos(b.admin,'https://app.example.com',enviar);
  await processarRetornos(b.admin,'https://app.example.com',enviar);
  assertEquals(envios,1);assertEquals(b.updates[0].status,'erro');
});
Deno.test('falha de gravação após envio não autoriza um novo envio',async()=>{
  const b=banco({falhaGravar:true});let envios=0;
  const enviar=()=>{envios++;return Promise.resolve({ok:true});};
  assertEquals((await processarRetornos(b.admin,'https://app.example.com',enviar)).erros,1);
  await processarRetornos(b.admin,'https://app.example.com',enviar);
  assertEquals(envios,1);
});
