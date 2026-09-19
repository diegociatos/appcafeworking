# Auditoria da operação nacional CafeWorking

Revisão de código em 19/09/2026, sem acesso ou alteração de produção. A classificação abaixo confirma o que está versionado; integrações financeiras e fiscais ainda precisam ser homologadas no sandbox/staging.

## Modelo operacional considerado

- Luxemburgo: unidade própria completa, com coworking, cafeteria, salas e endereço fiscal.
- Estoril: imóvel integralmente ocupado por uma empresa; a oferta pública é somente endereço fiscal e recebimento de correspondências.
- Rede parceira: uma unidade operada localmente pelo parceiro, começando por endereço fiscal e podendo evoluir para estações, salas, reunião, auditório e outros serviços aprovados.
- Cliente: escolhe cidade/unidade, aceita contrato, paga, cria acesso e acompanha contrato, documentos, correspondências e conversa.
- CafeWorking: aprova unidade e catálogo, supervisiona atendimento, controla marca, cobrança, split, conciliação e sua remuneração.

## Diagnóstico por jornada

| Capacidade | Estado | Diagnóstico / pendência |
| --- | --- | --- |
| Página nacional de endereço fiscal | Pronto | Página dedicada, catálogo por unidade e contratação. “Endereço Fiscal” já tem destaque próprio no menu de serviços. |
| Busca por cidade | Parcial | Gerador SEO por cidade existe e só considera unidade/serviço aprovados. Falta busca nacional com estado vazio, lista de espera/candidatura e publicação automática no build. |
| Luxemburgo e Estoril | Pronto | Ofertas distintas no site e no app. Estoril é descrito como somente endereço fiscal, sem acesso público ao coworking. |
| Página pública de unidade parceira | Parcial | Renderizador canônico por cidade/bairro existe, com proteção contra conteúdo duplicado. Falta conectar publicação/despublicação ao build e sitemap. |
| Contratação, contrato e pagamento | Pronto no código | Plano, unidade, aceite versionado, cobrança Asaas, ativação e painel. Requer cenário completo em sandbox antes de produção. |
| Portal do cliente | Pronto | Assinatura, contrato, endereço fiscal, kit documental, correspondências e conversa por unidade. |
| IPTU/índice cadastral | Parcial | Bucket privado, documento aprovado/válido e entrega pelo kit estão implementados. Falta política administrativa explícita por município/CNAE e registro de qual versão foi entregue a cada contrato. |
| Correspondências | Parcial | Registro, cliente, foto/PDF privado, categoria, status, aviso e retirada. Digitalização autorizada e encaminhamento com cobrança/rastreio ainda não formam um fluxo completo. |
| Conversa parceiro-cliente | Pronto na primeira versão | Thread por cliente/unidade, acesso restrito e intervenção de administrador. Faltam anexos, realtime, SLA e notificações multicanal. |
| Painel operacional do parceiro | Pronto na primeira versão | Sidebar do próprio app, operação do dia, clientes, contratos, documentos, correspondências, conversas e financeiro. Unidade só fiscal oculta salas/reservas. |
| Onboarding do parceiro | Parcial | Empresa, imóvel, documentos, fotos, serviços, financeiro, análise e publicação. Conta Asaas/KYC ainda é manual. |
| Aprovação e supervisão admin | Pronto na primeira versão | Revisão documental e editorial, requisitos configuráveis, parecer, publicação e visão global. |
| Segurança/RLS | Parcial | Novas operações usam RLS/RPC e isolamento por unidade/cliente; testes negativos existem. Políticas legadas ainda precisam de auditoria integral em staging com usuários reais de cada papel. |
| Split Asaas | Crítico / parcial | Cobrança falha fechada quando parceiro não tem carteira. Porém o painel calcula sobre o bruto, enquanto `percentualValue` do Asaas é aplicado sobre o líquido após tarifas. O valor previsto pode divergir do transferido. |
| Eventos do split e conciliação | Ausente | Webhook trata pagamento, estorno e chargeback como status da cobrança, mas ignora `PAYMENT_SPLIT_DONE`, cancelamento e bloqueio por divergência. Não há razão conciliada do repasse real. |
| Estorno do split | Ausente | Não foi identificado uso de `splitRefunds`; estorno/chargeback pode deixar divisão financeira e garantia inconsistentes. |
| Conta Asaas do parceiro | Parcial | PF/PJ e `walletId` são aceitos, mas aprovação não cria subconta nem acompanha KYC/ativação. Hoje depende de cadastro manual. |
| Comissão 75%–85% | Parcial | Percentual é configurável e o padrão é 75%, mas a validação aceita qualquer valor entre 0% e 100%. A regra comercial 75%–85% deve virar faixa configurável da plataforma, não constante espalhada. |
| NFS-e da CafeWorking | Crítico / incorreto para o modelo proposto | O valor da comissão é calculado, mas a emissão automática usa o cliente pagador como tomador. Para nota de intermediação contra o parceiro é preciso uma obrigação fiscal separada, com cadastro/endereço do parceiro e serviço municipal configurado. |
| Nota/obrigação do parceiro ao cliente | Ausente / decisão necessária | O desenho contratual e fiscal precisa definir quem presta o serviço principal ao cliente e quem emite o documento fiscal. Não deve ser inferido apenas pelo split. |
| Mensalidade futura do parceiro | Preparado conceitualmente | Criar produto/cobrança própria, separado da comissão e desligado inicialmente. Não misturar com retenção do split nem ativar sem aceite contratual. |
| Observabilidade e suporte | Parcial | Há auditoria e avisos, mas faltam painel de falhas de webhook, reprocessamento seguro e alertas de divergência financeira/fiscal. |

## Problemas que impedem liberar o financeiro nacional

1. **Definir a base do percentual.** Se o parceiro recebe 75%–85% do líquido, o Asaas pode aplicar `percentualValue`, e o app deve registrar o líquido e a tarifa reais recebidos por webhook/API. Se o percentual for sobre o bruto, é necessário outro cálculo e a CafeWorking absorve taxas; não se deve prometer esse valor usando a implementação atual.
2. **Separar duas relações fiscais.** A cobrança do cliente e a comissão de intermediação devida pelo parceiro são fatos/partes diferentes. A nota de comissão não pode reutilizar automaticamente o cliente pagador como tomador.
3. **Automatizar onboarding Asaas.** Criar ou vincular a conta do parceiro, guardar `walletId`, acompanhar KYC e impedir publicação/venda até ativação. A conta matriz precisa atender aos requisitos atuais de subcontas do Asaas.
4. **Conciliar split real.** Persistir eventos de split, tarifa, valor líquido, valor efetivamente transferido, bloqueios, estornos e chargebacks; exibir “previsto”, “processando”, “disponível/pago” apenas a partir de fatos do provedor.
5. **Homologar contratos e tributos.** Contador/advogado deve validar prestador do serviço principal, tomador de cada NFS-e, retenções, código de serviço e ISS de cada município. Requisitos municipais permanecem configuráveis.

## Sequência segura de implementação

1. Fechar decisão comercial/fiscal sobre base do split e emissor do serviço principal.
2. Criar razão financeira imutável e processamento idempotente dos eventos de split/estorno.
3. Integrar onboarding e estado de KYC da conta Asaas PF/PJ em sandbox.
4. Criar cobrança fiscal da comissão CafeWorking contra o parceiro, independente da cobrança do cliente.
5. Homologar ponta a ponta: contratação, contrato, pagamento, acesso, correspondência, split, estorno e notas.
6. Só então ativar vendas de uma unidade parceira piloto e expandir cidade a cidade.

## Referências oficiais usadas na revisão

- Asaas — split de pagamentos: <https://docs.asaas.com/docs/split-de-pagamentos>
- Asaas — criação de subcontas: <https://docs.asaas.com/docs/criacao-de-subcontas>
- Asaas — webhooks de cobranças: <https://docs.asaas.com/docs/webhook-para-cobrancas>
- Asaas — estorno de cobrança: <https://docs.asaas.com/reference/estornar-cobranca>
- Asaas — FAQ de notas fiscais: <https://docs.asaas.com/docs/faq-de-notas-fiscais>
- REDESIM — consulta prévia: <https://www.gov.br/empresas-e-negocios/pt-br/redesim/abrir-cnpj/consultar-viabilidade>
- ANPD — guia de segurança: <https://www.gov.br/anpd/pt-br/documentos-e-publicacoes/guia-seguranca-da-informacao-para-atpcs.pdf>

