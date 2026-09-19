# Endereço fiscal em unidade parceira — lógica de produto

Revisão de produto em 19/09/2026. Este documento descreve a experiência e os controles do app; não determina documentos ou enquadramento jurídico para todos os municípios.

## Princípio

Uma unidade parceira pode operar somente endereço fiscal. Sala, estação, coworking e agenda são capacidades opcionais e independentes. O app habilita menus conforme os serviços aprovados da unidade.

Ter os documentos do imóvel aprovados não significa que qualquer empresa possa registrar-se ali. A jornada separa a aptidão da unidade da viabilidade da atividade de cada cliente. A Consulta Prévia verifica a combinação de endereço e atividade no município; o licenciamento posterior varia conforme atividade e risco.

## Três experiências

### Parceiro e recepção

1. Cadastra empresa, imóvel, horários e capacidade operacional.
2. Envia apenas documentos configurados pela CafeWorking para aquela localidade; nenhum requisito novo é presumido pelo app.
3. Seleciona endereço fiscal. Se for o único serviço, salas e reservas não são exigidas nem exibidas na operação.
4. Após aprovação, recebe clientes e contratos vinculados somente à sua unidade.
5. Opera correspondências: identifica cliente, fotografa envelope/documento, classifica, notifica, registra digitalização ou retirada e mantém histórico.
6. Atende o cliente no chat registrado e acompanha sua parcela em cada cobrança.

### Cliente

1. Escolhe unidade e plano, conhece o endereço e as condições antes de contratar.
2. Aceita o contrato versionado e paga.
3. Envia os documentos da empresa em área privada.
4. Recebe orientação explícita de que a contratação não substitui a Consulta Prévia de Viabilidade.
5. Após conferência, adimplência e documentação válida da unidade, recebe links temporários para o kit do imóvel.
6. Vê correspondências e conversa com a recepção da unidade.
7. Em cancelamento, recebe orientação e prazo contratual para retirar o endereço dos cadastros.

### CafeWorking

1. Aprova parceiro e unidade separadamente.
2. Configura requisitos operacionais por localidade/unidade, sem convertê-los em afirmação jurídica genérica.
3. Revisa documentos e validade; somente documentos aprovados entram no kit.
4. Supervisiona conversas e indicadores, sem acessar unidades fora do escopo operacional.
5. Mantém preço, contrato, percentual e snapshot financeiro centralizados. A parcela da CafeWorking pode chegar a 25%; o percentual efetivo é configurado, não codificado na interface.
6. Suspende novas vendas quando unidade, recebimento, documento ou publicação deixam de cumprir as regras, preservando o atendimento dos contratos existentes.

## Estados essenciais

- Unidade: rascunho → em análise → correção ou publicada → suspensa/encerrada.
- Documento do imóvel: pendente → em análise → aprovado/rejeitado; vencendo/vencido é derivado da validade.
- Contrato fiscal: aguardando pagamento → aguardando documentos → em conferência → aguardando viabilidade → liberado; inadimplente/cancelando/cancelado são estados paralelos de cobrança.
- Correspondência: recebida → cliente notificado → digitalizada, retirada ou encaminhada, sempre com data e operador.

## Controles obrigatórios de produto

- Isolamento por unidade e papel no banco, não somente pela sidebar.
- Links temporários para IPTU e documentos; nenhum arquivo público.
- Registro de quem aprovou, acessou, notificou, retirou ou alterou estado.
- Minimização de dados para a recepção e retenção definida para fotos, mensagens e documentos.
- Requisitos municipais configuráveis e revisão humana antes da publicação.
- Nenhuma promessa de aprovação da viabilidade, licenciamento ou ganho financeiro.

## Referências oficiais consideradas

- REDESIM: Consulta Prévia de Viabilidade e licenciamento por risco.
- Prefeitura de Belo Horizonte: viabilidade como etapa anterior à abertura/alteração e ao ALF.
- Receita Federal, IN RFB 2.119/2022: conceito de estabelecimento para o CNPJ.
- LGPD, art. 46, e guia de segurança da ANPD: controle de acesso e proteção contra acesso não autorizado.
