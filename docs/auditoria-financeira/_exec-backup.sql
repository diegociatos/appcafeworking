-- Execução: BACKUP dos lançamentos com data inválida composável (classe A).
-- Idempotente (PK). Retorna a contagem no backup.
create table if not exists saneamento_backup_datas (
  unidade_id text, item_id text, doc_antes jsonb,
  aplicado_em timestamptz default now(),
  primary key (unidade_id, item_id)
);
insert into saneamento_backup_datas (unidade_id, item_id, doc_antes)
select a.unidade_id, a.item_id, a.doc
from app_state a
where a.entity = 'lancamentos'
  and not (a.doc->>'data' ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$')
  and a.doc->>'data' ~ '^[0-9]{1,2}'
  and a.doc->>'mes' is not null
on conflict (unidade_id, item_id) do nothing;
select count(*) as registros_no_backup from saneamento_backup_datas;
