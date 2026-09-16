"""
Teste da migration 20260918120000_operacao_recepcao no banco REAL, desfeito.

  begin; <migration>; <checagens>; RAISE 'DRYRUN_OK <json>'; (rollback)

Cria, dentro da transação, logins de teste (recepção de duas unidades,
contabilidade e cliente), clientes e confere: bucket privado e RLS dos arquivos
de correspondência, a RPC acessos_clientes por papel, que usuario_id_por_email
não é chamável pelo app e a auditoria do lançamento manual em creditos_ledger.
O RAISE final desfaz tudo; depois o script confere que nada ficou gravado.

Uso: python supabase/tests/dryrun_operacao_recepcao.py
Numa worktree sem `supabase link`, aponte para a pasta vinculada:
  SUPABASE_LINK_DIR=C:\\dev\\appcafe python supabase/tests/dryrun_operacao_recepcao.py
"""

import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
MIGRATION = REPO / "supabase" / "migrations" / "20260918120000_operacao_recepcao.sql"
PASTA_VINCULADA = Path(os.environ.get("SUPABASE_LINK_DIR") or REPO)

ESPERADO = {
    "bucket_privado_10mb": True,
    "bucket_aceita_webp_e_pdf": True,
    "policies_do_bucket": 4,
    "recepcao_envia_arquivo_da_unidade": True,
    "recepcao_ve_arquivo_da_unidade": 1,
    "outra_unidade_nao_envia": True,
    "outra_unidade_nao_ve": 0,
    "cliente_nao_envia": True,
    "cliente_nao_ve": 0,
    "contabilidade_nao_ve": 0,
    "acessos_recepcao_linhas": 2,
    "acessos_cliente_com_login_e_vinculo": True,
    "acessos_sem_login": True,
    "acessos_convidado_em": True,
    "acessos_outra_unidade": 0,
    "acessos_cliente": 0,
    "acessos_anon_sem_execute": True,
    "usuario_por_email_bloqueado_ao_app": True,
    "usuario_por_email_service_role": True,
    "credito_created_by_forcado": True,
    "credito_manual_auditado": 1,
    "credito_service_role_sem_auditoria_dupla": 1,
}

CHECAGENS = """
do $dry$
declare
  res jsonb;
  u_rec    uuid := gen_random_uuid();
  u_rec_b  uuid := gen_random_uuid();
  u_contab uuid := gen_random_uuid();
  u_cli    uuid := gen_random_uuid();
  v_envia boolean := false; v_ve int; v_outra_envia boolean := false; v_outra_ve int;
  v_cli_envia boolean := false; v_cli_ve int; v_contab_ve int;
  v_linhas int; v_cli_ok boolean; v_sem_login boolean; v_convidado boolean;
  v_outra_linhas int; v_cli_linhas int;
  v_uid_bloqueado boolean := false; v_uid_service boolean;
  v_created_by uuid; v_audit_manual int; v_audit_total int;
begin
  insert into auth.users (id, email, aud, role) values
    (u_rec, 'rec.oprec.dryrun@teste.local', 'authenticated', 'authenticated'),
    (u_rec_b, 'recb.oprec.dryrun@teste.local', 'authenticated', 'authenticated'),
    (u_contab, 'contab.oprec.dryrun@teste.local', 'authenticated', 'authenticated'),
    (u_cli, 'cli.oprec.dryrun@teste.local', 'authenticated', 'authenticated');
  insert into public.unidades (id, nome) values ('un_dryrun_oprec_a', 'Dryrun A'), ('un_dryrun_oprec_b', 'Dryrun B');
  insert into public.unidade_members (user_id, unidade_id, role) values
    (u_rec, 'un_dryrun_oprec_a', 'recepcao'),
    (u_rec_b, 'un_dryrun_oprec_b', 'recepcao'),
    (u_contab, 'un_dryrun_oprec_a', 'contabilidade'),
    (u_cli, 'un_dryrun_oprec_a', 'cliente');
  insert into public.clientes (id, unidade_id, nome, email) values
    ('cli_oprec_1', 'un_dryrun_oprec_a', 'Com login', 'Cli.Oprec.Dryrun@teste.local'),
    ('cli_oprec_2', 'un_dryrun_oprec_a', 'Sem login', 'semlogin.oprec.dryrun@teste.local'),
    ('cli_oprec_3', 'un_dryrun_oprec_a', 'Sem e-mail', null);
  insert into public.audit_logs (unidade_id, acao, entidade, entidade_id, detalhe)
  values ('un_dryrun_oprec_a', 'cliente.acesso_enviado', 'cliente', 'cli_oprec_2', jsonb_build_object('email', 'semlogin.oprec.dryrun@teste.local'));

  -- ---- recepção da unidade A ----
  perform set_config('request.jwt.claims', json_build_object('sub', u_rec, 'email', 'rec.oprec.dryrun@teste.local', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    insert into storage.objects (bucket_id, name) values ('correspondencias', 'un_dryrun_oprec_a/co_dryrun.webp');
    v_envia := true;
  exception when others then v_envia := false;
  end;
  select count(*) into v_ve from storage.objects where bucket_id = 'correspondencias' and name like 'un_dryrun_oprec_a/%';
  select count(*),
         bool_or(email = 'cli.oprec.dryrun@teste.local' and tem_login and tem_acesso),
         bool_or(email = 'semlogin.oprec.dryrun@teste.local' and not tem_login and not tem_acesso),
         bool_or(email = 'semlogin.oprec.dryrun@teste.local' and convidado_em is not null)
    into v_linhas, v_cli_ok, v_sem_login, v_convidado
    from public.acessos_clientes('un_dryrun_oprec_a');
  begin
    perform public.usuario_id_por_email('cli.oprec.dryrun@teste.local');
  exception when insufficient_privilege then v_uid_bloqueado := true;
  end;
  insert into public.creditos_ledger (id, unidade_id, cliente_id, tipo, quantidade, origem, motivo, referencia_id, created_by)
  values ('cred_oprec_manual', 'un_dryrun_oprec_a', 'cli_oprec_3', 'sala_reuniao', 4, 'horas_mes', 'Horas de sala 09/2026 · teste', 'horas_mes:2026-09:sala_reuniao', gen_random_uuid());
  reset role;

  -- ---- recepção da unidade B ----
  perform set_config('request.jwt.claims', json_build_object('sub', u_rec_b, 'email', 'recb.oprec.dryrun@teste.local', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    insert into storage.objects (bucket_id, name) values ('correspondencias', 'un_dryrun_oprec_a/co_intruso.webp');
  exception when others then v_outra_envia := true;
  end;
  select count(*) into v_outra_ve from storage.objects where bucket_id = 'correspondencias' and name like 'un_dryrun_oprec_a/%';
  select count(*) into v_outra_linhas from public.acessos_clientes('un_dryrun_oprec_a');
  reset role;

  -- ---- cliente ----
  perform set_config('request.jwt.claims', json_build_object('sub', u_cli, 'email', 'cli.oprec.dryrun@teste.local', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    insert into storage.objects (bucket_id, name) values ('correspondencias', 'un_dryrun_oprec_a/co_cliente.webp');
  exception when others then v_cli_envia := true;
  end;
  select count(*) into v_cli_ve from storage.objects where bucket_id = 'correspondencias' and name like 'un_dryrun_oprec_a/%';
  select count(*) into v_cli_linhas from public.acessos_clientes('un_dryrun_oprec_a');
  reset role;

  -- ---- contabilidade ----
  perform set_config('request.jwt.claims', json_build_object('sub', u_contab, 'email', 'contab.oprec.dryrun@teste.local', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_contab_ve from storage.objects where bucket_id = 'correspondencias' and name like 'un_dryrun_oprec_a/%';
  reset role;

  -- ---- service_role (Edge Functions): sem auth.uid() ----
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
  v_uid_service := public.usuario_id_por_email('CLI.oprec.dryrun@teste.local') = u_cli;
  insert into public.creditos_ledger (id, unidade_id, cliente_id, tipo, quantidade, origem)
  values ('cred_oprec_consumo', 'un_dryrun_oprec_a', 'cli_oprec_3', 'sala_reuniao', -1, 'consumo');
  reset role;

  select created_by into v_created_by from public.creditos_ledger where id = 'cred_oprec_manual';
  select count(*) into v_audit_manual from public.audit_logs
    where acao = 'credito.lancado' and entidade_id = 'cli_oprec_3' and ator_id = u_rec
      and detalhe ->> 'lancamento_id' = 'cred_oprec_manual' and ator_email = 'rec.oprec.dryrun@teste.local';
  select count(*) into v_audit_total from public.audit_logs where acao = 'credito.lancado' and entidade_id = 'cli_oprec_3';

  res := jsonb_build_object(
    'bucket_privado_10mb', (select not public and file_size_limit = 10485760 from storage.buckets where id = 'correspondencias'),
    'bucket_aceita_webp_e_pdf', (select allowed_mime_types @> array['image/webp', 'application/pdf'] from storage.buckets where id = 'correspondencias'),
    'policies_do_bucket', (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'correspondencias_equipe_%'),
    'recepcao_envia_arquivo_da_unidade', v_envia,
    'recepcao_ve_arquivo_da_unidade', v_ve,
    'outra_unidade_nao_envia', v_outra_envia,
    'outra_unidade_nao_ve', v_outra_ve,
    'cliente_nao_envia', v_cli_envia,
    'cliente_nao_ve', v_cli_ve,
    'contabilidade_nao_ve', v_contab_ve,
    'acessos_recepcao_linhas', v_linhas,
    'acessos_cliente_com_login_e_vinculo', v_cli_ok,
    'acessos_sem_login', v_sem_login,
    'acessos_convidado_em', v_convidado,
    'acessos_outra_unidade', v_outra_linhas,
    'acessos_cliente', v_cli_linhas,
    'acessos_anon_sem_execute', not has_function_privilege('anon', 'public.acessos_clientes(text)', 'execute'),
    'usuario_por_email_bloqueado_ao_app', v_uid_bloqueado and not has_function_privilege('authenticated', 'public.usuario_id_por_email(text)', 'execute'),
    'usuario_por_email_service_role', v_uid_service,
    'credito_created_by_forcado', v_created_by = u_rec,
    'credito_manual_auditado', v_audit_manual,
    'credito_service_role_sem_auditoria_dupla', v_audit_total
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
        print(f"  {'OK ' if ok else 'ERR'} {chave:<42} {obtido}" + ("" if ok else f"   (esperado: {esperado})"))

    saida = cli_query([
        "select not exists (select 1 from storage.buckets where id = 'correspondencias') as sem_bucket_novo, "
        "to_regprocedure('public.acessos_clientes(text)') is null as sem_rpc_acessos, "
        "to_regprocedure('public.usuario_id_por_email(text)') is null as sem_rpc_usuario, "
        "not exists (select 1 from pg_trigger where tgname in ('creditos_ledger_autor', 'creditos_ledger_auditar')) as sem_gatilhos, "
        "not exists (select 1 from pg_policies where policyname like 'correspondencias_equipe_%') as sem_policies, "
        "not exists (select 1 from auth.users where email like '%.oprec.dryrun@teste.local') as sem_login_de_teste, "
        "not exists (select 1 from public.unidades where id like 'un_dryrun_oprec_%') as sem_unidade_de_teste, "
        "not exists (select 1 from public.creditos_ledger where id like 'cred_oprec_%') as sem_credito_de_teste"
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
