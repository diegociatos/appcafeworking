-- ============================================================================
-- CafeWorking · NFS-e — upload do certificado A1 + gravação no Vault
--
-- Adiciona metadados do certificado em config_fiscal (validade/titular, sem o
-- segredo) e a função upsert_fiscal_secret() que grava/atualiza o certificado
-- no Vault (espelha upsert_bank_secret do módulo de boletos). O .pfx e a senha
-- NUNCA ficam em coluna comum nem no front — só no Vault.
--
-- Depende de: 20260604120000_notas_fiscais.sql
-- ============================================================================

-- Metadados não sensíveis do certificado (para a UI mostrar status/validade).
alter table public.config_fiscal
  add column if not exists certificado_titular   text,
  add column if not exists certificado_validade  date,
  add column if not exists certificado_enviado_em timestamptz;

-- ----------------------------------------------------------------------------
-- upsert_fiscal_secret(p_ref, p_secret): cria/atualiza um segredo no Vault.
-- SECURITY DEFINER, restrito ao service_role (Edge Function salvar-certificado).
-- ----------------------------------------------------------------------------
create or replace function public.upsert_fiscal_secret(p_ref text, p_secret text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'acesso negado: só o backend pode gravar certificados';
  end if;

  select id into v_id from vault.secrets where name = p_ref limit 1;

  if v_id is null then
    perform vault.create_secret(p_secret, p_ref, 'Certificado A1 NFS-e (CafeWorking)');
  else
    perform vault.update_secret(v_id, p_secret, p_ref, 'Certificado A1 NFS-e (CafeWorking)');
  end if;
end $$;

revoke all on function public.upsert_fiscal_secret(text, text) from public, anon, authenticated;
