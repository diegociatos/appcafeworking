-- ============================================================================
-- CafeWorking · Contas bancárias persistidas
--
-- PROBLEMA
--   A tela Boletos guardava a conta bancária só na memória do navegador: as
--   credenciais iam para o Vault (salvar-integracao, ref "<banco>_<unidade>"),
--   mas a linha de public.bank_accounts nunca era gravada. Ao recarregar a
--   conta sumia, e emitir-boleto/consultar/cancelar/testar-banco não achavam a
--   conta (o id "ba_…" do navegador nem é uuid). Em 17/09/2026 a tabela estava
--   vazia em produção e havia um segredo órfão no Vault.
--
-- O QUE MUDA
--   1) opcoes jsonb: preferências da tela de integração (autoRegistrar,
--      gerarPix). As demais colunas já existiam (apelido, tipo, ambiente,
--      beneficiário, pix_chave, credenciais_ref, conexao/conexao_status).
--   2) credenciais_ref amarrada à conta: precisa ser exatamente
--      "<banco>_<unidade_id>", o mesmo nome que salvar-integracao monta no
--      backend. Sem isso, quem é financeiro da unidade A poderia gravar uma
--      conta apontando para o segredo da unidade B (ou para "asaas_…") e emitir
--      boleto com a credencial alheia, já que as Edge Functions leem o Vault
--      com service_role pela credenciais_ref da linha.
--   3) credenciais_ref única: como o segredo é um por banco/unidade, duas
--      contas do mesmo banco na mesma unidade dividiriam (e sobrescreveriam) a
--      mesma credencial. O app regrava a conta existente nesse caso.
--   4) delete_bank_secret(ref): apaga o segredo bancário do Vault ao remover a
--      conta. Só service_role (Edge Function remover-conta-bancaria, que checa
--      master/financeiro), só refs de banco (nunca asaas_/nfse) e só quando
--      nenhuma conta ainda usa a referência.
--
-- RLS de bank_accounts continua a da 20260917160000 (admin + master/financeiro).
-- Idempotente.
-- ============================================================================

alter table public.bank_accounts
  add column if not exists opcoes jsonb not null default '{}'::jsonb;

comment on column public.bank_accounts.opcoes is
  'Preferências da integração na tela Boletos ({ autoRegistrar, gerarPix }). Sem segredo.';

-- ----------------------------------------------------------------------------
-- 2) credenciais_ref = "<banco>_<unidade_id>"
-- ----------------------------------------------------------------------------
alter table public.bank_accounts drop constraint if exists bank_accounts_credenciais_ref_da_conta;
alter table public.bank_accounts add constraint bank_accounts_credenciais_ref_da_conta
  check (credenciais_ref = banco::text || '_' || unidade_id);

-- ----------------------------------------------------------------------------
-- 3) uma conta por segredo
-- ----------------------------------------------------------------------------
create unique index if not exists bank_accounts_credenciais_ref_unica
  on public.bank_accounts (credenciais_ref);

-- ----------------------------------------------------------------------------
-- 4) apagar o segredo bancário do Vault (só backend)
-- ----------------------------------------------------------------------------
create or replace function public.delete_bank_secret(p_ref text)
returns boolean
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'acesso negado: só o backend pode apagar credenciais';
  end if;
  if p_ref is null or p_ref !~ '^(inter|itau|btg|bradesco)_.+' then
    raise exception 'referência de credencial bancária inválida: %', p_ref;
  end if;
  -- ainda em uso por alguma conta: não apaga
  if exists (select 1 from public.bank_accounts where credenciais_ref = p_ref) then
    return false;
  end if;
  delete from vault.secrets where name = p_ref;
  return found;
end $$;

revoke all on function public.delete_bank_secret(text) from public, anon, authenticated;
grant execute on function public.delete_bank_secret(text) to service_role;
