-- ==========================================================================
-- APLICAÇÃO da correção determinística de datas (classe A composável).
-- NÃO EXECUTAR sem aprovação. Rode ANTES, em modo leitura:
--   proposta-correcao-datas.sql  (mostra antes→depois, sem alterar)
--
-- O que faz:
--   1) cria uma tabela de BACKUP com o doc ANTES (permite rollback/auditoria);
--   2) atualiza SOMENTE os recebíveis com `data` inválida mas com dia +
--      competência derivável, gravando `data` e `dataVencimento` compostos dos
--      campos que JÁ existem (nada inventado);
--   3) é IDEMPOTENTE: pula o que já está DD/MM/AAAA e o que já tem backup.
-- Não apaga títulos, não presume pagamento, não altera valores.
-- Escopo opcional por unidade: troque o filtro de unidade_id onde indicado.
-- ==========================================================================

-- 1) Backup (uma vez por registro; idempotente pela PK).
create table if not exists saneamento_backup_datas (
  unidade_id text, item_id text, doc_antes jsonb,
  aplicado_em timestamptz default now(),
  primary key (unidade_id, item_id)
);

-- 2) Transação: backup + update dos composáveis ainda não corrigidos.
begin;

with alvo as (
  select a.unidade_id, a.item_id, a.doc,
    (regexp_match(a.doc->>'data', '^([0-9]{1,2})'))[1]::int as dia_raw,
    (a.doc->>'mes')::int as mes0,
    coalesce((a.doc->>'ano')::int, 2026) as ano
  from app_state a
  where a.entity = 'lancamentos'
    -- and a.unidade_id = 'un_cafeworkingluxembu_e78be3'   -- descomente p/ limitar
    and not (a.doc->>'data' ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$')
    and a.doc->>'data' ~ '^[0-9]{1,2}'
    and a.doc->>'mes' is not null
    and not exists (select 1 from saneamento_backup_datas b
                    where b.unidade_id = a.unidade_id and b.item_id = a.item_id)
),
bkp as (
  insert into saneamento_backup_datas (unidade_id, item_id, doc_antes)
  select unidade_id, item_id, doc from alvo
  returning unidade_id, item_id
)
update app_state s
set doc = jsonb_set(
            jsonb_set(s.doc, '{data}', to_jsonb(v.data_nova)),
            '{dataVencimento}', to_jsonb(v.data_nova)),
    updated_at = now()
from (
  select unidade_id, item_id,
    to_char(make_date(ano, mes0 + 1,
      least(dia_raw, extract(day from (make_date(ano, mes0 + 1, 1) + interval '1 month - 1 day'))::int)),
      'DD/MM/YYYY') as data_nova
  from alvo
) v
where s.entity = 'lancamentos' and s.unidade_id = v.unidade_id and s.item_id = v.item_id;

-- Confira a contagem afetada; se estiver correta, troque por COMMIT.
rollback;  -- << segurança: por padrão NÃO grava. Revise e troque para COMMIT.

-- ROLLBACK (desfazer depois de um COMMIT):
--   update app_state s set doc = b.doc_antes
--   from saneamento_backup_datas b
--   where s.entity='lancamentos' and s.unidade_id=b.unidade_id and s.item_id=b.item_id;
