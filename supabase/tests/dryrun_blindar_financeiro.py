"""
Teste da migration 20260917160000_blindar_financeiro no banco REAL, desfeito.

  begin; <migration>; <checagens>; RAISE 'DRYRUN_OK <json>'; (rollback)

As checagens criam, dentro da transação, logins de teste de cada papel (admin da
plataforma, master, financeiro, recepção, contabilidade e cliente), dados
financeiros em duas unidades e conferem a RLS assumindo o papel authenticated
com o JWT de cada um. Também testam a numeração da DPS (proximo_numero_dps) e a
unique (unidade, série, número). Nada fica gravado: o RAISE final desfaz tudo.

Uso: python supabase/tests/dryrun_blindar_financeiro.py
"""

import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
MIGRATION = REPO / "supabase" / "migrations" / "20260917160000_blindar_financeiro.sql"

# contagens na ordem: config, bank, boletos, cobrancas, notas, notificacoes, assinaturas, creditos
ESPERADO = {
    "helper_financeiro_existe": True,
    "helper_reconhece_master_e_financeiro": [True, True, False, False, False],
    "admin_ve_config_das_duas_unidades": 2,
    "financeiro": [1, 1, 1, 1, 1, 3, 1, 1],
    "master": [1, 1, 1, 1, 1, 3, 1, 1],
    "financeiro_nao_ve_outra_unidade": [0, 0],
    "recepcao": [0, 0, 0, 0, 0, 1, 1, 1],
    "contabilidade": [0, 0, 0, 0, 0, 0, 0, 0],
    "cliente": [0, 0, 1, 1, 1, 1, 1, 1],
    "recepcao_nao_insere_config_fiscal": True,
    "recepcao_update_config_fiscal_afeta": 0,
    "recepcao_nao_insere_conta_bancaria": True,
    "financeiro_update_config_fiscal_afeta": 1,
    "financeiro_insere_conta_bancaria": True,
    "numeracao_sequencial": [1, 2, 3],
    "numeracao_por_serie_e_unidade": [1, 1],
    "numeracao_parte_do_maior_gravado": 11,
    "numeracao_recusa_authenticated": True,
    "numeracao_recusa_sem_service_role": True,
    "numeracao_serie_invalida_barrada": True,
    "dps_duplicada_barrada": True,
    "nota_simulada_sem_numero_permitida": True,
    "status_simulada_no_enum": True,
    "tabela_numeracao_com_rls": True,
    "tabela_numeracao_fechada_para_authenticated": True,
    "funcao_numeracao_fechada_para_authenticated": True,
}

CHECAGENS = """
do $dry$
declare
  res jsonb;
  u_admin uuid := gen_random_uuid();
  u_master uuid := gen_random_uuid();
  u_fin uuid := gen_random_uuid();
  u_rec uuid := gen_random_uuid();
  u_contab uuid := gen_random_uuid();
  u_cli uuid := gen_random_uuid();
  v_ba uuid; v_ba_b uuid; v_ass uuid;
  v_helper jsonb;
  v_admin_config int;
  v_fin jsonb; v_master jsonb; v_rec jsonb; v_contab jsonb; v_cli jsonb; v_fin_outra jsonb;
  v_rec_ins_cfg boolean := false; v_rec_upd_cfg int; v_rec_ins_ba boolean := false;
  v_fin_upd_cfg int; v_fin_ins_ba boolean := false;
  n1 bigint; n2 bigint; n3 bigint; n_serie bigint; n_unid bigint; n_max bigint;
  v_num_auth boolean := false; v_num_sem_sr boolean := false; v_num_serie boolean := false;
  v_dup boolean := false; v_sim boolean := false;
begin
  -- ---------------- dados de teste ----------------
  insert into auth.users (id, email, aud, role) values
    (u_admin,  'admin.fin.dryrun@teste.local',  'authenticated', 'authenticated'),
    (u_master, 'master.fin.dryrun@teste.local', 'authenticated', 'authenticated'),
    (u_fin,    'fin.fin.dryrun@teste.local',    'authenticated', 'authenticated'),
    (u_rec,    'rec.fin.dryrun@teste.local',    'authenticated', 'authenticated'),
    (u_contab, 'contab.fin.dryrun@teste.local', 'authenticated', 'authenticated'),
    (u_cli,    'cli.fin.dryrun@teste.local',    'authenticated', 'authenticated');
  insert into public.platform_admins (user_id) values (u_admin);
  insert into public.unidade_members (user_id, unidade_id, role) values
    (u_master, 'un_dryrun_fin_a', 'master'),
    (u_fin,    'un_dryrun_fin_a', 'financeiro'),
    (u_rec,    'un_dryrun_fin_a', 'recepcao'),
    (u_contab, 'un_dryrun_fin_a', 'contabilidade'),
    (u_cli,    'un_dryrun_fin_a', 'cliente');

  insert into public.unidades (id, nome) values ('un_dryrun_fin_a', 'Dryrun A'), ('un_dryrun_fin_b', 'Dryrun B');
  insert into public.clientes (id, unidade_id, nome, documento, email)
  values ('cli_dryrun_fin', 'un_dryrun_fin_a', 'Cliente Dryrun', '11122233344', 'cli.fin.dryrun@teste.local');

  insert into public.config_fiscal (unidade_id) values ('un_dryrun_fin_a'), ('un_dryrun_fin_b');
  insert into public.bank_accounts (unidade_id, banco, tipo, credenciais_ref)
  values ('un_dryrun_fin_a', 'inter', 'franqueado', 'inter_dryrun') returning id into v_ba;
  insert into public.bank_accounts (unidade_id, banco, tipo, credenciais_ref)
  values ('un_dryrun_fin_b', 'inter', 'franqueado', 'inter_dryrun_b') returning id into v_ba_b;
  insert into public.boletos (bank_account_id, unidade_id, sacado, sacado_documento, valor, vencimento)
  values (v_ba, 'un_dryrun_fin_a', 'Cliente Dryrun', '11122233344', 100, current_date);
  insert into public.cobrancas (unidade_id, cliente, cliente_documento, cliente_email, valor, vencimento) values
    ('un_dryrun_fin_a', 'Cliente Dryrun', '11122233344', 'cli.fin.dryrun@teste.local', 100, current_date),
    ('un_dryrun_fin_b', 'Outro', '99988877766', 'outro.fin.dryrun@teste.local', 50, current_date);
  insert into public.notas_fiscais (unidade_id, numero, tomador, tomador_documento, valor)
  values ('un_dryrun_fin_a', '1', 'Cliente Dryrun', '11122233344', 100);
  insert into public.notificacoes (unidade_id, destinatario, evento, template) values
    ('un_dryrun_fin_a', 'cli.fin.dryrun@teste.local', 'boleto_nova', 'boleto_nova'),
    ('un_dryrun_fin_a', 'outro.fin.dryrun@teste.local', 'reserva', 'reserva'),
    ('un_dryrun_fin_a', 'outro.fin.dryrun@teste.local', 'nfse_emitida', 'nfse_emitida');
  insert into public.assinaturas (unidade_id, cliente_nome, cliente_email, plano_id, plano_nome, valor)
  values ('un_dryrun_fin_a', 'Cliente Dryrun', 'cli.fin.dryrun@teste.local', 'pl', 'Plano', 10) returning id into v_ass;
  insert into public.creditos_ledger (id, unidade_id, cliente_email, tipo, quantidade)
  values ('cred_dryrun_fin', 'un_dryrun_fin_a', 'cli.fin.dryrun@teste.local', 'horas', 2);

  -- ---------------- helper por papel ----------------
  v_helper := '[]'::jsonb;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_master, 'role', 'authenticated')::text, true);
  v_helper := v_helper || to_jsonb(public.is_unidade_financeiro('un_dryrun_fin_a'));
  perform set_config('request.jwt.claims', json_build_object('sub', u_fin, 'role', 'authenticated')::text, true);
  v_helper := v_helper || to_jsonb(public.is_unidade_financeiro('un_dryrun_fin_a'));
  perform set_config('request.jwt.claims', json_build_object('sub', u_rec, 'role', 'authenticated')::text, true);
  v_helper := v_helper || to_jsonb(public.is_unidade_financeiro('un_dryrun_fin_a'));
  perform set_config('request.jwt.claims', json_build_object('sub', u_contab, 'role', 'authenticated')::text, true);
  v_helper := v_helper || to_jsonb(public.is_unidade_financeiro('un_dryrun_fin_a'));
  perform set_config('request.jwt.claims', json_build_object('sub', u_cli, 'role', 'authenticated')::text, true);
  v_helper := v_helper || to_jsonb(public.is_unidade_financeiro('un_dryrun_fin_a'));
  reset role;

  -- ---------------- leitura por papel ----------------
  -- admin
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin, 'email', 'admin.fin.dryrun@teste.local', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_admin_config from public.config_fiscal where unidade_id like 'un_dryrun_fin_%';
  reset role;

  -- financeiro, master, recepção, contabilidade, cliente: mesma bateria na unidade A
  perform set_config('request.jwt.claims', json_build_object('sub', u_fin, 'email', 'fin.fin.dryrun@teste.local', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_fin := jsonb_build_array(
    (select count(*) from public.config_fiscal where unidade_id = 'un_dryrun_fin_a'),
    (select count(*) from public.bank_accounts where unidade_id = 'un_dryrun_fin_a'),
    (select count(*) from public.boletos where unidade_id = 'un_dryrun_fin_a'),
    (select count(*) from public.cobrancas where unidade_id = 'un_dryrun_fin_a'),
    (select count(*) from public.notas_fiscais where unidade_id = 'un_dryrun_fin_a'),
    (select count(*) from public.notificacoes where unidade_id = 'un_dryrun_fin_a'),
    (select count(*) from public.assinaturas where unidade_id = 'un_dryrun_fin_a'),
    (select count(*) from public.creditos_ledger where unidade_id = 'un_dryrun_fin_a'));
  v_fin_outra := jsonb_build_array(
    (select count(*) from public.config_fiscal where unidade_id = 'un_dryrun_fin_b'),
    (select count(*) from public.cobrancas where unidade_id = 'un_dryrun_fin_b'));
  update public.config_fiscal set municipio = 'Belo Horizonte' where unidade_id = 'un_dryrun_fin_a';
  get diagnostics v_fin_upd_cfg = row_count;
  begin
    insert into public.bank_accounts (unidade_id, banco, tipo, credenciais_ref)
    values ('un_dryrun_fin_a', 'itau', 'franqueado', 'itau_dryrun');
    v_fin_ins_ba := true;
  exception when others then v_fin_ins_ba := false;
  end;
  begin
    perform public.proximo_numero_dps('un_dryrun_fin_a', '00001');
  exception when insufficient_privilege then v_num_auth := true;
  end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', u_master, 'email', 'master.fin.dryrun@teste.local', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_master := jsonb_build_array(
    (select count(*) from public.config_fiscal where unidade_id = 'un_dryrun_fin_a'),
    (select count(*) from public.bank_accounts where unidade_id = 'un_dryrun_fin_a' and credenciais_ref = 'inter_dryrun'),
    (select count(*) from public.boletos where unidade_id = 'un_dryrun_fin_a'),
    (select count(*) from public.cobrancas where unidade_id = 'un_dryrun_fin_a'),
    (select count(*) from public.notas_fiscais where unidade_id = 'un_dryrun_fin_a'),
    (select count(*) from public.notificacoes where unidade_id = 'un_dryrun_fin_a'),
    (select count(*) from public.assinaturas where unidade_id = 'un_dryrun_fin_a'),
    (select count(*) from public.creditos_ledger where unidade_id = 'un_dryrun_fin_a'));
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', u_rec, 'email', 'rec.fin.dryrun@teste.local', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_rec := jsonb_build_array(
    (select count(*) from public.config_fiscal where unidade_id = 'un_dryrun_fin_a'),
    (select count(*) from public.bank_accounts where unidade_id = 'un_dryrun_fin_a'),
    (select count(*) from public.boletos where unidade_id = 'un_dryrun_fin_a'),
    (select count(*) from public.cobrancas where unidade_id = 'un_dryrun_fin_a'),
    (select count(*) from public.notas_fiscais where unidade_id = 'un_dryrun_fin_a'),
    (select count(*) from public.notificacoes where unidade_id = 'un_dryrun_fin_a'),
    (select count(*) from public.assinaturas where unidade_id = 'un_dryrun_fin_a'),
    (select count(*) from public.creditos_ledger where unidade_id = 'un_dryrun_fin_a'));
  update public.config_fiscal set municipio = 'Invadido' where unidade_id = 'un_dryrun_fin_a';
  get diagnostics v_rec_upd_cfg = row_count;
  begin
    insert into public.config_fiscal (unidade_id) values ('un_dryrun_fin_c');
  exception when insufficient_privilege then v_rec_ins_cfg := true;
  end;
  begin
    insert into public.bank_accounts (unidade_id, banco, tipo, credenciais_ref)
    values ('un_dryrun_fin_a', 'btg', 'franqueado', 'btg_dryrun');
  exception when insufficient_privilege then v_rec_ins_ba := true;
  end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', u_contab, 'email', 'contab.fin.dryrun@teste.local', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_contab := jsonb_build_array(
    (select count(*) from public.config_fiscal where unidade_id = 'un_dryrun_fin_a'),
    (select count(*) from public.bank_accounts where unidade_id = 'un_dryrun_fin_a'),
    (select count(*) from public.boletos where unidade_id = 'un_dryrun_fin_a'),
    (select count(*) from public.cobrancas where unidade_id = 'un_dryrun_fin_a'),
    (select count(*) from public.notas_fiscais where unidade_id = 'un_dryrun_fin_a'),
    (select count(*) from public.notificacoes where unidade_id = 'un_dryrun_fin_a'),
    (select count(*) from public.assinaturas where unidade_id = 'un_dryrun_fin_a'),
    (select count(*) from public.creditos_ledger where unidade_id = 'un_dryrun_fin_a'));
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', u_cli, 'email', 'cli.fin.dryrun@teste.local', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_cli := jsonb_build_array(
    (select count(*) from public.config_fiscal where unidade_id = 'un_dryrun_fin_a'),
    (select count(*) from public.bank_accounts where unidade_id = 'un_dryrun_fin_a'),
    (select count(*) from public.boletos where unidade_id = 'un_dryrun_fin_a'),
    (select count(*) from public.cobrancas where unidade_id = 'un_dryrun_fin_a'),
    (select count(*) from public.notas_fiscais where unidade_id = 'un_dryrun_fin_a'),
    (select count(*) from public.notificacoes where unidade_id = 'un_dryrun_fin_a'),
    (select count(*) from public.assinaturas where unidade_id = 'un_dryrun_fin_a'),
    (select count(*) from public.creditos_ledger where unidade_id = 'un_dryrun_fin_a'));
  reset role;

  -- ---------------- numeração da DPS (como o backend: service_role) ----------------
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  n1 := public.proximo_numero_dps('un_dryrun_fin_a', '00001');
  n2 := public.proximo_numero_dps('un_dryrun_fin_a', '00001');
  n3 := public.proximo_numero_dps('un_dryrun_fin_a', '00001');
  n_serie := public.proximo_numero_dps('un_dryrun_fin_a', '00002');
  n_unid := public.proximo_numero_dps('un_dryrun_fin_b', '00001');
  insert into public.notas_fiscais (unidade_id, numero, tomador, tomador_documento, valor, serie_dps, numero_dps)
  values ('un_dryrun_fin_a', '10', 'X', '1', 1, '00003', 10);
  n_max := public.proximo_numero_dps('un_dryrun_fin_a', '00003');
  begin
    perform public.proximo_numero_dps('un_dryrun_fin_a', '1');
  exception when others then v_num_serie := true;
  end;
  begin
    insert into public.notas_fiscais (unidade_id, numero, tomador, tomador_documento, valor, serie_dps, numero_dps)
    values ('un_dryrun_fin_a', '10b', 'X', '1', 1, '00003', 10);
  exception when unique_violation then v_dup := true;
  end;
  begin
    insert into public.notas_fiscais (unidade_id, numero, tomador, tomador_documento, valor, serie_dps, numero_dps)
    values ('un_dryrun_fin_a', 'SIM-1', 'X', '1', 1, null, null),
           ('un_dryrun_fin_a', 'SIM-2', 'X', '1', 1, null, null);
    v_sim := true;
  exception when others then v_sim := false;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', u_fin, 'role', 'authenticated')::text, true);
  begin
    perform public.proximo_numero_dps('un_dryrun_fin_a', '00001');
  exception when raise_exception then v_num_sem_sr := true;
  end;

  res := jsonb_build_object(
    'helper_financeiro_existe', to_regprocedure('public.is_unidade_financeiro(text)') is not null,
    'helper_reconhece_master_e_financeiro', v_helper,
    'admin_ve_config_das_duas_unidades', v_admin_config,
    'financeiro', v_fin,
    'master', v_master,
    'financeiro_nao_ve_outra_unidade', v_fin_outra,
    'recepcao', v_rec,
    'contabilidade', v_contab,
    'cliente', v_cli,
    'recepcao_nao_insere_config_fiscal', v_rec_ins_cfg,
    'recepcao_update_config_fiscal_afeta', v_rec_upd_cfg,
    'recepcao_nao_insere_conta_bancaria', v_rec_ins_ba,
    'financeiro_update_config_fiscal_afeta', v_fin_upd_cfg,
    'financeiro_insere_conta_bancaria', v_fin_ins_ba,
    'numeracao_sequencial', jsonb_build_array(n1, n2, n3),
    'numeracao_por_serie_e_unidade', jsonb_build_array(n_serie, n_unid),
    'numeracao_parte_do_maior_gravado', n_max,
    'numeracao_recusa_authenticated', v_num_auth,
    'numeracao_recusa_sem_service_role', v_num_sem_sr,
    'numeracao_serie_invalida_barrada', v_num_serie,
    'dps_duplicada_barrada', v_dup,
    'nota_simulada_sem_numero_permitida', v_sim,
    'status_simulada_no_enum', exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
       where t.typname = 'nfse_status' and e.enumlabel = 'simulada'),
    'tabela_numeracao_com_rls', (select relrowsecurity from pg_class where oid = 'public.nfse_numeracao'::regclass),
    'tabela_numeracao_fechada_para_authenticated',
       not has_table_privilege('authenticated', 'public.nfse_numeracao', 'SELECT')
       and not has_table_privilege('anon', 'public.nfse_numeracao', 'SELECT'),
    'funcao_numeracao_fechada_para_authenticated',
       not has_function_privilege('authenticated', 'public.proximo_numero_dps(text,text)', 'EXECUTE')
       and not has_function_privilege('anon', 'public.proximo_numero_dps(text,text)', 'EXECUTE')
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
        "select to_regclass('public.nfse_numeracao') is null as sem_tabela_nova, "
        "to_regprocedure('public.is_unidade_financeiro(text)') is null as sem_helper_novo, "
        "to_regprocedure('public.proximo_numero_dps(text,text)') is null as sem_funcao_numeracao, "
        "not exists (select 1 from information_schema.columns where table_schema = 'public' "
        "and table_name = 'notas_fiscais' and column_name = 'numero_dps') as sem_coluna_numero_dps, "
        "not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid "
        "where t.typname = 'nfse_status' and e.enumlabel = 'simulada') as sem_status_simulada, "
        "not exists (select 1 from pg_policies where schemaname = 'public' and policyname like '%financeiro%') as sem_policy_nova, "
        "not exists (select 1 from auth.users where email like '%.fin.dryrun@teste.local') as sem_login_de_teste, "
        "not exists (select 1 from public.unidades where id like 'un_dryrun_fin_%') as sem_unidade_de_teste"
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
