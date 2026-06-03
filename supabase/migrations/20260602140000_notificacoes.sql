-- ============================================================================
-- CafeWorking · Notificações ao cliente (Fase 1: e-mail)
--
-- Outbox + log de tudo que é enviado ao cliente. O ENVIO acontece numa Edge
-- Function (Deno) chamando o provedor (Resend) — a API key fica no Vault/secrets,
-- nunca no front-end. WhatsApp fica como canal previsto (stub) para depois.
-- ============================================================================

create extension if not exists pgcrypto;

do $$ begin
  create type public.notif_canal as enum ('email', 'whatsapp');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notif_status as enum ('fila', 'enviado', 'erro', 'cancelado');
exception when duplicate_object then null; end $$;

create table if not exists public.notificacoes (
  id            uuid primary key default gen_random_uuid(),
  unidade_id    text not null,
  cliente_nome  text,
  destinatario  text not null,                       -- e-mail (ou telefone no whatsapp)
  canal         public.notif_canal not null default 'email',
  -- evento de negócio: boleto_nova | boleto_pago | boleto_lembrete | boleto_vencido
  --                    | correspondencia | cafe_pedido | cafe_pronto | reserva | ...
  evento        text not null,
  template      text not null,
  dados         jsonb not null default '{}',         -- variáveis do template
  assunto       text,
  status        public.notif_status not null default 'fila',
  provider_id   text,                                -- id no provedor (Resend)
  erro          text,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz
);

create index if not exists notificacoes_unidade_idx on public.notificacoes (unidade_id);
create index if not exists notificacoes_status_idx on public.notificacoes (status);
create index if not exists notificacoes_evento_idx on public.notificacoes (evento);

alter table public.notificacoes enable row level security;

-- A equipe da unidade lê o histórico (auditoria). O envio (insert/update) é
-- feito pela Edge Function com service_role, que ignora RLS.
drop policy if exists "notificacoes: select da unidade" on public.notificacoes;
create policy "notificacoes: select da unidade"
  on public.notificacoes for select
  using (public.is_unidade_member(unidade_id));

-- ----------------------------------------------------------------------------
-- Opt-in do cliente por categoria (transacionais sempre vão; opcionais não).
-- Categorias: cobranca | correspondencia | cafeteria | reservas | novidades
-- ----------------------------------------------------------------------------
create table if not exists public.cliente_notif_prefs (
  cliente_id   text not null,
  unidade_id   text not null,
  email        text,
  cobranca         boolean not null default true,    -- transacional (recomendado on)
  correspondencia  boolean not null default true,
  cafeteria        boolean not null default true,
  reservas         boolean not null default true,
  novidades        boolean not null default false,   -- marketing (opt-in explícito)
  atualizado_em timestamptz not null default now(),
  primary key (cliente_id, unidade_id)
);
alter table public.cliente_notif_prefs enable row level security;

drop policy if exists "prefs: unidade" on public.cliente_notif_prefs;
create policy "prefs: unidade"
  on public.cliente_notif_prefs for select
  using (public.is_unidade_member(unidade_id));
