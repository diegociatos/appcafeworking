-- ============================================================================
-- Ajustes de 15/09/2026 (respostas do Diego):
--  * terceira sala privativa de 4 lugares livre no Luxemburgo (não existia no app)
--  * sala de reunião da Estoril com 8 lugares
--  * day pass e diária são a mesma coisa: fica o "Day pass" (R$ 85), no site
--  * planos Turno e Flex: cliente escolhe manhã (8h às 12h) ou tarde (12h às 18h)
-- Sala vive no app_state (doc) e na tabela salas: os dois mudam juntos.
-- ============================================================================
begin;

insert into public.app_state (unidade_id, entity, item_id, doc) values
  ('un_cafeworkingluxembu_e78be3', 'salas', 's_lux_privativa_7', $json${
    "id": "s_lux_privativa_7", "unidadeId": "un_cafeworkingluxembu_e78be3", "nome": "Sala Privativa - 7",
    "tipo": "Privativa", "cap": 4, "bases": 4, "descricao": "", "comodidades": ["Ar-condicionado"], "fotos": [],
    "valor": "R$ 2.200/mês", "valorHora": 0, "valorMensal": 2200, "contratada": false, "contratante": "",
    "reservaOnline": false, "planos": []
  }$json$::jsonb)
on conflict (unidade_id, entity, item_id) do nothing;
insert into public.salas (id, unidade_id, nome, tipo, capacidade, bases, descricao, comodidades, fotos, valor_hora, valor_mensal, contratada, active, reserva_online)
values ('s_lux_privativa_7', 'un_cafeworkingluxembu_e78be3', 'Sala Privativa - 7', 'Privativa', 4, 4, '', '["Ar-condicionado"]'::jsonb, '[]'::jsonb, 0, 2200, false, true, false)
on conflict (id) do nothing;

update public.app_state set doc = doc || '{"cap": 8}'::jsonb
where entity = 'salas' and unidade_id = 'un_cafeworkingestoril_a1c7e2' and item_id = 's_est_reuniao';
update public.salas set capacidade = 8 where id = 's_est_reuniao';

delete from public.app_state where entity = 'planos' and unidade_id = 'un_cafeworkingluxembu_e78be3' and item_id = 'pl_cow_diaria';
update public.app_state
set doc = doc || $json${
  "nome": "Day pass", "venderNoSite": true, "ordem": 6,
  "descricao": "Um dia inteiro na sala compartilhada, das 8h às 18h",
  "beneficios": ["Um dia na sala compartilhada, das 8h às 18h", "Área comum e Wi-Fi", "Use no dia que preferir"]
}$json$::jsonb
where entity = 'planos' and unidade_id = 'un_cafeworkingluxembu_e78be3' and item_id = 'pl_cow_daypass';

update public.app_state
set doc = doc || jsonb_build_object(
  'escolhaTurno', true,
  'beneficios', (select jsonb_agg(b) from jsonb_array_elements_text(doc->'beneficios') b
                 where b not in ('Meio período: manhã ou tarde (turno fixo)', 'Até 5h por dia'))
               || '[]'::jsonb)
where entity = 'planos' and unidade_id = 'un_cafeworkingluxembu_e78be3' and item_id in ('pl_site_cow_turno', 'pl_site_cow_flex');
update public.app_state
set doc = jsonb_set(doc, '{beneficios}', '["Manhã (8h às 12h) ou tarde (12h às 18h), à sua escolha"]'::jsonb || (doc->'beneficios'))
where entity = 'planos' and unidade_id = 'un_cafeworkingluxembu_e78be3' and item_id in ('pl_site_cow_turno', 'pl_site_cow_flex');

commit;
