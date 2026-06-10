-- ============================================================================
-- CafeWorking · Restaura os GRANTs do service_role (padrão Supabase)
--
-- As tabelas foram criadas via SQL Editor (setup manual) e o role
-- `service_role` ficou sem privilégios de tabela em algumas delas
-- (PostgREST devolvia 42501 "permission denied"). Aqui devolvemos o acesso
-- total ao service_role (role do backend; o RLS não se aplica a ele), como é
-- o padrão de um projeto Supabase. Não muda nada para usuários normais.
-- ============================================================================

grant usage on schema public to service_role, anon, authenticated;

grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all functions in schema public to service_role;

-- Tabelas futuras já nascem acessíveis ao service_role.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;
