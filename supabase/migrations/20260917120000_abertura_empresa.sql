-- ============================================================================
-- CafeWorking · Abertura de empresa (processo acompanhado pela contabilidade)
--
--   1) Papel 'contabilidade' em unidade_members
--      A contabilidade parceira (Ciatos Contabilidade) tem login próprio e SÓ
--      enxerga os processos de abertura das unidades em que está vinculada.
--      is_unidade_staff deixa de contar 'contabilidade' como equipe (antes
--      qualquer papel diferente de 'cliente' era equipe e veria financeiro,
--      clientes, salas...). Novo helper is_unidade_contabilidade.
--      unidade_members não tem check de role (conferido no banco em 16/09/2026),
--      então não há constraint a ampliar.
--   2) unidade_documentos: tipos avcb, habite_se, autorizacao_proprietario e a
--      coluna numero (índice cadastral do IPTU, número do AVCB...)
--   3) aberturas           — um processo por compra (idempotente pela
--                            assinatura ou pelo cadastro pago)
--      abertura_eventos    — histórico append-only (trigger barra update/delete)
--      abertura_documentos — anexos do cliente e da contabilidade
--   4) bucket PRIVADO documentos-abertura (só service_role; o app recebe links
--      assinados e links de envio de uso único pela Edge Function aberturas)
--
-- Escrita SÓ pela Edge Function aberturas (service_role). Para authenticated,
-- apenas select pela RLS: admin da plataforma, equipe e contabilidade da
-- unidade, e o cliente dono pelo e-mail do login.
--
-- Lembrete (20260605140000): toda tabela nova nasce com permissão para
-- anon/authenticated. Aqui tudo é revogado e concedido de novo só no que
-- precisa. Idempotente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Papéis
-- ----------------------------------------------------------------------------
create or replace function public.is_unidade_staff(p_unidade_id text)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.unidade_members m
    where m.user_id = auth.uid() and m.unidade_id = p_unidade_id
      and m.role not in ('cliente', 'contabilidade')
  );
$$;

create or replace function public.is_unidade_contabilidade(p_unidade_id text)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.unidade_members m
    where m.user_id = auth.uid() and m.unidade_id = p_unidade_id and m.role = 'contabilidade'
  );
$$;

revoke all on function public.is_unidade_contabilidade(text) from public, anon;
grant execute on function public.is_unidade_contabilidade(text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2) Kit da unidade: novos tipos e número do documento
-- ----------------------------------------------------------------------------
alter table public.unidade_documentos
  add column if not exists numero text;

alter table public.unidade_documentos drop constraint if exists unidade_documentos_numero_check;
alter table public.unidade_documentos add constraint unidade_documentos_numero_check
  check (numero is null or length(btrim(numero)) between 1 and 100);

alter table public.unidade_documentos drop constraint if exists unidade_documentos_tipo_check;
alter table public.unidade_documentos add constraint unidade_documentos_tipo_check
  check (tipo in ('iptu', 'alvara', 'anuencia_modelo', 'comprovante_imovel', 'avcb', 'habite_se', 'autorizacao_proprietario', 'outro'));

comment on column public.unidade_documentos.numero is 'Índice cadastral do IPTU, número do AVCB ou do habite-se (texto que o cliente copia)';

-- ----------------------------------------------------------------------------
-- 3a) aberturas
-- ----------------------------------------------------------------------------
create table if not exists public.aberturas (
  id                    uuid primary key default gen_random_uuid(),
  unidade_id            text not null,
  assinatura_id         uuid references public.assinaturas (id),
  pending_signup_id     uuid,
  cliente_email         text not null check (cliente_email = lower(btrim(cliente_email)) and cliente_email like '%@%'),
  cliente_nome          text not null check (length(btrim(cliente_nome)) between 1 and 200),
  plano_nome            text,
  origem                text not null check (origem in ('venda', 'equipe')),
  usa_endereco_unidade  boolean not null default false,
  status                text not null default 'aguardando_cliente'
                          check (status in ('aguardando_cliente', 'em_analise', 'pendente_cliente', 'em_registro', 'concluida', 'cancelada')),
  dados                 jsonb not null default '{}'::jsonb check (jsonb_typeof(dados) = 'object'),
  resultado             jsonb not null default '{}'::jsonb check (jsonb_typeof(resultado) = 'object'),
  pendencia             text check (pendencia is null or length(pendencia) <= 2000),
  enviado_em            timestamptz,
  concluido_em          timestamptz,
  cancelado_em          timestamptz,
  criado_por            uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Idempotência: o webhook do Asaas reenvia; uma compra gera um processo só.
create unique index if not exists aberturas_assinatura_uk on public.aberturas (assinatura_id) where assinatura_id is not null;
create unique index if not exists aberturas_pending_signup_uk on public.aberturas (pending_signup_id) where pending_signup_id is not null;
create index if not exists aberturas_unidade_status_idx on public.aberturas (unidade_id, status, updated_at desc);
create index if not exists aberturas_email_idx on public.aberturas (cliente_email);

drop trigger if exists aberturas_touch on public.aberturas;
create trigger aberturas_touch before update on public.aberturas
  for each row execute function public.venda_touch_updated_at();

alter table public.aberturas enable row level security;

drop policy if exists "aberturas: select por papel" on public.aberturas;
create policy "aberturas: select por papel" on public.aberturas for select
  using (
    public.is_platform_admin()
    or public.is_unidade_staff(unidade_id)
    or public.is_unidade_contabilidade(unidade_id)
    or cliente_email = lower(auth.jwt() ->> 'email')
  );
-- Sem policy de escrita: tudo passa pela Edge Function aberturas.

revoke all on public.aberturas from public, anon, authenticated;
grant select on public.aberturas to authenticated;
grant all on public.aberturas to service_role;

-- ----------------------------------------------------------------------------
-- 3b) abertura_eventos (append-only)
-- ----------------------------------------------------------------------------
create table if not exists public.abertura_eventos (
  id           uuid primary key default gen_random_uuid(),
  abertura_id  uuid not null references public.aberturas (id),
  unidade_id   text not null,
  tipo         text not null check (tipo in ('criada', 'enviada', 'correcao_pedida', 'status', 'concluida', 'cancelada', 'documento', 'resultado')),
  status_de    text,
  status_para  text,
  texto        text check (texto is null or length(texto) <= 2000),
  interno      boolean not null default false,
  autor_id     uuid,
  autor_email  text,
  autor_papel  text not null check (autor_papel in ('cliente', 'contabilidade', 'equipe', 'admin', 'sistema')),
  created_at   timestamptz not null default now()
);
create index if not exists abertura_eventos_abertura_idx on public.abertura_eventos (abertura_id, created_at);

create or replace function public.abertura_eventos_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'HISTORICO_APPEND_ONLY' using errcode = '42501';
end $$;

drop trigger if exists abertura_eventos_sem_alteracao on public.abertura_eventos;
create trigger abertura_eventos_sem_alteracao before update or delete on public.abertura_eventos
  for each row execute function public.abertura_eventos_append_only();

alter table public.abertura_eventos enable row level security;

drop policy if exists "abertura_eventos: select por papel" on public.abertura_eventos;
create policy "abertura_eventos: select por papel" on public.abertura_eventos for select
  using (
    public.is_platform_admin()
    or public.is_unidade_staff(unidade_id)
    or public.is_unidade_contabilidade(unidade_id)
    or (
      not interno
      and exists (
        select 1 from public.aberturas a
        where a.id = abertura_eventos.abertura_id and a.cliente_email = lower(auth.jwt() ->> 'email')
      )
    )
  );

revoke all on public.abertura_eventos from public, anon, authenticated;
grant select on public.abertura_eventos to authenticated;
grant all on public.abertura_eventos to service_role;

-- ----------------------------------------------------------------------------
-- 3c) abertura_documentos
-- ----------------------------------------------------------------------------
create table if not exists public.abertura_documentos (
  id             uuid primary key default gen_random_uuid(),
  abertura_id    uuid not null references public.aberturas (id),
  unidade_id     text not null,
  lado           text not null check (lado in ('cliente', 'contabilidade')),
  categoria      text not null,
  socio_id       text check (socio_id is null or socio_id ~ '^[a-z0-9]{6,24}$'),
  nome_arquivo   text not null check (length(nome_arquivo) between 1 and 200),
  mime           text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png')),
  bytes          int  not null check (bytes > 0 and bytes <= 8388608),
  storage_path   text not null unique,
  enviado_por    uuid,
  enviado_papel  text check (enviado_papel in ('cliente', 'contabilidade', 'equipe', 'admin')),
  created_at     timestamptz not null default now(),
  constraint abertura_documentos_categoria_ck check (
    (lado = 'cliente' and categoria in ('socio_identidade', 'socio_residencia', 'iptu', 'avcb', 'autorizacao_proprietario', 'outro_cliente'))
    or (lado = 'contabilidade' and categoria in ('contrato_social', 'cartao_cnpj', 'inscricao_municipal', 'alvara', 'outro'))
  ),
  constraint abertura_documentos_socio_ck check ((categoria in ('socio_identidade', 'socio_residencia')) = (socio_id is not null)),
  constraint abertura_documentos_caminho_ck check (storage_path like unidade_id || '/' || abertura_id::text || '/%')
);
create index if not exists abertura_documentos_abertura_idx on public.abertura_documentos (abertura_id, created_at);

alter table public.abertura_documentos enable row level security;

drop policy if exists "abertura_documentos: select por papel" on public.abertura_documentos;
create policy "abertura_documentos: select por papel" on public.abertura_documentos for select
  using (
    public.is_platform_admin()
    or public.is_unidade_staff(unidade_id)
    or public.is_unidade_contabilidade(unidade_id)
    or exists (
      select 1 from public.aberturas a
      where a.id = abertura_documentos.abertura_id and a.cliente_email = lower(auth.jwt() ->> 'email')
    )
  );

revoke all on public.abertura_documentos from public, anon, authenticated;
grant select on public.abertura_documentos to authenticated;
grant all on public.abertura_documentos to service_role;

-- ----------------------------------------------------------------------------
-- 4) Bucket privado: <unidade_id>/<abertura_id>/<uuid>-<nome>. Sem policies em
--    storage.objects: só o service_role lê e grava.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos-abertura', 'documentos-abertura', false, 8388608, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
