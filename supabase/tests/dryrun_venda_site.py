# -*- coding: utf-8 -*-
"""
Teste da migration 20260914120000_venda_site CONTRA O BANCO LINKADO, sem gravar nada.

    python supabase/tests/dryrun_venda_site.py

Uso: ANTES do `supabase db push` que aplica a venda_site. Depois que ela estiver
aplicada, alguns esperados deixam de valer (por exemplo, o número da versão de
contrato), e o teste deve ser adaptado ou aposentado.

Como garante que nada fica gravado:
  begin; <migration>; <bateria de testes>; RAISE 'DRYRUN_OK <json>'; rollback;
O RAISE final aborta a transação de propósito. Depois o script confere por
leitura que nenhuma tabela, coluna, sala ou reserva de teste ficou no banco.

Custo em produção: trava reservas, cobrancas, salas e pending_signups por menos
de um segundo (ALTER TABLE dentro da transação).

Requisitos: Supabase CLI logado e projeto linkado (supabase link), Python 3.
Unidade usada nas salas de teste: a variável UNIDADE_TESTE ou a primeira unidade.
Validado em 2026-09-14 no Postgres 17.6 do projeto lmgbysfrbtgqzbtouzft.
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
REPO = Path(__file__).resolve().parents[2]
MIGRACAO = REPO / "supabase" / "migrations" / "20260914120000_venda_site.sql"

ESPERADO = {
    "hash_banco_igual_codigo": True,
    "versoes": "1->2",
    "v1_vigente_apos_v2": False,
    "v2_vigente": True,
    "contrato_imutavel": True,
    "aceite_sem_update": True,
    "aceite_sem_delete": True,
    "chamada_legada_11_params": "confirmada",
    "hold_criado": "aguardando_pagamento",
    "hold_tem_expiracao": True,
    "hold_bloqueia_horario": True,
    "recusa_sala_sem_online": True,
    "hold_expirado_libera": True,
    "pagou_apos_ocupado": "sem_horario",
    "hold1_final": "cancelada/pago_sem_horario",
    "pagou_a_tempo": "confirmada",
    "hold2_final": "confirmada/pago/expira=null",
    "pagamento_repetido": "ja_confirmada",
    "cancelada_pela_equipe": "nao_reconfirmavel",
    "legado_final": "cancelada/pago_sem_horario",
    "hold3_final": "cancelada/expirado",
    "criar_reserva_anon": False,
    "criar_reserva_logado": False,
    "confirmar_paga_logado": False,
    "liberar_expiradas_anon": False,
    "publicar_contrato_anon": False,
    "indice_unico_cobranca": True,
}


def cli_query(args):
    r = subprocess.run(["supabase", "db", "query", "--linked", *args], cwd=REPO, capture_output=True,
                       text=True, encoding="utf-8", errors="replace")
    return (r.stdout or "") + (r.stderr or "")


def linhas(saida):
    m = re.search(r"\{.*\}", saida, re.S)
    return json.loads(m.group(0)).get("rows", []) if m else []


def unidade_de_teste():
    if os.environ.get("UNIDADE_TESTE"):
        return os.environ["UNIDADE_TESTE"]
    rows = linhas(cli_query(["select id from public.unidades order by created_at nulls last, id limit 1"]))
    if not rows:
        sys.exit("Nenhuma unidade no banco para ancorar as salas de teste (defina UNIDADE_TESTE).")
    return rows[0]["id"]


def montar_sql(unidade):
    corpo = "Contrato de adesão — versão de teste\nCláusula 1ª: café é obrigatório."
    esperado = hashlib.sha256(corpo.encode("utf-8")).hexdigest()
    sql_corpo = corpo.replace("'", "''").replace("\n", "\\n")
    U = unidade.replace("'", "''")
    sig = ("public.criar_reserva_segura(text,text,text,text,text,text,timestamptz,timestamptz,"
           "integer,text,numeric,text,timestamptz,text,text,boolean)")

    def hold(rid, h_ini, h_fim, sala="sala_dryrun"):
        return (f"public.criar_reserva_segura(p_id => '{rid}', p_unidade_id => '{U}', p_sala_id => '{sala}', "
                f"p_cliente_id => null, p_cliente_nome => 'Hold', p_cliente_email => 'hold@example.com', "
                f"p_start_at => v_ini + interval '{h_ini} hours', p_end_at => v_ini + interval '{h_fim} hours', "
                f"p_base => null, p_origem => 'site', p_valor => 50, p_status => 'aguardando_pagamento', "
                f"p_expira_em => now() + interval '30 minutes', p_somente_online => true)")

    def direta(rid, h_ini, h_fim):
        return (f"public.criar_reserva_segura(p_id => '{rid}', p_unidade_id => '{U}', p_sala_id => 'sala_dryrun', "
                f"p_cliente_id => null, p_cliente_nome => 'Recepcao', p_cliente_email => 'rec@example.com', "
                f"p_start_at => v_ini + interval '{h_ini} hours', p_end_at => v_ini + interval '{h_fim} hours', "
                f"p_base => null, p_origem => 'recepcao', p_valor => 0)")

    testes = f"""
do $dryrun$
declare
  res jsonb := '{{}}'::jsonb;
  v_c1 public.contratos_modelos;
  v_c2 public.contratos_modelos;
  v_r  public.reservas;
  v_aceite uuid;
  v_n int;
  v_ini timestamptz := date_trunc('hour', now()) + interval '2 days';
begin
  res := res || jsonb_build_object('postgres', current_setting('server_version'));

  -- 1) contrato: hash do banco = hash do código (UTF-8), versões e imutabilidade
  v_c1 := public.publicar_contrato_modelo(null, 'endereco_fiscal', 'Teste dry-run', E'{sql_corpo}');
  v_c2 := public.publicar_contrato_modelo(null, 'endereco_fiscal', 'Teste dry-run v2', E'{sql_corpo}' || ' (v2)');
  res := res || jsonb_build_object(
    'hash_banco_igual_codigo', v_c1.hash = '{esperado}',
    'versoes', v_c1.versao || '->' || v_c2.versao,
    'v1_vigente_apos_v2', (select vigente from public.contratos_modelos where id = v_c1.id),
    'v2_vigente', v_c2.vigente);
  begin
    update public.contratos_modelos set corpo = 'alterado' where id = v_c1.id;
    res := res || jsonb_build_object('contrato_imutavel', false);
  exception when others then
    res := res || jsonb_build_object('contrato_imutavel', sqlerrm like 'CONTRATO_IMUTAVEL%');
  end;

  -- 2) aceite append-only
  insert into public.aceites_contrato (modelo_id, categoria, versao, hash, unidade_id, cliente_nome, cliente_email, referencia_tipo, referencia_id)
  values (v_c2.id, v_c2.categoria, v_c2.versao, v_c2.hash, '{U}', 'Dry Run', 'dryrun@example.com', 'signup', 'x')
  returning id into v_aceite;
  begin
    update public.aceites_contrato set cliente_nome = 'x' where id = v_aceite;
    res := res || jsonb_build_object('aceite_sem_update', false);
  exception when others then
    res := res || jsonb_build_object('aceite_sem_update', sqlerrm like 'REGISTRO_IMUTAVEL%');
  end;
  begin
    delete from public.aceites_contrato where id = v_aceite;
    res := res || jsonb_build_object('aceite_sem_delete', false);
  exception when others then
    res := res || jsonb_build_object('aceite_sem_delete', sqlerrm like 'REGISTRO_IMUTAVEL%');
  end;

  -- 3) reservas
  insert into public.salas (id, unidade_id, nome, tipo, capacidade, bases, valor_hora, reserva_online, active, contratada)
  values ('sala_dryrun', '{U}', 'DryRun', 'Reuniao', 4, 0, 50, true, true, false),
         ('sala_dryrun_off', '{U}', 'DryRun Off', 'Reuniao', 4, 0, 50, false, true, false);

  v_r := {direta('r_dry_legado', 0, 1)};
  res := res || jsonb_build_object('chamada_legada_11_params', v_r.status);

  v_r := {hold('r_dry_hold', 2, 3)};
  res := res || jsonb_build_object('hold_criado', v_r.status, 'hold_tem_expiracao', v_r.expira_em is not null);

  begin
    perform {direta('r_dry_conflito', 2, 3)};
    res := res || jsonb_build_object('hold_bloqueia_horario', false);
  exception when others then
    res := res || jsonb_build_object('hold_bloqueia_horario', sqlerrm = 'CONFLITO');
  end;

  begin
    perform {hold('r_dry_off', 8, 9, 'sala_dryrun_off')};
    res := res || jsonb_build_object('recusa_sala_sem_online', false);
  exception when others then
    res := res || jsonb_build_object('recusa_sala_sem_online', sqlerrm = 'SALA_SEM_RESERVA_ONLINE');
  end;

  update public.reservas set expira_em = now() - interval '1 minute' where id = 'r_dry_hold';
  v_r := {direta('r_dry_ocupou', 2, 3)};
  res := res || jsonb_build_object('hold_expirado_libera', v_r.status = 'confirmada');
  res := res || jsonb_build_object('pagou_apos_ocupado', public.confirmar_reserva_paga('r_dry_hold'));
  -- cada leitura em comando próprio: um comando SQL enxerga o snapshot do início dele
  res := res || jsonb_build_object('hold1_final', (select status || '/' || payment_status from public.reservas where id = 'r_dry_hold'));

  v_r := {hold('r_dry_hold2', 4, 5)};
  res := res || jsonb_build_object('pagou_a_tempo', public.confirmar_reserva_paga('r_dry_hold2'));
  res := res || jsonb_build_object('hold2_final', (select status || '/' || payment_status || '/expira=' || coalesce(expira_em::text, 'null') from public.reservas where id = 'r_dry_hold2'));
  res := res || jsonb_build_object('pagamento_repetido', public.confirmar_reserva_paga('r_dry_hold2'));

  update public.reservas set status = 'cancelada' where id = 'r_dry_legado';
  res := res || jsonb_build_object('cancelada_pela_equipe', public.confirmar_reserva_paga('r_dry_legado'));
  res := res || jsonb_build_object('legado_final', (select status || '/' || payment_status from public.reservas where id = 'r_dry_legado'));

  v_r := {hold('r_dry_hold3', 6, 7)};
  update public.reservas set expira_em = now() - interval '1 minute' where id = 'r_dry_hold3';
  v_n := public.liberar_reservas_expiradas();
  res := res || jsonb_build_object('liberadas', v_n);
  res := res || jsonb_build_object('hold3_final', (select status || '/' || payment_status from public.reservas where id = 'r_dry_hold3'));

  -- 4) permissões e índice
  res := res || jsonb_build_object(
    'criar_reserva_anon', has_function_privilege('anon', '{sig}', 'execute'),
    'criar_reserva_logado', has_function_privilege('authenticated', '{sig}', 'execute'),
    'confirmar_paga_logado', has_function_privilege('authenticated', 'public.confirmar_reserva_paga(text)', 'execute'),
    'liberar_expiradas_anon', has_function_privilege('anon', 'public.liberar_reservas_expiradas()', 'execute'),
    'publicar_contrato_anon', has_function_privilege('anon', 'public.publicar_contrato_modelo(text,text,text,text)', 'execute'),
    'indice_unico_cobranca', to_regclass('public.cobrancas_asaas_payment_uk') is not null);

  raise exception 'DRYRUN_OK %', res::text;
end
$dryrun$;
"""
    return "begin;\n" + MIGRACAO.read_text(encoding="utf-8") + "\n" + testes + "\nrollback;\n"


def extrair_resultado(saida):
    candidatos = [saida]
    for m in re.finditer(r"\{.*\}", saida, re.S):
        try:
            pilha = [json.loads(m.group(0))]
            while pilha:
                o = pilha.pop()
                if isinstance(o, str) and "DRYRUN_OK" in o:
                    candidatos.append(o)
                elif isinstance(o, dict):
                    pilha.extend(o.values())
                elif isinstance(o, list):
                    pilha.extend(o)
        except Exception:
            pass
    for cand in reversed(candidatos):
        i = cand.find("DRYRUN_OK ")
        if i < 0:
            continue
        resto = cand[i + len("DRYRUN_OK "):]
        resto = resto[resto.find("{"):]
        for tentativa in (resto, resto.replace('\\"', '"')):
            try:
                return json.JSONDecoder().raw_decode(tentativa)[0]
            except Exception:
                continue
    return None


def main():
    unidade = unidade_de_teste()
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False, encoding="utf-8", newline="\n") as f:
        f.write(montar_sql(unidade))
        caminho = f.name
    try:
        saida = cli_query(["-f", caminho])
    finally:
        os.unlink(caminho)

    resultado = extrair_resultado(saida)
    if resultado is None:
        print("A MIGRATION OU UM TESTE FALHOU ANTES DO FIM:\n")
        print(saida[-4000:])
        return 1

    print(f"Postgres {resultado.get('postgres')} · unidade de teste {unidade} · transação desfeita\n")
    falhas = 0
    for chave, esperado in ESPERADO.items():
        obtido = resultado.get(chave)
        ok = obtido == esperado
        falhas += not ok
        print(f"  {'OK ' if ok else 'ERR'} {chave:<28} {obtido}" + ("" if ok else f"   (esperado: {esperado})"))
    liberadas_ok = isinstance(resultado.get("liberadas"), int) and resultado["liberadas"] >= 1
    falhas += not liberadas_ok
    print(f"  {'OK ' if liberadas_ok else 'ERR'} {'liberadas (>= 1)':<28} {resultado.get('liberadas')}")

    # Nada pode ter ficado gravado.
    rows = linhas(cli_query([
        "select to_regclass('public.contratos_modelos') is null as sem_tabela_contratos, "
        "(select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace "
        " where n.nspname = 'public' and p.proname = 'criar_reserva_segura' and p.pronargs = 11) = 1 as funcao_reserva_original, "
        "not exists (select 1 from information_schema.columns where table_schema = 'public' "
        " and table_name = 'reservas' and column_name = 'expira_em') as reservas_sem_coluna_nova, "
        "(select count(*) from public.salas where id like 'sala_dryrun%') = 0 as sem_sala_de_teste, "
        "(select count(*) from public.reservas where id like 'r_dry%') = 0 as sem_reserva_de_teste"
    ]))
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
