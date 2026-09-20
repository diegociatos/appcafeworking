-- Contatos financeiros adicionais; NÃO são identidades de acesso ao portal.
-- Aplicar antes de publicar o frontend. Não altera dados ou policies existentes.
alter table public.clientes add column if not exists emails_adicionais text[] not null default '{}';

-- Produção recebeu esta coluna como jsonb, fora do controle de migrations.
-- Converte para text[] copiando o conteúdo antes de trocar (USING não aceita
-- subconsulta, por isso a coluna nova + update + rename).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clientes'
      and column_name = 'emails_adicionais' and data_type = 'jsonb'
  ) then
    alter table public.clientes add column emails_adicionais_txt text[] not null default '{}';
    update public.clientes set emails_adicionais_txt =
      coalesce((select array_agg(v) from jsonb_array_elements_text(emails_adicionais) v), '{}')
      where jsonb_typeof(emails_adicionais) = 'array';
    alter table public.clientes drop column emails_adicionais;
    alter table public.clientes rename column emails_adicionais_txt to emails_adicionais;
  end if;
end $$;

alter table public.clientes drop constraint if exists clientes_emails_adicionais_limite;
alter table public.clientes add constraint clientes_emails_adicionais_limite check (cardinality(emails_adicionais) <= 10);
comment on column public.clientes.emails_adicionais is 'Cópias financeiras cadastradas pela equipe. Não concedem acesso, login ou recuperação de senha.';
