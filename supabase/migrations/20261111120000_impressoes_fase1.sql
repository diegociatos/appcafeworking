-- ============================================================================
-- CafeWorking · Gestão de Impressões — Fase 1 (modelo de dados)
--
-- O cliente envia um documento pelo portal; a recepção (ou, na Fase 2, um agente
-- local) imprime na HP LaserJet Pro MFP 4103fdw e a contabilização fica por
-- FOLHA (frente-e-verso = 1 folha por 2 páginas). A franquia varia por plano
-- (direitos.impressaoMensal, em folhas) e o excedente vale R$ 1,50/folha,
-- faturado no fechamento do mês (Fase 3). Nada aqui bloqueia a impressão.
--
--   1) impressoras        — registro por unidade; o agente autentica por token
--   2) impressao_jobs     — fila + contabilidade por trabalho
--   3) consumos_impressao — um lançamento por trabalho impresso (soma do mês)
--   4) fechamentos_impressao — trava de idempotência do fechamento (Fase 3)
--   5) bucket privado 'impressoes' — arquivo apagado após impresso (LGPD)
--
-- RLS de três camadas (igual ao resto do app): admin da plataforma / staff da
-- unidade / cliente (só os próprios, pelo e-mail do login). Consumo é escrito só
-- pelo backend (service_role). Reaproveita: creditos_ledger (tipo 'impressao'),
-- cobrancas (fechamento), is_platform_admin()/is_unidade_staff()/tg_set_updated_at().
--
-- Aditivo e idempotente. Não altera nenhum fluxo existente.
-- Depende de: unidades, clientes, cobrancas, rls_por_papel, operacao_recepcao.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) impressoras — uma ou mais por unidade. O agente local se autentica com um
--    token cujo sha256 fica aqui (o valor em claro nunca é gravado).
-- ----------------------------------------------------------------------------
create table if not exists public.impressoras (
  id                text primary key,
  unidade_id        text not null references public.unidades(id) on delete cascade,
  nome              text not null,
  modelo            text,
  device_token_hash text not null,
  ativo             boolean not null default true,
  created_at        timestamptz not null default now()
);
create index if not exists impressoras_unidade_idx on public.impressoras (unidade_id, ativo);

alter table public.impressoras enable row level security;
drop policy if exists "impressoras: leitura staff" on public.impressoras;
create policy "impressoras: leitura staff" on public.impressoras for select
  using (public.is_platform_admin() or public.is_unidade_staff(unidade_id));
-- Cadastro/edição: só backend (service_role) ou admin da plataforma.
drop policy if exists "impressoras: escrita admin" on public.impressoras;
create policy "impressoras: escrita admin" on public.impressoras for all
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- ----------------------------------------------------------------------------
-- 2) impressao_jobs — fila e contabilidade. `folhas` é a unidade cobrada;
--    `folhas_impressas` é o que o agente confirma (Fase 2). `paginas` é o
--    declarado no envio (o agente conta de verdade depois).
-- ----------------------------------------------------------------------------
create table if not exists public.impressao_jobs (
  id               uuid primary key default gen_random_uuid(),
  unidade_id       text not null references public.unidades(id) on delete cascade,
  cliente_id       text references public.clientes(id) on delete set null,
  cliente_email    text not null,
  cliente_nome     text,
  impressora_id    text references public.impressoras(id) on delete set null,
  documento_nome   text not null,
  storage_path     text,                                   -- apagado após impresso
  paginas          int  not null default 1 check (paginas > 0),
  copias           int  not null default 1 check (copias > 0),
  duplex           boolean not null default true,
  folhas           int  not null check (folhas > 0),
  folhas_impressas int,
  status           text not null default 'fila'
                     check (status in ('fila','enviado','impresso','falha','cancelado')),
  origem           text not null default 'portal' check (origem in ('portal','email','recepcao')),
  erro             text,
  criado_em        timestamptz not null default now(),
  impresso_em      timestamptz
);
create index if not exists impressao_jobs_fila_idx
  on public.impressao_jobs (unidade_id, impressora_id, status, criado_em);
create index if not exists impressao_jobs_cliente_idx
  on public.impressao_jobs (unidade_id, cliente_email, criado_em desc);

alter table public.impressao_jobs enable row level security;
drop policy if exists "impressao_jobs: leitura por papel" on public.impressao_jobs;
create policy "impressao_jobs: leitura por papel" on public.impressao_jobs for select
  using (
    public.is_platform_admin()
    or public.is_unidade_staff(unidade_id)
    or lower(cliente_email) = lower(auth.jwt() ->> 'email')
  );
-- Sem policy de insert/update/delete: a fila é criada e baixada só pelo backend
-- (service_role nas Edge Functions), que ignora RLS. O cliente não escreve.

-- ----------------------------------------------------------------------------
-- 3) consumos_impressao — um lançamento por trabalho impresso. O total do mês
--    por cliente = soma de `folhas`. UNIQUE(job_id) garante idempotência.
-- ----------------------------------------------------------------------------
create table if not exists public.consumos_impressao (
  id            uuid primary key default gen_random_uuid(),
  unidade_id    text not null references public.unidades(id) on delete cascade,
  cliente_id    text references public.clientes(id) on delete set null,
  cliente_email text not null,
  competencia   text not null check (competencia ~ '^\d{4}-\d{2}$'),
  job_id        uuid not null references public.impressao_jobs(id) on delete cascade,
  folhas        int  not null check (folhas > 0),
  created_at    timestamptz not null default now(),
  unique (job_id)
);
create index if not exists consumos_impressao_fechamento_idx
  on public.consumos_impressao (competencia, unidade_id, cliente_email);

alter table public.consumos_impressao enable row level security;
drop policy if exists "consumos impressao: leitura por papel" on public.consumos_impressao;
create policy "consumos impressao: leitura por papel" on public.consumos_impressao for select
  using (
    public.is_platform_admin()
    or public.is_unidade_staff(unidade_id)
    or lower(cliente_email) = lower(auth.jwt() ->> 'email')
  );
-- Escrita só backend (service_role).

-- ----------------------------------------------------------------------------
-- 4) fechamentos_impressao — um fechamento por cliente/unidade/competência
--    (Fase 3: fatura o excedente no Asaas). Espelha fechamentos_cafeteria.
-- ----------------------------------------------------------------------------
create table if not exists public.fechamentos_impressao (
  id               uuid primary key default gen_random_uuid(),
  unidade_id       text not null references public.unidades(id) on delete cascade,
  cliente_id       text references public.clientes(id) on delete set null,
  cliente_email    text not null,
  competencia      text not null check (competencia ~ '^\d{4}-\d{2}$'),
  folhas_total     int  not null default 0,
  folhas_franquia  int  not null default 0,
  folhas_excedente int  not null default 0,
  valor_excedente  numeric(12,2) not null default 0,
  status           text not null default 'processando' check (status in ('processando','faturado','isento','erro')),
  cobranca_id      uuid references public.cobrancas(id) on delete set null,
  erro             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (unidade_id, cliente_id, competencia)
);
alter table public.fechamentos_impressao enable row level security;
drop policy if exists "fechamentos impressao: leitura staff" on public.fechamentos_impressao;
create policy "fechamentos impressao: leitura staff" on public.fechamentos_impressao for select
  using (public.is_platform_admin() or public.is_unidade_staff(unidade_id));
drop trigger if exists set_updated_at on public.fechamentos_impressao;
create trigger set_updated_at before update on public.fechamentos_impressao
  for each row execute function public.tg_set_updated_at();

-- ----------------------------------------------------------------------------
-- 5) Bucket privado dos arquivos a imprimir. Caminho <unidade_id>/<job_id>.<ext>.
--    O arquivo é apagado assim que o trabalho fica 'impresso' (LGPD). Equipe/
--    admin gerencia; o agente baixa por URL assinada gerada pelo service_role.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('impressoes', 'impressoes', false, 26214400,
  array['application/pdf','image/png','image/jpeg','text/plain','application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/octet-stream'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "impressoes_equipe_le" on storage.objects;
create policy "impressoes_equipe_le" on storage.objects for select to authenticated
  using (bucket_id = 'impressoes'
    and (public.is_platform_admin() or public.is_unidade_staff((storage.foldername(name))[1])));

drop policy if exists "impressoes_equipe_insere" on storage.objects;
create policy "impressoes_equipe_insere" on storage.objects for insert to authenticated
  with check (bucket_id = 'impressoes'
    and (public.is_platform_admin() or public.is_unidade_staff((storage.foldername(name))[1])));

drop policy if exists "impressoes_equipe_apaga" on storage.objects;
create policy "impressoes_equipe_apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'impressoes'
    and (public.is_platform_admin() or public.is_unidade_staff((storage.foldername(name))[1])));

commit;
