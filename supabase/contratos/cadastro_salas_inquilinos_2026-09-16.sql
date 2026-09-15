-- ============================================================================
-- Inquilinos das salas privativas do Luxemburgo conferidos com o Diego (16/09/2026):
--   4 lugares: Sion (Ciatos Soluções) alugada; Savassi, Lourdes e Serra livres
--   5 lugares: Belvedere (Ciatos Contabilidade), Mangabeiras (Garcia, Oliveira e Silva = Ciatos Jurídico)
--   6 lugares: Funcionários (Notare)   7 lugares: Santa Tereza (BD Transporte)
-- A Pampulha tinha sido criada só para completar 3 livres: sai.
-- Aplicado em produção.
-- ============================================================================

begin;

-- Pampulha só sai se nada aponta para ela
do $$
begin
  if exists (select 1 from public.assinaturas where sala_id = 's_lux_privativa_7')
     or exists (select 1 from public.pending_signups where sala_id = 's_lux_privativa_7')
     or exists (select 1 from public.reservas where sala_id = 's_lux_privativa_7') then
    raise exception 'A sala Pampulha já tem uso registrado; não apagar.';
  end if;
end $$;
delete from public.app_state where entity = 'salas' and unidade_id = 'un_cafeworkingluxembu_e78be3' and item_id = 's_lux_privativa_7';
delete from public.salas where id = 's_lux_privativa_7';

-- Serra: livre, à venda por R$ 2.200
update public.salas set contratada = false, valor_mensal = 2200 where id = 's1782410118483';
update public.app_state
set doc = doc || '{"contratada": false, "contratante": "", "valorMensal": 2200, "valor": "R$ 2.200/mês"}'::jsonb
where entity = 'salas' and unidade_id = 'un_cafeworkingluxembu_e78be3' and item_id = 's1782410118483';

-- Belvedere: Ciatos Contabilidade (antes constava a Notare, que está na Funcionários)
update public.app_state
set doc = doc || '{"contratada": true, "contratante": "CIATOS CONTABILIDADE LTDA"}'::jsonb
where entity = 'salas' and unidade_id = 'un_cafeworkingluxembu_e78be3' and item_id = 's1782420821947';

select s.nome, s.capacidade, s.contratada, a.doc->>'contratante' as contratante
from public.salas s join public.app_state a on a.entity = 'salas' and a.item_id = s.id
where s.unidade_id = 'un_cafeworkingluxembu_e78be3' and s.tipo = 'Privativa' order by s.capacidade, s.nome;

commit;
