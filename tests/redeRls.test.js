// Executa a migração REAL num Postgres WASM descartável; nunca usa .env ou rede.
// O bootstrap representa somente os contratos do schema anterior necessários.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const ids = { admin: '00000000-0000-4000-8000-000000000001', a: '00000000-0000-4000-8000-000000000002', b: '00000000-0000-4000-8000-000000000003', cliente: '00000000-0000-4000-8000-000000000004', recepcao: '00000000-0000-4000-8000-000000000005' };
test('Migração, ACL, RLS e workflow de unidade parceira em Postgres isolado', async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      create function auth.role() returns text language sql stable as $$select current_setting('test.role',true)$$;
      create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('email',current_setting('test.email',true))$$;
      grant usage on schema public,auth to authenticated,anon,service_role;
      grant execute on all functions in schema auth to authenticated,anon,service_role;
      create table public.platform_admins(user_id uuid);
      create table public.contas(id text primary key,tipo text,parceiro_status text,asaas_wallet_id text);
      create table public.unidades(id text primary key,franqueado_id text,ativa boolean default true,endereco text,cidade text);
      create table public.audit_logs(unidade_id text,ator_id uuid,acao text,entidade text,entidade_id text,detalhe jsonb);
      create table public.reservas(id text,unidade_id text,status text,start_at timestamptz,end_at timestamptz,updated_at timestamptz);
      create table public.unidade_members(user_id uuid,unidade_id text,role text);
      create table public.clientes(id text primary key,unidade_id text,email text);
      create table public.unidade_documentos(id uuid primary key default gen_random_uuid(),unidade_id text,tipo text,storage_path text,validade date);
      alter table public.unidade_documentos enable row level security;
      create function public.is_platform_admin() returns boolean language sql stable security definer as $$select exists(select 1 from public.platform_admins where user_id=auth.uid())$$;
      create function public.is_unidade_staff(p text) returns boolean language sql stable security definer as $$select exists(select 1 from public.unidade_members where user_id=auth.uid() and unidade_id=p and role<>'cliente')$$;
      create policy docs_select on public.unidade_documentos for select using(public.is_platform_admin() or public.is_unidade_staff(unidade_id));
      create policy docs_insert on public.unidade_documentos for insert with check(public.is_platform_admin() or public.is_unidade_staff(unidade_id));
      grant select,insert on public.unidade_documentos to authenticated;
      alter default privileges in schema public grant all on tables to anon,authenticated;
      alter default privileges in schema public grant execute on functions to anon,authenticated;
      insert into auth.users values ${Object.values(ids).map((id) => `('${id}')`).join(',')};
      insert into public.platform_admins values ('${ids.admin}');
      insert into public.contas values ('ca','parceiro','ativo','wallet-123'),('cb','parceiro','ativo','wallet-456'),('cw','propria',null,null);
      insert into public.unidades(id,franqueado_id,ativa) values ('ua','ca',true),('ub','cb',true),('lux','cw',true);
      insert into public.unidade_members values ('${ids.a}','ua','master'),('${ids.b}','ub','master'),('${ids.cliente}','ua','cliente'),('${ids.recepcao}','ua','recepcao');
      insert into public.clientes values ('cliente-a','ua','cliente@example.com'),('outro-a','ua','outro@example.com'),('cliente-b','ub','b@example.com');
      insert into public.reservas values ('ra','ua','confirmada',now()-interval '5 minutes',now()+interval '1 hour',now());
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/20260927120000_rede_unidades_experiencia.sql', import.meta.url), 'utf8'));
    const login = async (nome, role = 'authenticated') => {
      await db.exec('reset role');
      await db.query("select set_config('test.uid',$1,false),set_config('test.role',$2,false),set_config('test.email',$3,false)", [ids[nome] || '', role, nome === 'cliente' ? 'cliente@example.com' : `${nome}@example.com`]);
      await db.exec(`set role ${role}`);
    };
    const dados = { empresa: 'Escritório', responsavel: 'Operador', endereco: 'Rua 10', cidade: 'Cidade', uf: 'MG', bairro: 'Centro', horarios: '9–18', fotos: ['https://example.com/foto.jpg'], servicos: ['endereco_fiscal'], financeiroConferido: true };
    const salvar = (unidade, d = dados, enviar = false) => db.query('select public.salvar_perfil_parceiro($1,$2::jsonb,$3)', [unidade, JSON.stringify(d), enviar]);
    const enviar = (unidade, cliente) => db.query('select public.enviar_mensagem_unidade($1,$2,$3)', [unidade, cliente, 'Mensagem de teste']);
    await t.test('Parceiro A não cadastra unidade B, não aprova e não escreve diretamente', async () => {
      await login('a'); await salvar('ua');
      await assert.rejects(salvar('ub'), /Sem acesso/);
      await assert.rejects(db.query("update public.parceiro_unidade_perfis set status='publicado'"), /permission denied/);
      await assert.rejects(db.query("select public.revisar_perfil_parceiro('ua','publicado','')"), /Somente admin/);
      await assert.rejects(salvar('ua', { ...dados, fotos: ['javascript:alert(1)'] }, true), /HTTPS/);
      await assert.rejects(salvar('ua', { ...dados, servicos: ['inventado'] }, true), /Serviços inválidos/);
    });
    await t.test('Separação de perfis: B e cliente não leem onboarding de A', async () => {
      await login('b'); assert.equal((await db.query('select * from public.parceiro_unidade_perfis')).rows.length, 0);
      await login('cliente'); assert.equal((await db.query('select * from public.parceiro_unidade_perfis')).rows.length, 0);
      await assert.rejects(salvar('ua'), /Sem acesso/);
    });
    await t.test('Documentos: revisão administrativa obrigatória quando configurada', async () => {
      await login('a');
      await db.query("insert into public.unidade_documentos(unidade_id,tipo,storage_path,revisao_status) values ('ua','iptu','ua/iptu.pdf','aprovado')");
      assert.equal((await db.query('select revisao_status from public.unidade_documentos')).rows[0].revisao_status, 'pendente');
      await db.query("update public.unidade_documentos set revisao_status='aprovado'");
      assert.equal((await db.query('select revisao_status from public.unidade_documentos')).rows[0].revisao_status, 'pendente');
      await salvar('ua', dados, true);
      await login('admin');
      await db.query("select public.configurar_requisito_parceiro('iptu',true,true)");
      await assert.rejects(db.query("select public.revisar_perfil_parceiro('ua','publicado','')"), /documentos obrigatórios/);
      await db.query("update public.unidade_documentos set revisao_status='aprovado' where unidade_id='ua'");
      await db.query("select public.revisar_perfil_parceiro('ua','publicado','Conferido')");
      await login('admin','service_role');
      assert.equal((await db.query("select public.unidade_publicavel('ua') ok")).rows[0].ok, true);
      assert.equal((await db.query("select public.servico_publicavel('ua','endereco_fiscal') ok")).rows[0].ok, true);
      assert.equal((await db.query("select public.servico_publicavel('ua','sala_hora') ok")).rows[0].ok, false);
      await db.exec('reset role');
      await db.query("update public.unidade_documentos set validade=current_date-1 where unidade_id='ua'");
      await login('admin','service_role');
      assert.equal((await db.query("select public.unidade_publicavel('ua') ok")).rows[0].ok, false);
      await db.exec('reset role');
      await db.query("update public.unidade_documentos set validade=null where unidade_id='ua'");
      await login('admin','service_role');
      assert.equal((await db.query("select public.unidade_publicavel('ub') ok")).rows[0].ok, false);
      assert.equal((await db.query("select public.unidade_publicavel('lux') ok")).rows[0].ok, true);
      await login('a'); await salvar('ua');
      await login('admin','service_role');
      assert.equal((await db.query("select public.unidade_publicavel('ua') ok")).rows[0].ok, false);
    });
    await t.test('Chat: cliente próprio, equipe local e supervisão; sem spoofing ou mutação', async () => {
      await login('cliente'); await enviar('ua','cliente-a');
      await assert.rejects(enviar('ua','outro-a'), /Sem acesso/);
      await assert.rejects(enviar('ub','cliente-b'), /Sem acesso/);
      await assert.rejects(enviar('ub','cliente-a'), /Sem acesso/);
      await login('a'); await enviar('ua','cliente-a');
      await assert.rejects(db.query("insert into public.unidade_mensagens(unidade_id,cliente_id,autor_papel,texto) values('ua','cliente-a','admin','Forjada')"), /permission denied/);
      await assert.rejects(db.query('delete from public.unidade_mensagens'), /permission denied/);
      await login('b'); assert.equal((await db.query('select * from public.unidade_mensagens')).rows.length, 0);
      await login('recepcao'); assert.equal((await db.query('select * from public.unidade_mensagens')).rows.length, 2);
      await login('admin'); await enviar('ua','cliente-a');
      await login('cliente');
      assert.deepEqual((await db.query('select autor_papel from public.unidade_mensagens order by created_at')).rows.map((r) => r.autor_papel), ['cliente','unidade','admin']);
    });
    await t.test('Anônimo não lê nem invoca RPCs privadas', async () => {
      await login('', 'anon');
      await assert.rejects(db.query('select * from public.parceiro_unidade_perfis'), /permission denied/);
      await assert.rejects(db.query('select * from public.unidade_mensagens'), /permission denied/);
      await assert.rejects(enviar('ua','cliente-a'), /permission denied/);
    });
    await t.test('Check-in e saída só pela equipe local, sem alterar pagamento', async () => {
      await login('b'); await assert.rejects(db.query("select public.presenca_reserva_parceira('ra','checkin')"), /Sem acesso/);
      await login('cliente'); await assert.rejects(db.query("select public.presenca_reserva_parceira('ra','checkin')"), /Sem acesso/);
      await login('a');
      await assert.rejects(db.query("select public.presenca_reserva_parceira('ra','concluida')"), /Transição inválida/);
      await db.query("select public.presenca_reserva_parceira('ra','checkin')");
      await db.query("select public.presenca_reserva_parceira('ra','concluida')");
      await assert.rejects(db.query("select public.presenca_reserva_parceira('ra','checkin')"), /Transição inválida/);
    });
  } finally { await db.close(); }
});
