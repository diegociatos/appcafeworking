"""
Teste da migration 20260921120000_parceiros_fase1 no banco REAL, desfeito.

  begin; <migration>; <checagens>; RAISE 'DRYRUN_OK <json>'; (rollback)

Cria, dentro da transação, logins (admin da plataforma, master e financeiro de
uma conta parceira, master de uma conta própria), contas, unidades, tabela
nacional, cobrança com split e razão de garantia, e confere:
  • contas existentes continuam 'propria'; travas de percentual, status,
    carteira e e-mails de aviso;
  • planos_modelo só para o admin; unidade nova de conta parceira recebe a
    tabela; conta própria não recebe; conta que vira parceira recebe;
  • master da parceira não muda preço (update direto nem upsert do app), não
    cria plano, não forja plano modelo, não exclui, não aplica a tabela; pausa e
    reativa; unidade própria segue livre;
  • aplicar a tabela atualiza preço, respeita a pausa da unidade e descontinua o
    plano que saiu da tabela;
  • cobrancas: as partes do split precisam fechar;
  • parceiro_garantias: sem duplicar por cobrança/tipo, leitura só da própria
    conta, lançamento de devolução só pelo admin;
  • funções internas fechadas para o front.
Nada fica gravado: o RAISE final desfaz tudo.

Uso: python supabase/tests/dryrun_parceiros_fase1.py
"""

import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
MIGRATION = REPO / "supabase" / "migrations" / "20260921120000_parceiros_fase1.sql"

ESPERADO = {
    "contas_existentes_continuam_propria": True,
    "parceiro_sem_status_barrado": True,
    "percentual_invalido_barrado": True,
    "carteira_invalida_barrada": True,
    "email_de_aviso_invalido_barrado": True,
    "modelo_sem_preco_barrado": True,
    "tabela_copiada_na_unidade_parceira_nova": [3, True, True, True],
    "unidade_propria_nao_recebe_tabela": 0,
    "master_parceiro_nao_muda_preco": [149, 6, ["Endereço para CNPJ"]],
    "upsert_do_app_so_pausa": [299, False, True],
    "master_parceiro_nao_cria_plano": True,
    "master_parceiro_nao_forja_plano_modelo": True,
    "master_parceiro_nao_exclui_plano_modelo": True,
    "master_parceiro_nao_aplica_tabela": True,
    "master_parceiro_nao_ve_tabela_nacional": 0,
    "master_parceiro_nao_grava_tabela_nacional": True,
    "unidade_propria_livre": [1, 55],
    "admin_aplica_tabela": 2,
    "preco_nacional_atualizado": 159,
    "pausa_da_unidade_respeitada": [319, False, True],
    "plano_fora_da_tabela_descontinuado": [False, False, True],
    "master_parceiro_reativa": [True, False],
    "conta_que_vira_parceira_recebe_tabela": [2, 1],
    "split_consistente_gravado": [100, 75, 7.5, 67.5, 25],
    "split_que_nao_fecha_barrado": True,
    "split_pela_metade_barrado": True,
    "garantia_nao_duplica": True,
    "financeiro_parceiro_le_garantias_e_cobrancas": [2, 1],
    "outra_conta_nao_ve_garantias": [0, 0],
    "master_parceiro_nao_lanca_garantia": True,
    "admin_lanca_devolucao": True,
    "admin_nao_lanca_retencao": True,
    "funcoes": [False, False, True, False],
}

CHECAGENS = """
do $dry$
declare
  res jsonb;
  u_adm uuid := gen_random_uuid();
  u_mp  uuid := gen_random_uuid();
  u_fp  uuid := gen_random_uuid();
  u_mo  uuid := gen_random_uuid();
  v_tot int; v_prop int;
  v_sem_status boolean := false; v_pct boolean := false; v_wallet boolean := false; v_email boolean := false;
  v_modelo_ruim boolean := false;
  v_cria boolean := false; v_forja boolean := false; v_apaga boolean := false; v_aplica_mst boolean := false;
  v_mp_modelos int; v_mp_ins_modelo boolean := false;
  v_aplicados int;
  v_cob uuid; v_split_ruim boolean := false; v_split_meio boolean := false; v_dup boolean := false;
  v_fp_gar int; v_fp_cob int; v_mo_gar int; v_mo_cob int;
  v_mp_lanca boolean := false; v_adm_dev boolean := false; v_adm_ret boolean := false;
  v_po_livre jsonb;
  v_reativa jsonb;
  v_upsert jsonb; v_pausa jsonb; v_po_sem_tabela int; v_trava jsonb;
  v_n int;
begin
  select count(*), count(*) filter (where tipo = 'propria') into v_tot, v_prop from public.contas;

  -- ---------------- travas da conta ----------------
  begin
    insert into public.contas (id, nome, tipo) values ('fr_dryrun_pc_x', 'X', 'parceiro');
  exception when check_violation then v_sem_status := true;
  end;
  begin
    insert into public.contas (id, nome, tipo, parceiro_status, parceiro_percentual) values ('fr_dryrun_pc_x', 'X', 'parceiro', 'ativo', 100);
  exception when check_violation then v_pct := true;
  end;
  begin
    insert into public.contas (id, nome, asaas_wallet_id) values ('fr_dryrun_pc_x', 'X', 'carteira com espaço');
  exception when check_violation then v_wallet := true;
  end;
  begin
    insert into public.contas (id, nome, emails_aviso) values ('fr_dryrun_pc_x', 'X', array['ok.pc.dryrun@teste.local', 'nao-e-email']);
  exception when check_violation then v_email := true;
  end;

  -- ---------------- dados de teste ----------------
  insert into auth.users (id, email, aud, role) values
    (u_adm, 'adm.pc.dryrun@teste.local', 'authenticated', 'authenticated'),
    (u_mp,  'mp.pc.dryrun@teste.local',  'authenticated', 'authenticated'),
    (u_fp,  'fp.pc.dryrun@teste.local',  'authenticated', 'authenticated'),
    (u_mo,  'mo.pc.dryrun@teste.local',  'authenticated', 'authenticated');
  insert into public.platform_admins (user_id) values (u_adm);
  insert into public.contas (id, nome, email, tipo, parceiro_status, asaas_wallet_id, emails_aviso) values
    ('fr_dryrun_pc', 'Parceiro PC', 'mp.pc.dryrun@teste.local', 'parceiro', 'ativo', '0f1e2d3c-aaaa-bbbb-cccc-1234567890ab', array['aviso.pc.dryrun@teste.local']);
  insert into public.contas (id, nome, email) values ('fr_dryrun_po', 'Própria PO', 'mo.pc.dryrun@teste.local');

  -- ---------------- tabela nacional pelo admin (JWT) ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', u_adm, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.planos_modelo (id, doc) values
    ('pl_nac_dryrun_fiscal', '{"nome":"Fiscal Dryrun","preco":149,"recorrencia":"mensal","categoria":"endereco_fiscal","venderNoSite":true,"prazoMinimoMeses":6,"beneficios":["Endereço para CNPJ"],"direitos":{"correspondencias":10}}'),
    ('pl_nac_dryrun_cowork', '{"nome":"Cowork Dryrun","preco":299,"recorrencia":"mensal","categoria":"coworking","venderNoSite":true}'),
    ('pl_nac_dryrun_sala',   '{"nome":"Sala Dryrun","preco":999,"recorrencia":"mensal","categoria":"sala_privativa"}');
  begin
    insert into public.planos_modelo (id, doc) values ('pl_nac_dryrun_ruim', '{"nome":"Sem preço"}');
  exception when check_violation then v_modelo_ruim := true;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- ---------------- unidades (como o criar-unidade, service_role) ----------------
  insert into public.unidades (id, nome, franqueado_id) values
    ('un_dryrun_pc', 'Parceira PC', 'fr_dryrun_pc'),
    ('un_dryrun_po', 'Própria PO', 'fr_dryrun_po');
  insert into public.unidade_members (user_id, unidade_id, franqueado_id, role) values
    (u_mp, 'un_dryrun_pc', 'fr_dryrun_pc', 'master'),
    (u_fp, 'un_dryrun_pc', 'fr_dryrun_pc', 'financeiro'),
    (u_mo, 'un_dryrun_po', 'fr_dryrun_po', 'master');
  select count(*) into v_po_sem_tabela from public.app_state where unidade_id = 'un_dryrun_po' and entity = 'planos';

  -- ---------------- master da parceira (JWT) ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', u_mp, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  update public.app_state
     set doc = doc || '{"preco": 1, "prazoMinimoMeses": 0, "beneficios": ["Tudo grátis"]}'::jsonb
   where unidade_id = 'un_dryrun_pc' and entity = 'planos' and item_id = 'pl_nac_dryrun_fiscal';
  -- o app grava com upsert (insert ... on conflict do update)
  insert into public.app_state (unidade_id, entity, item_id, doc)
  select unidade_id, entity, item_id, doc || '{"preco": 5, "ativo": false}'::jsonb
  from public.app_state where unidade_id = 'un_dryrun_pc' and entity = 'planos' and item_id = 'pl_nac_dryrun_cowork'
  on conflict (unidade_id, entity, item_id) do update set doc = excluded.doc;
  select jsonb_build_array(doc -> 'preco', doc -> 'ativo', doc -> 'pausadoNaUnidade') into v_upsert
  from public.app_state where unidade_id = 'un_dryrun_pc' and entity = 'planos' and item_id = 'pl_nac_dryrun_cowork';
  begin
    insert into public.app_state (unidade_id, entity, item_id, doc)
    values ('un_dryrun_pc', 'planos', 'pl_meu_dryrun', '{"id":"pl_meu_dryrun","nome":"Meu","preco":1,"unidadeId":"un_dryrun_pc"}');
  exception when others then v_cria := sqlerrm like '%PLANO_NACIONAL%';
  end;
  begin
    insert into public.app_state (unidade_id, entity, item_id, doc)
    values ('un_dryrun_pc', 'planos', 'pl_nac_forjado', '{"id":"pl_nac_forjado","nome":"Forjado","preco":1,"modelo":true}');
  exception when others then v_forja := sqlerrm like '%PLANO_NACIONAL%';
  end;
  begin
    delete from public.app_state where unidade_id = 'un_dryrun_pc' and entity = 'planos' and item_id = 'pl_nac_dryrun_fiscal';
  exception when others then v_apaga := sqlerrm like '%PLANO_NACIONAL%';
  end;
  begin
    perform public.aplicar_planos_modelo(null);
  exception when others then v_aplica_mst := sqlerrm like '%SO_ADMIN%';
  end;
  select count(*) into v_mp_modelos from public.planos_modelo;
  begin
    insert into public.planos_modelo (id, doc) values ('pl_nac_dryrun_mst', '{"nome":"Master","preco":1}');
  exception when insufficient_privilege then v_mp_ins_modelo := true;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select jsonb_build_array(doc -> 'preco', doc -> 'prazoMinimoMeses', doc -> 'beneficios') into v_trava
  from public.app_state where unidade_id = 'un_dryrun_pc' and entity = 'planos' and item_id = 'pl_nac_dryrun_fiscal';

  -- ---------------- master de unidade própria: livre ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', u_mo, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.app_state (unidade_id, entity, item_id, doc)
  values ('un_dryrun_po', 'planos', 'pl_po_dryrun', '{"id":"pl_po_dryrun","nome":"Próprio","preco":50,"unidadeId":"un_dryrun_po"}');
  update public.app_state set doc = doc || '{"preco": 55}'::jsonb
   where unidade_id = 'un_dryrun_po' and entity = 'planos' and item_id = 'pl_po_dryrun';
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select jsonb_build_array(count(*), max((doc ->> 'preco')::numeric)) into v_po_livre
  from public.app_state where unidade_id = 'un_dryrun_po' and entity = 'planos';

  -- ---------------- admin muda a tabela e aplica ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', u_adm, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  update public.planos_modelo set doc = doc || '{"preco": 159}'::jsonb where id = 'pl_nac_dryrun_fiscal';
  update public.planos_modelo set doc = doc || '{"preco": 319}'::jsonb where id = 'pl_nac_dryrun_cowork';
  delete from public.planos_modelo where id = 'pl_nac_dryrun_sala';
  v_aplicados := public.aplicar_planos_modelo('un_dryrun_pc');
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select jsonb_build_array(doc -> 'preco', doc -> 'ativo', doc -> 'pausadoNaUnidade') into v_pausa
  from public.app_state where unidade_id = 'un_dryrun_pc' and entity = 'planos' and item_id = 'pl_nac_dryrun_cowork';

  -- ---------------- master reativa o plano pausado ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', u_mp, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  update public.app_state set doc = doc || '{"ativo": true}'::jsonb
   where unidade_id = 'un_dryrun_pc' and entity = 'planos' and item_id = 'pl_nac_dryrun_cowork';
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select jsonb_build_array((doc -> 'ativo'), (doc -> 'pausadoNaUnidade')) into v_reativa
  from public.app_state where unidade_id = 'un_dryrun_pc' and entity = 'planos' and item_id = 'pl_nac_dryrun_cowork';

  -- ---------------- conta própria vira parceira (contas-plataforma) ----------------
  update public.contas set tipo = 'parceiro', parceiro_status = 'em_analise' where id = 'fr_dryrun_po';

  -- ---------------- cobrança com split ----------------
  insert into public.cobrancas (unidade_id, cliente, valor, parceiro_conta_id, asaas_wallet_id, split_parceiro_pct, split_garantia_pct,
                                valor_bruto, valor_parceiro, valor_garantia, valor_repasse, valor_cafeworking, status)
  values ('un_dryrun_pc', 'Cliente PC', 100, 'fr_dryrun_pc', '0f1e2d3c-aaaa-bbbb-cccc-1234567890ab', 75, 10, 100, 75, 7.5, 67.5, 25, 'pago')
  returning id into v_cob;
  begin
    insert into public.cobrancas (unidade_id, cliente, valor, parceiro_conta_id, split_parceiro_pct, split_garantia_pct,
                                  valor_bruto, valor_parceiro, valor_garantia, valor_repasse, valor_cafeworking)
    values ('un_dryrun_pc', 'Cliente PC', 100, 'fr_dryrun_pc', 75, 10, 100, 75, 7.5, 70, 25);
  exception when check_violation then v_split_ruim := true;
  end;
  begin
    insert into public.cobrancas (unidade_id, cliente, valor, parceiro_conta_id) values ('un_dryrun_pc', 'Cliente PC', 100, 'fr_dryrun_pc');
  exception when check_violation then v_split_meio := true;
  end;

  -- ---------------- razão de garantia (webhook, service_role) ----------------
  insert into public.parceiro_garantias (conta_id, unidade_id, cobranca_id, tipo, valor) values ('fr_dryrun_pc', 'un_dryrun_pc', v_cob, 'retencao', 7.5);
  begin
    insert into public.parceiro_garantias (conta_id, unidade_id, cobranca_id, tipo, valor) values ('fr_dryrun_pc', 'un_dryrun_pc', v_cob, 'retencao', 7.5);
  exception when unique_violation then v_dup := true;
  end;
  insert into public.parceiro_garantias (conta_id, unidade_id, cobranca_id, tipo, valor) values ('fr_dryrun_pc', 'un_dryrun_pc', v_cob, 'estorno', 7.5);

  perform set_config('request.jwt.claims', json_build_object('sub', u_fp, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_fp_gar from public.parceiro_garantias where conta_id like 'fr_dryrun_%';
  select count(*) into v_fp_cob from public.cobrancas where unidade_id like 'un_dryrun_%';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_mo, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_mo_gar from public.parceiro_garantias where conta_id like 'fr_dryrun_%';
  select count(*) into v_mo_cob from public.cobrancas where unidade_id like 'un_dryrun_%';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_mp, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    insert into public.parceiro_garantias (conta_id, unidade_id, tipo, valor) values ('fr_dryrun_pc', 'un_dryrun_pc', 'devolucao', 7.5);
  exception when insufficient_privilege then v_mp_lanca := true;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_adm, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.parceiro_garantias (conta_id, unidade_id, tipo, valor, observacao) values ('fr_dryrun_pc', 'un_dryrun_pc', 'devolucao', 1, 'teste');
  get diagnostics v_n = row_count;
  v_adm_dev := v_n = 1;
  begin
    insert into public.parceiro_garantias (conta_id, unidade_id, tipo, valor) values ('fr_dryrun_pc', 'un_dryrun_pc', 'retencao', 1);
  exception when insufficient_privilege then v_adm_ret := true;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  res := jsonb_build_object(
    'contas_existentes_continuam_propria', v_tot = v_prop,
    'parceiro_sem_status_barrado', v_sem_status,
    'percentual_invalido_barrado', v_pct,
    'carteira_invalida_barrada', v_wallet,
    'email_de_aviso_invalido_barrado', v_email,
    'modelo_sem_preco_barrado', v_modelo_ruim,
    'tabela_copiada_na_unidade_parceira_nova', (
       select jsonb_build_array(count(*), bool_and(doc ->> 'modelo' = 'true'), bool_and(doc ->> 'unidadeId' = 'un_dryrun_pc'),
                                bool_and(doc ->> 'id' = item_id))
       from public.app_state where unidade_id = 'un_dryrun_pc' and entity = 'planos'),
    'unidade_propria_nao_recebe_tabela', v_po_sem_tabela,
    'master_parceiro_nao_muda_preco', v_trava,
    'upsert_do_app_so_pausa', v_upsert,
    'master_parceiro_nao_cria_plano', v_cria,
    'master_parceiro_nao_forja_plano_modelo', v_forja,
    'master_parceiro_nao_exclui_plano_modelo', v_apaga,
    'master_parceiro_nao_aplica_tabela', v_aplica_mst,
    'master_parceiro_nao_ve_tabela_nacional', v_mp_modelos,
    'master_parceiro_nao_grava_tabela_nacional', v_mp_ins_modelo,
    'unidade_propria_livre', v_po_livre,
    'admin_aplica_tabela', v_aplicados,
    'preco_nacional_atualizado', (select doc -> 'preco' from public.app_state
       where unidade_id = 'un_dryrun_pc' and entity = 'planos' and item_id = 'pl_nac_dryrun_fiscal'),
    'pausa_da_unidade_respeitada', v_pausa,
    'plano_fora_da_tabela_descontinuado', (select jsonb_build_array(doc -> 'ativo', doc -> 'venderNoSite', doc -> 'descontinuado') from public.app_state
       where unidade_id = 'un_dryrun_pc' and entity = 'planos' and item_id = 'pl_nac_dryrun_sala'),
    'master_parceiro_reativa', v_reativa,
    'conta_que_vira_parceira_recebe_tabela', (select jsonb_build_array(
         count(*) filter (where doc ->> 'modelo' = 'true'), count(*) filter (where item_id = 'pl_po_dryrun'))
       from public.app_state where unidade_id = 'un_dryrun_po' and entity = 'planos'),
    'split_consistente_gravado', (select jsonb_build_array(valor_bruto, valor_parceiro, valor_garantia, valor_repasse, valor_cafeworking)
       from public.cobrancas where id = v_cob),
    'split_que_nao_fecha_barrado', v_split_ruim,
    'split_pela_metade_barrado', v_split_meio,
    'garantia_nao_duplica', v_dup,
    'financeiro_parceiro_le_garantias_e_cobrancas', jsonb_build_array(v_fp_gar, v_fp_cob),
    'outra_conta_nao_ve_garantias', jsonb_build_array(v_mo_gar, v_mo_cob),
    'master_parceiro_nao_lanca_garantia', v_mp_lanca,
    'admin_lanca_devolucao', v_adm_dev,
    'admin_nao_lanca_retencao', v_adm_ret,
    'funcoes', jsonb_build_array(
       has_function_privilege('authenticated', 'public.aplicar_planos_modelo_interno(text, text)', 'EXECUTE'),
       has_function_privilege('anon', 'public.aplicar_planos_modelo(text)', 'EXECUTE'),
       has_function_privilege('authenticated', 'public.aplicar_planos_modelo(text)', 'EXECUTE'),
       has_function_privilege('authenticated', 'public.tg_app_state_planos_parceiro()', 'EXECUTE'))
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
        "and table_name = 'contas' and column_name = 'tipo') as sem_coluna_tipo, "
        "not exists (select 1 from information_schema.columns where table_schema = 'public' "
        "and table_name = 'cobrancas' and column_name = 'valor_repasse') as sem_coluna_repasse, "
        "to_regclass('public.planos_modelo') is null as sem_planos_modelo, "
        "to_regclass('public.parceiro_garantias') is null as sem_parceiro_garantias, "
        "to_regprocedure('public.aplicar_planos_modelo(text)') is null as sem_funcao_aplicar, "
        "not exists (select 1 from pg_trigger where tgname = 'planos_parceiro') as sem_gatilho_planos, "
        "not exists (select 1 from auth.users where email like '%.pc.dryrun@teste.local') as sem_login_de_teste, "
        "not exists (select 1 from public.contas where id like 'fr_dryrun_p%') as sem_conta_de_teste, "
        "not exists (select 1 from public.unidades where id like 'un_dryrun_p%') as sem_unidade_de_teste, "
        "not exists (select 1 from public.app_state where unidade_id like 'un_dryrun_p%') as sem_app_state_de_teste, "
        "not exists (select 1 from public.cobrancas where unidade_id like 'un_dryrun_p%') as sem_cobranca_de_teste"
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
