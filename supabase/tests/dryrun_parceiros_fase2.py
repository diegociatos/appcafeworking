"""
Teste da migration 20260923120000_parceiros_fase2 no banco REAL, desfeito.

  begin; <migration>; <checagens>; RAISE 'DRYRUN_OK <json>'; (rollback)

Cria, dentro da transação, logins (admin da plataforma, master de uma conta
parceira, master de uma conta própria), contas, unidades, candidaturas,
correspondências no app_state, cobrança com split e garantia, e confere:
  • parceiro_candidaturas: travas de situação, documento, UF, e-mail, serviços,
    recusa sem motivo, dois pedidos abertos com o mesmo documento;
  • RLS: o admin lê e move para 'em_analise'; não aprova nem recusa pelo app
    (isso é da Edge Function); quem não é admin não lê nada;
  • contratos_modelos aceita a categoria 'parceria' e recusa categoria inválida;
  • proximo_dia_util pula sábado e domingo;
  • correspondencias_fora_prazo só traz unidade parceira, sem aviso e além do
    prazo; ignora a notificada e a de unidade própria; a equipe da unidade lê a
    da própria unidade e ninguém de fora lê a lista geral;
  • parceiro_alertas não duplica o mesmo alerta e o parceiro lê os seus;
  • parceiro_indicadores devolve clientes, receita do mês, garantia e atrasos,
    só para o admin.
Nada fica gravado: o RAISE final desfaz tudo.

Uso: python supabase/tests/dryrun_parceiros_fase2.py
"""

import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
MIGRATION = REPO / "supabase" / "migrations" / "20260923120000_parceiros_fase2.sql"

ESPERADO = {
    "situacao_invalida_barrada": True,
    "documento_invalido_barrado": True,
    "uf_invalida_barrada": True,
    "email_invalido_barrado": True,
    "servico_desconhecido_barrado": True,
    "recusa_sem_motivo_barrada": True,
    "dois_pedidos_abertos_barrados": True,
    "pedido_novo_depois_de_recusar_passa": True,
    "admin_le_candidaturas": 2,
    "admin_marca_em_analise": True,
    "admin_nao_aprova_pelo_app": True,
    "admin_nao_recusa_pelo_app": True,
    "nao_admin_nao_ve_candidatura": 0,
    "nao_admin_nao_grava_candidatura": True,
    "contrato_de_parceria_publica": ["parceria", 1, True],
    "categoria_invalida_barrada": True,
    # quinta → sexta; sexta → segunda; sábado → segunda; domingo → segunda
    "proximo_dia_util": ["2026-09-18", "2026-09-21", "2026-09-21", "2026-09-21"],
    "fora_do_prazo_geral": [["un_dry2_pc", "co_dry2_atrasada"]],
    "fora_do_prazo_da_unidade": 1,
    "equipe_da_unidade_le_o_atraso": 1,
    "nao_admin_nao_le_a_lista_geral": True,
    "outra_unidade_nao_le_o_atraso": True,
    "alerta_nao_duplica": True,
    "parceiro_le_o_proprio_alerta": 1,
    "outra_conta_nao_le_alerta": 0,
    "indicadores_do_parceiro": ["fr_dry2_pc", "em_analise", True, 1, 1, 200, 150, 15, 1],
    "nao_admin_nao_ve_indicadores": True,
    "funcoes_fechadas_para_anon": [False, False, False],
}

CHECAGENS = """
do $dry$
declare
  res jsonb;
  u_adm uuid := gen_random_uuid();
  u_mp  uuid := gen_random_uuid();
  u_mo  uuid := gen_random_uuid();
  c_ok  uuid;
  v_situacao boolean := false; v_doc boolean := false; v_uf boolean := false; v_email boolean := false;
  v_serv boolean := false; v_recusa boolean := false; v_dup boolean := false; v_depois boolean := false;
  v_adm_le int; v_adm_analisa boolean := false; v_adm_aprova boolean := false; v_adm_recusa boolean := false;
  v_mo_le int; v_mo_grava boolean := false;
  v_contrato jsonb; v_cat boolean := false;
  v_dias jsonb; v_atrasos jsonb; v_equipe int; v_mo_geral boolean := false; v_mo_unidade boolean := false;
  v_alerta_dup boolean := false; v_mp_alertas int; v_mo_alertas int;
  v_ind jsonb; v_mo_ind boolean := false;
  v_cob uuid;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_n int;
begin
  -- ---------------- travas da candidatura ----------------
  begin
    insert into public.parceiro_candidaturas (situacao, escritorio, documento, responsavel, email, whatsapp, cidade, uf, endereco, servicos)
    values ('sei-la', 'Escritório Dry', '20351761000103', 'Ana Dry', 'ana.dry2@teste.local', '31997129789', 'Belo Horizonte', 'MG', 'Rua Guaicui, 715, sala 3', array['endereco_fiscal']);
  exception when check_violation then v_situacao := true;
  end;
  begin
    insert into public.parceiro_candidaturas (escritorio, documento, responsavel, email, whatsapp, cidade, uf, endereco, servicos)
    values ('Escritório Dry', '20.351.761/0001-03', 'Ana Dry', 'ana.dry2@teste.local', '31997129789', 'Belo Horizonte', 'MG', 'Rua Guaicui, 715, sala 3', array['endereco_fiscal']);
  exception when check_violation then v_doc := true;
  end;
  begin
    insert into public.parceiro_candidaturas (escritorio, documento, responsavel, email, whatsapp, cidade, uf, endereco, servicos)
    values ('Escritório Dry', '20351761000103', 'Ana Dry', 'ana.dry2@teste.local', '31997129789', 'Belo Horizonte', 'Minas', 'Rua Guaicui, 715, sala 3', array['endereco_fiscal']);
  exception when check_violation then v_uf := true;
  end;
  begin
    insert into public.parceiro_candidaturas (escritorio, documento, responsavel, email, whatsapp, cidade, uf, endereco, servicos)
    values ('Escritório Dry', '20351761000103', 'Ana Dry', 'nao-e-email', '31997129789', 'Belo Horizonte', 'MG', 'Rua Guaicui, 715, sala 3', array['endereco_fiscal']);
  exception when check_violation then v_email := true;
  end;
  begin
    insert into public.parceiro_candidaturas (escritorio, documento, responsavel, email, whatsapp, cidade, uf, endereco, servicos)
    values ('Escritório Dry', '20351761000103', 'Ana Dry', 'ana.dry2@teste.local', '31997129789', 'Belo Horizonte', 'MG', 'Rua Guaicui, 715, sala 3', array['voar']);
  exception when check_violation then v_serv := true;
  end;
  begin
    insert into public.parceiro_candidaturas (situacao, escritorio, documento, responsavel, email, whatsapp, cidade, uf, endereco, servicos)
    values ('recusada', 'Escritório Dry', '20351761000103', 'Ana Dry', 'ana.dry2@teste.local', '31997129789', 'Belo Horizonte', 'MG', 'Rua Guaicui, 715, sala 3', array['endereco_fiscal']);
  exception when check_violation then v_recusa := true;
  end;

  -- candidatura boa (como a Edge Function grava, com service_role)
  insert into public.parceiro_candidaturas (escritorio, documento, responsavel, email, whatsapp, cidade, uf, endereco, servicos, salas)
  values ('Escritório Dry 2', '20351761000103', 'Ana Dry', 'ana.dry2@teste.local', '31997129789', 'Belo Horizonte', 'MG', 'Rua Guaicui, 715, sala 3', array['endereco_fiscal', 'sala_reuniao'], 2)
  returning id into c_ok;
  begin
    insert into public.parceiro_candidaturas (escritorio, documento, responsavel, email, whatsapp, cidade, uf, endereco, servicos)
    values ('Outro nome', '20351761000103', 'Bia Dry', 'bia.dry2@teste.local', '31997129789', 'Belo Horizonte', 'MG', 'Rua Guaicui, 715, sala 4', array['endereco_fiscal']);
  exception when unique_violation then v_dup := true;
  end;
  -- recusada libera o documento para um pedido novo
  insert into public.parceiro_candidaturas (situacao, motivo, escritorio, documento, responsavel, email, whatsapp, cidade, uf, endereco, servicos)
  values ('recusada', 'Já temos parceiro na cidade.', 'Escritório Dry 3', '11222333000181', 'Caio Dry', 'caio.dry2@teste.local', '31997129789', 'Contagem', 'MG', 'Rua Teste, 100, Centro', array['endereco_fiscal']);
  insert into public.parceiro_candidaturas (escritorio, documento, responsavel, email, whatsapp, cidade, uf, endereco, servicos)
  values ('Escritório Dry 3', '11222333000181', 'Caio Dry', 'caio.dry2@teste.local', '31997129789', 'Contagem', 'MG', 'Rua Teste, 100, Centro', array['endereco_fiscal']);
  get diagnostics v_n = row_count;
  v_depois := v_n = 1;
  -- o teste segue com uma só candidatura aberta por documento
  delete from public.parceiro_candidaturas where documento = '11222333000181' and situacao = 'nova';

  -- ---------------- dados de teste ----------------
  insert into auth.users (id, email, aud, role) values
    (u_adm, 'adm.dry2@teste.local', 'authenticated', 'authenticated'),
    (u_mp,  'mp.dry2@teste.local',  'authenticated', 'authenticated'),
    (u_mo,  'mo.dry2@teste.local',  'authenticated', 'authenticated');
  insert into public.platform_admins (user_id) values (u_adm);
  insert into public.contas (id, nome, email, tipo, parceiro_status, asaas_wallet_id) values
    ('fr_dry2_pc', 'Parceiro Dry 2', 'mp.dry2@teste.local', 'parceiro', 'em_analise', '0f1e2d3c-aaaa-bbbb-cccc-1234567890ab');
  insert into public.contas (id, nome, email) values ('fr_dry2_po', 'Própria Dry 2', 'mo.dry2@teste.local');
  insert into public.unidades (id, nome, franqueado_id, cidade) values
    ('un_dry2_pc', 'CafeWorking Contagem', 'fr_dry2_pc', 'Contagem/MG'),
    ('un_dry2_po', 'Própria Dry 2', 'fr_dry2_po', 'Belo Horizonte/MG');
  insert into public.unidade_members (user_id, unidade_id, franqueado_id, role) values
    (u_mp, 'un_dry2_pc', 'fr_dry2_pc', 'master'),
    (u_mo, 'un_dry2_po', 'fr_dry2_po', 'master');

  -- ---------------- RLS da candidatura ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', u_adm, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_adm_le from public.parceiro_candidaturas;
  update public.parceiro_candidaturas set situacao = 'em_analise' where id = c_ok;
  get diagnostics v_n = row_count;
  v_adm_analisa := v_n = 1;
  begin
    update public.parceiro_candidaturas set situacao = 'aprovada' where id = c_ok;
    get diagnostics v_n = row_count;
    v_adm_aprova := v_n = 0;  -- with check barra sem erro (0 linhas) ou lança
  exception when others then v_adm_aprova := true;
  end;
  begin
    update public.parceiro_candidaturas set situacao = 'recusada', motivo = 'nao' where id = c_ok;
    get diagnostics v_n = row_count;
    v_adm_recusa := v_n = 0;
  exception when others then v_adm_recusa := true;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  perform set_config('request.jwt.claims', json_build_object('sub', u_mo, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_mo_le from public.parceiro_candidaturas;
  begin
    insert into public.parceiro_candidaturas (escritorio, documento, responsavel, email, whatsapp, cidade, uf, endereco, servicos)
    values ('Invasor', '52998224725', 'Dan Dry', 'dan.dry2@teste.local', '31997129789', 'Betim', 'MG', 'Rua Teste, 200, Centro', array['endereco_fiscal']);
  exception when others then v_mo_grava := true;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- ---------------- contrato de parceria ----------------
  select jsonb_build_array(categoria, versao, vigente) into v_contrato
  from public.publicar_contrato_modelo(null, 'parceria', 'Contrato de parceria', 'Texto da minuta de parceria.');
  begin
    perform public.publicar_contrato_modelo(null, 'nada_disso', 'X', 'Y');
  exception when check_violation then v_cat := true;
  end;

  -- ---------------- prazo de correspondência ----------------
  -- 17/09/2026 é quinta; 18/09 sexta; 19/09 sábado; 20/09 domingo
  select jsonb_build_array(
    public.proximo_dia_util(date '2026-09-17'), public.proximo_dia_util(date '2026-09-18'),
    public.proximo_dia_util(date '2026-09-19'), public.proximo_dia_util(date '2026-09-20')) into v_dias;

  insert into public.app_state (unidade_id, entity, item_id, doc) values
    ('un_dry2_pc', 'correspondencias', 'co_dry2_atrasada',
      jsonb_build_object('cliente', 'Cliente Dry', 'remetente', 'Receita Federal', 'status', 'aguardando',
                         'recebidoEm', (v_hoje - 10)::text || 'T09:00:00.000Z')),
    ('un_dry2_pc', 'correspondencias', 'co_dry2_avisada',
      jsonb_build_object('cliente', 'Cliente Dry', 'remetente', 'Banco', 'status', 'notificado',
                         'notificadoEm', now()::text, 'recebidoEm', (v_hoje - 10)::text || 'T09:00:00.000Z')),
    ('un_dry2_pc', 'correspondencias', 'co_dry2_hoje',
      jsonb_build_object('cliente', 'Cliente Dry', 'remetente', 'Correios', 'status', 'aguardando',
                         'recebidoEm', v_hoje::text || 'T09:00:00.000Z')),
    ('un_dry2_po', 'correspondencias', 'co_dry2_propria',
      jsonb_build_object('cliente', 'Cliente Próprio', 'remetente', 'Receita Federal', 'status', 'aguardando',
                         'recebidoEm', (v_hoje - 10)::text || 'T09:00:00.000Z'));

  select coalesce(jsonb_agg(jsonb_build_array(unidade_id, item_id) order by item_id), '[]'::jsonb)
    into v_atrasos
  from public.correspondencias_fora_prazo(null);

  -- ---------------- cobrança, garantia e assinatura (indicadores) ----------------
  insert into public.cobrancas (unidade_id, cliente, valor, parceiro_conta_id, asaas_wallet_id, split_parceiro_pct, split_garantia_pct,
                                valor_bruto, valor_parceiro, valor_garantia, valor_repasse, valor_cafeworking, status, pago_em)
  values ('un_dry2_pc', 'Cliente Dry', 200, 'fr_dry2_pc', '0f1e2d3c-aaaa-bbbb-cccc-1234567890ab', 75, 10, 200, 150, 15, 135, 50, 'pago', now())
  returning id into v_cob;
  insert into public.parceiro_garantias (conta_id, unidade_id, cobranca_id, tipo, valor)
  values ('fr_dry2_pc', 'un_dry2_pc', v_cob, 'retencao', 15);
  insert into public.assinaturas (unidade_id, cliente_nome, cliente_email, plano_id, plano_nome, valor, status)
  values ('un_dry2_pc', 'Cliente Dry', 'cliente.dry2@teste.local', 'pl_nac_dryrun', 'Fiscal', 149, 'ativa');

  -- ---------------- alertas ----------------
  insert into public.parceiro_alertas (conta_id, unidade_id, tipo, referencia)
  values ('fr_dry2_pc', 'un_dry2_pc', 'correspondencia_atrasada', 'co_dry2_atrasada');
  begin
    insert into public.parceiro_alertas (conta_id, unidade_id, tipo, referencia)
    values ('fr_dry2_pc', 'un_dry2_pc', 'correspondencia_atrasada', 'co_dry2_atrasada');
  exception when unique_violation then v_alerta_dup := true;
  end;

  -- ---------------- leitura por papel ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', u_mp, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_equipe from public.correspondencias_fora_prazo('un_dry2_pc');
  select count(*) into v_mp_alertas from public.parceiro_alertas where conta_id = 'fr_dry2_pc';
  begin
    perform public.correspondencias_fora_prazo(null);
  exception when others then v_mo_geral := sqlerrm like '%SO_ADMIN%';
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_mo, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform public.correspondencias_fora_prazo('un_dry2_pc');
  exception when others then v_mo_unidade := sqlerrm like '%SEM_ACESSO%';
  end;
  select count(*) into v_mo_alertas from public.parceiro_alertas where conta_id = 'fr_dry2_pc';
  begin
    perform public.parceiro_indicadores();
  exception when others then v_mo_ind := sqlerrm like '%SO_ADMIN%';
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  select jsonb_build_array(conta_id, parceiro_status, tem_carteira, unidades, clientes_ativos,
                           receita_mes, parte_parceiro_mes, garantia_saldo, corresp_atrasadas)
    into v_ind
  from public.parceiro_indicadores() where conta_id = 'fr_dry2_pc';

  res := jsonb_build_object(
    'situacao_invalida_barrada', v_situacao,
    'documento_invalido_barrado', v_doc,
    'uf_invalida_barrada', v_uf,
    'email_invalido_barrado', v_email,
    'servico_desconhecido_barrado', v_serv,
    'recusa_sem_motivo_barrada', v_recusa,
    'dois_pedidos_abertos_barrados', v_dup,
    'pedido_novo_depois_de_recusar_passa', v_depois,
    'admin_le_candidaturas', v_adm_le,
    'admin_marca_em_analise', v_adm_analisa,
    'admin_nao_aprova_pelo_app', v_adm_aprova,
    'admin_nao_recusa_pelo_app', v_adm_recusa,
    'nao_admin_nao_ve_candidatura', v_mo_le,
    'nao_admin_nao_grava_candidatura', v_mo_grava,
    'contrato_de_parceria_publica', v_contrato,
    'categoria_invalida_barrada', v_cat,
    'proximo_dia_util', v_dias,
    'fora_do_prazo_geral', v_atrasos,
    'fora_do_prazo_da_unidade', (select count(*) from public.correspondencias_fora_prazo('un_dry2_pc')),
    'equipe_da_unidade_le_o_atraso', v_equipe,
    'nao_admin_nao_le_a_lista_geral', v_mo_geral,
    'outra_unidade_nao_le_o_atraso', v_mo_unidade,
    'alerta_nao_duplica', v_alerta_dup,
    'parceiro_le_o_proprio_alerta', v_mp_alertas,
    'outra_conta_nao_le_alerta', v_mo_alertas,
    'indicadores_do_parceiro', v_ind,
    'nao_admin_nao_ve_indicadores', v_mo_ind,
    'funcoes_fechadas_para_anon', jsonb_build_array(
       has_function_privilege('anon', 'public.correspondencias_fora_prazo(text)', 'EXECUTE'),
       has_function_privilege('anon', 'public.parceiro_indicadores()', 'EXECUTE'),
       has_function_privilege('anon', 'public.proximo_dia_util(date)', 'EXECUTE'))
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
        "select to_regclass('public.parceiro_candidaturas') is null as sem_candidaturas, "
        "to_regclass('public.parceiro_alertas') is null as sem_alertas, "
        "to_regprocedure('public.parceiro_indicadores()') is null as sem_funcao_indicadores, "
        "to_regprocedure('public.correspondencias_fora_prazo(text)') is null as sem_funcao_atrasos, "
        "not exists (select 1 from auth.users where email like '%.dry2@teste.local') as sem_login_de_teste, "
        "not exists (select 1 from public.contas where id like 'fr_dry2_%') as sem_conta_de_teste, "
        "not exists (select 1 from public.unidades where id like 'un_dry2_%') as sem_unidade_de_teste, "
        "not exists (select 1 from public.app_state where unidade_id like 'un_dry2_%') as sem_app_state_de_teste, "
        "not exists (select 1 from public.cobrancas where unidade_id like 'un_dry2_%') as sem_cobranca_de_teste, "
        "not exists (select 1 from public.contratos_modelos where categoria = 'parceria') as sem_contrato_de_teste"
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
