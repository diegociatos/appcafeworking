-- ============================================================================
-- CafeWorking · Conexão OAuth (consentimento) das contas bancárias
--   - colunas de status de conexão em bank_accounts
--   - helper de Vault para gravar/atualizar tokens OAuth (só service_role)
-- ============================================================================

alter table public.bank_accounts add column if not exists conexao jsonb;
alter table public.bank_accounts add column if not exists conexao_status text;

-- Grava OU atualiza um segredo no Vault (tokens OAuth do banco), referenciado
-- por nome. Usada pela Edge Function `bank-oauth-callback`.
create or replace function public.upsert_bank_secret(p_ref text, p_secret text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'acesso negado: só o backend pode gravar credenciais';
  end if;

  select id into v_id from vault.secrets where name = p_ref limit 1;
  if v_id is null then
    perform vault.create_secret(p_secret, p_ref, 'Token/credencial bancária (CafeWorking)');
  else
    perform vault.update_secret(v_id, p_secret);
  end if;
end $$;

revoke all on function public.upsert_bank_secret(text, text) from public, anon, authenticated;
