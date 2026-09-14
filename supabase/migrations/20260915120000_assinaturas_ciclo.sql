-- ============================================================================
-- Ciclo de vida da assinatura vendida pelo site (contratos v1, 14/09/2026)
--
-- 1) assinaturas: próxima cobrança, aviso de renovação do anual, cancelamento
--    com aviso prévio, acerto financeiro e conferência de documentos
-- 2) assinatura_documentos + bucket privado documentos-clientes
-- 3) rotina diária (pg_cron + pg_net) chamando a Edge Function rotina-diaria.
--    O token da chamada fica no Vault (rotina_diaria_token) e no secret
--    ROTINA_DIARIA_TOKEN da função; sem o token a função recusa (401).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) assinaturas
-- ----------------------------------------------------------------------------
alter table public.assinaturas
  add column if not exists proxima_cobranca           date,
  add column if not exists aviso_renovacao_ciclo      date,
  add column if not exists cancelamento_solicitado_em timestamptz,
  add column if not exists cancela_em                 date,
  add column if not exists cancelamento_tipo          text,
  add column if not exists cancelamento_motivo        text,
  add column if not exists requer_acerto              boolean not null default false,
  add column if not exists motivo_acerto              text,
  add column if not exists acerto_resolvido_em        timestamptz,
  add column if not exists docs_status                text,
  add column if not exists docs_parecer               text,
  add column if not exists docs_avaliado_em           timestamptz,
  add column if not exists docs_avaliado_por          uuid;

comment on column public.assinaturas.aviso_renovacao_ciclo is 'proxima_cobranca já avisada por e-mail (uma vez por ciclo do anual)';
comment on column public.assinaturas.requer_acerto is 'cancelamento com multa de fidelidade, devolução proporcional do anual ou reembolso manual: equipe resolve';

alter table public.assinaturas drop constraint if exists assinaturas_status_check;
alter table public.assinaturas add constraint assinaturas_status_check
  check (status in ('ativa', 'inadimplente', 'cancelando', 'cancelada'));

alter table public.assinaturas drop constraint if exists assinaturas_cancelamento_tipo_check;
alter table public.assinaturas add constraint assinaturas_cancelamento_tipo_check
  check (cancelamento_tipo is null or cancelamento_tipo in ('arrependimento', 'aviso_previo', 'documentos_reprovados', 'equipe'));

alter table public.assinaturas drop constraint if exists assinaturas_docs_status_check;
alter table public.assinaturas add constraint assinaturas_docs_status_check
  check (docs_status is null or docs_status in ('pendente', 'enviado', 'aprovado', 'reprovado'));

update public.assinaturas
set proxima_cobranca = (inicio + case when recorrencia = 'anual' then interval '12 months' else interval '1 month' end)::date
where proxima_cobranca is null and status <> 'cancelada';

update public.assinaturas
set docs_status = 'pendente'
where categoria = 'endereco_fiscal' and docs_status is null and status <> 'cancelada';

create index if not exists assinaturas_rotina_idx on public.assinaturas (status, proxima_cobranca);

-- ----------------------------------------------------------------------------
-- 2) documentos enviados pelo cliente
-- ----------------------------------------------------------------------------
create table if not exists public.assinatura_documentos (
  id             uuid primary key default gen_random_uuid(),
  assinatura_id  uuid not null references public.assinaturas (id),
  unidade_id     text not null,
  cliente_email  text not null,
  tipo           text not null,
  nome_arquivo   text not null,
  mime           text not null,
  bytes          int  not null check (bytes > 0),
  storage_path   text not null unique,
  enviado_por    uuid,
  created_at     timestamptz not null default now()
);
create index if not exists assinatura_documentos_assinatura_idx on public.assinatura_documentos (assinatura_id, created_at desc);

alter table public.assinatura_documentos enable row level security;
drop policy if exists "assinatura_documentos: select por papel" on public.assinatura_documentos;
create policy "assinatura_documentos: select por papel" on public.assinatura_documentos for select
  using (
    public.is_platform_admin()
    or public.is_unidade_staff(unidade_id)
    or cliente_email = (auth.jwt() ->> 'email')
  );
-- Sem policy de escrita: o envio passa pela Edge Function (valida dono, tipo e tamanho).

-- O projeto concede tudo a anon/authenticated por padrão (20260605140000): revoga a escrita.
revoke all on public.assinatura_documentos from anon, authenticated;
grant select on public.assinatura_documentos to authenticated;
grant all on public.assinatura_documentos to service_role;

-- Bucket privado: só o service_role lê e grava; o app recebe links assinados.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos-clientes', 'documentos-clientes', false, 8388608, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 3) rotina diária às 8h de Brasília (11h UTC)
-- ----------------------------------------------------------------------------
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

select cron.schedule(
  'cafeworking-rotina-diaria',
  '0 11 * * *',
  $cron$
  select net.http_post(
    url := 'https://lmgbysfrbtgqzbtouzft.supabase.co/functions/v1/rotina-diaria',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-rotina-token', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'rotina_diaria_token'), '')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);
