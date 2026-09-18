# Clientes, contratos, NFS-e e escolha do banco

Revisão sobre a main `d54d0a90cadc38f98e8ee825f33659bc147bc81f`, em branch independente da revisão visual anterior. Nada foi publicado em produção.

## Conferência dos quatro pedidos

1. **Mais e-mails:** ausente na main. Cadastro tinha somente `email`. Incluídos até dez contatos adicionais, validação, normalização e deduplicação; o principal permanece como identidade de login. Salvamento agora aguarda confirmação do banco antes de fechar o formulário. O cartão do cliente também exibe as cópias financeiras.
2. **Cliente e itens no contrato:** ausente no formulário financeiro. Incluída busca por nome/documento e seleção do cliente da unidade ativa; nome/documento são preenchidos pelo cadastro. Incluída busca/seleção de produtos e serviços do catálogo com quantidade, snapshot de nome/preço e soma opcional. O valor mensal final continua explícito e não soma o plano duas vezes. `clienteId` e itens ficam no contrato em `app_state`; as parcelas também guardam `clienteId`. Não modifica contratos antigos.
3. **Erro NFS-e HTTP/1.1:** a main já tinha `http2: false`, mas removia a opção em caso de falha ao construir o cliente. Essa alternativa podia voltar ao protocolo rejeitado. O transporte agora exige mTLS/HTTP/1.1, não reenvia POST, consome a resposta antes de fechar o cliente e apresenta orientação para verificar a publicação. Não é possível afirmar que a nota real está resolvida sem confirmar a versão da Edge Function e testar o certificado em homologação. Referência de protocolo: https://deno.com/blog/v1.34 (opções http1/http2).
4. **Inter versus Asaas:** a main tinha integração bancária em Boletos, mas Cobranças chamava exclusivamente Asaas. Agora Nova cobrança exige escolher o emissor; o fluxo bancário reutiliza o formulário de Boletos e espera a confirmação da API. Falha não fecha o formulário nem cria falsa confirmação. Boleto já registrado no Asaas não é convertido ou reemitido automaticamente.

## Destinatários adicionais

Somente eventos financeiros (`boleto_nova`, `boleto_lembrete`, `boleto_pago`, `boleto_vencido`, `cobranca_nova`, `nfse_emitida`) expandem destinatários. A consulta usa a mesma unidade e o e-mail principal exato, escapando curingas; cadastro ambíguo não expande. Cada cópia tem registro próprio de notificação. Não altera RLS/Auth, não concede acesso, não envia convite ou recuperação de senha aos adicionais. As cópias cobrem mensagens do CafeWorking; não mudam destinatários automáticos configurados diretamente no Asaas/banco. Uma falha de cópia não repete a operação financeira; detalhes de envios ficam no registro de notificações. Cadastro ausente, ambíguo ou migration ainda não aplicada não expande destinatários.

## Ordem necessária para publicação (não executada)

1. Em homologação, aplicar `20260925120000_clientes_emails_adicionais.sql` antes do frontend. A migration adiciona coluna com valor vazio, limita a dez contatos e preserva registros/policies.
2. Publicar as Edge Functions que empacotam os módulos compartilhados modificados. Isso inclui `enviar-email`, `asaas-cobranca` e emissores/webhooks/rotinas que usam notificações financeiras ou NFS-e. Atualizar `emitir-nfse`, `cancelar-nfse` e consumidores de `_shared/nfse/emitirNota.ts`; conferir dependências transitivas no pipeline para não misturar versões.
3. Publicar o frontend da branch aprovada. Publicar só o site/app no Cloudflare não atualiza as Edge Functions do Supabase.
4. Validar duas unidades e dois clientes: persistência após novo login, cópias somente aos contatos da mesma unidade, convite somente ao titular e falha de gravação visível.
5. No Inter de homologação, confirmar conta ativa, credenciais no Vault, certificado e conexão testada. Criar cobrança sintética, consultar situação e validar PDF/retorno. Asaas segue fluxo separado. Não cancelar ou emitir novamente o boleto real mostrado na captura sem conferir sua situação.
6. Na NFS-e, confirmar função publicada e certificado em homologação. Após erro de comunicação em emissão real, consultar a situação antes de reenviar, para evitar duplicidade.

## Validação local

- `npm run lint` e `npm run build`: aprovados.
- `node --test tests/contatosCliente.test.js`: 3 testes aprovados.
- `deno test --node-modules-dir=auto --allow-env supabase/functions/_shared/`: 190 testes aprovados. Sem permissão de rede na execução dos testes.
- Testes novos cobrem normalização de contatos, eventos permitidos, isolamento da consulta por unidade/email, cadastro ambíguo, HTTP/1.1 obrigatório, fechamento do cliente e ausência de reenvio/fallback fiscal.
- Browser em modo demonstração: cliente sintético salvo e reaberto com dois e-mails; cliente selecionado no contrato; duas unidades do serviço a R$120 totalizam R$240 e permanecem no contrato salvo; emissor bancário mostra Banco Inter, sem emissão real.

Não executados: migration no banco, deploy, envio real de e-mail, emissão real de boleto/NF, verificação das credenciais de produção. Os testes de transporte fiscal usam respostas simuladas.
