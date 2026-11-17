# Status da lista de melhorias CafeWorking (P0/P1/P2)

Conferido contra a versão atual (já em produção) + o que foi feito na
auditoria/saneamento financeiro. Legenda: ✅ feito · 🟡 parcial · ⬜ pendente.

> **Atualização 2026-11-17 (tudo já em produção, branch main):** regime de caixa
> por data de pagamento (Fluxo de Caixa + DRE Caixa), drill-down da inadimplência,
> reserva pendente fora de a-receber, once-only do Asaas coberto por teste,
> alerta de clientes duplicados, aviso de meses sem provisão nas despesas
> recorrentes, **conciliação bancária manual** (conferido no extrato × saldo do
> extrato × diferença), **pagador informado × cliente vinculado** (manual +
> importação) e **trilha de auditoria** no lançamento (baixa/estorno/conciliação/
> alteração de valor, com quem/quando/antes→depois). 63 testes verdes.
>
> **Decisões do Diego implementadas (2026-11-17, "faz o que for recomendado"):**
> 1. **Exclusão = soft-delete (lixeira):** excluir manda para a Lixeira (sai das
>    telas, recuperável), com quem/quando/motivo no histórico. Nova aba Lixeira.
> 2. **Separação de poderes:** qualquer perfil de finanças manda para a lixeira;
>    **excluir em definitivo** (apaga de vez) é só **gerente/admin** (master/
>    franqueador). Baixa/estorno seguem com o financeiro, mas ficam auditados.
>    Dados bancários já são restritos por RLS a master/financeiro/admin.
>
> **P0 financeiro concluído.** Próximo: P1 (contratos/faturamento, fila de
> renovação, painel da controladoria).

## P0 · Reservas, financeiro e controle de acesso

**1. Reservas e vencimento dos avulsos** — 🟡
- Reserva de sala confirma só no pagamento: o lançamento da reserva nasce com id
  determinístico `lc_res_<id>` e vira "pago" quando o Asaas confirma
  (`_shared/lancamentoReserva.ts`). ✅ não duplica receita.
- Vencimento = data do pagamento (avulsos): o doc usa `competenciaBRT(quando)` →
  data do fato. 🟡 **falta garantir** que a reserva **pendente** não gere um
  "previsto" em Contas a Receber/inadimplência, e aplicar a mesma regra
  (vencimento = data do pagamento) em **lançamentos manuais e importações**.
- Mensalidade = vencimento contratual: as parcelas de contrato agora geram
  `dataVencimento` real do dia contratual (corrigido no saneamento). ✅

**2. Vínculo reserva/contrato/cobrança/recebimento** — 🟡
- Começado na Fase B: coluna `lancamento_id` em `boletos`/`cobrancas`; id
  determinístico da reserva; `conciliarPrevisto`; webhook baixa a obrigação
  vinculada. Reserva herda categoria/unidade/subcategoria do serviço. ✅ parte.
- ⬜ Falta: referência única ponta-a-ponta exibida (reserva→cobrança→recebimento→
  NF), sinal/saldo/complementos na mesma operação.
- Impedir duplicidade em import/reprocessamento: ids determinísticos + webhooks
  idempotentes já evitam. ✅

**3. Conciliação Asaas/bancos** — 🟡
- Há a conciliação previsto↔pago (tela nova) e o split de parceiro (bruto/parte/
  garantia/repasse) no `_shared/cobrancas.ts`. ⬜ Falta a conciliação com o
  **movimento bancário** (taxa, líquido, extrato) e a visão de situação por venda.

**4. Contas a Receber e inadimplência** — ✅ em grande parte
- Separação **vencido / a vencer / projeção futura** e **fila de inconsistências**
  (vencimentos inválidos) já no ar; dashboard e "a receber" com o mesmo critério.
- 🟡 Falta: **abrir, a partir de cada indicador**, a lista de registros que
  compõem o total com filtros de unidade/período/origem (os dados já estão nas
  telas; falta o clique no número levar à lista filtrada).

**5. Cadastro/identificação de clientes** — 🟡
- Transferências/investimentos já saem da fila de "vincular a cliente" e da
  receita. Vínculo automático por descrição existe.
- ⬜ Falta: **pagador informado x cliente vinculado** em campos separados; alerta
  de **duplicados** + unificação com prévia/histórico.

**6. Contas a Pagar e projeção** — 🟡
- Recorrentes alimentam a provisão; DRE por competência + fluxo por caixa já
  existem. ⬜ Falta: validar fornecedor/unidade/categoria/competência/vencimento e
  **sinalizar meses sem provisão** recorrente.

**7. Permissões e auditoria** — ⬜
- RBAC por papel existe (PERFIS). ⬜ Falta: detalhar na tela **Equipe** o que cada
  perfil faz por unidade; **separar lançamento e aprovação** (baixa/estorno/
  exclusão/dados bancários); **trilha de auditoria** (quem/quando/motivo/antes-
  depois); período fechado com reabertura autorizada.

## P1 · Contratos, equipe e gestão
> **Em produção 2026-11-17:** **Painel da Controladoria** (saldo/conciliado, caixa
> 7/30d, aging, contratado×faturado×recebido, blocos clicáveis) e **fila de
> renovação proativa** de contratos (vencem no mês/próximos 2 meses).
- Contratos e faturamento — ✅ fila de renovação proativa + **parcelas a faturar**
  destacadas na fila de Pendências (origem: previsto de contrato sem cobrança).
- Painel da Controladoria — ✅ entregue (por unidade; aging/projeção clicáveis).
- Visão por unidade — ✅ **Controladoria do grupo** (tela de nível principal)
  soma as unidades visíveis e compara lado a lado (saldo, recebido, resultado,
  a receber, vencido), com total do grupo. Visível a franqueador/master/financeiro.
- Fila de trabalho — ✅ **Pendências** (aba Financeiro): fila única com
  inadimplência, parcelas a faturar, renovações, sem cliente, a conferir e
  inconsistências; cada bloco leva à aba onde se resolve. (Atribuição de
  responsável por item fica para um modelo de tarefas futuro.)

**P1 financeiro essencial concluído.** Resta (menor): DRE por unidade/serviço,
régua de cobrança como tarefa com responsável.

## P2 · Operação
> **Em produção 2026-11-17 (autônomo):** fechamento de caixa do PDV por forma de
> pagamento (resumo/conferência, sem recriar lançamento) e lista de reposição de
> estoque (sugestão de compra + custo estimado + botão Repor).
- Cafeteria (PDV) — ✅ **fechamento de caixa por forma de pagamento** (Dinheiro/
  Pix/Cartão/plano, com contado × diferença). As vendas já lançam o caixa.
- Estoque — ✅ **lista de reposição** (tarefa de compra com sugestão de quantidade
  e custo estimado). Alerta já existia; virou worklist acionável.
- Patrimônio ↔ documento — ✅ já existia (campo `anexo`: contrato/NF por bem).
- Impressões — ✅ **conferido:** a cobrança usa só as folhas EFETIVAMENTE impressas
  (`folhas_impressas` em `impressao-concluida`); impressão com falha não cobra.
  🟡 Falta (Fase 3): apurar/faturar o excedente no fechamento do mês — gera
  lançamento/cobrança por cliente; **precisa de decisão** (regra de franquia por
  plano, proração) antes de automatizar, por mexer em valores/cobrança reais.
- Auditório — ⬜ **não construído (precisa de decisão).** Hoje "auditório" é só um
  valor de `sala` num evento (display-only); não há sinal/saldo/cancelamento/NF.
  Um fluxo de reserva-com-sinal deve espelhar o de salas (addReserva/criarReserva/
  cancelarReserva em store.jsx), mas depende de regras de negócio (preço, % de
  sinal, política de reembolso, quando emite NF) — não dá para definir sozinho.

## Primeira entrega — 3 cenários a validar
1. **Reserva avulsa confirmada após pagamento, vencimento na mesma data** — 🟡
   implementar: pendente fora de a-receber/inadimplência + vencimento = pagamento;
   teste do webhook.
2. **Venda Asaas uma única vez na receita** — ✅ já dedup (id determinístico +
   `cobrancasJaLancadas`); validar com teste.
3. **Total da inadimplência abrindo a lista de registros** — 🟡 implementar o
   drill-down (clicar no indicador → lista filtrada).
