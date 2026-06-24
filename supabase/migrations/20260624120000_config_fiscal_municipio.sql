-- ============================================================================
-- CafeWorking · config_fiscal: código IBGE do município (cLocEmi da DPS)
--
-- O leiaute nacional da DPS exige cLocEmi (código IBGE de 7 dígitos do município
-- emissor). Guardamos por unidade para montar a DPS sem depender de mapa fixo.
-- BH = 3106200.
-- ============================================================================

alter table public.config_fiscal add column if not exists codigo_municipio text;
