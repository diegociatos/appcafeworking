-- ============================================================================
-- Salas privativas do Luxemburgo com nome de bairro de BH (Diego, 16/09/2026),
-- salas de 6 e 7 lugares que faltavam no app e hora avulsa no site.
-- Aplicado em produção. Tabela salas e doc do app mudam juntos.
-- ============================================================================

begin;

-- nomes: livres de 4 lugares, alugadas de 4, de 5
with nomes(id, nome) as (values
  ('s1782420700809', 'Sala Savassi'),
  ('s1782420735937', 'Sala Lourdes'),
  ('s_lux_privativa_7', 'Sala Pampulha'),
  ('s1782408248191', 'Sala Sion'),
  ('s1782410118483', 'Sala Serra'),
  ('s1782420821947', 'Sala Belvedere'),
  ('s1782420889913', 'Sala Mangabeiras')
), t as (
  update public.salas s set nome = n.nome from nomes n
  where s.id = n.id and s.unidade_id = 'un_cafeworkingluxembu_e78be3'
  returning s.id
)
update public.app_state a set doc = a.doc || jsonb_build_object('nome', n.nome)
from nomes n
where a.entity = 'salas' and a.unidade_id = 'un_cafeworkingluxembu_e78be3' and a.item_id = n.id;

-- salas que faltavam (alugadas)
insert into public.app_state (unidade_id, entity, item_id, doc) values
  ('un_cafeworkingluxembu_e78be3', 'salas', 's_lux_funcionarios', $json${
    "id": "s_lux_funcionarios", "unidadeId": "un_cafeworkingluxembu_e78be3", "nome": "Sala Funcionários",
    "tipo": "Privativa", "cap": 6, "bases": 6, "descricao": "", "comodidades": ["Ar-condicionado"], "fotos": [],
    "valor": "", "valorHora": 0, "valorMensal": 0, "contratada": true, "contratante": "NOTARE SOLUÇÕES IMOBILIARIAS LTDA",
    "reservaOnline": false, "planos": []
  }$json$::jsonb),
  ('un_cafeworkingluxembu_e78be3', 'salas', 's_lux_santa_tereza', $json${
    "id": "s_lux_santa_tereza", "unidadeId": "un_cafeworkingluxembu_e78be3", "nome": "Sala Santa Tereza",
    "tipo": "Privativa", "cap": 7, "bases": 7, "descricao": "", "comodidades": ["Ar-condicionado"], "fotos": [],
    "valor": "", "valorHora": 0, "valorMensal": 0, "contratada": true, "contratante": "BD Transporte",
    "reservaOnline": false, "planos": []
  }$json$::jsonb)
on conflict (unidade_id, entity, item_id) do nothing;

insert into public.salas (id, unidade_id, nome, tipo, capacidade, bases, descricao, comodidades, fotos, valor_hora, valor_mensal, contratada, active, reserva_online)
values
  ('s_lux_funcionarios', 'un_cafeworkingluxembu_e78be3', 'Sala Funcionários', 'Privativa', 6, 6, '', '["Ar-condicionado"]'::jsonb, '[]'::jsonb, 0, 0, true, true, false),
  ('s_lux_santa_tereza', 'un_cafeworkingluxembu_e78be3', 'Sala Santa Tereza', 'Privativa', 7, 7, '', '["Ar-condicionado"]'::jsonb, '[]'::jsonb, 0, 0, true, true, false)
on conflict (id) do nothing;

-- hora avulsa no site (já aplicado antes deste arquivo; repetir não muda nada)
update public.app_state
set doc = doc || jsonb_build_object(
  'venderNoSite', true, 'ordem', 7, 'nome', 'Hora avulsa',
  'beneficios', jsonb_build_array('1 hora na sala compartilhada', 'Área comum e Wi-Fi', 'Use no dia que preferir')
)
where entity = 'planos' and unidade_id = 'un_cafeworkingluxembu_e78be3' and item_id = 'pl_cow_hora';

select id, nome, capacidade, contratada from public.salas
where unidade_id = 'un_cafeworkingluxembu_e78be3' and tipo = 'Privativa' order by capacidade, nome;

commit;
