-- ============================================================================
-- Turno do coworking de meio período e sala atribuída à assinatura.
--
-- turno: planos Turno e Flex — o cliente escolhe manhã (8h às 12h) ou tarde
--   (12h às 18h) na contratação.
-- sala_id: sala privativa vendida pelo site é um plano por tamanho; a equipe
--   atribui a sala exata na entrega. Sem sala atribuída, a assinatura ainda
--   ocupa uma vaga daquele tamanho (ver _shared/disponibilidade.ts).
-- ============================================================================

alter table public.pending_signups add column if not exists turno text;
alter table public.assinaturas
  add column if not exists turno   text,
  add column if not exists sala_id text;

alter table public.pending_signups drop constraint if exists pending_signups_turno_check;
alter table public.pending_signups add constraint pending_signups_turno_check check (turno is null or turno in ('manha', 'tarde'));
alter table public.assinaturas drop constraint if exists assinaturas_turno_check;
alter table public.assinaturas add constraint assinaturas_turno_check check (turno is null or turno in ('manha', 'tarde'));

create index if not exists assinaturas_plano_sem_sala_idx on public.assinaturas (unidade_id, plano_id) where sala_id is null;
create unique index if not exists assinaturas_sala_ativa_uk on public.assinaturas (sala_id)
  where sala_id is not null and status in ('ativa', 'inadimplente', 'cancelando');
