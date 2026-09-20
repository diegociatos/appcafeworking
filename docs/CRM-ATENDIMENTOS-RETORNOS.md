# Responsável, conversas e retorno ao cliente

O CRM tinha apenas a observação geral do lead. Esta branch acrescenta o responsável por atendimento, comentários com autor/data e um retorno agendado com lembrete ao e-mail de acesso do responsável.

## Uso

- Ao puxar um lead sem responsável para **Em Contato**, o usuário autenticado assume o atendimento. A etapa só muda depois da confirmação. Um atendimento já assumido conserva o responsável.
- **Ver atendimento → Assumir atendimento** também registra quem assumiu e quando. Dois usuários não conseguem sobrescrever um ao outro ao assumir o mesmo lead. A autoria vem do login, não de um campo livre.
- Cada **Registrar conversa** acrescenta uma anotação com autor e data/hora do servidor. A observação anterior permanece visível. Qualquer membro autorizado da equipe pode acrescentar uma conversa; o responsável não muda por isso.
- O próximo contato é opcional e exige um comentário. Usa o horário do dispositivo, convertido para UTC no banco; o e-mail mostra horário de Brasília. Há um agendamento pendente por lead.
- O lembrete usa o e-mail atual do login do responsável, não o e-mail do cliente nem o do autor de outra conversa. Leva nome do lead, contato, conversa relacionada e link para o CRM.
- O card mostra responsável e retorno. A tela permite marcar **Contato realizado** ou **Cancelar retorno**, antes do envio ou depois de seu resultado. A equipe enxerga falhas de envio. Leituras são atualizadas a cada 30 segundos.
- Leads fechados/removidos não geram lembrete. Responsáveis sem acesso à unidade ou marcados inativos não recebem os dados do cliente.

## Banco e segurança

`crm_atendimentos`, `crm_comentarios` e `crm_retornos` ficam separados do JSON do card. Isso evita que uma aba antiga sobrescreva o histórico de outra pessoa. Não modifica leads nem registros antigos. RLS só permite leitura à equipe da unidade/admin, não ao cliente. Escrita direta pelo app é revogada; a RPC valida a unidade, o lead, a autoria, o estado do retorno e a data futura. O bloqueio do lead serializa disputas pelo atendimento. Sem função de transferência neste escopo.

A fila usa bloqueio `SKIP LOCKED` e marca cada retorno como processando antes de enviar. Execuções repetidas não retiram novamente o mesmo retorno. Não há reenvio automático em falhas ou resultado incerto: consultar **Notificações** e o provedor antes de reagendar. Se o worker parar depois da retirada, o registro permanece processando para revisão operacional; não afirma que foi enviado.

## Publicação pendente

Esta branch parte do PR #2 e o PR de CRM tem aquela branch como base. Revisar e integrar o PR #2 primeiro; depois redirecionar o PR de CRM para main, preservando apenas este novo conjunto de mudanças.

1. Aplicar `20260926120000_crm_atendimentos.sql` em homologação. Não foi aplicada no Supabase.
2. Publicar `crm-retornos` com `--no-verify-jwt`. O endpoint valida seu próprio token; não aceita a chave pública do app como autorização.
3. Configurar **CRM_RETORNO_TOKEN** (aleatório, mínimo 32 caracteres) nos secrets da Edge Function, e **crm_retorno_token** com o mesmo valor no Vault. Configurar **crm_supabase_url** no Vault com a URL HTTPS do projeto (sem barra final). Não incluir os valores no repositório, frontend ou logs.
4. Conferir **APP_URL** e o provedor de e-mail já usado pelo app (Microsoft 365/Resend), incluindo remetente autorizado. Não foram lidas nem expostas credenciais.
5. Executar `supabase/scripts/agendar-crm-retornos.sql`. Configura um único job a cada cinco minutos e recusa configuração ausente. Não executado aqui. A migration sozinha não ativa e-mails.
6. Publicar o frontend depois da migration; validar com dois usuários da mesma unidade, outra unidade e um cliente. Conferir disputa por responsável, persistência após recarregar e o recebimento real de um lembrete sintético autorizado em homologação. O processamento ocorre no servidor com o app fechado; execução normal acontece na próxima rodada do cron, não no segundo exato do horário.

## Validação local

- `npm run test:crm`: PostgreSQL em memória (PGlite, apenas dependência de desenvolvimento) aplica a migration real e testa responsável, autoria, datas, ausência de gravação parcial, RLS, permissões de escrita, preservação do histórico, fila e transições. Fixtures mínimas representam as tabelas/helpers de Auth existentes; não substitui teste no Supabase de homologação.
- `node --test tests/contatosCliente.test.js`: preserva a validação do PR anterior.
- `deno test --node-modules-dir=auto --allow-env supabase/functions/_shared/`: testes de token, destinatário, unidade, acesso revogado, lead fechado, falha de provedor e ausência de repetição; execução sem permissão de rede.
- `npm run lint` e `npm run build`.
- Navegador desktop/mobile em demonstração: responsável, duas conversas com data, agendamento, conclusão e reabertura do atendimento. Nenhum e-mail real enviado. Os registros de demonstração duram apenas enquanto esta tela estiver montada.

Nenhum deploy, job de cron, e-mail real ou alteração de main foi executado.
