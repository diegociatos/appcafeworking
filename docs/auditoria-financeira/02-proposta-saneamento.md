# Fase C — Proposta de saneamento de dados (revisável, NÃO aplicada)

> Nada aqui foi executado em produção. Toda mutação depende da sua aprovação.
> Princípios: **não inventar** data/cliente/competência/classificação; **não
> apagar** títulos; **não presumir** pagamentos; **não alterar valores** para
> fechar totais. Execução futura: idempotente, com **backup** dos `doc` afetados
> e **rollback**, e registro em auditoria (autor, antes, depois, motivo).

Base: inventário `diagnostico-registros.sql` → `inventario-saneamento.csv`
(privado). Unidade com dados: **CafeWorkingLuxemburgo**. Estoril não tem
lançamentos (ausência de dados, não de atividade).

## Resumo por classe (Luxemburgo)

| Classe | Registros | Valor (R$) | Tipo de correção |
|---|---:|---:|---|
| A — data inválida | 215 | 54.676,37 | **208 determinística** + 7 humana |
| B — recebível futuro (2027+) | 124 | 28.398,50 | **Nenhuma mutação** (relatório) |
| C — não comercial sem cliente | 128 | 45.627,63 | **Nenhuma mutação** (fila/receita) |
| D — sem subcategoria | 278 | 69.119,97 | **Humana** (classificar) |
| E — previsto com pago equivalente | 156 | 38.431,14 | **Humana** (conciliar) |

## A — Datas inválidas (a única com correção automática)

`parseDate`/edição mostravam o dia solto ("1","20","—"). O código **já** passou a
compor a data real a partir de (dia + competência) para cálculo e exibição; a
proposta aqui é **persistir** essa data nos registros, para o banco também ficar
consistente.

- **208 registros (R$ 54.016,37) — DETERMINÍSTICO.** Têm dia + competência
  (mês/ano). A data proposta é composta dos campos que já existem — **nada é
  inventado**. Simulação antes→depois: `proposta-correcao-datas.sql` →
  `proposta-datas-antes-depois.csv` (privado). Exemplos:
  `'6'` (mês=out) → `06/10/2026`; `'11/08/26'` → `11/08/2026`; `'12/11'` →
  `12/11/2026`.
- **7 registros (R$ 660,00) — HUMANA.** Sem dia derivável (`data="—"` etc.).
  Ficam na **fila de inconsistências** (já visível na tela de Inadimplência) até
  alguém informar a data. Não somem, não são chutados.

Script de aplicação (idempotente, com auditoria/backup) em
`aplicar-correcao-datas.sql` — **NÃO executado**; roda só após sua aprovação.

## B — Recebíveis futuros (2027+): sem mutação

São provisões contratuais legítimas. A correção foi de **relatório**, já no
código: "A receber" e o Dashboard passam a separar **vencido / a vencer /
projeção futura**; o futuro não infla mais o indicador. Nenhum dado muda.

## C — Não comercial sem cliente: sem mutação

As 128 entradas (Investimentos e Conta Movimentação/Transferência) estão
categorizadas corretamente. A correção foi **excluí-las** da fila "vincular a
cliente" e da **receita** (caixa/Dashboard), já no código. As transferências
(17, R$ 31.050,42) devem ser revisadas quanto ao **par** (origem↔destino) —
revisão humana, sem mutação automática.

## D — Sem subcategoria (278, R$ 69.119,97): decisão humana

A maioria são recorrências geradas sem subcategoria (o "—" do DRE). **Não** é
seguro atribuir subcategoria automaticamente (depende do serviço). Proposta:
- código passa a **exigir** subcategoria em lançamentos novos e a destacar os
  antigos incompletos como "a classificar" (pendente — Fase A restante);
- entregar a lista agrupada por descrição/plano para a equipe classificar em
  lote. A classificação em si é decisão da equipe.

## E — Previsto com pago equivalente (156, R$ 38.431,14): conciliação humana

Previstos em aberto que têm um **pago** de mesmo cliente e valor (ex.: Ciatos
1.570,74). Podem ser: (a) a mesma obrigação paga sem baixa do previsto →
conciliar (baixar o previsto); (b) cobranças distintas de mesmo valor →
manter. **Não** conciliar por nome+valor automaticamente (seu requisito).
Proposta:
- **Fase B** cria o vínculo obrigação↔pagamento (`lancamento_id` em
  boleto/cobrança + baixa idempotente pelo webhook) e a ação "vincular entrada
  existente a uma parcela", sem criar lançamento novo;
- apresentar os 156 pares para revisão, um a um, com o par evidenciado.

## O que NÃO entra em saneamento automático (decisão humana)

- Reclassificar "IPTU - APTO DIEGO", flat, Poços de Caldas (coworking→aluguel).
- Vincular receitas a clientes por nome+valor.
- Natureza de operações com empresas do grupo.
- Os 7 sem data derivável e os 156 candidatos à conciliação.

## Execução (quando você aprovar)

1. Backup: copiar os `doc` dos registros afetados (tabela de backup com data/hora).
2. Aplicar `aplicar-correcao-datas.sql` (só a classe A determinística),
   idempotente (pula o que já está DD/MM/AAAA), gravando auditoria
   (antes/depois/autor="saneamento"/motivo).
3. Rodar o diagnóstico de novo e conferir: 208 recebíveis passam a ter data
   válida; os 7 seguem na fila; nenhum valor muda.
4. Rollback disponível pelo backup.
