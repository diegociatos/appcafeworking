"""
Teste da migration 20260924120000_desconto_plano_reserva no banco REAL, desfeito.

  begin; <migration>; <checagens>; RAISE 'DRYRUN_OK <json>'; (rollback)

Confere: colunas novas nascem nulas, o check recusa percentual fora de 0–100 e
valor negativo, o par (percentual, valor cheio) tem de vir junto ou não vir,
reserva com desconto grava normal e a RLS de reservas continua igual (staff vê e
grava na unidade, cliente vê só a própria e não grava). Nada fica gravado: o
RAISE final desfaz tudo.

Uso: python supabase/tests/dryrun_desconto_plano_reserva.py
     (worktree sem link: SUPABASE_LINK_DIR=C:\\dev\\appcafe python ...)
"""

import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
MIGRATION = REPO / "supabase" / "migrations" / "20260924120000_desconto_plano_reserva.sql"
# A worktree não tem o link do Supabase CLI: aponta para o repositório principal.
LINK_DIR = Path(os.environ.get("SUPABASE_LINK_DIR", str(REPO)))

ESPERADO = {
    "colunas_criadas": True,
    "reserva_nasce_sem_desconto": True,
    "desconto_valido_aceito": [20.00, 100.00],
    "percentual_acima_de_100_barrado": True,
    "percentual_zero_barrado": True,
    "valor_sem_desconto_negativo_barrado": True,
    "desconto_sem_valor_cheio_barrado": True,
    "valor_cheio_sem_desconto_barrado": True,
    "staff_ve_reserva": 1,
    "staff_grava_desconto": 1,
    "cliente_ve_a_propria": 1,
    "cliente_nao_ve_de_outro": 0,
    "cliente_nao_grava": 0,
    "rls_segue_ligada": True,
}

CHECAGENS = """
do $dry$
declare
  res jsonb;
  u_rec uuid := gen_random_uuid();
  u_cli uuid := gen_random_uuid();
  v_colunas boolean; v_nasce boolean;
  v_pcts numeric[]; v_acima boolean := false; v_zero boolean := false; v_neg boolean := false;
  v_so_pct boolean := false; v_so_valor boolean := false;
  v_staff_ve int; v_staff_upd int; v_cli_ve int; v_cli_outro int; v_cli_upd int := 0;
begin
  insert into auth.users (id, email, aud, role) values
    (u_rec, 'rec.desc.dryrun@teste.local', 'authenticated', 'authenticated'),
    (u_cli, 'cli.desc.dryrun@teste.local', 'authenticated', 'authenticated');
  insert into public.unidades (id, nome) values ('un_dryrun_desc', 'Dryrun Desconto');
  insert into public.unidade_members (user_id, unidade_id, role) values
    (u_rec, 'un_dryrun_desc', 'recepcao'),
    (u_cli, 'un_dryrun_desc', 'cliente');
  insert into public.salas (id, unidade_id, nome, tipo, valor_hora)
  values ('sala_dryrun_desc', 'un_dryrun_desc', 'Sala Dryrun', 'Reunião', 100);

  select count(*) = 2 into v_colunas from information_schema.columns
   where table_schema = 'public' and table_name = 'reservas'
     and column_name in ('desconto_plano_pct', 'valor_sem_desconto');

  -- reserva sem desconto
  insert into public.reservas (id, unidade_id, sala_id, cliente_nome, cliente_email, start_at, end_at, valor)
  values ('res_dryrun_desc_1', 'un_dryrun_desc', 'sala_dryrun_desc', 'Cliente Dryrun',
          'cli.desc.dryrun@teste.local', now() + interval '2 days', now() + interval '2 days 1 hour', 100);
  select desconto_plano_pct is null and valor_sem_desconto is null into v_nasce
    from public.reservas where id = 'res_dryrun_desc_1';

  -- reserva com desconto de 20% (de 100 por 80) e outra com 100%
  insert into public.reservas (id, unidade_id, sala_id, cliente_nome, cliente_email, start_at, end_at,
                               valor, desconto_plano_pct, valor_sem_desconto)
  values ('res_dryrun_desc_2', 'un_dryrun_desc', 'sala_dryrun_desc', 'Cliente Dryrun',
          'cli.desc.dryrun@teste.local', now() + interval '3 days', now() + interval '3 days 1 hour', 80, 20, 100),
         ('res_dryrun_desc_3', 'un_dryrun_desc', 'sala_dryrun_desc', 'Outro Cliente',
          'outro.desc.dryrun@teste.local', now() + interval '4 days', now() + interval '4 days 1 hour', 0, 100, 100);
  select array_agg(desconto_plano_pct order by id) into v_pcts
    from public.reservas where id in ('res_dryrun_desc_2', 'res_dryrun_desc_3');

  begin
    update public.reservas set desconto_plano_pct = 120 where id = 'res_dryrun_desc_2';
  exception when check_violation then v_acima := true;
  end;
  begin
    update public.reservas set desconto_plano_pct = 0 where id = 'res_dryrun_desc_2';
  exception when check_violation then v_zero := true;
  end;
  begin
    update public.reservas set valor_sem_desconto = -1 where id = 'res_dryrun_desc_2';
  exception when check_violation then v_neg := true;
  end;
  begin
    update public.reservas set desconto_plano_pct = 10, valor_sem_desconto = null where id = 'res_dryrun_desc_1';
  exception when check_violation then v_so_pct := true;
  end;
  begin
    update public.reservas set desconto_plano_pct = null, valor_sem_desconto = 50 where id = 'res_dryrun_desc_1';
  exception when check_violation then v_so_valor := true;
  end;

  -- ---------------- RLS ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', u_rec, 'email', 'rec.desc.dryrun@teste.local', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_staff_ve from public.reservas where id = 'res_dryrun_desc_2';
  update public.reservas set desconto_plano_pct = 15, valor_sem_desconto = 100, valor = 85
   where id = 'res_dryrun_desc_2';
  get diagnostics v_staff_upd = row_count;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', u_cli, 'email', 'cli.desc.dryrun@teste.local', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_cli_ve from public.reservas where id = 'res_dryrun_desc_2';
  select count(*) into v_cli_outro from public.reservas where id = 'res_dryrun_desc_3';
  begin
    update public.reservas set desconto_plano_pct = 99, valor_sem_desconto = 100 where id = 'res_dryrun_desc_2';
    get diagnostics v_cli_upd = row_count;
  exception when insufficient_privilege then v_cli_upd := 0;
  end;
  reset role;

  res := jsonb_build_object(
    'colunas_criadas', v_colunas,
    'reserva_nasce_sem_desconto', v_nasce,
    'desconto_valido_aceito', to_jsonb(v_pcts),
    'percentual_acima_de_100_barrado', v_acima,
    'percentual_zero_barrado', v_zero,
    'valor_sem_desconto_negativo_barrado', v_neg,
    'desconto_sem_valor_cheio_barrado', v_so_pct,
    'valor_cheio_sem_desconto_barrado', v_so_valor,
    'staff_ve_reserva', v_staff_ve,
    'staff_grava_desconto', v_staff_upd,
    'cliente_ve_a_propria', v_cli_ve,
    'cliente_nao_ve_de_outro', v_cli_outro,
    'cliente_nao_grava', v_cli_upd,
    'rls_segue_ligada', (select relrowsecurity from pg_class where oid = 'public.reservas'::regclass)
  );
  raise exception 'DRYRUN_OK %', res::text;
end
$dry$;
"""


def cli_query(args):
    r = subprocess.run(["supabase", "db", "query", "--linked", *args], cwd=LINK_DIR, capture_output=True,
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
        "and table_name = 'reservas' and column_name in ('desconto_plano_pct', 'valor_sem_desconto')) as sem_colunas, "
        "not exists (select 1 from auth.users where email like '%.desc.dryrun@teste.local') as sem_login_de_teste, "
        "not exists (select 1 from public.unidades where id = 'un_dryrun_desc') as sem_unidade_de_teste, "
        "not exists (select 1 from public.salas where id = 'sala_dryrun_desc') as sem_sala_de_teste, "
        "not exists (select 1 from public.reservas where id like 'res_dryrun_desc_%') as sem_reserva_de_teste"
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
