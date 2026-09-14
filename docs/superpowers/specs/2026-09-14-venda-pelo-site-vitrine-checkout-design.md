# Venda pelo site — vitrine de planos e checkout em tela única

Data: 14/09/2026 · Decisões: Diego (brainstorming de 14/09) · Complementa `docs/VENDA-PELO-SITE.md`.

## 1. Objetivo

Quem entra em cafeworking.com.br contrata endereço fiscal, plano de coworking,
sala privativa ou sala de reunião por hora **sem sair do site e sem falar com
ninguém**, e a compra cai no mesmo Supabase que a equipe opera no app
(`lmgbysfrbtgqzbtouzft`). Hoje o site não vende nada: ~150 links levam ao
WhatsApp e os preços que aparecem estão escritos à mão e já divergem do app.

## 2. Decisões

| Tema | Decisão |
|---|---|
| Catálogo | Um só: o do app (tela Planos). O site nunca tem plano ou preço escrito à mão |
| Unidades | Planos e preços diferentes por unidade; o site mostra a vitrine de uma unidade por vez |
| Sob consulta | Plano sem preço público aparece com "Pedir proposta", que cria lead no CRM do app |
| Vitrine | Híbrida: cards gerados no HTML na publicação, conferidos ao vivo, republicação diária |
| Checkout | Tela única: resumo + nome, CPF/CNPJ, e-mail, celular + aceite do contrato + Pagar. Sem senha |
| Mensal | Só cartão de crédito, recorrente |
| Anual | Desconto de 10% (configurável no app, vale para todos os planos); PIX, boleto ou cartão à vista; renova sozinho |
| Sala por hora | PIX ou cartão |
| Senha | Criada depois do pagamento, por convite enviado por e-mail |
| Documentos do endereço fiscal | Conferidos depois do pagamento; reprovação → estorno e cancelamento |
| Pagamento | Asaas |

## 3. Jornadas

### 3.1 Plano (endereço fiscal, coworking, sala privativa)

1. **Vitrine** na página da categoria ou em `/planos`. Seletor de unidade no topo (lembrado no navegador; páginas de unidade já abrem nela). Cada card: selo opcional ("Mais procurado"), nome, preço mensal, preço anual com a economia, lista do que inclui, prazo mínimo do mensal, botão **Contratar**.
2. **`/contratar?unidade=…&plano=…`** (tela única, fora do índice):
   - escolha **Mensal · cartão** ou **Anual −10% · PIX, boleto ou cartão à vista**, com o valor e a economia em reais;
   - resumo lateral: plano, unidade, valor, fidelidade (mensal) ou data de renovação (anual);
   - 4 campos: nome, CPF ou CNPJ (validado na hora; CNPJ busca a razão social), e-mail, celular;
   - no anual, a forma: PIX, boleto ou cartão à vista;
   - "Li e aceito o contrato" com link que abre o texto vigente;
   - botão com o valor: "Pagar R$ 149,00 por mês" / "Pagar R$ 1.609,20 no PIX".
3. **`/pagamento`**:
   - cartão → tela de cartão do Asaas; confirmação imediata;
   - PIX → QR e copia-e-cola na página, que consulta o status e avança sozinha;
   - boleto → baixar/copiar; aviso de 1 a 3 dias úteis e confirmação por e-mail.
4. **Confirmado**: "Pagamento confirmado" + três passos: criar a senha pelo e-mail, enviar documentos (endereço fiscal), receber o kit. E-mail de boas-vindas com o link de criar senha.
5. **Área do cliente (app)**: criar senha → tarefa "Complete seu endereço fiscal" (upload) → equipe confere → kit do endereço.

### 3.2 Sala de reunião por hora

Bloco "Reservar por hora" nas páginas de salas, com o menor valor/hora da
unidade → `/reservar-sala`: sala, dia, horário livre (agenda pública sem dados
pessoais), 4 campos, aceite, PIX ou cartão. O horário fica segurado por 30
minutos até o pagamento. Não cria login.

### 3.3 Sob consulta

Card sem preço, botão **Pedir proposta** → formulário curto (nome, e-mail,
celular, mensagem) com anti-robô → lead no CRM do app: origem "Site",
interesse = nome do plano, etapa "Novo Lead", unidade escolhida.

## 4. Arquitetura da vitrine

```
App · tela Planos ──► Supabase (app_state 'planos', por unidade)
                          │
      ┌───────────────────┴──────────────────────┐
      ▼                                          ▼
Publicação (Netlify build)                 Navegador
scripts/vitrine.js                         assets/js/vitrine.js
 · chama planos-publicos?site=1             · chama planos-publicos?site=1
 · escreve cards entre marcadores           · redesenha o que mudou
 · JSON-LD de oferta com preço              · checkout sempre com dado ao vivo
      └──────────── assets/js/cards-plano.js ────┘
                 (template único dos dois lados)
Função agendada Netlify (diária) ──► build hook ──► republicação
```

- **Marcadores**: `<!-- vitrine:categoria=endereco_fiscal -->…<!-- /vitrine -->` nas páginas; o script substitui só o miolo. A cópia commitada é a última gerada localmente e serve de reserva.
- **Build falha-seguro**: sem resposta do Supabase, o script avisa e sai com sucesso, mantendo a cópia commitada.
- **Template único**: `cards-plano.js` exporta `renderCards(planos, opcoes)` e roda em Node (build) e no navegador, para as duas versões nunca divergirem.
- **`netlify.toml`** passa a existir no site com `command = "node scripts/vitrine.js"` e `publish = "."`. As funções `lead-webhook` e `reserva-webhook` continuam.

## 5. Mudanças por sistema

### 5.1 App (`C:\dev\appcafe\src`)

- **Planos**: categoria (endereço fiscal, coworking, sala privativa), publicar no site, sob consulta (preço opcional quando marcado), selo de destaque (texto), benefícios (lista livre, um por linha), prazo mínimo do mensal (meses), capacidade (sala privativa), ordem na vitrine. Os direitos já existentes geram linhas automáticas no card ("2h/mês de sala de reunião").
- **Configurações da unidade**: desconto do anual (%), padrão 10.
- **Salas**: marcar "reserva online" (valor/hora já existe).
- **Contratos**: tela para publicar versão por categoria (usa `publicar_contrato_modelo`).
- **CRM**: exibir e-mail e mensagem dos leads vindos do site.
- **Área do cliente**: faturas do Asaas (tabela `cobrancas`), tarefa de documentos do endereço fiscal, status de conferência.

### 5.2 Backend (`supabase/`), sobre a fase 1 já commitada

- **`planos-publicos`**: devolver `sobConsulta`, `destaque`, `beneficios`, `ordem`, `precoAnual` (calculado no servidor com o desconto da unidade) e `descontoAnualPct`; plano sob consulta sai sem `preco`.
- **`iniciar-assinatura`**:
  - `senha` deixa de existir; o login é criado bloqueado com senha aleatória;
  - `periodicidade`: `mensal` → assinatura `MONTHLY`, `billingType CREDIT_CARD`; `anual` → assinatura `YEARLY` com valor anual, `billingType` = `PIX`, `BOLETO` ou `CREDIT_CARD`;
  - valor sempre calculado no servidor; plano sob consulta recusado;
  - fidelidade: mensal = prazo mínimo do plano; anual = 12 meses.
- **`asaas-webhook`**: na ativação, gerar link de criar senha (`auth.admin.generateLink` tipo recovery/invite) e enviar o e-mail de boas-vindas pelo Resend; renovação anual segue o fluxo de assinatura (fatura nova, créditos do plano por pagamento).
- **`pedir-proposta`** (nova, pública, Turnstile): grava lead no `app_state` entity `leads` da unidade.
- **`status-pagamento`** (nova, pública): devolve só o status de um pagamento a partir de um token opaco emitido no checkout, para a tela do PIX avançar sozinha. Não expõe dado pessoal.
- **Expiração**: cadastro aguardando pagamento há mais de 5 dias (boleto) é cancelado junto com a cobrança no Asaas.
- Antecedência da fatura anual: configurar no Asaas para 30 dias.

### 5.3 Site (`C:\dev\cafeworking`)

Páginas novas, fora do índice: `contratar.html`, `pagamento.html`, `reservar-sala.html`.
Inventário das páginas existentes (levantado no `main` em 14/09):

| Grupo | Páginas | Muda para |
|---|---|---|
| Produto | `endereco-fiscal`, `coworking`, `salas-privativas`, `planos` | vitrine da categoria (em `planos`, todas as categorias); some "Consultar", "Solicitar proposta" e os preços fixos |
| Unidade | `unidade-luxemburgo`, `unidade-estoril`, `coworking-luxemburgo-bh`, `coworking-estoril-bh`, `endereco-fiscal-luxemburgo-bh` | vitrine já na unidade |
| Sala por hora | `salas-de-reuniao`, `sala-reuniao-luxemburgo-bh`, `alugar-sala-reuniao-bh`, `atendimento-privativo` | bloco "Reservar por hora" → `reservar-sala` |
| Sob consulta | `auditorio`, `workshops`, `espaco-eventos-corporativos-bh`, `cafeteria` (eventos) | "Pedir proposta" → CRM |
| Landing de anúncio | `lp-endereco-fiscal`, `lp-salas-privativas`, `lp-salas-reuniao` | vitrine/reserva da categoria acima do formulário |
| Texto "não publicamos preço" | `planos` (3), `salas-privativas`, `quanto-custa-coworking-bh`, e o artigo `coworking-ou-escritorio` (branch não publicado) | reescrever |
| Sem mudança nesta fase | contabilidade, abertura de empresa, jurídico, artigos do blog, `index`, `sobre`, `ambientes`, página em inglês | "Agendar visita" e WhatsApp continuam; menu ganha "Planos e preços" |

## 6. Regras de preço

- `precoAnual = arredonda(preco × 12 × (1 − desconto/100), 2)`; exibido também como equivalente mensal.
- Economia exibida = `preco × 12 − precoAnual`.
- Anual é sempre 12 meses; o prazo mínimo do plano vale só para o mensal.
- O servidor recalcula tudo; o valor da tela é só informativo.

## 7. Erros e bordas

| Situação | Comportamento |
|---|---|
| Supabase fora na publicação | build mantém a cópia commitada |
| Supabase fora no navegador | cards do HTML ficam; "Contratar" mostra "Não foi possível abrir a contratação agora" com WhatsApp |
| Plano pausado ou preço mudou entre a vitrine e o checkout | checkout mostra o dado atual antes de pagar; plano pausado volta para a vitrine com aviso |
| Contrato mudou | aceite recusado; a tela mostra a versão nova |
| E-mail já é cliente | "Você já é cliente: entre na área do cliente" (compra autenticada fica para depois) |
| Compra abandonada | mesma compra em 48h é retomada; outra descarta a anterior (já implementado) |
| Boleto não pago em 5 dias | cadastro e cobrança cancelados |
| PIX pago depois de a reserva de sala expirar e o horário ser ocupado | reserva marcada para estorno (já implementado) |
| Documentos reprovados | equipe cancela a assinatura e estorna pelo app |

## 8. Testes

- Deno: preço anual e economia, forma de pagamento por periodicidade, recusa de sob consulta, expiração de pendente.
- Migration: `supabase/tests/dryrun_venda_site.py` estendido para as colunas novas.
- Site: `scripts/vitrine.js` com a API fora do ar (não quebra); mesmo HTML de card no build e no navegador para o mesmo JSON; celular 375px.
- Ponta a ponta no Asaas **sandbox**: mensal no cartão, anual no PIX, anual no boleto, anual no cartão, sala por hora no PIX, pedir proposta, webhook repetido.

## 9. Fora de escopo desta fase

Compra de um segundo produto por quem já é cliente · cancelamento pelo próprio
cliente · reajuste anual automático · NFS-e automática por pagamento · abertura
de empresa e contabilidade no checkout · vitrine na página em inglês.

## 10. Depende do Diego

Conta Asaas (sandbox e produção) cadastrada no app e webhook configurado ·
unidade Luxemburgo renomeada com cidade e unidade Estoril criada · planos com
categoria, preço, benefícios e sob consulta · desconto anual confirmado ·
valor/hora e salas com reserva online · textos de contrato revisados · chave do
Cloudflare Turnstile.
