-- ============================================================================
-- CafeWorking · "Começar limpo" — remove os dados de DEMONSTRAÇÃO
--
-- Rode no SQL Editor DEPOIS do setup, quando for operar de verdade. Remove os
-- registros fictícios do seed, mantendo a estrutura real do Grupo Ciatos
-- (conta fr_ciatos + unidades Luxemburgo/Estoril + config fiscal).
--
-- Revise antes de rodar. Comente o que quiser preservar.
-- ============================================================================

-- 1) Clientes fictícios (Ciatos Log, Mendes Advocacia) ----------------------
delete from public.clientes where id in ('c1', 'c2');
-- Para apagar TODOS os clientes e começar do zero, use:
--   delete from public.clientes;

-- 2) Equipe de demonstração -------------------------------------------------
--   Marina/Paulo/Júlia são exemplos; Rafael é da unidade demo Savassi.
delete from public.usuarios where id in ('us1', 'us2', 'us3', 'us4');
-- Mantenha/edite os que forem reais. Os usuários de LOGIN ficam no Supabase
-- Auth + unidade_members (não nesta tabela, que é só o cadastro da equipe).

-- 3) Conta/unidade de demonstração (Savassi) --------------------------------
--   Remove a unidade e a conta fictícias "Franquia Savassi". Mantém o
--   Grupo Ciatos (real) + Luxemburgo + Estoril. Se você QUISER manter a
--   Savassi de exemplo, comente as 3 linhas abaixo.
delete from public.unidade_members where unidade_id = 'savassi';
delete from public.unidades       where id = 'savassi';
delete from public.contas         where id = 'fr1';

-- 3b) Zera os números de vitrine das unidades (receita/membros/ocupação/salas).
--   Eram valores de demonstração. O Dashboard calcula os reais a partir dos
--   lançamentos/clientes; estes campos ficam só como referência.
update public.unidades set receita = 0, membros = 0, ocupacao = 0, salas = 0
  where id in ('lux', 'est', 'savassi');

-- 4) (Opcional) Boletos e notas de teste ------------------------------------
--   Se emitiu boletos/notas em PRODUÇÃO RESTRITA só para testar, limpe aqui.
-- delete from public.notas_fiscais where status <> 'autorizada' or true;  -- cuidado
-- delete from public.boletos;

-- ============================================================================
-- Depois disto, cadastre seus clientes reais pela tela (já persiste no banco).
-- A conta (Grupo Ciatos), as unidades (Lux/Estoril) e a config fiscal
-- permanecem. Ajuste o CNPJ/IM/ISS em config_fiscal com o seu contador.
-- ============================================================================
