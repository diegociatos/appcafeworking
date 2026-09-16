-- Endereço da unidade Luxemburgo sem acento e com vírgula sobrando ("Rua Guaicui, 715, Luxemburgo,  · Belo Horizonte/MG").
-- Aparece para o cliente na abertura de empresa e no endereço fiscal. Aplicado em produção em 16/09/2026.
update public.unidades
set endereco = 'Rua Guaicuí, 715, Luxemburgo · Belo Horizonte/MG'
where id = 'un_cafeworkingluxembu_e78be3' and endereco like 'Rua Guaicui, 715, Luxemburgo,%';

select id, endereco from public.unidades order by id;
