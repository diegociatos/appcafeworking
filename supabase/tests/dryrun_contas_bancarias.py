"""
Teste da migration 20260919120000_contas_bancarias no banco REAL, desfeito.

  begin; <migration>; <checagens>; RAISE 'DRYRUN_OK <json>'; (rollback)

Cria, dentro da transação, logins de teste (financeiro e recepção da unidade A,
financeiro da unidade B), grava contas bancárias como o app grava (JWT do
financeiro, RLS) e confere: coluna opcoes, trava da credenciais_ref
("<banco>_<unidade>"), unicidade com regravação (upsert mantém o id), RLS por
papel e a função delete_bank_secret (só service_role, só ref de banco, não apaga
segredo em uso). Nada fica gravado: o RAISE final desfaz tudo, inclusive os
segredos de teste criados no Vault.

Uso: python supabase/tests/dryrun_contas_bancarias.py
"""

import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
MIGRATION = REPO / "supabase" / "migrations" / "20260919120000_contas_bancarias.sql"

ESPERADO = {
    "coluna_opcoes_default_vazio": {},
    "financeiro_grava_conta_da_unidade": True,
    "financeiro_le_conta_gravada": 1,
    "opcoes_gravadas": {"gerarPix": False, "autoRegistrar": True},
    "ref_de_outra_unidade_barrada": True,
    "ref_do_asaas_barrada": True,
    "ref_de_outro_banco_barrada": True,
    "segunda_conta_mesmo_banco_barrada": True,
    "upsert_regrava_mesma_conta": [True, "Inter novo apelido", 1],
    "financeiro_atualiza_conexao": 1,
    "financeiro_nao_ve_outra_unidade": 0,
    "recepcao_nao_ve_contas": 0,
    "recepcao_nao_grava_conta": True,
    "recepcao_update_afeta": 0,
    "recepcao_delete_afeta": 0,
    "funcao_fechada_para_authenticated": True,
    "funcao_recusa_sem_service_role": True,
    "funcao_recusa_ref_do_asaas": True,
    "funcao_nao_apaga_segredo_em_uso": [False, 1],
    "funcao_apaga_segredo_sem_conta": [True, 0],
    "funcao_segredo_inexistente": False,
    "segredo_asaas_intacto": 1,
}

CHECAGENS = """
do $dry$
declare
  res jsonb;
  u_fin uuid := gen_random_uuid();
  u_rec uuid := gen_random_uuid();
  u_fin_b uuid := gen_random_uuid();
  v_ba uuid; v_ba2 uuid; v_n int;
  v_ins_ok boolean := false; v_le int; v_opcoes jsonb;
  v_outra boolean := false; v_asaas boolean := false; v_outro_banco boolean := false; v_dup boolean := false;
  v_apelido text; v_upd_conexao int; v_fin_outra int;
  v_rec_ve int; v_rec_ins boolean := false; v_rec_upd int; v_rec_del int;
  v_sem_sr boolean := false; v_ref_asaas boolean := false;
  v_em_uso boolean; v_apagou boolean; v_inexistente boolean;
begin
  -- ---------------- dados de teste ----------------
  insert into auth.users (id, email, aud, role) values
    (u_fin,   'fin.cb.dryrun@teste.local',   'authenticated', 'authenticated'),
    (u_rec,   'rec.cb.dryrun@teste.local',   'authenticated', 'authenticated'),
    (u_fin_b, 'finb.cb.dryrun@teste.local',  'authenticated', 'authenticated');
  insert into public.unidades (id, nome) values ('un_dryrun_cb_a', 'Dryrun CB A'), ('un_dryrun_cb_b', 'Dryrun CB B');
  insert into public.unidade_members (user_id, unidade_id, role) values
    (u_fin,   'un_dryrun_cb_a', 'financeiro'),
    (u_rec,   'un_dryrun_cb_a', 'recepcao'),
    (u_fin_b, 'un_dryrun_cb_b', 'financeiro');

  -- conta da unidade B (gravada pelo backend) + segredos de teste no Vault
  insert into public.bank_accounts (unidade_id, banco, tipo, credenciais_ref)
  values ('un_dryrun_cb_b', 'itau', 'franqueado', 'itau_un_dryrun_cb_b');
  perform vault.create_secret('{"client_id":"x","client_secret":"y"}', 'inter_un_dryrun_cb_a', 'dryrun');
  perform vault.create_secret('{"client_id":"x","client_secret":"y"}', 'bradesco_un_dryrun_cb_a', 'dryrun');
  perform vault.create_secret('{"api_key":"z"}', 'asaas_un_dryrun_cb_a', 'dryrun');

  -- ---------------- financeiro da unidade A ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', u_fin, 'email', 'fin.cb.dryrun@teste.local', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  begin
    insert into public.bank_accounts (unidade_id, banco, tipo, apelido, ambiente, beneficiario_nome, credenciais_ref, opcoes)
    values ('un_dryrun_cb_a', 'inter', 'franqueado', 'Inter teste', 'sandbox', 'Cedente', 'inter_un_dryrun_cb_a',
            '{"autoRegistrar": true, "gerarPix": false}'::jsonb)
    returning id into v_ba;
    v_ins_ok := v_ba is not null;
  exception when others then v_ins_ok := false;
  end;
  select count(*), max(opcoes::text)::jsonb into v_le, v_opcoes from public.bank_accounts where unidade_id = 'un_dryrun_cb_a';

  begin
    insert into public.bank_accounts (unidade_id, banco, tipo, credenciais_ref)
    values ('un_dryrun_cb_a', 'itau', 'franqueado', 'itau_un_dryrun_cb_b');
  exception when check_violation then v_outra := true;
  end;
  begin
    insert into public.bank_accounts (unidade_id, banco, tipo, credenciais_ref)
    values ('un_dryrun_cb_a', 'inter', 'franqueado', 'asaas_un_dryrun_cb_a');
  exception when check_violation then v_asaas := true;
  end;
  begin
    insert into public.bank_accounts (unidade_id, banco, tipo, credenciais_ref)
    values ('un_dryrun_cb_a', 'btg', 'franqueado', 'inter_un_dryrun_cb_a');
  exception when check_violation then v_outro_banco := true;
  end;
  begin
    insert into public.bank_accounts (unidade_id, banco, tipo, credenciais_ref)
    values ('un_dryrun_cb_a', 'inter', 'franqueador', 'inter_un_dryrun_cb_a');
  exception when unique_violation then v_dup := true;
  end;

  -- o que o PostgREST faz com on_conflict=credenciais_ref + merge-duplicates
  insert into public.bank_accounts (unidade_id, banco, tipo, apelido, credenciais_ref)
  values ('un_dryrun_cb_a', 'inter', 'franqueado', 'Inter novo apelido', 'inter_un_dryrun_cb_a')
  on conflict (credenciais_ref) do update
    set apelido = excluded.apelido, tipo = excluded.tipo
  returning id into v_ba2;
  select apelido into v_apelido from public.bank_accounts where id = v_ba;
  select count(*) into v_n from public.bank_accounts where unidade_id = 'un_dryrun_cb_a';

  update public.bank_accounts set conexao = '{"status":"conectado"}'::jsonb, conexao_status = 'conectado' where id = v_ba;
  get diagnostics v_upd_conexao = row_count;
  select count(*) into v_fin_outra from public.bank_accounts where unidade_id = 'un_dryrun_cb_b';
  reset role;

  -- ---------------- recepção da unidade A ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', u_rec, 'email', 'rec.cb.dryrun@teste.local', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_rec_ve from public.bank_accounts where unidade_id = 'un_dryrun_cb_a';
  begin
    insert into public.bank_accounts (unidade_id, banco, tipo, credenciais_ref)
    values ('un_dryrun_cb_a', 'bradesco', 'franqueado', 'bradesco_un_dryrun_cb_a');
  exception when insufficient_privilege then v_rec_ins := true;
  end;
  update public.bank_accounts set apelido = 'Invadido' where unidade_id = 'un_dryrun_cb_a';
  get diagnostics v_rec_upd = row_count;
  delete from public.bank_accounts where unidade_id = 'un_dryrun_cb_a';
  get diagnostics v_rec_del = row_count;
  -- a função não aceita o JWT de usuário (e nem tem execute para authenticated)
  begin
    perform public.delete_bank_secret('inter_un_dryrun_cb_a');
  exception when insufficient_privilege or raise_exception then v_sem_sr := true;
  end;
  reset role;

  -- sem role service_role nas claims (chamada direta sem JWT do backend)
  perform set_config('request.jwt.claims', json_build_object('sub', u_fin, 'role', 'authenticated')::text, true);
  begin
    perform public.delete_bank_secret('bradesco_un_dryrun_cb_a');
    v_sem_sr := false;
  exception when raise_exception then null;
  end;

  -- ---------------- como o backend (service_role) ----------------
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  begin
    perform public.delete_bank_secret('asaas_un_dryrun_cb_a');
  exception when raise_exception then v_ref_asaas := true;
  end;
  v_em_uso := public.delete_bank_secret('inter_un_dryrun_cb_a');
  v_apagou := public.delete_bank_secret('bradesco_un_dryrun_cb_a');
  v_inexistente := public.delete_bank_secret('btg_un_dryrun_cb_a');

  res := jsonb_build_object(
    'coluna_opcoes_default_vazio', (select opcoes from public.bank_accounts where unidade_id = 'un_dryrun_cb_b'),
    'financeiro_grava_conta_da_unidade', v_ins_ok,
    'financeiro_le_conta_gravada', v_le,
    'opcoes_gravadas', v_opcoes,
    'ref_de_outra_unidade_barrada', v_outra,
    'ref_do_asaas_barrada', v_asaas,
    'ref_de_outro_banco_barrada', v_outro_banco,
    'segunda_conta_mesmo_banco_barrada', v_dup,
    'upsert_regrava_mesma_conta', jsonb_build_array(v_ba2 = v_ba, v_apelido, v_n),
    'financeiro_atualiza_conexao', v_upd_conexao,
    'financeiro_nao_ve_outra_unidade', v_fin_outra,
    'recepcao_nao_ve_contas', v_rec_ve,
    'recepcao_nao_grava_conta', v_rec_ins,
    'recepcao_update_afeta', v_rec_upd,
    'recepcao_delete_afeta', v_rec_del,
    'funcao_fechada_para_authenticated',
       not has_function_privilege('authenticated', 'public.delete_bank_secret(text)', 'EXECUTE')
       and not has_function_privilege('anon', 'public.delete_bank_secret(text)', 'EXECUTE'),
    'funcao_recusa_sem_service_role', v_sem_sr,
    'funcao_recusa_ref_do_asaas', v_ref_asaas,
    'funcao_nao_apaga_segredo_em_uso', jsonb_build_array(v_em_uso,
       (select count(*) from vault.secrets where name = 'inter_un_dryrun_cb_a')),
    'funcao_apaga_segredo_sem_conta', jsonb_build_array(v_apagou,
       (select count(*) from vault.secrets where name = 'bradesco_un_dryrun_cb_a')),
    'funcao_segredo_inexistente', v_inexistente,
    'segredo_asaas_intacto', (select count(*) from vault.secrets where name = 'asaas_un_dryrun_cb_a')
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
        "select not exists (select 1 from information_schema.columns where table_schema = 'public' "
        "and table_name = 'bank_accounts' and column_name = 'opcoes') as sem_coluna_opcoes, "
        "to_regprocedure('public.delete_bank_secret(text)') is null as sem_funcao_nova, "
        "not exists (select 1 from pg_constraint where conname = 'bank_accounts_credenciais_ref_da_conta') as sem_constraint_nova, "
        "to_regclass('public.bank_accounts_credenciais_ref_unica') is null as sem_indice_novo, "
        "not exists (select 1 from vault.secrets where name like '%_un_dryrun_cb_%') as sem_segredo_de_teste, "
        "not exists (select 1 from auth.users where email like '%.cb.dryrun@teste.local') as sem_login_de_teste, "
        "not exists (select 1 from public.unidades where id like 'un_dryrun_cb_%') as sem_unidade_de_teste, "
        "not exists (select 1 from public.bank_accounts where unidade_id like 'un_dryrun_cb_%') as sem_conta_de_teste"
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
