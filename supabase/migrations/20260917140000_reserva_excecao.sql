-- ============================================================================
-- CafeWorking · Reserva feita pela recepção sem cadastro é EXCEÇÃO
--
-- O caminho padrão é a recepção mandar o link de reserva (o cliente escolhe o
-- horário, informa os dados e paga). Quando a recepção reserva direto para
-- quem não é cliente, o motivo fica registrado na própria reserva.
-- Idempotente.
-- ============================================================================

alter table public.reservas
  add column if not exists observacao text;

alter table public.reservas drop constraint if exists reservas_observacao_check;
alter table public.reservas add constraint reservas_observacao_check
  check (observacao is null or length(observacao) <= 500);

comment on column public.reservas.observacao is 'Motivo da reserva manual para quem não é cliente (exceção), registrado pela recepção';
