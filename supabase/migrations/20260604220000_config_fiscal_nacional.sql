-- ============================================================================
-- CafeWorking · NFS-e Nacional — campos fiscais detalhados na config da unidade
--
-- O padrão nacional pede vários códigos tributários. Para um coworking, quase
-- todos são FIXOS por unidade (mesmo serviço sempre: locação de espaço), então
-- ficam na config_fiscal e entram automaticamente em cada nota.
--
-- Depende de: 20260604120000_notas_fiscais.sql
-- ============================================================================

alter table public.config_fiscal
  add column if not exists codigo_tributacao_nacional text,   -- Código de Tributação Nacional
  add column if not exists codigo_servico_municipal   text,   -- Código Complementar Municipal
  add column if not exists nbs                         text,  -- NBS do serviço
  add column if not exists regime_especial             text default 'nenhum', -- Regime Especial de Tributação
  add column if not exists aliquota_simples numeric(6,4),     -- Alíquota efetiva do Simples Nacional (%)
  add column if not exists iss_retido       boolean default false, -- ISSQN retido pelo tomador
  add column if not exists exigibilidade_iss text default 'exigivel', -- exigivel | suspensa | imune | exportacao | nao_incidencia
  add column if not exists pis_cofins_cst   text,             -- Situação Tributária PIS/COFINS
  add column if not exists retencao_pis_cofins_csll boolean default false,
  add column if not exists beneficio_municipal text,          -- nº do benefício, se houver
  add column if not exists reducao_base_iss numeric(6,2) default 0; -- % de dedução/redução da base do ISS
