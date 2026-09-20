# Rede de parceiros CafeWorking

> Atualização de escopo em 18/09/2026: o texto abaixo registra decisões anteriores e não define enquadramento jurídico nem condições comerciais desta implementação. Para a versão em revisão, consultar `REDE-UNIDADES-DIAGNOSTICO.md` e `REDE-UNIDADES-HOMOLOGACAO.md`. Percentuais existentes foram preservados no backend, mas não são apresentados como condições fixas na nova página pública. Nenhuma minuta foi publicada ou alterada.

Decisões do Diego em 17/09/2026:

- **Parceiro = franqueado sem a burocracia de franquia.** Escritórios de contabilidade, advocacia e similares, em qualquer município, oferecem endereço fiscal e, se quiserem, sala privativa e escritório compartilhado.
- **Modelo jurídico: a CafeWorking vende.** O cliente contrata a CafeWorking pelo site ou app. O parceiro é um prestador credenciado que fornece o espaço e atende no local. A unidade aparece como "CafeWorking · Cidade". Esse desenho evita a licença de marca para negócio próprio, que caracterizaria franquia (Lei 13.966/2019).
- **Dinheiro: split no Asaas, 75% para o parceiro e 25% para a CafeWorking.** Cada um emite nota da sua parte. O parceiro fatura a cessão de espaço e o endereço; a CafeWorking fatura a plataforma e a intermediação.
- **Preço: tabela nacional única.** A mesma tabela vale para todas as cidades e é copiada para cada unidade parceira. O parceiro não altera preço.
- **Entrada na rede:** formulário "Seja parceiro" no site, aprovado pelo Diego no painel.
- **Acesso:** o parceiro entra na plataforma, com login master da própria unidade, e recebe e-mail a cada contrato novo.

## Pontos a validar antes de lançar

1. **Tributário (Ciatos):**
   - como cada parte emite a nota no split 75/25;
   - onde incide o ISS (serviço de endereço no município do parceiro, intermediação em BH);
   - como fica o parceiro pessoa física (carnê-leão/INSS).
2. **Jurídico:**
   - revisar as minutas em `docs/contratos-parceiros/`;
   - CDC: a CafeWorking pode responder solidariamente perante o consumidor, e a proteção real vem do regresso, da indenidade, da retenção e da fiança;
   - risco de o arranjo ser visto como franquia se o parceiro ganhar autonomia comercial com a marca.
3. **Garantia versus split:** a minuta prevê reter 10% do repasse.
   - **Proposta:** o split envia 67,5% direto ao parceiro, e 7,5% ficam com a CafeWorking num razão de garantia por parceiro.
   - **Devolução:** a garantia é devolvida 12 meses após o último cliente, ou usada para cobrir prejuízo.
   - **Validar:** o tratamento contábil desse valor retido.
4. **Asaas:**
   - cada parceiro precisa de uma conta Asaas que receba o split (subconta criada por API ou conta própria, via walletId);
   - a subconta passa por análise cadastral (KYC) no Asaas;
   - as cobranças de unidades parceiras saem da conta Asaas da CafeWorking com o split, e nunca da chave do parceiro.

## Fases

### Fase 1: fundação no app
- **Conta:** `contas.tipo` ('propria' | 'parceiro'), percentual do parceiro (75), percentual de garantia (10% do repasse), `asaas_wallet_id`, situação do parceiro e dados PJ/PF.
- **Tabela nacional de preços:** cadastro de planos modelo pelo admin da plataforma, aplicação e sincronização para as unidades parceiras e bloqueio de edição de preço pelo parceiro.
- **Split nas cobranças:**
  - vale para assinatura, avulso, reserva pelo site e cobrança pelo app;
  - toda cobrança de unidade parceira usa a conta Asaas da CafeWorking com split para o `walletId` do parceiro;
  - os valores de cada cobrança (bruto, parte do parceiro, garantia, parte da CafeWorking) ficam registrados.
- **Razão de garantia por parceiro,** com extrato visível ao parceiro.
- **Nota ao receber:** em unidade parceira, a CafeWorking emite só a parte dela.
- **E-mail ao parceiro** a cada contrato novo, reserva paga, abertura de empresa e cancelamento.
- **Visão do parceiro:** "Meus repasses" por mês (bruto, 75%, garantia retida, líquido), sem ver dados de outras unidades.

### Fase 2: entrada do parceiro — feita (20260923120000)
- **Site:** `seja-parceiro.html` (repositório do site) explica o modelo e recebe a
  candidatura; `assets/js/parceiro-form.js` valida documento e telefone, mostra o
  contrato de parceria vigente e envia à Edge Function `parceiro-candidatura`
  (pública, com Turnstile). Quem envia cai em `obrigado-parceiro.html` (noindex).
- **Banco:** `parceiro_candidaturas` (só o admin da plataforma lê e move para
  'em_analise'; aprovar e recusar são da Edge Function).
- **Painel "Parceiros"** (`src/pages/Parceiros.jsx`): candidaturas por situação,
  aprovar, recusar com motivo (e-mail ao candidato), checklist do que falta e
  indicadores da rede.
- **Aprovar** (`aprovar-parceiro`, idempotente e auditada): conta parceira 75/10
  em `em_analise`, unidade "CafeWorking &lt;Cidade&gt;" com a tabela nacional,
  login master com link de criar senha, aceite do contrato de parceria (categoria
  `parceria`, quando houver texto publicado) e e-mail de boas-vindas com o que
  falta. **Não ativa o parceiro:** ele só vende com o `asaas_wallet_id` em Contas.
- **Kit do endereço:** o roteiro (IPTU com índice cadastral, autorização do
  proprietário, AVCB) sai no checklist da tela e no e-mail; o envio continua em
  Unidades → Documentos do endereço fiscal.

### Fase 3: operação e vitrine nacional — parcial
- **Vitrine:** `scripts/paginas-cidade.js` (site) gera no build uma página por
  cidade com unidade pública vendendo endereço fiscal
  (`/endereco-fiscal/<cidade>-<uf>`), com preço da tabela nacional, endereço, o
  que está incluso, FAQ e botão de contratar já com a unidade. O `contratar.js`
  aceita `?cidade=` e descobre a unidade. **feito**
- **Prazo de correspondência:** `correspondencias_fora_prazo()` acha o que passou
  de 1 dia útil em unidade parceira; a `rotina-diaria` avisa o parceiro e a
  CafeWorking uma vez por correspondência (`parceiro_alertas`) e a tela
  Correspondências marca o que está fora do prazo. **feito**
- **Indicadores por parceiro** (`parceiro_indicadores()`): clientes ativos,
  receita do mês, garantia acumulada e correspondências fora do prazo. **feito**
- **Qualidade:** bloqueio de repasse com reclamação pendente. **pendente**

### Pendências para o dono decidir
1. **Publicar o contrato de parceria** (categoria `parceria`, sem unidade), a
   partir de `docs/contratos-parceiros/`, depois da revisão da Ciatos Jurídico.
   Enquanto não houver texto, a aprovação segue sem registrar o aceite e a tela
   avisa.
2. **Contrato do cliente de unidade parceira** com os dados do parceiro e a
   cláusula de responsabilidade (hoje o texto vigente é o mesmo de qualquer
   unidade).
3. **Subconta Asaas do parceiro:** a carteira (`walletId`) continua informada à
   mão em Contas. Criar a subconta por API exige decisão sobre o KYC.

## Publicação da unidade (migration 20260927120000)

Decisões tomadas ao integrar o branch `codex/rede-unidades-parceiras`:

- **Unidade de conta própria não muda.** `unidade_publicavel()` só cobra perfil
  aprovado, carteira Asaas e documentos em dia de conta `parceiro`. Unidade
  própria (e qualquer unidade cuja conta não esteja marcada como parceira)
  continua publicável e vendendo só por estar ativa — é o que mantém Luxemburgo
  e Estoril no site.
- **Documento do kit.** Na unidade própria o documento nasce `aprovado` e a
  equipe da unidade continua cuidando dele sozinha; na parceira nasce
  `pendente` e só o admin da plataforma muda a situação. Número, validade e
  arquivo seguem imutáveis para todo mundo: para trocar, apaga e envia de novo.
- **Uma fonte da verdade por pergunta.** *Quais* documentos pedir ao parceiro
  continua em `_shared/parceiroCandidatura.ts` (`KIT_ENDERECO_PARCEIRO`, que a
  tela Parceiros e o e-mail de boas-vindas usam). *Qual* deles trava a
  publicação é a tabela `parceiro_requisitos`, semeada com os mesmos valores e
  ajustável pelo admin em `configurar_requisito_parceiro`. Hoje só o IPTU trava:
  a autorização do proprietário é condicional (imóvel de terceiro) e o AVCB
  depende do prédio.
- **Catálogo público não cai por causa da rede.** `unidades_publicaveis(text[])`
  responde a lista inteira numa chamada; se a RPC falhar, as unidades próprias
  continuam no catálogo e as parceiras ficam de fora (o lado seguro dos dois).
- **Vocabulário de serviços.** A candidatura do site usa os rótulos comerciais
  (`endereco_fiscal`, `sala_privativa`, `escritorio_compartilhado`,
  `sala_reuniao`); o perfil aprovado usa as categorias de plano
  (`endereco_fiscal`, `coworking`, `sala_hora`, `sala_privativa`), porque é
  contra elas que `servico_publicavel()` libera a venda. São coisas diferentes
  de propósito: o que o candidato pediu e o que a CafeWorking aprovou.
