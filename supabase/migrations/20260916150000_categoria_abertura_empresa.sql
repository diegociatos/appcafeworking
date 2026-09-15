-- ============================================================================
-- Categoria abertura_empresa: abertura de empresa vendida pelo site (avulsa,
-- R$ 299) com contrato próprio. Os planos de endereço fiscal que incluem
-- abertura ou certificado digital marcam isso em direitos (aberturaEmpresa,
-- certificadoDigital), sem mudar de categoria.
-- ============================================================================

alter table public.contratos_modelos drop constraint if exists contratos_modelos_categoria_check;
alter table public.contratos_modelos add constraint contratos_modelos_categoria_check
  check (categoria in ('endereco_fiscal', 'coworking', 'sala_privativa', 'sala_hora', 'abertura_empresa'));
