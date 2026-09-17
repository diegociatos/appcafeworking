"""
Teste da migration 20260922120000_email_microsoft no banco REAL, desfeito.

  begin; <migration>; <checagens>; RAISE 'DRYRUN_OK <json>'; (rollback)

Confere: tabela integracoes_plataforma com RLS e sem acesso para anon e
authenticated (nem leitura, nem escrita), service_role grava/lê a config e o
atualizado_em anda; funções upsert/read/delete_email_secret só para
service_role, só refs "email_ms365_*", upsert regrava o mesmo segredo, leitura
de inexistente devolve null, delete apaga. Nada fica gravado: o RAISE final
desfaz tudo, inclusive os segredos de teste criados no Vault.

Uso (a pasta vinculada ao Supabase pode ser outra, ex.: rodando de uma worktree):
  SUPABASE_LINK_DIR=C:\\dev\\appcafe python supabase/tests/dryrun_email_microsoft.py
"""

import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PASTA_VINCULADA = Path(os.environ.get("SUPABASE_LINK_DIR") or REPO)
MIGRATION = REPO / "supabase" / "migrations" / "20260922120000_email_microsoft.sql"

ESPERADO = {
    "rls_ligada": True,
    "sem_politicas": 0,
    "anon_nao_le": True,
    "authenticated_nao_le": True,
    "authenticated_nao_grava": True,
    "service_role_grava_e_le": "envio@grupociatos.com.br",
    "atualizado_em_anda": True,
    "funcoes_fechadas_para_anon_authenticated": True,
    "funcoes_abertas_para_service_role": True,
    "tabela_fechada_para_anon_authenticated": True,
    "upsert_recusa_sem_service_role": True,
    "read_recusa_sem_service_role": True,
    "delete_recusa_sem_service_role": True,
    "authenticated_sem_execute": True,
    "upsert_recusa_ref_de_outro_modulo": True,
    "read_recusa_ref_de_outro_modulo": True,
    "delete_recusa_ref_de_outro_modulo": True,
    "upsert_recusa_segredo_vazio": True,
    "upsert_cria_e_regrava_um_so": [1, "valor-2"],
    "read_devolve_segredo": "valor-2",
    "read_inexistente_null": True,
    "delete_apaga": [True, 0, False],
    "segredo_de_outro_modulo_intacto": 1,
}

CHECAGENS = """
do $dry$
declare
  res jsonb;
  u uuid := gen_random_uuid();
  v_anon boolean := false; v_auth boolean := false; v_auth_ins boolean := false; v_auth_exec boolean := false;
  v_cfg text; v_t1 timestamptz; v_t2 timestamptz;
  v_up_sr boolean := false; v_rd_sr boolean := false; v_del_sr boolean := false;
  v_up_ref boolean := false; v_rd_ref boolean := false; v_del_ref boolean := false; v_vazio boolean := false;
  v_lido text; v_inexistente text; v_del1 boolean; v_del2 boolean; v_qtd int;
begin
  insert into auth.users (id, email, aud, role) values (u, 'adm.email.dryrun@teste.local', 'authenticated', 'authenticated');
  perform vault.create_secret('{"api_key":"z"}', 'asaas_un_dryrun_email', 'dryrun');

  -- ---------------- anon ----------------
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
  begin
    perform 1 from public.integracoes_plataforma;
  exception when insufficient_privilege then v_anon := true;
  end;
  reset role;

  -- ---------------- authenticated ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform 1 from public.integracoes_plataforma;
  exception when insufficient_privilege then v_auth := true;
  end;
  begin
    insert into public.integracoes_plataforma (tipo, config) values ('email_ms365', '{"ativo":true}');
  exception when insufficient_privilege then v_auth_ins := true;
  end;
  begin
    perform public.read_email_secret('email_ms365_dryrun_teste');
  exception when insufficient_privilege then v_auth_exec := true;
  end;
  reset role;

  -- sem service_role nas claims (chamada direta, sem trocar de role)
  begin
    perform public.upsert_email_secret('email_ms365_dryrun_teste', 'x');
  exception when raise_exception then v_up_sr := true;
  end;
  begin
    perform public.read_email_secret('email_ms365_dryrun_teste');
  exception when raise_exception then v_rd_sr := true;
  end;
  begin
    perform public.delete_email_secret('email_ms365_dryrun_teste');
  exception when raise_exception then v_del_sr := true;
  end;

  -- ---------------- service_role ----------------
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
  insert into public.integracoes_plataforma (tipo, config)
  values ('email_ms365', '{"tenant_id":"t","client_id":"c","envia_como":"envio@grupociatos.com.br"}')
  on conflict (tipo) do update set config = excluded.config;
  select config->>'envia_como', atualizado_em into v_cfg, v_t1 from public.integracoes_plataforma where tipo = 'email_ms365';
  update public.integracoes_plataforma set atualizado_em = '2000-01-01', config = config || '{"ativo":true}' where tipo = 'email_ms365';
  select atualizado_em into v_t2 from public.integracoes_plataforma where tipo = 'email_ms365';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

  begin
    perform public.upsert_email_secret('asaas_un_dryrun_email', 'x');
  exception when raise_exception then v_up_ref := true;
  end;
  begin
    perform public.read_email_secret('asaas_un_dryrun_email');
  exception when raise_exception then v_rd_ref := true;
  end;
  begin
    perform public.delete_email_secret('asaas_un_dryrun_email');
  exception when raise_exception then v_del_ref := true;
  end;
  begin
    perform public.upsert_email_secret('email_ms365_dryrun_teste', '');
  exception when raise_exception then v_vazio := true;
  end;

  perform public.upsert_email_secret('email_ms365_dryrun_teste', 'valor-1');
  perform public.upsert_email_secret('email_ms365_dryrun_teste', 'valor-2');
  select count(*) into v_qtd from vault.secrets where name = 'email_ms365_dryrun_teste';
  v_lido := public.read_email_secret('email_ms365_dryrun_teste');
  v_inexistente := public.read_email_secret('email_ms365_dryrun_nao_existe');
  v_del1 := public.delete_email_secret('email_ms365_dryrun_teste');
  v_del2 := public.delete_email_secret('email_ms365_dryrun_teste');

  res := jsonb_build_object(
    'rls_ligada', (select relrowsecurity from pg_class where oid = 'public.integracoes_plataforma'::regclass),
    'sem_politicas', (select count(*) from pg_policies where schemaname = 'public' and tablename = 'integracoes_plataforma'),
    'anon_nao_le', v_anon,
    'authenticated_nao_le', v_auth,
    'authenticated_nao_grava', v_auth_ins,
    'service_role_grava_e_le', v_cfg,
    'atualizado_em_anda', v_t2 > '2000-01-02'::timestamptz,
    'funcoes_fechadas_para_anon_authenticated',
       not has_function_privilege('anon', 'public.upsert_email_secret(text, text)', 'EXECUTE')
       and not has_function_privilege('authenticated', 'public.upsert_email_secret(text, text)', 'EXECUTE')
       and not has_function_privilege('anon', 'public.read_email_secret(text)', 'EXECUTE')
       and not has_function_privilege('authenticated', 'public.read_email_secret(text)', 'EXECUTE')
       and not has_function_privilege('anon', 'public.delete_email_secret(text)', 'EXECUTE')
       and not has_function_privilege('authenticated', 'public.delete_email_secret(text)', 'EXECUTE'),
    'funcoes_abertas_para_service_role',
       has_function_privilege('service_role', 'public.upsert_email_secret(text, text)', 'EXECUTE')
       and has_function_privilege('service_role', 'public.read_email_secret(text)', 'EXECUTE')
       and has_function_privilege('service_role', 'public.delete_email_secret(text)', 'EXECUTE'),
    'tabela_fechada_para_anon_authenticated',
       not has_table_privilege('anon', 'public.integracoes_plataforma', 'SELECT')
       and not has_table_privilege('authenticated', 'public.integracoes_plataforma', 'SELECT')
       and not has_table_privilege('authenticated', 'public.integracoes_plataforma', 'INSERT')
       and not has_table_privilege('authenticated', 'public.integracoes_plataforma', 'UPDATE'),
    'upsert_recusa_sem_service_role', v_up_sr,
    'read_recusa_sem_service_role', v_rd_sr,
    'delete_recusa_sem_service_role', v_del_sr,
    'authenticated_sem_execute', v_auth_exec,
    'upsert_recusa_ref_de_outro_modulo', v_up_ref,
    'read_recusa_ref_de_outro_modulo', v_rd_ref,
    'delete_recusa_ref_de_outro_modulo', v_del_ref,
    'upsert_recusa_segredo_vazio', v_vazio,
    'upsert_cria_e_regrava_um_so', jsonb_build_array(v_qtd, v_lido),
    'read_devolve_segredo', v_lido,
    'read_inexistente_null', v_inexistente is null,
    'delete_apaga', jsonb_build_array(v_del1, (select count(*) from vault.secrets where name = 'email_ms365_dryrun_teste'), v_del2),
    'segredo_de_outro_modulo_intacto', (select count(*) from vault.secrets where name = 'asaas_un_dryrun_email')
  );
  raise exception 'DRYRUN_OK %', res::text;
end
$dry$;
"""


def cli_query(args):
    r = subprocess.run(["supabase", "db", "query", "--linked", *args], cwd=PASTA_VINCULADA, capture_output=True,
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

    m = re.search(r"DRYRUN_OK (\{.*?\})(?=\\n|\"|$)", saida.replace('\\"', '"'))
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
        print(f"  {'OK ' if ok else 'ERR'} {chave:<46} {obtido}" + ("" if ok else f"   (esperado: {esperado})"))

    saida = cli_query([
        "select to_regclass('public.integracoes_plataforma') is null as sem_tabela_nova, "
        "to_regprocedure('public.upsert_email_secret(text, text)') is null as sem_upsert, "
        "to_regprocedure('public.read_email_secret(text)') is null as sem_read, "
        "to_regprocedure('public.delete_email_secret(text)') is null as sem_delete, "
        "not exists (select 1 from vault.secrets where name like 'email_ms365_dryrun%' or name = 'asaas_un_dryrun_email') as sem_segredo_de_teste, "
        "not exists (select 1 from auth.users where email = 'adm.email.dryrun@teste.local') as sem_login_de_teste"
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
        print(saida[-1500:])

    print(f"\n{'TUDO OK' if not falhas else f'{falhas} FALHA(S)'}")
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
