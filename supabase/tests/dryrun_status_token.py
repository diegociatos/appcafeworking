"""
Teste da migration 20260914190000_venda_site_status_token no banco REAL, desfeito.

  begin; <migration>; <checagens>; RAISE 'DRYRUN_OK <json>'; (rollback)

O RAISE final aborta a transação de propósito; depois o script confere que
nada ficou gravado. Uso: python supabase/tests/dryrun_status_token.py
"""

import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
MIGRATION = REPO / "supabase" / "migrations" / "20260914190000_venda_site_status_token.sql"

ESPERADO = {
    "coluna_status_token": True,
    "status_token_obrigatorio": True,
    "indice_unico": True,
    "senha_definida_padrao_true": True,
    "linhas_sem_token": 0,
    "token_gerado_no_insert": True,
    "token_repetido_barrado": True,
}

CHECAGENS = """
do $dry$
declare
  res jsonb;
begin

  res := jsonb_build_object(
    'coluna_status_token', exists (select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'pending_signups' and column_name = 'status_token'),
    'status_token_obrigatorio', (select is_nullable = 'NO' from information_schema.columns
       where table_schema = 'public' and table_name = 'pending_signups' and column_name = 'status_token'),
    'indice_unico', to_regclass('public.pending_signups_status_token_uk') is not null,
    'senha_definida_padrao_true', (select column_default = 'true' from information_schema.columns
       where table_schema = 'public' and table_name = 'pending_signups' and column_name = 'senha_definida'),
    'linhas_sem_token', (select count(*) from public.pending_signups where status_token is null),
    'token_gerado_no_insert', (select column_default like 'gen_random_uuid()%' from information_schema.columns
       where table_schema = 'public' and table_name = 'pending_signups' and column_name = 'status_token'),
    'token_repetido_barrado', (select i.indisunique from pg_index i
       where i.indexrelid = to_regclass('public.pending_signups_status_token_uk'))
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
        print(f"  {'OK ' if ok else 'ERR'} {chave:<28} {obtido}" + ("" if ok else f"   (esperado: {esperado})"))

    saida = cli_query([
        "select not exists (select 1 from information_schema.columns where table_schema = 'public' "
        "and table_name = 'pending_signups' and column_name in ('status_token', 'senha_definida')) as sem_colunas_novas, "
        "(select count(*) from public.pending_signups where email like '%@teste.local') = 0 as sem_linhas_de_teste"
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
