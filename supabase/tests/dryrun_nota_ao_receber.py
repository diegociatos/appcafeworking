"""
Teste da migration 20260918120000_nota_ao_receber no banco REAL, desfeito.

  begin; <migration>; <checagens>; RAISE 'DRYRUN_OK <json>'; (rollback)

Confere: interruptor emitir_ao_receber (padrão desligado), colunas de nota na
cobrança com check de status, reivindicação idempotente (só um update passa),
uma nota valendo por cobrança (simulada/cancelada não contam), on delete set
null nos dois sentidos e que a RLS continua igual (financeiro liga o
interruptor, recepção não; cliente vê a própria nota; authenticated não grava
cobrança). Nada fica gravado: o RAISE final desfaz tudo.

Uso: python supabase/tests/dryrun_nota_ao_receber.py
"""

import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
MIGRATION = REPO / "supabase" / "migrations" / "20260918120000_nota_ao_receber.sql"

ESPERADO = {
    "emitir_ao_receber_padrao_false": False,
    "emitir_ao_receber_not_null": True,
    "cobranca_nota_status_padrao_null": True,
    "nota_status_invalido_barrado": True,
    "reivindicacao_so_uma_passa": [1, 0],
    "segunda_nota_valendo_barrada": True,
    "simulada_e_cancelada_nao_contam": 3,
    "outra_cobranca_aceita_nota": True,
    "apagar_nota_limpa_cobranca": True,
    "apagar_cobranca_limpa_nota": True,
    "financeiro_liga_interruptor": 1,
    "recepcao_nao_liga_interruptor": 0,
    "financeiro_ve_cobranca_com_nota": 1,
    "recepcao_nao_ve_cobranca": 0,
    "cliente_ve_propria_nota": 1,
    "cliente_nao_grava_cobranca": 0,
    "rls_segue_ligada": [True, True, True],
}

CHECAGENS = """
do $dry$
declare
  res jsonb;
  u_fin uuid := gen_random_uuid();
  u_rec uuid := gen_random_uuid();
  u_cli uuid := gen_random_uuid();
  v_cob uuid; v_cob2 uuid; v_nota uuid; v_nota_sim uuid;
  v_padrao boolean; v_notnull boolean; v_status_null boolean;
  v_check boolean := false; v_c1 int; v_c2 int; v_dup boolean := false; v_outras int;
  v_outra boolean := false; v_del_nota boolean; v_del_cob boolean;
  v_fin_cfg int; v_rec_cfg int; v_fin_ve int; v_rec_ve int; v_cli_nota int; v_cli_upd int;
begin
  insert into auth.users (id, email, aud, role) values
    (u_fin, 'fin.nota.dryrun@teste.local', 'authenticated', 'authenticated'),
    (u_rec, 'rec.nota.dryrun@teste.local', 'authenticated', 'authenticated'),
    (u_cli, 'cli.nota.dryrun@teste.local', 'authenticated', 'authenticated');
  insert into public.unidades (id, nome) values ('un_dryrun_nota', 'Dryrun Nota');
  insert into public.unidade_members (user_id, unidade_id, role) values
    (u_fin, 'un_dryrun_nota', 'financeiro'),
    (u_rec, 'un_dryrun_nota', 'recepcao'),
    (u_cli, 'un_dryrun_nota', 'cliente');
  insert into public.clientes (id, unidade_id, nome, documento, email)
  values ('cli_dryrun_nota', 'un_dryrun_nota', 'Cliente Nota', '11122233344', 'cli.nota.dryrun@teste.local');

  -- interruptor
  insert into public.config_fiscal (unidade_id) values ('un_dryrun_nota');
  select emitir_ao_receber into v_padrao from public.config_fiscal where unidade_id = 'un_dryrun_nota';
  select is_nullable = 'NO' into v_notnull from information_schema.columns
   where table_schema = 'public' and table_name = 'config_fiscal' and column_name = 'emitir_ao_receber';

  -- cobrança paga
  insert into public.cobrancas (unidade_id, cliente, cliente_documento, cliente_email, valor, status, asaas_payment_id)
  values ('un_dryrun_nota', 'Cliente Nota', '11122233344', 'cli.nota.dryrun@teste.local', 119, 'pago', 'pay_dryrun_nota_1')
  returning id into v_cob;
  insert into public.cobrancas (unidade_id, cliente, cliente_documento, valor, status, asaas_payment_id)
  values ('un_dryrun_nota', 'Cliente Nota', '11122233344', 50, 'pago', 'pay_dryrun_nota_2')
  returning id into v_cob2;
  select nota_status is null and nota_id is null and nota_erro is null into v_status_null from public.cobrancas where id = v_cob;

  begin
    update public.cobrancas set nota_status = 'qualquer' where id = v_cob;
  exception when check_violation then v_check := true;
  end;

  -- reivindicação (webhook CONFIRMED e RECEIVED)
  update public.cobrancas set nota_status = 'emitindo' where id = v_cob and nota_status is null and nota_id is null;
  get diagnostics v_c1 = row_count;
  update public.cobrancas set nota_status = 'emitindo' where id = v_cob and nota_status is null and nota_id is null;
  get diagnostics v_c2 = row_count;

  -- uma nota valendo por cobrança
  insert into public.notas_fiscais (unidade_id, numero, tomador, tomador_documento, valor, status, cobranca_id)
  values ('un_dryrun_nota', '1', 'Cliente Nota', '11122233344', 119, 'autorizada', v_cob) returning id into v_nota;
  update public.cobrancas set nota_id = v_nota, nota_status = 'emitida' where id = v_cob;
  begin
    insert into public.notas_fiscais (unidade_id, numero, tomador, tomador_documento, valor, status, cobranca_id)
    values ('un_dryrun_nota', '2', 'Cliente Nota', '11122233344', 119, 'processando', v_cob);
  exception when unique_violation then v_dup := true;
  end;
  execute $q$insert into public.notas_fiscais (unidade_id, numero, tomador, tomador_documento, valor, status, cobranca_id)
    values ('un_dryrun_nota', 's', 'Cliente Nota', '11122233344', 119, 'simulada', $1) returning id$q$ using v_cob into v_nota_sim;
  insert into public.notas_fiscais (unidade_id, numero, tomador, tomador_documento, valor, status, cobranca_id)
  values ('un_dryrun_nota', 'c', 'Cliente Nota', '11122233344', 119, 'cancelada', v_cob);
  select count(*) into v_outras from public.notas_fiscais where cobranca_id = v_cob;
  begin
    insert into public.notas_fiscais (unidade_id, numero, tomador, tomador_documento, valor, status, cobranca_id)
    values ('un_dryrun_nota', '3', 'Cliente Nota', '11122233344', 50, 'autorizada', v_cob2);
    v_outra := true;
  exception when unique_violation then v_outra := false;
  end;

  -- ---------------- RLS (antes de apagar) ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', u_fin, 'email', 'fin.nota.dryrun@teste.local', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  update public.config_fiscal set emitir_ao_receber = true where unidade_id = 'un_dryrun_nota';
  get diagnostics v_fin_cfg = row_count;
  select count(*) into v_fin_ve from public.cobrancas where id = v_cob and nota_id = v_nota;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', u_rec, 'email', 'rec.nota.dryrun@teste.local', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  update public.config_fiscal set emitir_ao_receber = false where unidade_id = 'un_dryrun_nota';
  get diagnostics v_rec_cfg = row_count;
  select count(*) into v_rec_ve from public.cobrancas where id = v_cob;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', u_cli, 'email', 'cli.nota.dryrun@teste.local', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_cli_nota from public.notas_fiscais where id = v_nota;
  begin
    update public.cobrancas set nota_status = null where id = v_cob;
    get diagnostics v_cli_upd = row_count;
  exception when insufficient_privilege then v_cli_upd := 0;
  end;
  reset role;

  -- on delete set null
  delete from public.notas_fiscais where id = v_nota;
  select nota_id is null into v_del_nota from public.cobrancas where id = v_cob;
  delete from public.cobrancas where id = v_cob;
  select cobranca_id is null into v_del_cob from public.notas_fiscais where id = v_nota_sim;

  res := jsonb_build_object(
    'emitir_ao_receber_padrao_false', v_padrao,
    'emitir_ao_receber_not_null', v_notnull,
    'cobranca_nota_status_padrao_null', v_status_null,
    'nota_status_invalido_barrado', v_check,
    'reivindicacao_so_uma_passa', jsonb_build_array(v_c1, v_c2),
    'segunda_nota_valendo_barrada', v_dup,
    'simulada_e_cancelada_nao_contam', v_outras,
    'outra_cobranca_aceita_nota', v_outra,
    'apagar_nota_limpa_cobranca', v_del_nota,
    'apagar_cobranca_limpa_nota', v_del_cob,
    'financeiro_liga_interruptor', v_fin_cfg,
    'recepcao_nao_liga_interruptor', v_rec_cfg,
    'financeiro_ve_cobranca_com_nota', v_fin_ve,
    'recepcao_nao_ve_cobranca', v_rec_ve,
    'cliente_ve_propria_nota', v_cli_nota,
    'cliente_nao_grava_cobranca', v_cli_upd,
    'rls_segue_ligada', jsonb_build_array(
      (select relrowsecurity from pg_class where oid = 'public.cobrancas'::regclass),
      (select relrowsecurity from pg_class where oid = 'public.notas_fiscais'::regclass),
      (select relrowsecurity from pg_class where oid = 'public.config_fiscal'::regclass))
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
        print(f"  {'OK ' if ok else 'ERR'} {chave:<40} {obtido}" + ("" if ok else f"   (esperado: {esperado})"))

    saida = cli_query([
        "select not exists (select 1 from information_schema.columns where table_schema = 'public' "
        "and table_name = 'config_fiscal' and column_name = 'emitir_ao_receber') as sem_interruptor, "
        "not exists (select 1 from information_schema.columns where table_schema = 'public' "
        "and table_name = 'cobrancas' and column_name in ('nota_id', 'nota_status', 'nota_erro')) as sem_colunas_cobranca, "
        "not exists (select 1 from information_schema.columns where table_schema = 'public' "
        "and table_name = 'notas_fiscais' and column_name = 'cobranca_id') as sem_coluna_nota, "
        "to_regclass('public.notas_fiscais_cobranca_uk') is null as sem_indice, "
        "not exists (select 1 from auth.users where email like '%.nota.dryrun@teste.local') as sem_login_de_teste, "
        "not exists (select 1 from public.unidades where id = 'un_dryrun_nota') as sem_unidade_de_teste, "
        "not exists (select 1 from public.cobrancas where asaas_payment_id like 'pay_dryrun_nota_%') as sem_cobranca_de_teste"
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
