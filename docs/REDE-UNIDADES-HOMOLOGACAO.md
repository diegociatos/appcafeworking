# Homologação da primeira versão da rede

Nenhum passo neste roteiro deve ser executado contra produção sem autorização explícita. Não usar as credenciais já versionadas de `.env.production` para demonstração. Não executar os dry-runs remotos como se fossem testes locais.

1. Revisar PRs existentes e este PR. Não substituir as branches de CRM, contratos ou agenda. Conciliar scripts de teste de `package.json` quando integrar os PRs; preservar `test:rede` junto dos testes anteriores.
2. Criar/selecionar Supabase de staging com migrations anteriores efetivamente aplicadas. A suíte Postgres WASM valida a migração nova e o contrato mínimo anterior, não o schema completo hospedado, Auth, Storage ou e-mail.
3. Aplicar a migration nova somente em staging. Conferir compatibilidade e `audit_logs`, memberships, grants e buckets. Não reaplicar `setup_completo.sql` sobre um banco existente.
4. Configurar app local com URL/key pública de staging em `.env.local`. Nunca service-role no frontend. APIs novas falham explicitamente se schema/migration faltarem.
5. Publicar as Edge Functions alteradas somente no projeto de staging: catálogo, unidades públicas, kit, iniciar assinatura e reservar sala online. Não ativar rotinas, cobrança real ou envio de e-mail para clientes reais. Usar sandbox do provedor e fixtures autorizadas.
6. Criar operador A, operador B, recepção, cliente A, outro cliente A e admin em fixtures. Confirmar isolamento também por chamadas HTTP diretas, troca de unidade, histórico e ausência de membership. Contabilidade/financeiro não devem acessar o chat por serem staff genéricos.
7. Candidatar/aprovar pelo fluxo existente, configurar conta, preparar perfil, carregar fotos, salvar cada etapa, enviar, revisar documentos, solicitar correção e reenviar. Percentuais vêm da conta, não desta página. Documentos são tipos existentes, requisitos configurados após análise local.
8. Confirmar que parceiro não publica sozinho nem altera review por REST. Perfil não aprovado, requisito vencido ou serviço não selecionado não pode ser vendido. Unidade própria deve continuar no catálogo.
9. Conferir registro/notificação/retirada de correspondência existentes, com foto privada e cliente real de fixture. Chat precisa gravar antes de mostrar envio concluído; supervisão identificada. Atualização é manual.
10. Registrar presença de reserva confirmada dentro da janela; saída somente após check-in. Tentar reserva de outra unidade, cancelada e fora de horário. Conferir que pagamento/ledger não mudam.
11. Validar recebimentos existentes e rejeição de contratação nova em unidade não publicada; cobrança operacional anterior não depende da nova revisão editorial.
12. Validar kit: parceiro pendente/rejeitado/vencido sem link ao cliente; documentos próprios legados válidos continuam disponíveis aos clientes elegíveis.
13. Só depois integrar renderizador de páginas aprovadas ao build/sitemap, com remoção de conteúdo revogado, cache, canonical e links de planos. A rotina antiga de páginas por cidade mantém HTML em falha de API: **não confiar nisso para remover imediatamente páginas revogadas**. Checkout rejeita unidade não publicada, mas retirada do HTML requer estratégia de reconciliação.

## Cuidados antes de qualquer publicação definitiva

- Backup e revisão da lista de parceiros existentes: a migration deliberadamente exige revisão dos seus documentos e perfis antes de voltar à vitrine. Não presumir que não existem parceiros em produção.
- Unidade publicada editada retorna a rascunho. Decidir se a próxima versão precisa manter snapshot público anterior enquanto alterações são analisadas.
- Revisar expansão de privilégios das helpers legadas (`role <> cliente`), todos os endpoints service-role e acesso a Storage no ambiente completo.
- Configurar política de requisitos por município/unidade; catálogo global inicial não é determinação jurídica.
- Conferir URLs das fotos públicas, consentimento de uso e ausência de dados pessoais. O bucket de fotos existente é público; aprovação protege a página, não torna a URL do asset privada.
- Avaliar desempenho do catálogo: a implementação inicial confere publicação por unidade; otimizar em consulta batch antes de centenas de unidades.
- Planejar prevenção de abuso/rate limit, retenção de mensagens, paginação e notificações do chat.
- Testar jornadas e acessibilidade em aparelhos reais. A integração operacional ainda não recebeu teste visual com Auth/Storage de staging.
