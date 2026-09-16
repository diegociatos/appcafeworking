"""
Teste da migration 20260917120000_abertura_empresa no banco REAL, desfeito.

  begin; <migration>; <checagens>; RAISE 'DRYRUN_OK <json>'; (rollback)

As checagens criam, dentro da transação, dois logins de teste (contabilidade e
cliente), processos em duas unidades e conferem a RLS assumindo o papel
authenticated com o JWT de cada um. Nada fica gravado: o RAISE final desfaz tudo.

Uso: python supabase/tests/dryrun_abertura_empresa.py
"""

import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
MIGRATION = REPO / "supabase" / "migrations" / "20260917120000_abertura_empresa.sql"

ESPERADO = {
    "helper_contabilidade_existe": True,
    "staff_nao_conta_contabilidade": True,
    "contabilidade_reconhecida": True,
    "contabilidade_ve_aberturas_da_unidade": 2,
    "contabilidade_nao_ve_outra_unidade": 0,
    "contabilidade_nao_ve_app_state": 0,
    "contabilidade_ve_eventos_internos": 2,
    "cliente_ve_so_o_proprio": 1,
    "cliente_nao_ve_evento_interno": 1,
    "cliente_ve_seus_documentos": 1,
    "authenticated_nao_insere": True,
    "authenticated_nao_altera": True,
    "historico_append_only": True,
    "status_invalido_barrado": True,
    "categoria_do_lado_errado_barrada": True,
    "documento_de_socio_sem_socio_barrado": True,
    "idempotencia_pending_signup": True,
    "kit_aceita_avcb_com_numero": True,
    "kit_tipo_invalido_barrado": True,
    "tabelas_com_rls": True,
    "bucket_privado_8mb": True,
}

CHECAGENS = """
do $dry$
declare
  res jsonb;
  u_contab uuid := gen_random_uuid();
  u_cli    uuid := gen_random_uuid();
  a1 uuid; a2 uuid; a3 uuid;
  v_staff boolean; v_contab boolean;
  v_contab_aberturas int; v_contab_outra int; v_contab_app_state int; v_contab_eventos int;
  v_cli_aberturas int; v_cli_eventos int; v_cli_docs int;
  v_insere boolean := false; v_altera boolean := false; v_append boolean := false;
  v_status boolean := false; v_lado boolean := false; v_socio boolean := false;
  v_idem boolean := false; v_kit boolean := false; v_kit_invalido boolean := false;
  v_ps uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role) values
    (u_contab, 'contab.dryrun@teste.local', 'authenticated', 'authenticated'),
    (u_cli, 'cliente.dryrun@teste.local', 'authenticated', 'authenticated');
  insert into public.unidade_members (user_id, unidade_id, role) values
    (u_contab, 'un_dryrun_a', 'contabilidade'),
    (u_cli, 'un_dryrun_a', 'cliente');

  insert into public.aberturas (unidade_id, cliente_email, cliente_nome, origem, pending_signup_id)
  values ('un_dryrun_a', 'cliente.dryrun@teste.local', 'Cliente Teste', 'venda', v_ps) returning id into a1;
  insert into public.aberturas (unidade_id, cliente_email, cliente_nome, origem)
  values ('un_dryrun_b', 'outro.dryrun@teste.local', 'Outro', 'equipe') returning id into a2;
  insert into public.aberturas (unidade_id, cliente_email, cliente_nome, origem)
  values ('un_dryrun_a', 'terceiro.dryrun@teste.local', 'Terceiro', 'equipe') returning id into a3;

  insert into public.abertura_eventos (abertura_id, unidade_id, tipo, texto, interno, autor_papel) values
    (a1, 'un_dryrun_a', 'criada', 'Processo aberto', false, 'sistema'),
    (a1, 'un_dryrun_a', 'documento', 'Contrato social anexado', true, 'contabilidade');
  insert into public.abertura_documentos (abertura_id, unidade_id, lado, categoria, socio_id, nome_arquivo, mime, bytes, storage_path)
  values (a1, 'un_dryrun_a', 'cliente', 'socio_identidade', 'abc123', 'rg.pdf', 'application/pdf', 100, 'un_dryrun_a/' || a1 || '/x-rg.pdf');

  begin
    update public.aberturas set status = 'arquivada' where id = a1;
  exception when check_violation then v_status := true;
  end;
  begin
    insert into public.abertura_documentos (abertura_id, unidade_id, lado, categoria, nome_arquivo, mime, bytes, storage_path)
    values (a1, 'un_dryrun_a', 'cliente', 'cartao_cnpj', 'c.pdf', 'application/pdf', 10, 'un_dryrun_a/' || a1 || '/y-c.pdf');
  exception when check_violation then v_lado := true;
  end;
  begin
    insert into public.abertura_documentos (abertura_id, unidade_id, lado, categoria, nome_arquivo, mime, bytes, storage_path)
    values (a1, 'un_dryrun_a', 'cliente', 'socio_residencia', 'r.pdf', 'application/pdf', 10, 'un_dryrun_a/' || a1 || '/z-r.pdf');
  exception when check_violation then v_socio := true;
  end;
  begin
    insert into public.aberturas (unidade_id, cliente_email, cliente_nome, origem, pending_signup_id)
    values ('un_dryrun_a', 'cliente.dryrun@teste.local', 'Cliente Teste', 'venda', v_ps);
  exception when unique_violation then v_idem := true;
  end;
  begin
    update public.abertura_eventos set texto = 'mudou' where abertura_id = a1;
  exception when insufficient_privilege then v_append := true;
  end;
  begin
    insert into public.unidade_documentos (unidade_id, tipo, titulo, nome_arquivo, mime, bytes, storage_path, numero)
    values ('un_dryrun_a', 'avcb', 'AVCB', 'avcb.pdf', 'application/pdf', 10, 'un_dryrun_a/avcb-dryrun.pdf', '123456');
    v_kit := true;
  exception when others then v_kit := false;
  end;
  begin
    insert into public.unidade_documentos (unidade_id, tipo, titulo, nome_arquivo, mime, bytes, storage_path)
    values ('un_dryrun_a', 'escritura', 'X', 'x.pdf', 'application/pdf', 10, 'un_dryrun_a/x-dryrun.pdf');
  exception when check_violation then v_kit_invalido := true;
  end;

  -- ---- como a contabilidade ----
  perform set_config('request.jwt.claims', json_build_object('sub', u_contab, 'email', 'contab.dryrun@teste.local', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_staff := public.is_unidade_staff('un_dryrun_a');
  v_contab := public.is_unidade_contabilidade('un_dryrun_a');
  select count(*) into v_contab_aberturas from public.aberturas where unidade_id = 'un_dryrun_a';
  select count(*) into v_contab_outra from public.aberturas where unidade_id = 'un_dryrun_b';
  select count(*) into v_contab_app_state from public.app_state where unidade_id = 'un_dryrun_a';
  select count(*) into v_contab_eventos from public.abertura_eventos where abertura_id = a1;
  begin
    insert into public.aberturas (unidade_id, cliente_email, cliente_nome, origem) values ('un_dryrun_a', 'x@teste.local', 'X', 'equipe');
  exception when insufficient_privilege then v_insere := true;
  end;
  begin
    update public.aberturas set status = 'concluida' where id = a1;
  exception when insufficient_privilege then v_altera := true;
  end;
  reset role;

  -- ---- como o cliente ----
  perform set_config('request.jwt.claims', json_build_object('sub', u_cli, 'email', 'Cliente.Dryrun@teste.local', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_cli_aberturas from public.aberturas where unidade_id like 'un_dryrun_%';
  select count(*) into v_cli_eventos from public.abertura_eventos where abertura_id = a1;
  select count(*) into v_cli_docs from public.abertura_documentos where abertura_id = a1;
  reset role;

  res := jsonb_build_object(
    'helper_contabilidade_existe', to_regprocedure('public.is_unidade_contabilidade(text)') is not null,
    'staff_nao_conta_contabilidade', v_staff = false,
    'contabilidade_reconhecida', v_contab,
    'contabilidade_ve_aberturas_da_unidade', v_contab_aberturas,
    'contabilidade_nao_ve_outra_unidade', v_contab_outra,
    'contabilidade_nao_ve_app_state', v_contab_app_state,
    'contabilidade_ve_eventos_internos', v_contab_eventos,
    'cliente_ve_so_o_proprio', v_cli_aberturas,
    'cliente_nao_ve_evento_interno', v_cli_eventos,
    'cliente_ve_seus_documentos', v_cli_docs,
    'authenticated_nao_insere', v_insere,
    'authenticated_nao_altera', v_altera,
    'historico_append_only', v_append,
    'status_invalido_barrado', v_status,
    'categoria_do_lado_errado_barrada', v_lado,
    'documento_de_socio_sem_socio_barrado', v_socio,
    'idempotencia_pending_signup', v_idem,
    'kit_aceita_avcb_com_numero', v_kit,
    'kit_tipo_invalido_barrado', v_kit_invalido,
    'tabelas_com_rls', (select bool_and(relrowsecurity) from pg_class
       where oid in ('public.aberturas'::regclass, 'public.abertura_eventos'::regclass, 'public.abertura_documentos'::regclass)),
    'bucket_privado_8mb', (select not public and file_size_limit = 8388608 from storage.buckets where id = 'documentos-abertura')
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
        print(f"  {'OK ' if ok else 'ERR'} {chave:<40} {obtido}" + ("" if ok else f"   (esperado: {esperado})"))

    saida = cli_query([
        "select to_regclass('public.aberturas') is null as sem_tabela_nova, "
        "to_regprocedure('public.is_unidade_contabilidade(text)') is null as sem_helper_novo, "
        "not exists (select 1 from storage.buckets where id = 'documentos-abertura') as sem_bucket, "
        "not exists (select 1 from auth.users where email like '%.dryrun@teste.local') as sem_login_de_teste, "
        "not exists (select 1 from information_schema.columns where table_schema = 'public' "
        "and table_name = 'unidade_documentos' and column_name = 'numero') as sem_coluna_numero"
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
