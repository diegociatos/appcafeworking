-- ============================================================================
-- CafeWorking · Seed de demonstração (espelha o seed do front-end).
-- Rode UMA vez após as migrations, para o banco nascer com os dados do app.
-- `on conflict do nothing` torna idempotente.
-- ============================================================================

-- Contas (coworkings assinantes) -------------------------------------------
insert into public.contas (id, nome, master, email, documento, telefone, plano, mensalidade, criado_em) values
  ('fr_ciatos', 'Grupo Ciatos',     'Diego Garcia',    'diego.garcia@grupociatos.com.br', '20.351.761/0001-03', '(31) 99712-9789', 'Pro',       597, '2024-01'),
  ('fr1',       'Franquia Savassi',  'Rafael Nogueira', 'rafael@franquiasavassi.com.br',   '42.518.770/0001-22', '',                'Essencial', 297, '2026-05')
on conflict (id) do nothing;

-- Unidades ------------------------------------------------------------------
insert into public.unidades (id, franqueado_id, nome, endereco, cor, salas, ocupacao, membros, receita) values
  ('lux',     'fr_ciatos', 'Luxemburgo', 'Rua Guaicuí, 715 · BH/MG',         '#6E4E3B', 14, 86, 92, 184500),
  ('est',     'fr_ciatos', 'Estoril',    'Av. Raja Gabaglia, 2000 · BH/MG',  '#0E4B4F',  9, 71, 58, 121300),
  ('savassi', 'fr1',       'Savassi',    'Rua Antônio de Albuquerque, 100 · BH/MG', '#B8862F', 0, 0, 0, 0)
on conflict (id) do nothing;

-- Equipe (usuários) ---------------------------------------------------------
insert into public.usuarios (id, unidade_id, nome, email, perfil, ativo) values
  ('us1', 'lux',     'Marina Souza',    'recepcao.lux@cafeworking.com.br', 'recepcao',   true),
  ('us2', 'lux',     'Paulo Andrade',   'financeiro@ciatos.com.br',        'financeiro', true),
  ('us3', 'est',     'Júlia Reis',      'recepcao.est@cafeworking.com.br', 'recepcao',   true),
  ('us4', 'savassi', 'Rafael Nogueira', 'rafael@franquiasavassi.com.br',   'master',     true)
on conflict (id) do nothing;

-- Clientes ------------------------------------------------------------------
insert into public.clientes (id, unidade_id, nome, documento, plano, fiscal, status, desde, contato, email, telefone) values
  ('c1', 'lux', 'Ciatos Log Transportes', '20.351.761/0001-03', 'Sala Privativa',  true, 'ativo', '2023', 'Rafael Mendes', 'rafael@ciatoslog.com.br', '(31) 99100-2030'),
  ('c2', 'lux', 'Mendes Advocacia',       '31.882.004/0001-77', 'Endereço Fiscal', true, 'ativo', '2024', 'Carla Mendes',  'carla@mendesadv.com.br',  '(31) 98822-1140')
on conflict (id) do nothing;

-- Configuração fiscal por unidade (NFS-e) -----------------------------------
-- Começa em 'homologacao' (produção restrita): emite só para teste até validar.
-- Troque o CNPJ/IM/alíquota conforme o contador. O certificado A1 é enviado
-- depois pela tela (Edge Function salvar-certificado → Vault).
insert into public.config_fiscal
  (unidade_id, municipio, uf, cnpj, inscricao_municipal, regime, codigo_servico, descricao_servico, aliquota_iss, emissor, ambiente, certificado_ref, emissao_ativa) values
  ('lux', 'Belo Horizonte', 'MG', '00.000.000/0001-00', '1.234.567/001-8', 'Simples Nacional', '08.01', 'Locação de espaço para coworking e salas', 2, 'nacional', 'homologacao', 'cert_nfse_lux', true),
  ('est', 'Belo Horizonte', 'MG', '00.000.000/0002-00', '1.234.567/002-6', 'Simples Nacional', '08.01', 'Locação de espaço para coworking e salas', 2, 'nacional', 'homologacao', 'cert_nfse_est', true)
on conflict (unidade_id) do nothing;

-- ============================================================================
-- Vínculos de acesso (preencher COM os ids reais do Supabase Auth)
-- Depois de criar os usuários no Auth, descubra o uuid e rode:
--
--   -- Diego = master do Grupo Ciatos (vê lux + est)
--   insert into public.unidade_members (user_id, unidade_id, franqueado_id, role) values
--     ('<uuid-do-diego>', 'lux', 'fr_ciatos', 'master'),
--     ('<uuid-do-diego>', 'est', 'fr_ciatos', 'master');
--
--   -- Admin da plataforma (vê todas as contas)
--   insert into public.platform_admins (user_id) values ('<uuid-do-admin>');
-- ============================================================================
