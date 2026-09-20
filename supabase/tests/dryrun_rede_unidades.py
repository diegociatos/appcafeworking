"""
Teste da migration 20260927120000_rede_unidades_experiencia no banco REAL, desfeito.

  begin; <migration>; <checagens>; RAISE 'DRYRUN_OK <json>'; (rollback)

Prova, com JWT de cada papel e com os DADOS REAIS que já estão em produção:
  • unidade de conta PRÓPRIA continua publicável e vendendo: toda unidade real
    passa em unidade_publicavel e todo plano ativo real passa em
    servico_publicavel (é o que mantém Luxemburgo e Estoril no site);
  • a equipe da unidade PRÓPRIA continua mandando e mexendo no documento do kit
    (o documento nasce 'aprovado' e o master da unidade muda a revisão);
  • unidade PARCEIRA sem perfil publicado não é publicável e não vende; depois
    de perfil enviado, documento obrigatório aprovado e revisão do admin, passa
    a vender SÓ as categorias aprovadas no perfil;
  • parceiro não revisa o próprio documento nem lê/grava dados de outra unidade;
  • cliente lê só a própria conversa (e consegue responder nela);
  • anon não lê nenhuma das tabelas novas nem executa as funções novas.
Nada fica gravado: o RAISE final desfaz tudo.

Uso: python supabase/tests/dryrun_rede_unidades.py
"""

import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
MIGRATION = REPO / "supabase" / "migrations" / "20260927120000_rede_unidades_experiencia.sql"

ESPERADO = {
    # ---- dados reais de produção ----
    "unidades_reais_conferidas": True,
    "unidades_reais_todas_publicaveis": True,
    "planos_reais_conferidos": True,
    "planos_reais_todos_vendaveis": True,
    # ---- unidade própria ----
    "propria_publicavel": True,
    "propria_vende_sem_perfil": True,
    "documento_da_propria_nasce_aprovado": True,
    "equipe_da_propria_edita_a_revisao": True,
    "equipe_da_propria_nao_troca_o_arquivo": True,
    # ---- unidade parceira ----
    "documento_da_parceira_nasce_pendente": True,
    "parceiro_nao_revisa_o_proprio_documento": True,
    "admin_revisa_documento_da_parceira": True,
    "parceira_sem_perfil_nao_publica": False,
    "parceira_sem_perfil_nao_vende": False,
    "perfil_enviado_fica_em_analise": "em_analise",
    "publicacao_barrada_sem_documento_obrigatorio": True,
    "parceira_publicada_publica": True,
    "parceira_vende_o_servico_aprovado": True,
    "parceira_nao_vende_servico_fora_do_perfil": False,
    "unidades_publicaveis_em_lote": ["un_dry3_pa", "un_dry3_po"],
    # ---- isolamento entre parceiros ----
    "parceiro_nao_le_perfil_de_outra_unidade": 0,
    "parceiro_nao_grava_em_outra_unidade": True,
    "parceiro_nao_le_mensagem_de_outra_unidade": 0,
    # ---- conversa do cliente ----
    "cliente_le_so_a_propria_conversa": 1,
    "cliente_responde_na_propria_conversa": True,
    "cliente_nao_fala_por_outro_cliente": True,
    "equipe_le_as_duas_conversas_da_unidade": 3,
    # ---- ACL ----
    "anon_nao_le_tabelas_novas": [False, False, False],
    "anon_nao_executa_funcoes_novas": [False, False, False, False, False],
    "authenticated_nao_executa_a_regua_de_publicacao": [False, False, False],
}

CHECAGENS = """
do $dry$
declare
  res jsonb;
  u_adm uuid := gen_random_uuid();
  u_pa  uuid := gen_random_uuid();
  u_pb  uuid := gen_random_uuid();
  u_po  uuid := gen_random_uuid();
  u_cli uuid := gen_random_uuid();
  v_n int;
  v_doc_po uuid; v_doc_pa uuid;
  v_unidades_reais int; v_unidades_reais_ok int;
  v_planos_reais int; v_planos_reais_ok int;
  v_prop_pub boolean; v_prop_vende boolean;
  v_doc_po_status text; v_po_edita boolean := false; v_po_troca boolean := false;
  v_doc_pa_status text; v_pa_revisa boolean := false; v_adm_revisa boolean := false;
  v_pa_sem_perfil boolean; v_pa_sem_perfil_vende boolean;
  v_status_envio text; v_barrado boolean := false;
  v_pa_pub boolean; v_pa_vende boolean; v_pa_vende_fora boolean;
  v_lote jsonb;
  v_pa_le_outro int; v_pa_grava_outro boolean := false; v_pa_le_msg int;
  v_cli_le int; v_cli_responde boolean := false; v_cli_outro boolean := false; v_equipe_le int;
  v_dados jsonb := jsonb_build_object(
    'empresa', 'Parceiro Dry 3 Ltda', 'responsavel', 'Ana Dry', 'endereco', 'Rua Teste, 100, sala 2',
    'cidade', 'Contagem', 'uf', 'MG', 'bairro', 'Centro', 'horarios', 'Segunda a sexta, 8h as 18h',
    'fotos', jsonb_build_array('https://exemplo.local/foto.jpg'), 'servicos', jsonb_build_array('endereco_fiscal'),
    'financeiroConferido', 'true');
begin
  -- =========================================================================
  -- 1) Dados REAIS de produção: nada do que já vende pode sair do ar
  -- =========================================================================
  select count(*), count(*) filter (where public.unidade_publicavel(u.id))
    into v_unidades_reais, v_unidades_reais_ok
  from public.unidades u where u.id not like 'un_dry3_%';

  select count(*), count(*) filter (where public.servico_publicavel(a.unidade_id, a.doc->>'categoria'))
    into v_planos_reais, v_planos_reais_ok
  from public.app_state a
  where a.entity = 'planos' and a.unidade_id is not null and a.unidade_id not like 'un_dry3_%'
    and coalesce((a.doc->>'ativo') <> 'false', true)
    and a.doc->>'categoria' is not null;

  -- =========================================================================
  -- 2) Cenário de teste
  -- =========================================================================
  insert into auth.users (id, email, aud, role) values
    (u_adm, 'adm.dry3@teste.local', 'authenticated', 'authenticated'),
    (u_pa,  'pa.dry3@teste.local',  'authenticated', 'authenticated'),
    (u_pb,  'pb.dry3@teste.local',  'authenticated', 'authenticated'),
    (u_po,  'po.dry3@teste.local',  'authenticated', 'authenticated'),
    (u_cli, 'cli.dry3@teste.local', 'authenticated', 'authenticated');
  insert into public.platform_admins (user_id) values (u_adm);

  insert into public.contas (id, nome, email, tipo, parceiro_status, asaas_wallet_id) values
    ('fr_dry3_pa', 'Parceiro Dry 3 A', 'pa.dry3@teste.local', 'parceiro', 'ativo', '0f1e2d3c-aaaa-bbbb-cccc-1234567890ab'),
    ('fr_dry3_pb', 'Parceiro Dry 3 B', 'pb.dry3@teste.local', 'parceiro', 'ativo', '0f1e2d3c-aaaa-bbbb-cccc-1234567890cd');
  insert into public.contas (id, nome, email) values ('fr_dry3_po', 'Propria Dry 3', 'po.dry3@teste.local');

  insert into public.unidades (id, nome, franqueado_id, cidade) values
    ('un_dry3_pa', 'CafeWorking Contagem Dry', 'fr_dry3_pa', 'Contagem/MG'),
    ('un_dry3_pb', 'CafeWorking Betim Dry',    'fr_dry3_pb', 'Betim/MG'),
    ('un_dry3_po', 'Propria Dry 3',            'fr_dry3_po', 'Belo Horizonte/MG');

  insert into public.unidade_members (user_id, unidade_id, franqueado_id, role) values
    (u_pa,  'un_dry3_pa', 'fr_dry3_pa', 'master'),
    (u_pb,  'un_dry3_pb', 'fr_dry3_pb', 'master'),
    (u_po,  'un_dry3_po', 'fr_dry3_po', 'master'),
    (u_cli, 'un_dry3_pa', 'fr_dry3_pa', 'cliente');

  insert into public.clientes (id, unidade_id, nome, email) values
    ('cli_dry3_a', 'un_dry3_pa', 'Cliente Dry A', 'cli.dry3@teste.local'),
    ('cli_dry3_b', 'un_dry3_pa', 'Cliente Dry B', 'outro.dry3@teste.local');

  -- =========================================================================
  -- 3) Unidade PRÓPRIA continua como hoje
  -- =========================================================================
  v_prop_pub := public.unidade_publicavel('un_dry3_po');
  v_prop_vende := public.servico_publicavel('un_dry3_po', 'coworking');  -- sem perfil nenhum

  perform set_config('request.jwt.claims', json_build_object('sub', u_po, 'role', 'authenticated', 'email', 'po.dry3@teste.local')::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.unidade_documentos (unidade_id, tipo, titulo, nome_arquivo, mime, bytes, storage_path, numero)
  values ('un_dry3_po', 'iptu', 'IPTU Dry propria', 'iptu.pdf', 'application/pdf', 1024, 'un_dry3_po/iptu-dry.pdf', '123')
  returning id, revisao_status into v_doc_po, v_doc_po_status;
  -- a equipe da unidade própria mexe na revisão do próprio documento
  update public.unidade_documentos set revisao_status = 'em_analise', revisao_observacoes = 'conferindo'
   where id = v_doc_po;
  get diagnostics v_n = row_count;
  v_po_edita := v_n = 1;
  -- mas não troca o arquivo por baixo (isso continua sendo apagar e reenviar)
  begin
    update public.unidade_documentos set storage_path = 'un_dry3_po/outro.pdf' where id = v_doc_po;
    v_po_troca := false;
  exception when others then v_po_troca := true;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- =========================================================================
  -- 4) Unidade PARCEIRA: documento nasce pendente e só o admin revisa
  -- =========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', u_pa, 'role', 'authenticated', 'email', 'pa.dry3@teste.local')::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.unidade_documentos (unidade_id, tipo, titulo, nome_arquivo, mime, bytes, storage_path, numero, revisao_status)
  values ('un_dry3_pa', 'iptu', 'IPTU Dry parceira', 'iptu.pdf', 'application/pdf', 2048, 'un_dry3_pa/iptu-dry.pdf', '456', 'aprovado')
  returning id, revisao_status into v_doc_pa, v_doc_pa_status;
  begin
    update public.unidade_documentos set revisao_status = 'aprovado' where id = v_doc_pa;
    get diagnostics v_n = row_count;
    v_pa_revisa := v_n = 0;  -- a RLS esconde a linha (0 linhas) ou o gatilho lança
  exception when others then v_pa_revisa := true;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  perform set_config('request.jwt.claims', json_build_object('sub', u_adm, 'role', 'authenticated', 'email', 'adm.dry3@teste.local')::text, true);
  perform set_config('role', 'authenticated', true);
  update public.unidade_documentos set revisao_status = 'aprovado', revisao_observacoes = '' where id = v_doc_pa;
  get diagnostics v_n = row_count;
  v_adm_revisa := v_n = 1;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- =========================================================================
  -- 5) Publicação da unidade parceira
  -- =========================================================================
  v_pa_sem_perfil := public.unidade_publicavel('un_dry3_pa');
  v_pa_sem_perfil_vende := public.servico_publicavel('un_dry3_pa', 'endereco_fiscal');

  -- parceiro B manda o perfil sem nenhum documento: a publicação tem de barrar
  perform set_config('request.jwt.claims', json_build_object('sub', u_pb, 'role', 'authenticated', 'email', 'pb.dry3@teste.local')::text, true);
  perform set_config('role', 'authenticated', true);
  perform public.salvar_perfil_parceiro('un_dry3_pb', v_dados, true);
  reset role;
  perform set_config('request.jwt.claims', '', true);

  perform set_config('request.jwt.claims', json_build_object('sub', u_adm, 'role', 'authenticated', 'email', 'adm.dry3@teste.local')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform public.revisar_perfil_parceiro('un_dry3_pb', 'publicado', '');
    v_barrado := false;
  exception when others then v_barrado := sqlerrm like '%obrigat%';
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- parceiro A: perfil + documento aprovado → publica
  perform set_config('request.jwt.claims', json_build_object('sub', u_pa, 'role', 'authenticated', 'email', 'pa.dry3@teste.local')::text, true);
  perform set_config('role', 'authenticated', true);
  select status into v_status_envio from public.salvar_perfil_parceiro('un_dry3_pa', v_dados, true);
  -- e não enxerga nem escreve na unidade do parceiro B
  select count(*) into v_pa_le_outro from public.parceiro_unidade_perfis where unidade_id = 'un_dry3_pb';
  begin
    perform public.salvar_perfil_parceiro('un_dry3_pb', v_dados, false);
    v_pa_grava_outro := false;
  exception when others then v_pa_grava_outro := true;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  perform set_config('request.jwt.claims', json_build_object('sub', u_adm, 'role', 'authenticated', 'email', 'adm.dry3@teste.local')::text, true);
  perform set_config('role', 'authenticated', true);
  perform public.revisar_perfil_parceiro('un_dry3_pa', 'publicado', '');
  reset role;
  perform set_config('request.jwt.claims', '', true);

  v_pa_pub := public.unidade_publicavel('un_dry3_pa');
  v_pa_vende := public.servico_publicavel('un_dry3_pa', 'endereco_fiscal');
  v_pa_vende_fora := public.servico_publicavel('un_dry3_pa', 'coworking');
  select coalesce(jsonb_agg(unidade_id order by unidade_id), '[]'::jsonb) into v_lote
  from public.unidades_publicaveis(array['un_dry3_pa', 'un_dry3_pb', 'un_dry3_po']);

  -- =========================================================================
  -- 6) Conversa: cliente só vê a dele
  -- =========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', u_pa, 'role', 'authenticated', 'email', 'pa.dry3@teste.local')::text, true);
  perform set_config('role', 'authenticated', true);
  perform public.enviar_mensagem_unidade('un_dry3_pa', 'cli_dry3_a', 'Bom dia, sua correspondencia chegou.');
  perform public.enviar_mensagem_unidade('un_dry3_pa', 'cli_dry3_b', 'Bom dia, seu contrato foi renovado.');
  reset role;
  perform set_config('request.jwt.claims', '', true);

  perform set_config('request.jwt.claims', json_build_object('sub', u_cli, 'role', 'authenticated', 'email', 'cli.dry3@teste.local')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_cli_le from public.unidade_mensagens;
  begin
    perform public.enviar_mensagem_unidade('un_dry3_pa', 'cli_dry3_a', 'Obrigado, passo ai amanha.');
    v_cli_responde := true;
  exception when others then v_cli_responde := false;
  end;
  begin
    perform public.enviar_mensagem_unidade('un_dry3_pa', 'cli_dry3_b', 'Quero ver o contrato do vizinho.');
    v_cli_outro := false;
  exception when others then v_cli_outro := true;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  perform set_config('request.jwt.claims', json_build_object('sub', u_pb, 'role', 'authenticated', 'email', 'pb.dry3@teste.local')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_pa_le_msg from public.unidade_mensagens;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  perform set_config('request.jwt.claims', json_build_object('sub', u_pa, 'role', 'authenticated', 'email', 'pa.dry3@teste.local')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_equipe_le from public.unidade_mensagens;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  res := jsonb_build_object(
    'unidades_reais_conferidas', v_unidades_reais > 0,
    'unidades_reais_todas_publicaveis', v_unidades_reais = v_unidades_reais_ok,
    'planos_reais_conferidos', v_planos_reais > 0,
    'planos_reais_todos_vendaveis', v_planos_reais = v_planos_reais_ok,
    'propria_publicavel', v_prop_pub,
    'propria_vende_sem_perfil', v_prop_vende,
    'documento_da_propria_nasce_aprovado', v_doc_po_status = 'aprovado',
    'equipe_da_propria_edita_a_revisao', v_po_edita,
    'equipe_da_propria_nao_troca_o_arquivo', v_po_troca,
    'documento_da_parceira_nasce_pendente', v_doc_pa_status = 'pendente',
    'parceiro_nao_revisa_o_proprio_documento', v_pa_revisa,
    'admin_revisa_documento_da_parceira', v_adm_revisa,
    'parceira_sem_perfil_nao_publica', v_pa_sem_perfil,
    'parceira_sem_perfil_nao_vende', v_pa_sem_perfil_vende,
    'perfil_enviado_fica_em_analise', v_status_envio,
    'publicacao_barrada_sem_documento_obrigatorio', v_barrado,
    'parceira_publicada_publica', v_pa_pub,
    'parceira_vende_o_servico_aprovado', v_pa_vende,
    'parceira_nao_vende_servico_fora_do_perfil', v_pa_vende_fora,
    'unidades_publicaveis_em_lote', v_lote,
    'parceiro_nao_le_perfil_de_outra_unidade', v_pa_le_outro,
    'parceiro_nao_grava_em_outra_unidade', v_pa_grava_outro,
    'parceiro_nao_le_mensagem_de_outra_unidade', v_pa_le_msg,
    'cliente_le_so_a_propria_conversa', v_cli_le,
    'cliente_responde_na_propria_conversa', v_cli_responde,
    'cliente_nao_fala_por_outro_cliente', v_cli_outro,
    'equipe_le_as_duas_conversas_da_unidade', v_equipe_le,
    'anon_nao_le_tabelas_novas', jsonb_build_array(
      has_table_privilege('anon', 'public.parceiro_unidade_perfis', 'SELECT'),
      has_table_privilege('anon', 'public.parceiro_requisitos', 'SELECT'),
      has_table_privilege('anon', 'public.unidade_mensagens', 'SELECT')),
    'anon_nao_executa_funcoes_novas', jsonb_build_array(
      has_function_privilege('anon', 'public.unidade_publicavel(text)', 'EXECUTE'),
      has_function_privilege('anon', 'public.servico_publicavel(text,text)', 'EXECUTE'),
      has_function_privilege('anon', 'public.salvar_perfil_parceiro(text,jsonb,boolean)', 'EXECUTE'),
      has_function_privilege('anon', 'public.revisar_perfil_parceiro(text,text,text)', 'EXECUTE'),
      has_function_privilege('anon', 'public.enviar_mensagem_unidade(text,text,text)', 'EXECUTE')),
    'authenticated_nao_executa_a_regua_de_publicacao', jsonb_build_array(
      has_function_privilege('authenticated', 'public.unidade_publicavel(text)', 'EXECUTE'),
      has_function_privilege('authenticated', 'public.unidades_publicaveis(text[])', 'EXECUTE'),
      has_function_privilege('authenticated', 'public.servico_publicavel(text,text)', 'EXECUTE'))
  );
  raise exception 'DRYRUN_OK %', res::text;
end
$dry$;
"""


# Retrato do banco antes e depois: o dry-run não pode deixar objeto, coluna nem
# linha de teste para trás. Comparar antes/depois funciona tanto num banco que
# ainda não tem a migration quanto num que já tem.
RETRATO = (
    "select to_regclass('public.parceiro_unidade_perfis')::text as tabela_perfis, "
    "to_regclass('public.parceiro_requisitos')::text as tabela_requisitos, "
    "to_regclass('public.unidade_mensagens')::text as tabela_mensagens, "
    "to_regprocedure('public.unidade_publicavel(text)')::text as funcao_publicavel, "
    "to_regprocedure('public.unidades_publicaveis(text[])')::text as funcao_lote, "
    "exists (select 1 from information_schema.columns where table_schema='public' "
    "  and table_name='unidade_documentos' and column_name='revisao_status') as coluna_revisao, "
    "(select count(*) from public.unidades) as unidades, "
    "(select count(*) from public.contas) as contas, "
    "(select count(*) from public.clientes) as clientes, "
    "(select count(*) from public.unidade_documentos) as documentos, "
    "(select count(*) from auth.users) as logins"
)

SEM_RASTRO = (
    "select not exists (select 1 from auth.users where email like '%.dry3@teste.local') as sem_login_de_teste, "
    "not exists (select 1 from public.contas where id like 'fr_dry3_%') as sem_conta_de_teste, "
    "not exists (select 1 from public.unidades where id like 'un_dry3_%') as sem_unidade_de_teste, "
    "not exists (select 1 from public.clientes where id like 'cli_dry3_%') as sem_cliente_de_teste, "
    "not exists (select 1 from public.unidade_documentos where storage_path like '%dry%') as sem_documento_de_teste"
)


def cli_query(args):
    r = subprocess.run(["supabase", "db", "query", "--linked", *args], cwd=REPO, capture_output=True,
                       text=True, encoding="utf-8", errors="replace")
    return (r.stdout or "") + (r.stderr or "")


def linhas(saida):
    m = re.search(r"\{.*\}", saida, re.S)
    return json.loads(m.group(0)).get("rows", []) if m else []


def main():
    antes = linhas(cli_query([RETRATO]))
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
        print(saida[-4000:])
        return 1
    resultado = json.loads(m.group(1))

    falhas = 0
    for chave, esperado in ESPERADO.items():
        obtido = resultado.get(chave)
        ok = obtido == esperado
        falhas += not ok
        print(f"  {'OK ' if ok else 'ERR'} {chave:<48} {obtido}" + ("" if ok else f"   (esperado: {esperado})"))

    print("\nO banco ficou como estava?")
    depois = linhas(cli_query([RETRATO]))
    if not antes or not depois:
        falhas += 1
        print("  ERR não foi possível tirar o retrato do banco")
    else:
        for chave, valor in antes[0].items():
            igual = depois[0].get(chave) == valor
            falhas += not igual
            print(f"  {'OK ' if igual else 'ERR'} {chave:<24} {depois[0].get(chave)}"
                  + ("" if igual else f"   (antes: {valor})"))

    print("\nNada de teste ficou gravado?")
    rastro = linhas(cli_query([SEM_RASTRO]))
    for k, v in (rastro[0] if rastro else {}).items():
        falhas += v is not True
        print(f"  {'OK ' if v is True else 'ERR'} {k}")
    if not rastro:
        falhas += 1
        print("  ERR não foi possível verificar")

    print(f"\n{'TUDO OK' if not falhas else f'{falhas} FALHA(S)'}")
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
