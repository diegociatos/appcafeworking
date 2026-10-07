-- Marca, no cadastro do cliente, se ele terá contrato (recorrente/plano) ou se
-- é uso avulso (pontual). Serve para a equipe separar os dois na aba Clientes.
-- Idempotente; aplicar antes de publicar o frontend. Default 'contrato' para os
-- clientes que já existem (a maioria tem plano/contrato).
alter table public.clientes
  add column if not exists vinculo text not null default 'contrato';

alter table public.clientes drop constraint if exists clientes_vinculo_valido;
alter table public.clientes
  add constraint clientes_vinculo_valido check (vinculo in ('contrato', 'avulso'));

comment on column public.clientes.vinculo is
  'contrato = cliente com plano/contrato recorrente; avulso = uso pontual. Definido no cadastro pela equipe.';
