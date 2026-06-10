-- ============================================================================
-- CafeWorking · GRANTs para anon e authenticated (padrão Supabase)
--
-- As tabelas foram criadas via SQL Editor (setup manual) e os roles `anon` e
-- `authenticated` ficaram SEM privilégios de tabela → toda query do app pelo
-- PostgREST devolvia 403 (permission denied). O app mascarava isso mostrando o
-- seed. Aqui devolvemos os GRANTs padrão. O RLS (habilitado em todas as
-- tabelas) continua sendo a camada de segurança — o GRANT só permite o acesso,
-- as policies decidem o que cada um vê.
-- ============================================================================

grant usage on schema public to anon, authenticated;

grant all privileges on all tables in schema public to anon, authenticated;
grant all privileges on all sequences in schema public to anon, authenticated;
grant all privileges on all functions in schema public to anon, authenticated;

alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
