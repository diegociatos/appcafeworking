-- ============================================================================
-- CafeWorking · Day pass na AGENDA
--
-- O Day pass (passe diário da sala compartilhada, plano pl_cow_daypass) é
-- comprado pelo fluxo de cadastro (signup) e, até aqui, não virava reserva: não
-- aparecia na agenda. Esta migration dá o que falta para o day pass entrar na
-- agenda numa data escolhida no checkout:
--
--   1) pending_signups.data_uso — a data que o cliente escolhe no checkout
--   2) sala de coworking da Luxemburgo (s_lux_compartilhada), 8 estações, nos
--      DOIS lugares onde a sala vive: tabela public.salas (snake_case) e
--      app_state entity='salas' (doc camelCase que o front usa).
--
-- A reserva em si é criada pelo asaas-webhook quando o pagamento confirma
-- (origem 'daypass', bloco 08h–18h, base livre de 1..8), só como AGENDA — a
-- cobrança e a NF já saem pelo fluxo de signup. Não interfere nas salas de
-- reunião: conflito em criar_reserva_segura é sempre por sala_id.
--
-- Idempotente (roda mais de uma vez sem duplicar). Depende de: salas,
-- app_state, 20260914120000_venda_site (coluna reserva_online em salas).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) Data de uso do day pass escolhida no checkout
-- ----------------------------------------------------------------------------
alter table public.pending_signups
  add column if not exists data_uso date;
comment on column public.pending_signups.data_uso is
  'Day pass: dia útil escolhido no checkout para a reserva na sala compartilhada (08h–18h BRT).';

-- ----------------------------------------------------------------------------
-- 2) Sala de coworking (day pass) da unidade Luxemburgo — 8 estações
--
--    Precisa existir nos DOIS lugares, casados no shape. A tabela é a fonte que
--    criar_reserva_segura valida; o app_state (doc) é o que o front renderiza na
--    agenda. O app regrava a tabela a partir do doc no hydrate, então os valores
--    precisam bater para o re-sync não mexer em nada.
-- ----------------------------------------------------------------------------

-- 2a) tabela relacional public.salas
insert into public.salas
  (id, unidade_id, nome, tipo, capacidade, bases, descricao, comodidades, fotos, valor_hora, valor_mensal, contratada, active, reserva_online)
values
  ('s_lux_compartilhada', 'un_cafeworkingluxembu_e78be3', 'Coworking (Day pass)', 'Compartilhada', 8, 8,
   'Estações de coworking (day pass)', '[]'::jsonb, '[]'::jsonb, 0, 0, false, true, false)
on conflict (id) do nothing;

-- 2b) doc do app_state (camelCase, mesmo shape de seedSalas / seed das salas Estoril)
insert into public.app_state (unidade_id, entity, item_id, doc)
values
  ('un_cafeworkingluxembu_e78be3', 'salas', 's_lux_compartilhada', jsonb_build_object(
     'id', 's_lux_compartilhada', 'unidadeId', 'un_cafeworkingluxembu_e78be3',
     'nome', 'Coworking (Day pass)', 'tipo', 'Compartilhada', 'cap', 8, 'bases', 8,
     'descricao', 'Estações de coworking (day pass)', 'comodidades', '[]'::jsonb,
     'fotos', '[]'::jsonb, 'valor', '', 'valorHora', 0, 'valorMensal', 0,
     'contratada', false, 'contratante', '', 'reservaOnline', false, 'planos', '[]'::jsonb))
on conflict (unidade_id, entity, item_id) do nothing;

commit;
