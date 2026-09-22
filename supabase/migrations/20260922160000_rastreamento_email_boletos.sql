-- Confirmação e leitura dos e-mails financeiros.
alter table public.notificacoes
  add column if not exists tracking_token uuid default gen_random_uuid(),
  add column if not exists opened_at timestamptz,
  add column if not exists confirmed_at timestamptz;

create unique index if not exists notificacoes_tracking_token_uk
  on public.notificacoes (tracking_token) where tracking_token is not null;

comment on column public.notificacoes.opened_at is
  'Primeira abertura detectada pelo pixel; pode não ocorrer se o cliente bloquear imagens.';
comment on column public.notificacoes.confirmed_at is
  'Confirmação explícita do destinatário pelo botão do e-mail.';
