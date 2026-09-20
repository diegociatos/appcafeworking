import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// PostgreSQL em memória. Auth e tabelas anteriores são fixtures mínimas;
// as tabelas, policies e RPCs do CRM são a migration real, sem reimplementação.
test('CRM: migration, autoria, isolamento e fila no PostgreSQL',async t=>{
  const pg=new PGlite();
  const ana='00000000-0000-0000-0000-000000000001';
  const bruno='00000000-0000-0000-0000-000000000002';
  const cliente='00000000-0000-0000-0000-000000000003';
  const externo='00000000-0000-0000-0000-000000000004';
  try {
    await pg.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table public.unidades(id text primary key);
      create table public.unidade_members(user_id uuid,unidade_id text,role text);
      create table public.platform_admins(user_id uuid);
      create table public.app_state(unidade_id text,entity text,item_id text,doc jsonb,primary key(unidade_id,entity,item_id));
      create function public.is_platform_admin() returns boolean language sql security definer stable as $$ select exists(select 1 from public.platform_admins where user_id=auth.uid()) $$;
      create function public.is_unidade_staff(p_unidade_id text) returns boolean language sql security definer stable as $$ select exists(select 1 from public.unidade_members where user_id=auth.uid() and unidade_id=p_unidade_id and role<>'cliente') $$;
      grant usage on schema public,auth to authenticated,anon,service_role;
      insert into public.unidades values('lux'),('outra');
      insert into auth.users values
        ('${ana}','ana@example.com','{"nome":"Ana"}'),('${bruno}','bruno@example.com','{"nome":"Bruno"}'),
        ('${cliente}','cliente@example.com','{}'),('${externo}','externo@example.com','{}');
      insert into public.unidade_members values ('${ana}','lux','recepcao'),('${bruno}','lux','master'),('${cliente}','lux','cliente'),('${externo}','outra','recepcao');
      insert into public.app_state values('lux','leads','l1','{"nome":"Gabriela"}'),('outra','leads','l2','{"nome":"Outro lead"}');
    `);
    await pg.exec(await readFile(new URL('../supabase/migrations/20260926120000_crm_atendimentos.sql',import.meta.url),'utf8'));
    const login=async(id,role='authenticated')=>{
      await pg.exec('reset role'); await pg.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
      await pg.exec(`set role ${role}`);
    };
    const rpc=(acao,texto=null,data=null,id=null,unidade='lux',lead='l1')=>pg.query('select public.crm_registrar_atendimento($1,$2,$3,$4,$5,$6)',[unidade,lead,acao,texto,data,id]);
    let retornoId;
    await t.test('usuário assume; nome e data são do banco e outro usuário não sobrescreve',async()=>{
      await login(ana);await rpc('assumir');await rpc('assumir');
      const {rows}=await pg.query('select * from crm_atendimentos');
      assert.equal(rows.length,1);assert.equal(rows[0].responsavel_nome,'Ana');assert.equal(rows[0].responsavel_id,ana);assert.ok(rows[0].assumido_em);
      await login(bruno);await assert.rejects(rpc('assumir'),/outro usuário/);
    });
    await t.test('comentário tem autor real e retorno vai ao responsável, mesmo com outro autor',async()=>{
      const futura=new Date(Date.now()+3600000).toISOString();
      await rpc('comentar','Falamos sobre sala privativa.',futura);
      const comentario=(await pg.query('select * from crm_comentarios')).rows[0];
      assert.equal(comentario.autor_id,bruno);assert.equal(comentario.autor_nome,'Bruno');assert.ok(comentario.created_at);
      const retorno=(await pg.query('select * from crm_retornos')).rows[0];retornoId=retorno.id;
      assert.equal(retorno.responsavel_id,ana);assert.equal(retorno.comentario_id,comentario.id);
    });
    await t.test('retorno inválido ou duplicado não salva comentário parcial',async()=>{
      await assert.rejects(rpc('comentar','Passado','2020-01-01'),/futuro/);
      await assert.rejects(rpc('comentar','Duplicado',new Date(Date.now()+7200000).toISOString()),/pendente/);
      assert.equal((await pg.query('select count(*)::int as n from crm_comentarios')).rows[0].n,1);
    });
    await t.test('cliente e equipe de outra unidade não leem nem operam o histórico',async()=>{
      for(const id of [cliente,externo]){
        await login(id);
        assert.equal((await pg.query('select * from crm_comentarios')).rows.length,0);
        assert.equal((await pg.query('select * from crm_atendimentos')).rows.length,0);
        assert.equal((await pg.query('select * from crm_retornos')).rows.length,0);
        await assert.rejects(rpc('comentar','Sem permissão'),/permissão/);
      }
    });
    await t.test('autoria e histórico não podem ser alterados por escrita direta',async()=>{
      await login(ana);
      await assert.rejects(pg.query("update crm_comentarios set autor_nome='Outro'"),/permission denied/);
      await assert.rejects(pg.query('delete from crm_atendimentos'),/permission denied/);
      await assert.rejects(pg.query('select * from crm_retirar_retornos()'),/permission denied/);
    });
    await t.test('edição antiga do card não apaga histórico de atendimento',async()=>{
      await pg.exec('reset role');await pg.query("update app_state set doc='{}' where unidade_id='lux' and item_id='l1'");
      assert.equal((await pg.query('select count(*)::int as n from crm_comentarios')).rows[0].n,1);
    });
    await t.test('fila só retira vencidos e segunda retirada não duplica',async()=>{
      await pg.query("update crm_retornos set agendado_para=now()-interval '1 minute' where id=$1",[retornoId]);
      await pg.exec('set role service_role');
      const lote=(await pg.query('select * from crm_retirar_retornos()')).rows;
      assert.equal(lote.length,1);assert.equal(lote[0].status,'processando');
      assert.equal((await pg.query('select * from crm_retirar_retornos()')).rows.length,0);
    });
    await t.test('conclusão/cancelamento respeita estado e unidade do retorno',async()=>{
      await login(ana);await assert.rejects(rpc('concluir',null,null,retornoId),/processamento/);
      await pg.exec('reset role');await pg.query("update crm_retornos set status='enviado' where id=$1",[retornoId]);
      await login(ana);await rpc('concluir',null,null,retornoId);
      assert.equal((await pg.query('select status from crm_retornos')).rows[0].status,'concluido');
      await assert.rejects(rpc('cancelar',null,null,retornoId),/não encontrado/);
    });
    await t.test('lead inexistente e chamada anônima não criam atendimento',async()=>{
      await login(ana);await assert.rejects(rpc('assumir',null,null,null,'lux','inexistente'),/não encontrado/);
      await login('', 'anon');await assert.rejects(rpc('assumir'),/permission denied/);
    });
  } finally { await pg.close(); }
});
