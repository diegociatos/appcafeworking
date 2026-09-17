# Rede de parceiros CafeWorking

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

### Fase 2: entrada do parceiro
- **Site:** página "Seja parceiro CafeWorking" com formulário (dados, endereço, fotos, IPTU/AVCB, serviços oferecidos) e aceite do contrato de parceria.
- **Painel "Parceiros":** candidaturas e, na aprovação, criação da conta, da unidade com a tabela nacional, do login master, da subconta Asaas e do kit do endereço.
- **Contratos:** o contrato do cliente de unidade parceira é preenchido com os dados do parceiro e a cláusula de responsabilidade.

### Fase 3: operação e vitrine nacional
- **Vitrine:** páginas por cidade geradas no build ("Endereço fiscal em Cidade/UF") e busca de unidade por cidade no contratar.
- **Prazo de correspondência:** avisar o cliente em até 1 dia útil, com alerta ao parceiro e à CafeWorking.
- **Qualidade:** bloqueio de repasse com reclamação pendente e indicadores por parceiro (clientes, cancelamentos, prazo).
