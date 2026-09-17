-- ============================================================================
-- CafeWorking · Desconto de sala do plano na reserva
--
-- PROBLEMA
--   O cadastro de Planos tem "Desconto sala (%)" (direitos.descontoSala), mas
--   nada no sistema usava: o excedente de horas era sempre cobrado pelo preço
--   cheio da sala. A tela prometia um desconto que nunca saía do papel.
--
-- DECISÃO
--   Quem aplica o desconto é o SERVIDOR (Edge Function criar-reserva, com
--   _shared/direitosPlano.ts + calcularReserva). `reservas.valor` continua sendo
--   o que o cliente paga — agora já com o desconto. Para a tela, a auditoria e o
--   financeiro conseguirem explicar esse número depois de recarregar a página,
--   a reserva guarda o percentual aplicado e o valor cheio de onde ele saiu:
--     • desconto_plano_pct  — 0 a 100 (nulo = sem desconto)
--     • valor_sem_desconto  — excedente pelo preço de tabela (nulo = sem desconto)
--
--   Sem coluna nova em lugar nenhum além de reservas; nenhuma policy muda (o
--   select/escrita de reservas continua com as regras de 20260628120000 e a
--   escrita real é do backend). São colunas informativas: o dinheiro segue em
--   `valor`.
--
-- Idempotente (add column if not exists). Em 17/09/2026 a produção tinha 2
-- unidades, 75 clientes e nenhuma venda: nada a preencher para trás.
-- ============================================================================

alter table public.reservas
  add column if not exists desconto_plano_pct numeric(5,2),
  add column if not exists valor_sem_desconto numeric(12,2);

alter table public.reservas drop constraint if exists reservas_desconto_plano_pct_check;
alter table public.reservas add constraint reservas_desconto_plano_pct_check
  check (desconto_plano_pct is null or (desconto_plano_pct > 0 and desconto_plano_pct <= 100));

alter table public.reservas drop constraint if exists reservas_valor_sem_desconto_check;
alter table public.reservas add constraint reservas_valor_sem_desconto_check
  check (valor_sem_desconto is null or valor_sem_desconto >= 0);

-- Desconto registrado exige de onde ele saiu (e vice-versa): número solto
-- vira conta que ninguém confere.
alter table public.reservas drop constraint if exists reservas_desconto_plano_coerente;
alter table public.reservas add constraint reservas_desconto_plano_coerente
  check ((desconto_plano_pct is null) = (valor_sem_desconto is null));

comment on column public.reservas.desconto_plano_pct is
  'Desconto de sala do plano (direitos.descontoSala) aplicado ao excedente pela Edge criar-reserva; nulo quando não houve';
comment on column public.reservas.valor_sem_desconto is
  'Excedente pelo preço cheio da sala, antes do desconto do plano; nulo quando não houve desconto';
comment on column public.reservas.valor is
  'O que o cliente paga pela reserva, já com o desconto do plano quando houver (ver desconto_plano_pct)';
