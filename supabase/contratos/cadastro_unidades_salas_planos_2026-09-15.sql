-- ============================================================================
-- Cadastro de 15/09/2026 (pedido do Diego): salas do Luxemburgo com preço e
-- reserva online, planos de coworking e sala privativa, unidade Estoril com
-- endereço fiscal e salas todas alugadas.
--
-- Salas vivem em DOIS lugares: app_state (doc do app) e a tabela salas (usada
-- pelo site). O app regrava a tabela a partir do doc ao hidratar, então os dois
-- são atualizados juntos. Tudo numa transação.
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- 1) Luxemburgo: privativas 3 e 4 com R$ 2.200/mês; salas de reunião no site
-- ---------------------------------------------------------------------------
update public.app_state
set doc = doc || '{"valorMensal": 2200, "valor": "R$ 2.200/mês"}'::jsonb
where entity = 'salas' and unidade_id = 'un_cafeworkingluxembu_e78be3'
  and item_id in ('s1782420700809', 's1782420735937');
update public.salas set valor_mensal = 2200
where id in ('s1782420700809', 's1782420735937');

update public.app_state
set doc = doc || '{"reservaOnline": true}'::jsonb
where entity = 'salas' and unidade_id = 'un_cafeworkingluxembu_e78be3'
  and item_id in ('s1788469794625', 's1788469826712', 's1788469697369');
update public.salas set reserva_online = true
where id in ('s1788469794625', 's1788469826712', 's1788469697369');

-- Luxemburgo com cidade (o seletor público mostrava "Outra")
update public.unidades set cidade = 'Belo Horizonte' where id = 'un_cafeworkingluxembu_e78be3' and cidade is null;

-- ---------------------------------------------------------------------------
-- 2) Luxemburgo: planos de coworking (tabela do Diego) e sala privativa 4 lugares
-- ---------------------------------------------------------------------------
insert into public.app_state (unidade_id, entity, item_id, doc)
select 'un_cafeworkingluxembu_e78be3', 'planos', p->>'id', p
from jsonb_array_elements($json$[
  {"id": "pl_site_cow_turno", "nome": "Plano Turno", "preco": 390, "ordem": 1, "destaque": "",
   "descricao": "Meio período, manhã ou tarde, com turno fixo",
   "beneficios": ["Meio período: manhã ou tarde (turno fixo)", "Até 5h por dia", "Área comum e Wi-Fi", "1 café por dia", "Acesso a eventos"],
   "direitos": {"horasReuniao": 0, "horasCoworking": 0, "dayPass": 0, "correspondencias": 0, "cafeIncluso": true, "descontoSala": 0, "descontoCafe": 0}},
  {"id": "pl_site_cow_flex", "nome": "Plano Flex", "preco": 550, "ordem": 2, "destaque": "",
   "descricao": "Meio período com horas de sala, impressões e consultoria",
   "beneficios": ["Meio período: manhã ou tarde (turno fixo)", "Até 5h por dia", "2h/mês de sala de reunião", "20 impressões/mês", "1h/mês de consultoria Ciatos", "10% de desconto em eventos"],
   "direitos": {"horasReuniao": 2, "horasCoworking": 0, "dayPass": 0, "correspondencias": 0, "cafeIncluso": true, "descontoSala": 0, "descontoCafe": 0}},
  {"id": "pl_site_cow_diario", "nome": "Plano Diário", "preco": 750, "ordem": 3, "destaque": "Mais procurado",
   "descricao": "Todos os dias, das 8h às 18h, com mesa fixa",
   "beneficios": ["Segunda a sexta, das 8h às 18h", "Mesa fixa reservada", "4h/mês de sala de reunião", "30 impressões/mês", "1h/mês de consultoria Ciatos", "1 café por dia", "10% de desconto em eventos"],
   "direitos": {"horasReuniao": 4, "horasCoworking": 0, "dayPass": 0, "correspondencias": 0, "cafeIncluso": true, "descontoSala": 0, "descontoCafe": 0}},
  {"id": "pl_site_cow_full", "nome": "Plano Full", "preco": 890, "ordem": 4, "destaque": "",
   "descricao": "Dia inteiro com mesa fixa e suporte prioritário",
   "beneficios": ["Dia inteiro, até 10h por dia", "Mesa fixa reservada", "6h/mês de sala de reunião", "2 cafés por dia", "50 impressões/mês", "1h/mês de consultoria Ciatos", "15% de desconto e prioridade em eventos", "Suporte prioritário"],
   "direitos": {"horasReuniao": 6, "horasCoworking": 0, "dayPass": 0, "correspondencias": 0, "cafeIncluso": true, "descontoSala": 0, "descontoCafe": 0}},
  {"id": "pl_site_cow_empresarial", "nome": "Plano Empresarial", "preco": 1290, "ordem": 5, "destaque": "",
   "descricao": "Acesso ilimitado com mesa fixa, locker e suporte dedicado",
   "beneficios": ["Acesso ilimitado, até 10h por dia", "Mesa fixa + locker", "10h/mês de sala de reunião", "3 cafés por dia", "100 impressões/mês", "2h/mês de consultoria Ciatos", "20% de desconto e acesso VIP em eventos", "Suporte dedicado"],
   "direitos": {"horasReuniao": 10, "horasCoworking": 0, "dayPass": 0, "correspondencias": 0, "cafeIncluso": true, "descontoSala": 0, "descontoCafe": 0}}
]$json$::jsonb) as p
on conflict (unidade_id, entity, item_id) do nothing;

update public.app_state
set doc = doc || jsonb_build_object(
  'unidadeId', unidade_id, 'recorrencia', 'mensal', 'emiteNF', true, 'ativo', true,
  'categoria', 'coworking', 'venderNoSite', true, 'sobConsulta', false, 'prazoMinimoMeses', 0)
where entity = 'planos' and unidade_id = 'un_cafeworkingluxembu_e78be3' and item_id like 'pl_site_cow_%'
  and not (doc ? 'categoria');

insert into public.app_state (unidade_id, entity, item_id, doc) values
  ('un_cafeworkingluxembu_e78be3', 'planos', 'pl_site_privativa_4', $json${
    "id": "pl_site_privativa_4", "unidadeId": "un_cafeworkingluxembu_e78be3",
    "nome": "Sala privativa para 4 pessoas", "preco": 2200, "recorrencia": "mensal", "emiteNF": true, "ativo": true,
    "descricao": "Escritório fechado e mobiliado para até 4 pessoas",
    "categoria": "sala_privativa", "venderNoSite": true, "sobConsulta": false, "destaque": "",
    "capacidade": 4,
    "beneficios": ["Sala exclusiva para até 4 pessoas", "Mobiliada, com ar-condicionado", "Internet, limpeza e recepção", "Área comum e cafeteria", "Sala entregue em até 5 dias úteis"],
    "prazoMinimoMeses": 0, "ordem": 1,
    "direitos": {"horasReuniao": 0, "horasCoworking": 0, "dayPass": 0, "correspondencias": 0, "cafeIncluso": false, "descontoSala": 0, "descontoCafe": 0}
  }$json$::jsonb),
  -- avulsos da sala compartilhada: cadastrados, ainda fora do site
  ('un_cafeworkingluxembu_e78be3', 'planos', 'pl_cow_daypass', $json${
    "id": "pl_cow_daypass", "unidadeId": "un_cafeworkingluxembu_e78be3", "nome": "Day pass (sala compartilhada)",
    "preco": 85, "recorrencia": "avulso", "emiteNF": true, "ativo": true, "descricao": "Uso da sala compartilhada por um dia",
    "categoria": "coworking", "venderNoSite": false, "sobConsulta": false, "destaque": "", "beneficios": [], "prazoMinimoMeses": 0, "ordem": 10,
    "direitos": {"horasReuniao": 0, "horasCoworking": 0, "dayPass": 1, "correspondencias": 0, "cafeIncluso": false, "descontoSala": 0, "descontoCafe": 0}
  }$json$::jsonb),
  ('un_cafeworkingluxembu_e78be3', 'planos', 'pl_cow_diaria', $json${
    "id": "pl_cow_diaria", "unidadeId": "un_cafeworkingluxembu_e78be3", "nome": "Diária (sala compartilhada)",
    "preco": 65, "recorrencia": "avulso", "emiteNF": true, "ativo": true, "descricao": "Diária da sala compartilhada",
    "categoria": "coworking", "venderNoSite": false, "sobConsulta": false, "destaque": "", "beneficios": [], "prazoMinimoMeses": 0, "ordem": 11,
    "direitos": {"horasReuniao": 0, "horasCoworking": 0, "dayPass": 0, "correspondencias": 0, "cafeIncluso": false, "descontoSala": 0, "descontoCafe": 0}
  }$json$::jsonb),
  ('un_cafeworkingluxembu_e78be3', 'planos', 'pl_cow_hora', $json${
    "id": "pl_cow_hora", "unidadeId": "un_cafeworkingluxembu_e78be3", "nome": "Hora avulsa (sala compartilhada)",
    "preco": 20, "recorrencia": "avulso", "emiteNF": true, "ativo": true, "descricao": "Uma hora na sala compartilhada",
    "categoria": "coworking", "venderNoSite": false, "sobConsulta": false, "destaque": "", "beneficios": [], "prazoMinimoMeses": 0, "ordem": 12,
    "direitos": {"horasReuniao": 0, "horasCoworking": 1, "dayPass": 0, "correspondencias": 0, "cafeIncluso": false, "descontoSala": 0, "descontoCafe": 0}
  }$json$::jsonb)
on conflict (unidade_id, entity, item_id) do nothing;

-- ---------------------------------------------------------------------------
-- 3) Estoril: unidade, equipe com os mesmos papéis do Luxemburgo, salas alugadas,
--    planos de endereço fiscal e conta Asaas da CafeWorking
-- ---------------------------------------------------------------------------
insert into public.unidades (id, franqueado_id, nome, endereco, cidade, cor, salas, ocupacao, membros, receita, ativa)
values ('un_cafeworkingestoril_a1c7e2', 'fr_cafeworking-ltda_e78be3', 'CafeWorkingEstoril',
        'Av. Raja Gabaglia, 2000, Estoril · Belo Horizonte/MG', 'Belo Horizonte', '#0E4B4F', 6, 100, 0, 0, true)
on conflict (id) do nothing;

insert into public.unidade_members (user_id, unidade_id, franqueado_id, role)
select m.user_id, 'un_cafeworkingestoril_a1c7e2', m.franqueado_id, m.role
from public.unidade_members m
where m.unidade_id = 'un_cafeworkingluxembu_e78be3' and m.role <> 'cliente'
  and not exists (select 1 from public.unidade_members x where x.user_id = m.user_id and x.unidade_id = 'un_cafeworkingestoril_a1c7e2');

with salas_estoril(id, nome, tipo, cap) as (
  values ('s_est_privativa_1', 'Sala Privativa 1', 'Privativa', 4),
         ('s_est_privativa_2', 'Sala Privativa 2', 'Privativa', 4),
         ('s_est_privativa_3', 'Sala Privativa 3', 'Privativa', 6),
         ('s_est_privativa_4', 'Sala Privativa 4', 'Privativa', 6),
         ('s_est_privativa_5', 'Sala Privativa 5', 'Privativa', 3),
         ('s_est_reuniao',     'Sala de Reunião',  'Reunião',   6)
), docs as (
  insert into public.app_state (unidade_id, entity, item_id, doc)
  select 'un_cafeworkingestoril_a1c7e2', 'salas', s.id, jsonb_build_object(
    'id', s.id, 'unidadeId', 'un_cafeworkingestoril_a1c7e2', 'nome', s.nome, 'tipo', s.tipo, 'cap', s.cap,
    'bases', case when s.tipo = 'Privativa' then s.cap else 0 end, 'descricao', '', 'comodidades', '[]'::jsonb,
    'fotos', '[]'::jsonb, 'valor', '', 'valorHora', 0, 'valorMensal', 0, 'contratada', true, 'contratante', '',
    'reservaOnline', false, 'planos', '[]'::jsonb)
  from salas_estoril s
  on conflict (unidade_id, entity, item_id) do nothing
  returning item_id
)
insert into public.salas (id, unidade_id, nome, tipo, capacidade, bases, descricao, comodidades, fotos, valor_hora, valor_mensal, contratada, active, reserva_online)
select s.id, 'un_cafeworkingestoril_a1c7e2', s.nome, s.tipo, s.cap, case when s.tipo = 'Privativa' then s.cap else 0 end,
       '', '[]'::jsonb, '[]'::jsonb, 0, 0, true, true, false
from salas_estoril s
on conflict (id) do nothing;

insert into public.app_state (unidade_id, entity, item_id, doc)
select 'un_cafeworkingestoril_a1c7e2', 'planos', d.doc->>'id' || '_estoril',
       d.doc || jsonb_build_object('id', d.doc->>'id' || '_estoril', 'unidadeId', 'un_cafeworkingestoril_a1c7e2')
from public.app_state d
where d.entity = 'planos' and d.unidade_id = 'un_cafeworkingluxembu_e78be3'
  and d.item_id in ('pl_site_fiscal_basico', 'pl_site_fiscal_pro', 'pl_site_fiscal_premium')
on conflict (unidade_id, entity, item_id) do nothing;

insert into public.app_state (unidade_id, entity, item_id, doc)
values ('un_cafeworkingestoril_a1c7e2', 'configVenda', 'geral', '{"descontoAnualPct": 10}'::jsonb)
on conflict (unidade_id, entity, item_id) do nothing;

-- mesma conta Asaas da CafeWorking (cópia dentro do Vault, sem sair do banco)
do $vault$
declare v_segredo text;
begin
  if not exists (select 1 from vault.secrets where name = 'asaas_un_cafeworkingestoril_a1c7e2') then
    select decrypted_secret into v_segredo from vault.decrypted_secrets where name = 'asaas_un_cafeworkingluxembu_e78be3';
    if v_segredo is null then raise exception 'chave Asaas do Luxemburgo não encontrada'; end if;
    perform vault.create_secret(v_segredo, 'asaas_un_cafeworkingestoril_a1c7e2', 'Asaas CafeWorking (unidade Estoril)');
  end if;
end
$vault$;

commit;
