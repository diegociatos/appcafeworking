# Venda pelo site — cafeworking.com.br usando o Supabase do app

Objetivo: o cliente contrata **endereço fiscal, planos de coworking, sala privativa
e sala de reunião por hora** direto no site, e tudo cai no mesmo banco que a
equipe opera no app (projeto Supabase `lmgbysfrbtgqzbtouzft`).

O site continua hospedado na Netlify (o Supabase não hospeda site). O que muda é
que ele passa a usar o backend do app: catálogo e preços lidos do banco, checkout,
contrato, pagamento e reserva gravados nas mesmas tabelas.

## Decisões (Diego, 14/09/2026)

| Tema | Decisão |
|---|---|
| Pagamento | **Asaas** — cartão, PIX e boleto; mensais viram **assinatura** que cobra sozinha |
| Produtos da fase 1 | endereço fiscal · planos de coworking · sala de reunião por hora · sala privativa (preço publicado como plano) |
| Contrato | **aceite no checkout**, com versão do termo, data, IP, navegador e hash gravados |

## Estado encontrado em produção (14/09/2026)

- Uma única unidade no banco: `un_cafeworkingluxembu_e78be3` ("CafeWorkingLuxemburgo", cidade "Outra"). **Estoril não existe.**
- Um único plano publicado: "Endereço Fiscal", R$ 119/mês (o site anuncia três).
- **Asaas sem chave** — nem `ASAAS_API_KEY` nem `asaas_<unidade>` no Vault. Inter e certificado NFS-e configurados.
- `ALLOWED_ORIGINS` vazio → CORS `*` nas Edge Functions.
- O checkout existente (`iniciar-assinatura`) gera cobrança **avulsa** mesmo em plano mensal, não grava aceite de contrato nem prazo mínimo.

## O que depende do Diego (pode começar já, em paralelo)

1. **Asaas**: abrir/aprovar a conta do CafeWorking. Gerar primeiro uma chave de **sandbox** (para o teste ponta a ponta) e depois a de produção. Cadastrar pelo app (integração Asaas → vai para o Vault como `asaas_<unidade>`).
2. **Webhook no painel do Asaas**: URL `https://lmgbysfrbtgqzbtouzft.supabase.co/functions/v1/asaas-webhook`, com o token igual ao secret `ASAAS_WEBHOOK_TOKEN` (já existe no Supabase).
3. **Unidades no app**: renomear para "Luxemburgo" com cidade "Belo Horizonte"; criar a unidade Estoril.
4. **Catálogo e preços no app**: os planos de endereço fiscal, de coworking e de sala privativa (P/M/G/Corporativo), e o valor/hora das salas de reunião que podem ser reservadas online.
5. **Textos de contrato**: revisão jurídica das minutas por categoria antes de ligar a venda.
6. **Cloudflare Turnstile** (anti-robô, gratuito): criar a chave do site para `cafeworking.com.br`.

Sem os itens 1, 3 e 4 o checkout não vende; sem o 5 e o 6 não deve ir para produção.

## Fases

### Fase 1 — Backend (este repo, `supabase/`)
- Migration `venda_site`: `contratos_modelos` (versões imutáveis, hash no banco), `aceites_contrato` (append-only, prova do aceite), `assinaturas`, colunas novas em `pending_signups`/`cobrancas`/`reservas`/`salas`, status de reserva `aguardando_pagamento` com expiração, e `criar_reserva_segura` passando a respeitar reserva segurada.
- `_shared/venda.ts` com a lógica pura (CPF/CNPJ, janela de horário, valor, fidelidade, créditos do plano, classificação de evento do Asaas) + testes Deno.
- Edge Functions: `planos-publicos` (campos novos + filtro "vender no site"), `contrato-vigente` (nova), `iniciar-assinatura` (aceite obrigatório, assinatura Asaas para mensais, Turnstile), `asaas-webhook` (assinatura, faturas mensais, créditos por pagamento, confirmação de reserva, idempotente), `disponibilidade-salas` (nova, sem dados pessoais), `reservar-sala-online` (nova, segura o horário e cobra).

### Fase 2 — App (`src/`)
- Planos: categoria, prazo mínimo, "vender no site", capacidade.
- Salas: "reserva online".
- Modelos de contrato por categoria, com versões.
- Cliente e cobranças: assinaturas e prova de aceite.
- Área do cliente: faturas do Asaas e envio de documentos do endereço fiscal.
- Autocadastro do app também exigindo o aceite.

### Fase 3 — Site (`C:\dev\cafeworking`)
- `assets/js/loja.js` (cliente da API, catálogo ao vivo, Turnstile).
- Páginas `contratar.html`, `reservar-sala.html`, `pagamento.html` (fora do índice).
- Endereço fiscal, coworking, salas privativas, salas de reunião e planos com preços do banco e botão de contratar.
- Ajustar textos que dizem "não publicamos preço".

### Fase 4 — Testes e go-live
- Testes Deno da lógica + `deno check` das funções.
- Migration testada no banco em transação com `ROLLBACK` (com autorização) ou num projeto de teste.
- Ponta a ponta com a chave **sandbox** do Asaas numa unidade de teste.
- Produção: migration, deploy das funções, secrets (`TURNSTILE_SECRET_KEY`, `ALLOWED_ORIGINS`), deploy do app e do site.

## Lacunas conhecidas (fora da fase 1)
- Cliente que **já tem conta** e quer contratar outro produto: hoje o cadastro recusa e-mail existente. Precisa de compra autenticada pela área do cliente.
- Cancelamento de assinatura pelo cliente (com regra de fidelidade) e reajuste anual.
- Emissão automática de NFS-e a cada pagamento confirmado.
