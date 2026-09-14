"""
Teste da migration 20260915120000_assinaturas_ciclo no banco REAL, desfeito.

  begin; <migration>; <checagens>; RAISE 'DRYRUN_OK <json>'; (rollback)

Uso: python supabase/tests/dryrun_assinaturas_ciclo.py
"""

import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
MIGRATION = REPO / "supabase" / "migrations" / "20260915120000_assinaturas_ciclo.sql"

ESPERADO = {
    "colunas_novas": 13,
    "status_cancelando_aceito": True,
    "status_invalido_barrado": True,
    "docs_status_invalido_barrado": True,
    "tabela_documentos_rls": True,
    "documentos_sem_escrita_authenticated": True,
    "bucket_privado": True,
    "cron_agendado": True,
    "pg_net_instalado": True,
}

CHECAGENS = """
do $dry$
declare
  res jsonb;
  v_id uuid;
  v_cancelando boolean := false;
  v_invalido boolean := false;
  v_docs boolean := false;
begin
  insert into public.assinaturas (unidade_id, cliente_nome, cliente_email, plano_id, plano_nome, valor, status)
  values ('un_dryrun', 'Teste', 'dryrun@teste.local', 'pl', 'Plano', 10, 'ativa') returning id into v_id;

  begin
    update public.assinaturas set status = 'cancelando', cancela_em = current_date + 30 where id = v_id;
    v_cancelando := true;
  exception when others then v_cancelando := false;
  end;
  begin
    update public.assinaturas set status = 'suspensa' where id = v_id;
  exception when check_violation then v_invalido := true;
  end;
  begin
    update public.assinaturas set docs_status = 'talvez' where id = v_id;
  exception when check_violation then v_docs := true;
  end;

  res := jsonb_build_object(
    'colunas_novas', (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'assinaturas'
       and column_name in ('proxima_cobranca','aviso_renovacao_ciclo','cancelamento_solicitado_em','cancela_em','cancelamento_tipo',
         'cancelamento_motivo','requer_acerto','motivo_acerto','acerto_resolvido_em','docs_status','docs_parecer','docs_avaliado_em','docs_avaliado_por')),
    'status_cancelando_aceito', v_cancelando,
    'status_invalido_barrado', v_invalido,
    'docs_status_invalido_barrado', v_docs,
    'tabela_documentos_rls', (select relrowsecurity from pg_class where oid = 'public.assinatura_documentos'::regclass),
    'documentos_sem_escrita_authenticated', not has_table_privilege('authenticated', 'public.assinatura_documentos', 'INSERT'),
    'bucket_privado', (select not public from storage.buckets where id = 'documentos-clientes'),
    'cron_agendado', exists (select 1 from cron.job where jobname = 'cafeworking-rotina-diaria' and schedule = '0 11 * * *'),
    'pg_net_instalado', exists (select 1 from pg_extension where extname = 'pg_net')
  );
  raise exception 'DRYRUN_OK %', res::text;
end
$dry$;
"""


def cli_query(args):
    r = subprocess.run(["supabase", "db", "query", "--linked", *args], cwd=REPO, capture_output=True,
                       text=True, encoding="utf-8", errors="replace")
    return (r.stdout or "") + (r.stderr or "")


def main():
    sql = "begin;\n" + MIGRATION.read_text(encoding="utf-8") + "\n" + CHECAGENS
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False, encoding="utf-8", newline="\n") as f:
        f.write(sql)
        caminho = f.name
    try:
        saida = cli_query(["-f", caminho])
    finally:
        os.unlink(caminho)

    m = re.search(r"DRYRUN_OK (\{.*?\})", saida.replace('\\"', '"'))
    if not m:
        print("A MIGRATION OU UMA CHECAGEM FALHOU ANTES DO FIM:\n")
        print(saida[-3000:])
        return 1
    resultado = json.loads(m.group(1))

    falhas = 0
    for chave, esperado in ESPERADO.items():
        obtido = resultado.get(chave)
        ok = obtido == esperado
        falhas += not ok
        print(f"  {'OK ' if ok else 'ERR'} {chave:<38} {obtido}" + ("" if ok else f"   (esperado: {esperado})"))

    saida = cli_query([
        "select to_regclass('public.assinatura_documentos') is null as sem_tabela_nova, "
        "not exists (select 1 from pg_extension where extname in ('pg_cron','pg_net')) as sem_extensoes, "
        "not exists (select 1 from storage.buckets where id = 'documentos-clientes') as sem_bucket, "
        "(select count(*) from public.assinaturas where cliente_email like '%@teste.local') = 0 as sem_linha_de_teste"
    ])
    m = re.search(r"\{.*\}", saida, re.S)
    rows = json.loads(m.group(0)).get("rows", []) if m else []
    print("\nNada ficou gravado?")
    for k, v in (rows[0] if rows else {}).items():
        falhas += v is not True
        print(f"  {'OK ' if v is True else 'ERR'} {k}")
    if not rows:
        falhas += 1
        print("  ERR não foi possível verificar")

    print(f"\n{'TUDO OK' if not falhas else f'{falhas} FALHA(S)'}")
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
