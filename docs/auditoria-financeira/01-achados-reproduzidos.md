# Auditoria financeira CafeWorking — Fase 1: achados reproduzidos (produção)

> Reprodução **somente leitura** contra o banco de produção (`lmgbysfrbtgqzbtouzft`,
> projeto appcafeworking) via `supabase db query --linked` (SELECT apenas).
> Unidade analisada: **CafeWorkingLuxemburgo** (`un_cafeworkingluxembu_e78be3`).
> Data da reprodução: 2026-11-12. Nenhum dado foi alterado.

## Onde moram os dados

- Os **lançamentos financeiros** NÃO têm tabela própria: ficam em `app_state`
  (`entity='lancamentos'`, 1 linha por lançamento, `doc` jsonb). Luxemburgo tem
  **1.744** lançamentos. Campos relevantes no `doc`: `tipo` (entrada/saida),
  `status` (previsto/pago), `valor`, `mes` (índice 0–11), `ano`, `data`
  (texto DD/MM/AAAA), `dataVencimento`, `dataPagamento`, `competencia`,
  `clienteId`, `categoria`, `subcategoria`, `cobrancaId`, `boletoId`,
  `grupoRecorrencia`.
- Boletos (`boletos`), cobranças Asaas (`cobrancas`), assinaturas, reservas,
  contas bancárias (`bank_accounts`/`contas`) são tabelas relacionais à parte —
  **não** são a mesma entidade do lançamento. Daí a carteira fragmentada.

---

## Achado 1 — Datas inválidas sistêmicas (causa raiz de vários sintomas)

A geração de parcelas por **recorrência / atualização de contrato** grava o
**dia do mês** no campo `data` em vez de uma data completa `DD/MM/AAAA`, e deixa
`dataVencimento`/`dataPagamento` nulos.

Reprodução (Luxemburgo, `doc->>'valor'='1570.74'`, cliente `c1782411116011`):

| item_id | descrição | status | mes | data | venc | pag |
|---|---|---|---|---|---|---|
| lc1792006081747_9_0  | Sala Privativa · CIATOS SOLUCOES … (atualizado) | previsto | 9  | **1** | NULL | NULL |
| lc1792006081747_10_1 | … (atualizado) | previsto | 10 | **1** | NULL | NULL |
| lc1792006081747_11_2 | … (atualizado) | previsto | 11 | **1** | NULL | NULL |
| lc1793802565431938   | Ciatos Solucoes … | **pago** | 10 | 03/11/2026 | | 03/11/2026 |
| lc1790966028876769   | Ciatos Consultoria Ltda | **pago** | 9 | 01/10/2026 | | 01/10/2026 |

O `data="1"` é o que a tela de edição mostra como competência “1”.

**Escala (Luxemburgo):** entre os lançamentos, a validade do campo `data`
(`^\d{2}/\d{2}/\d{4}$`):

| data_valida | tipo | status | n | soma (R$) |
|---|---|---|---|---|
| **false** | entrada | **previsto** | **210** | **53.933,71** |
| false | entrada | pago | 3 | 343,59 |
| false | saida | pago | 2 | 399,07 |
| true | entrada | pago | 776 | 417.195,41 |
| true | entrada | previsto | 75 | 15.257,26 |
| true | saida | pago | 675 | 420.937,83 |
| true | saida | previsto | 3 | 332,43 |

Valores de `data` inválidos observados: dias soltos (`20`,`17`,`28`,`15`,`21`,
`25`,`30`,`10`,`31`,`27`,`16`,`1`,`14`), `—` (6×) e parciais (`14/07`,`15/10`).

> **210 recebíveis (R$ 53.933,71) estão sem data válida.** Causa provável no
> gerador de recorrência/atualização de contrato (a confirmar no código — linha
> exata pendente do mapa de código).

## Achado 2 — "Total a receber" reproduzido exatamente, e inflado

`previsto + entrada` = 210 (inválidas) + 75 (válidas) = **285 contas**,
soma **R$ 69.190,97** — bate exatamente com o "Total a receber: R$ 69.190,97,
285 contas" relatado. Inclui as 210 sem data válida **e** parcelas de competência
futura (recorrência gerada meses à frente, inclusive 2027 — a quantificar).

## Achado 3 — Inadimplência "some" os títulos sem data (discrepância explicada)

A tela de Inadimplência usa `parseDateBR(dataVencimento || data)` e exige
`dias >= 1`. Para os 210 previstos com `data` = dia solto, `parseDateBR` falha e
eles **saem silenciosamente** da inadimplência → por isso só **23 títulos /
R$ 2.887,95** aparecem lá, enquanto "a receber" mostra 285. É exatamente o que a
exigência (B) pede para evitar: título sem vencimento válido deve ir para uma
**fila de inconsistências**, não sumir.

## Achado 4 — Recebimento sem baixa / aparente duplicidade

O pagamento (Ciatos, R$ 1.570,74, 03/11/2026, `lc1793802565431938`, **pago**) é um
lançamento **separado** da parcela prevista (`lc1792006081747_10_1`, **previsto**,
`data="1"`). Não há vínculo (`cobrancaId`/`boletoId` nulos nos dois). Resultado: a
obrigação aparece ao mesmo tempo como **aberta em "a receber"** e como **recebida**
— candidata à conciliação, não duplicidade contábil provada.

## Achado 5 — Movimentos não comerciais na fila "pagas sem cliente"

Luxemburgo: **313 entradas pagas sem cliente, R$ 95.821,76** (bate com ~314 /
R$ 95.871,76; diferença dentro do "pode ter mudado"). Composição:

| categoria | subcategoria | n | soma (R$) |
|---|---|---|---|
| Investimentos/Dividendos | Investimentos (Ativos) | 105 | 563,93 |
| Receita Operacional Bruta | Aluguel de Salas Compartilhadas | 86 | 5.625,50 |
| Receita Operacional Bruta | Endereço Fiscal | 65 | 41.375,81 |
| Receita Operacional Bruta | Cafeteria | 21 | 300,49 |
| **Conta Movimentação** | **Transferência entre contas** | **17** | **31.050,42** |
| Receita Operacional Bruta | Aluguel de Salas Privativas | 10 | 2.421,50 |
| Investimentos/Dividendos | Aplicações Financeiras Ponto de Equilíbrio | 5 | 14.005,28 |
| Receita Operacional Bruta | Aluguel de Sala de Reunião | 3 | 470,83 |
| Investimentos/Dividendos | Impressoras e Periféricos | 1 | 8,00 |

> **~128 desses (Investimentos 111 = R$ 14.577,21 + Transferências 17 =
> R$ 31.050,42) NÃO são recebimentos comerciais** e não deveriam entrar na fila de
> "vincular a cliente" nem inflar recebimentos. As transferências também explicam
> parte da inflação de receita.

---

## Achado 6 — "A receber" inclui competência futura (2027)

`previsto + entrada` por ano (Luxemburgo): **2026 → 161 contas / R$ 40.792,47** e
**2027 → 124 contas / R$ 28.398,50**. Ou seja, **R$ 28.398,50 do "a receber" é
provisão de 2027**. Confirma: o total "a receber" não tem teto de ano e mistura
carteira vencida, a vencer e projeção contratual futura.

## Achado 7 — DRE por competência com receita "—" (sem subcategoria)

Entrada 2026 sem subcategoria: **151 previsto (R$ 39.982,47) + 3 pago (R$ 739,00)
= R$ 40.721,47** — bate ao centavo com o "R$ 40.721,47 em receita sem subcategoria"
do DRE por competência. A maioria são as recorrências sem subcategoria.

---

## Causas no código (mapa confirmado)

| Sintoma reproduzido | Causa no código |
|---|---|
| `data="1"` / dia solto em recorrência | `gerarCobrancasContrato` `src/lib/store.jsx:1275` (`data: String(c.diaVencimento||"10")`); `addContaRecorrente` `src/lib/store.jsx:654-657` (sobrescreve só `mes`, mantém `base.data`) |
| Título sem data some da inadimplência | `parseDateBR` exige "/" → retorna null p/ dia solto: `src/lib/dateUtils.js:47-60`; usado em Inadimplência `src/pages/Financeiro.jsx:2457-2462` |
| Dashboard ≠ Inadimplência | Dashboard lê a tabela `boletos`: `src/pages/Dashboard.jsx:62-63`; Inadimplência lê `lancamentos` previstos: `Financeiro.jsx:2457-2462` — **universos diferentes** |
| Recebimento online não dá baixa no lançamento | Boletos/cobranças **não têm `lancamento_id`**; `darBaixaLancamento` recusa baixar lançamento de cobrança/boleto `store.jsx:1225-1242`; webhooks não viram o lançamento `supabase/functions/asaas-webhook/*`, `webhook-boletos/index.ts:42-45` → fica "previsto" pra sempre |
| Transferências/aportes inflam receita | Excluídos do DRE receita (`Financeiro.jsx:1603-1604`) mas **contados** no Caixa (`:1382`), no Dashboard (`Dashboard.jsx:46-48`) e na fila "sem cliente" (`:1983`) |
| "A receber" com 2027 | Sem filtro de ano: `Financeiro.jsx:117` e `:685`; `Dashboard.jsx:59` |
| Import Excel sem ano | `src/lib/fluxoImport.js:245-250` nunca seta `ano` → cai no ano atual |
| `renovarContrato` duplica parcelas | `store.jsx:1349-1361` acrescenta range sem dedup de sobreposição |
| `pago_em` muda a cada reentrega Asaas | `supabase/functions/_shared/cobrancas.ts:60-61` reescreve `pago_em=now()` sempre |

Idempotência dos webhooks (não duplicam recebimento): confirmada —
`cobrancas.ts:73-115` (upsert por `asaas_payment_id`), `lancamentoReserva.ts`
(id determinístico `lc_res_<id>`), créditos id determinístico. O problema **não**
é duplicação de evento; é **falta de conciliação** entre a obrigação (lançamento)
e o instrumento (boleto/cobrança).

---

## Plano de correção proposto (fases, com portões de aprovação)

Tudo em **branch isolada**, com testes, validado em **homologação** (branch do
Supabase = cópia dos dados), **sem tocar produção** até sua aprovação.

**Fase A — Fundações determinísticas (baixo risco, alto valor):**
1. Validação de datas no servidor e na UI: proibir `data` sem `DD/MM/AAAA`;
   separar competência (mes/ano) de vencimento e pagamento; corrigir os geradores
   de recorrência (`store.jsx:1275`, `:654-657`) e o import (`fluxoImport.js:245`).
2. **Fila de inconsistências**: títulos sem data/venc válidos aparecem numa fila
   de revisão em vez de sumir da inadimplência; inadimplência passa a contar por
   saldo residual com fuso America/Sao_Paulo e "não vencido no próprio dia".
3. "A receber", fluxo e dashboard passam a separar **vencido / a vencer /
   projeção futura**; teto de ano onde fizer sentido.
4. Excluir **movimentos não comerciais** (Investimentos, Conta Movimentação) da
   fila "vincular a cliente" e da receita de caixa/dashboard; separar
   transferências e aportes.
5. Paginar a lista de recebimentos sem cliente.

**Fase B — Carteira única / conciliação:**
6. Vínculo obrigação↔instrumento: `lancamento_id` em boletos/cobranças (ou
   ponte), webhook dá baixa idempotente no lançamento; permitir "vincular entrada
   existente a parcela" sem criar nova.
7. Dashboard e Inadimplência passam a usar a **mesma fonte e critério**.

**Fase C — Saneamento de dados (diagnóstico + proposta, sem mutação automática):**
8. Rotina **somente leitura** que lista os registros afetados (IDs, unidade,
   valores, datas) e separa correções determinísticas de decisões humanas.
9. Proposta de correção com simulação antes/depois, backup e reversão —
   aplicada só após sua aprovação, idempotente.

**Fora de escopo automático (decisão humana):** reclassificar "IPTU APTO DIEGO",
flat, Poços de Caldas; vincular receitas a clientes por nome+valor; decidir
natureza de operações com empresas do grupo.

## Ainda a reproduzir (fecho da Fase 1)

- Saldo inicial cadastrado (R$ 5.213,00) x abertura do período (R$ 1.367,26) —
  `Financeiro.jsx:1374-1376`.
- Transferências: pares e líquido (R$ 5.872,36), escopo do exercício.
- Asaas: R$ 2.266,25 vencidos / 8 pagamentos vs tela de Cobranças = 0 (filtro
  `asaasApi.configured` + fonte `cobrancas`).
- Estoril: ausência de dados x ausência de atividade.
