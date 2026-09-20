-- Contatos financeiros adicionais; NÃO são identidades de acesso ao portal.
-- Aplicar antes de publicar o frontend. Não altera dados ou policies existentes.
alter table public.clientes add column if not exists emails_adicionais text[] not null default '{}';
alter table public.clientes drop constraint if exists clientes_emails_adicionais_limite;
alter table public.clientes add constraint clientes_emails_adicionais_limite check (cardinality(emails_adicionais) <= 10);
comment on column public.clientes.emails_adicionais is 'Cópias financeiras cadastradas pela equipe. Não concedem acesso, login ou recuperação de senha.';
