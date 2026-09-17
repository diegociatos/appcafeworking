"""
Teste da migration 20260920120000_falhas_graves no banco REAL, desfeito.

  begin; <migration>; <checagens>; RAISE 'DRYRUN_OK <json>'; (rollback)

Cria, dentro da transação, logins, conta, unidade, sala, reservas e créditos de
teste e confere:
  • cancelar_reserva_equipe: cancela na tabela, devolve as horas do plano (por
    e-mail e por cliente_id), não devolve duas vezes, libera o horário, exige
    confirmação para reserva paga, recusa check-in e cancela a que aguarda
    pagamento;
  • cancelar_reserva_cliente continua com as mesmas regras (24h) usando a
    devolução compartilhada;
  • funções fechadas para anon/authenticated;
  • contas: escrita só pelo backend, trava do caminho do contrato e do tipo de
    pessoa; bucket contratos-contas privado e sem policy.
Nada fica gravado: o RAISE final desfaz tudo.

Uso: python supabase/tests/dryrun_falhas_graves.py
"""

import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
MIGRATION = REPO / "supabase" / "migrations" / "20260920120000_falhas_graves.sql"

ESPERADO = {
    "equipe_cancela_status": ["cancelada", "cancelado", True, "Cliente desistiu"],
    "equipe_devolve_horas": [2, 5],
    "estorno_de_horas_unico_e_deterministico": [1, "cl_estorno_r_dryrun_fg_1_sala_reuniao"],
    "repetir_cancelamento_recusado": True,
    "horario_liberado_para_nova_reserva": [True, True],
    "paga_sem_confirmar_recusada": [True, "confirmada"],
    "paga_confirmada_cancela_e_mantem_pago": ["cancelada", "pago", True],
    "checkin_nao_cancela": True,
    "sem_email_devolve_por_cliente_id": [1, None, 3],
    "aguardando_pagamento_cancela": ["cancelada", "cancelado", True],
    "reserva_sem_consumo_devolve_zero": 0,
    "cliente_cancela_com_24h": [1, True],
    "cliente_prazo_24h_mantido": True,
    "cliente_paga_continua_barrada": True,
    "funcoes_fechadas_para_front": True,
    "master_nao_altera_conta": True,
    "master_nao_cria_conta": True,
    "master_ainda_le_a_propria_conta": 1,
    "contrato_de_outra_conta_barrado": True,
    "contrato_valido_gravado": True,
    "tipo_pessoa_invalido_barrado": True,
    "bucket_contratos_privado": [False, 10485760],
    "bucket_contratos_sem_policy": 0,
}

CHECAGENS = """
do $dry$
declare
  res jsonb;
  u_rec uuid := gen_random_uuid();
  u_mst uuid := gen_random_uuid();
  v_em  text := 'cli.fg.dryrun@teste.local';
  v_ini timestamptz := date_trunc('hour', now()) + interval '3 days 2 hours';
  v jsonb; v2 jsonb; v3 jsonb; v4 jsonb; v5 jsonb; v6 jsonb;
  v_rep boolean := false; v_livre boolean := false; v_bloqueado boolean := false; v_paga boolean := false; v_checkin boolean := false;
  v_prazo boolean := false; v_cli_paga boolean := false;
  v_mst_upd boolean := false; v_mst_ins boolean := false; v_mst_le int;
  v_outra boolean := false; v_valido boolean := false; v_tp boolean := false;
  r record; v_n int;
begin
  -- ---------------- dados de teste ----------------
  insert into auth.users (id, email, aud, role) values
    (u_rec, 'rec.fg.dryrun@teste.local', 'authenticated', 'authenticated'),
    (u_mst, 'mst.fg.dryrun@teste.local', 'authenticated', 'authenticated');
  insert into public.contas (id, nome, email, plano, mensalidade) values ('fr_dryrun_fg', 'Dryrun FG', 'mst.fg.dryrun@teste.local', 'Pro', 597);
  insert into public.unidades (id, nome, franqueado_id) values ('un_dryrun_fg', 'Dryrun FG', 'fr_dryrun_fg');
  insert into public.unidade_members (user_id, unidade_id, franqueado_id, role) values
    (u_rec, 'un_dryrun_fg', 'fr_dryrun_fg', 'recepcao'),
    (u_mst, 'un_dryrun_fg', 'fr_dryrun_fg', 'master');
  insert into public.salas (id, unidade_id, nome, tipo, bases, active, contratada)
  values ('sala_dryrun_fg', 'un_dryrun_fg', 'Reunião Dryrun', 'Reunião', 0, true, false);

  -- plano: 5 h por e-mail e 3 h por cliente_id (cadastro sem e-mail)
  insert into public.creditos_ledger (id, unidade_id, cliente_id, cliente_email, tipo, quantidade, origem, referencia_id) values
    ('cl_dryrun_fg_plano',  'un_dryrun_fg', null, v_em, 'sala_reuniao', 5, 'plano', null),
    ('cl_dryrun_fg_plano2', 'un_dryrun_fg', 'cli_dryrun_fg', null, 'sala_reuniao', 3, 'plano', null);

  insert into public.reservas (id, unidade_id, sala_id, cliente_id, cliente_nome, cliente_email, start_at, end_at, status, origem, valor, payment_status, expira_em) values
    ('r_dryrun_fg_1', 'un_dryrun_fg', 'sala_dryrun_fg', null, 'Cliente FG', v_em, v_ini, v_ini + interval '2 hours', 'confirmada', 'recepcao', 0, 'pendente', null),
    ('r_dryrun_fg_2', 'un_dryrun_fg', 'sala_dryrun_fg', null, 'Site FG', 'site.fg.dryrun@teste.local', v_ini + interval '1 day', v_ini + interval '1 day 1 hour', 'confirmada', 'site', 90, 'pago', null),
    ('r_dryrun_fg_3', 'un_dryrun_fg', 'sala_dryrun_fg', null, 'Checkin FG', v_em, v_ini + interval '2 days', v_ini + interval '2 days 1 hour', 'checkin', 'recepcao', 0, 'pendente', null),
    ('r_dryrun_fg_4', 'un_dryrun_fg', 'sala_dryrun_fg', 'cli_dryrun_fg', 'Sem email FG', null, v_ini + interval '3 days', v_ini + interval '3 days 1 hour', 'confirmada', 'recepcao', 0, 'pendente', null),
    ('r_dryrun_fg_5', 'un_dryrun_fg', 'sala_dryrun_fg', null, 'Aguarda FG', 'aguarda.fg.dryrun@teste.local', v_ini + interval '4 days', v_ini + interval '4 days 1 hour', 'aguardando_pagamento', 'site', 90, 'pendente', now() + interval '20 minutes'),
    ('r_dryrun_fg_6', 'un_dryrun_fg', 'sala_dryrun_fg', null, 'Cliente FG', v_em, v_ini + interval '5 days', v_ini + interval '5 days 1 hour', 'confirmada', 'app', 0, 'pendente', null),
    ('r_dryrun_fg_7', 'un_dryrun_fg', 'sala_dryrun_fg', null, 'Cliente FG', v_em, now() + interval '2 hours', now() + interval '3 hours', 'confirmada', 'app', 0, 'pendente', null),
    ('r_dryrun_fg_8', 'un_dryrun_fg', 'sala_dryrun_fg', null, 'Cliente FG', v_em, v_ini + interval '6 days', v_ini + interval '6 days 1 hour', 'confirmada', 'app', 50, 'pago', null);

  insert into public.creditos_ledger (id, unidade_id, cliente_id, cliente_email, tipo, quantidade, origem, referencia_id) values
    ('cl_dryrun_fg_c1', 'un_dryrun_fg', null, v_em, 'sala_reuniao', -2, 'consumo', 'r_dryrun_fg_1'),
    ('cl_dryrun_fg_c4', 'un_dryrun_fg', 'cli_dryrun_fg', null, 'sala_reuniao', -1, 'consumo', 'r_dryrun_fg_4'),
    ('cl_dryrun_fg_c6', 'un_dryrun_fg', null, v_em, 'sala_reuniao', -1, 'consumo', 'r_dryrun_fg_6');

  -- ---------------- equipe (como a Edge Function, service_role) ----------------
  begin
    perform public.criar_reserva_segura(null, 'un_dryrun_fg', 'sala_dryrun_fg', null, 'Outro FG', 'outro.fg.dryrun@teste.local',
      v_ini, v_ini + interval '2 hours', null, 'recepcao', 0);
  exception when others then v_bloqueado := sqlerrm like '%CONFLITO%';
  end;
  v := public.cancelar_reserva_equipe('r_dryrun_fg_1', u_rec, '  Cliente desistiu  ', false);
  begin
    perform public.cancelar_reserva_equipe('r_dryrun_fg_1', u_rec, null, false);
  exception when others then v_rep := sqlerrm like '%JA_CANCELADA%';
  end;
  begin
    perform public.criar_reserva_segura(null, 'un_dryrun_fg', 'sala_dryrun_fg', null, 'Outro FG', 'outro.fg.dryrun@teste.local',
      v_ini, v_ini + interval '2 hours', null, 'recepcao', 0);
    v_livre := true;
  exception when others then v_livre := false;
  end;

  begin
    perform public.cancelar_reserva_equipe('r_dryrun_fg_2', u_rec, null, false);
  exception when others then v_paga := sqlerrm like '%PAGA_CONFIRMAR%';
  end;
  v_paga := v_paga and (select status from public.reservas where id = 'r_dryrun_fg_2') = 'confirmada';
  v2 := public.cancelar_reserva_equipe('r_dryrun_fg_2', u_mst, null, true);

  begin
    perform public.cancelar_reserva_equipe('r_dryrun_fg_3', u_rec, null, false);
  exception when others then v_checkin := sqlerrm like '%NAO_CANCELAVEL%';
  end;

  v4 := public.cancelar_reserva_equipe('r_dryrun_fg_4', u_rec, null, false);
  v5 := public.cancelar_reserva_equipe('r_dryrun_fg_5', u_rec, null, false);

  -- ---------------- cliente (reservas-cliente) ----------------
  v6 := public.cancelar_reserva_cliente('r_dryrun_fg_6', upper(v_em), 24);
  begin
    perform public.cancelar_reserva_cliente('r_dryrun_fg_7', v_em, 24);
  exception when others then v_prazo := sqlerrm like '%PRAZO_CANCELAMENTO%';
  end;
  begin
    perform public.cancelar_reserva_cliente('r_dryrun_fg_8', v_em, 24);
  exception when others then v_cli_paga := sqlerrm like '%PAGA_FALE_CONOSCO%';
  end;

  -- ---------------- contas pelo front (master com JWT) ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', u_mst, 'email', 'mst.fg.dryrun@teste.local', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    update public.contas set mensalidade = 1 where id = 'fr_dryrun_fg';
  exception when insufficient_privilege then v_mst_upd := true;
  end;
  begin
    insert into public.contas (id, nome) values ('fr_dryrun_fg_2', 'Invasora');
  exception when insufficient_privilege then v_mst_ins := true;
  end;
  select count(*) into v_mst_le from public.contas where id = 'fr_dryrun_fg';
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- ---------------- contas pelo backend ----------------
  begin
    update public.contas set contrato_path = 'fr_outra/x-contrato.pdf', contrato_nome = 'c.pdf', contrato_mime = 'application/pdf', contrato_bytes = 10
    where id = 'fr_dryrun_fg';
  exception when check_violation then v_outra := true;
  end;
  update public.contas set contrato_path = 'fr_dryrun_fg/7d0c-contrato.pdf', contrato_nome = 'contrato.pdf',
    contrato_mime = 'application/pdf', contrato_bytes = 1000, contrato_enviado_em = now(), tipo_pessoa = 'PJ', nome_fantasia = 'FG'
  where id = 'fr_dryrun_fg';
  get diagnostics v_n = row_count;
  v_valido := v_n = 1;
  begin
    update public.contas set tipo_pessoa = 'XX' where id = 'fr_dryrun_fg';
  exception when check_violation then v_tp := true;
  end;

  res := jsonb_build_object(
    'equipe_cancela_status', (select jsonb_build_array(status, payment_status, cancelada_por = u_rec and cancelada_em is not null, cancelamento_motivo)
                               from public.reservas where id = 'r_dryrun_fg_1'),
    'equipe_devolve_horas', jsonb_build_array((v ->> 'horas_devolvidas')::numeric,
       (select sum(quantidade) from public.creditos_ledger where unidade_id = 'un_dryrun_fg' and cliente_email = v_em and tipo = 'sala_reuniao'
          and coalesce(referencia_id, '') <> 'r_dryrun_fg_6')),
    'estorno_de_horas_unico_e_deterministico', jsonb_build_array(
       (select count(*) from public.creditos_ledger where referencia_id = 'r_dryrun_fg_1' and origem = 'estorno'),
       (select id from public.creditos_ledger where referencia_id = 'r_dryrun_fg_1' and origem = 'estorno' limit 1)),
    'repetir_cancelamento_recusado', v_rep,
    'horario_liberado_para_nova_reserva', jsonb_build_array(v_bloqueado, v_livre),
    'paga_sem_confirmar_recusada', jsonb_build_array(v_paga, 'confirmada'),
    'paga_confirmada_cancela_e_mantem_pago', (select jsonb_build_array(status, payment_status, (v2 ->> 'paga')::boolean)
                                              from public.reservas where id = 'r_dryrun_fg_2'),
    'checkin_nao_cancela', v_checkin and (select status from public.reservas where id = 'r_dryrun_fg_3') = 'checkin',
    'sem_email_devolve_por_cliente_id', (select jsonb_build_array((v4 ->> 'horas_devolvidas')::numeric, cliente_email, saldo_apos)
                                         from public.creditos_ledger where referencia_id = 'r_dryrun_fg_4' and origem = 'estorno'),
    'aguardando_pagamento_cancela', (select jsonb_build_array(status, payment_status, expira_em is null)
                                     from public.reservas where id = 'r_dryrun_fg_5'),
    'reserva_sem_consumo_devolve_zero', (v5 ->> 'horas_devolvidas')::numeric,
    'cliente_cancela_com_24h', (select jsonb_build_array((v6 ->> 'horas_devolvidas')::numeric, cancelada_em is not null and status = 'cancelada')
                                from public.reservas where id = 'r_dryrun_fg_6'),
    'cliente_prazo_24h_mantido', v_prazo,
    'cliente_paga_continua_barrada', v_cli_paga,
    'funcoes_fechadas_para_front',
       not has_function_privilege('authenticated', 'public.cancelar_reserva_equipe(text, uuid, text, boolean)', 'EXECUTE')
       and not has_function_privilege('anon', 'public.cancelar_reserva_equipe(text, uuid, text, boolean)', 'EXECUTE')
       and not has_function_privilege('authenticated', 'public.devolver_creditos_reserva(text, text)', 'EXECUTE')
       and not has_function_privilege('anon', 'public.devolver_creditos_reserva(text, text)', 'EXECUTE')
       and not has_function_privilege('authenticated', 'public.cancelar_reserva_cliente(text, text, int)', 'EXECUTE')
       and has_function_privilege('service_role', 'public.cancelar_reserva_equipe(text, uuid, text, boolean)', 'EXECUTE'),
    'master_nao_altera_conta', v_mst_upd and (select mensalidade from public.contas where id = 'fr_dryrun_fg') = 597,
    'master_nao_cria_conta', v_mst_ins,
    'master_ainda_le_a_propria_conta', v_mst_le,
    'contrato_de_outra_conta_barrado', v_outra,
    'contrato_valido_gravado', v_valido,
    'tipo_pessoa_invalido_barrado', v_tp,
    'bucket_contratos_privado', (select jsonb_build_array(public, file_size_limit) from storage.buckets where id = 'contratos-contas'),
    'bucket_contratos_sem_policy', (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
                                    and (coalesce(qual, '') like '%contratos-contas%' or coalesce(with_check, '') like '%contratos-contas%'))
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
        "and table_name = 'reservas' and column_name = 'cancelada_por') as sem_coluna_cancelada_por, "
        "not exists (select 1 from information_schema.columns where table_schema = 'public' "
        "and table_name = 'contas' and column_name = 'contrato_path') as sem_coluna_contrato_path, "
        "to_regprocedure('public.cancelar_reserva_equipe(text, uuid, text, boolean)') is null as sem_funcao_equipe, "
        "to_regprocedure('public.devolver_creditos_reserva(text, text)') is null as sem_funcao_devolver, "
        "not exists (select 1 from pg_proc where proname = 'cancelar_reserva_cliente' and prosrc like '%devolver_creditos_reserva%') as cliente_intacta, "
        "not exists (select 1 from storage.buckets where id = 'contratos-contas') as sem_bucket_novo, "
        "not exists (select 1 from auth.users where email like '%.fg.dryrun@teste.local') as sem_login_de_teste, "
        "not exists (select 1 from public.unidades where id like 'un_dryrun_fg%') as sem_unidade_de_teste, "
        "not exists (select 1 from public.contas where id like 'fr_dryrun_fg%') as sem_conta_de_teste, "
        "not exists (select 1 from public.reservas where id like 'r_dryrun_fg_%' or cliente_email like '%.fg.dryrun@teste.local') as sem_reserva_de_teste, "
        "not exists (select 1 from public.creditos_ledger where unidade_id = 'un_dryrun_fg') as sem_credito_de_teste"
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
