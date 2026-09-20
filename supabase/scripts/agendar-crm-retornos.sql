-- Executar só após publicar crm-retornos e configurar os secrets em homologação.
-- Vault: crm_retorno_token = mesmo valor de CRM_RETORNO_TOKEN (>=32 caracteres),
-- crm_supabase_url = URL do projeto Supabase (sem barra final).
-- Não coloca o token no frontend, no repositório ou em notificações.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
do $$
begin
  if not exists(select 1 from vault.decrypted_secrets where name='crm_retorno_token' and length(decrypted_secret)>=32)
     or not exists(select 1 from vault.decrypted_secrets where name='crm_supabase_url' and decrypted_secret ~ '^https://[a-z0-9-]+\.supabase\.co$') then
    raise exception 'Configure crm_retorno_token e crm_supabase_url no Vault antes de ativar o agendador.';
  end if;
end $$;
select cron.schedule('cafeworking-crm-retornos','*/5 * * * *',$cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='crm_supabase_url') || '/functions/v1/crm-retornos',
    headers := jsonb_build_object('Content-Type','application/json','x-crm-token',
      (select decrypted_secret from vault.decrypted_secrets where name='crm_retorno_token')),
    body := '{}'::jsonb, timeout_milliseconds := 60000
  );
$cron$);
