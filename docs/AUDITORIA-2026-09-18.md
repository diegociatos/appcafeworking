# Auditoria prática — CafeWorking como um produto

Base do app: `d54d0a90cadc38f98e8ee825f33659bc147bc81f`.
Base do site: `ed41f3392c201b9e7305568e27dd94449628b7a2`.
Escopo: leitura do código e das migrações, testes locais, build e inspeção visual desktop/mobile. Nenhuma consulta autenticada ao banco, migration, cobrança, e-mail ou deploy foi executado.

## Arquitetura e jornada

| Camada | Implementação e pontos de entrada |
| --- | --- |
| Site | HTML estático, `assets/css/style.css`, scripts sem framework. Layout compartilhado gerado por `scripts/layout.js`; algumas páginas têm fonte em `scripts/conteudo/`. |
| Publicação | Ambos têm `wrangler.toml` para Cloudflare Pages. App publica `dist` do Vite; site usa `scripts/build-dist.js`, excluindo páginas internas. |
| App | React 18/Vite 5, `App.jsx`, componentes em `src/components`, store global em `src/lib/store.jsx`. Rotas em `?p=` e compatibilidade com caminhos antigos em `rotas.js`. |
| Identidade | Supabase Auth por cliente HTTP próprio (`supabaseAuth.js`); renovação e armazenamento local da sessão. Perfis de plataforma, master, recepção, financeiro, cliente e contabilidade. Visibilidade de menu não substitui autorização no servidor. |
| Dados | Postgres/Supabase: contas, unidades, vínculos, clientes, salas, reservas, créditos, assinaturas, cobranças, documentos; parte da operação usa JSON em `app_state`. |
| Servidor | Edge Functions Deno, autorização em funções e RLS; Asaas para pagamentos, integrações bancárias, NFS-e, notificações e Microsoft Graph/Resend. |
| Conversão | Site → planos/vitrine ou reservar-sala → contratar/reservar → pagamento → status-pagamento → acesso ao app por e-mail. |
| Pós-venda | Início, meu plano, reservas, faturas, correspondências, endereço fiscal, abertura de empresa, notificações e contato com recepção. |
| Operação | Reservas, salas, clientes, correspondências, PDV/KDS, catálogo, estoque, patrimônio, eventos, CRM, financeiro, boletos, cobranças e NFS-e. |

Salas privativas seguem assinatura/contrato; reservas por hora seguem disponibilidade e criação transacional; estações usam bases individuais e saldo de créditos. Auditório tem página comercial e operação de eventos: não foi comprovado checkout automatizado específico para todo formato de evento. Cafeteria tem vitrine/cardápio no site e PDV/cozinha/estoque no app. Endereço fiscal e correspondências têm etapas próprias de documentos e atendimento.

## Diagnóstico priorizado

| Prioridade | Evidência e impacto | Tratamento |
| --- | --- | --- |
| P1 | `Reservar.jsx` aceitava qualquer resposta de agenda; resposta atrasada podia substituir o dia atual. Confirmação não verificava carregamento/erro. | Corrigido: invalidação de respostas antigas, limpeza ao sair, bloqueio do formulário e aviso acessível enquanto carrega/falha/envia. Dois testes de regressão. |
| P1 | `sw.js` do site interceptava todo GET da mesma origem, incluindo pagamento/token/API. | Corrigido no site: bypass de checkout, endpoints e tokens; nova versão do cache e teste de regressão. Isso evita cachear esses recursos; não altera armazenamento de sessão do checkout. |
| P1 | Não há evidência local de quais migrations estão efetivamente aplicadas. Correções de isolamento e financeiro dependem delas. | Antes de produção, comparar histórico aplicado e testar dois clientes/unidades em homologação. Nenhuma migration aplicada aqui. |
| P1 | `npm audit` final reporta 8 ocorrências (6 high, 2 moderate), principalmente cadeia de desenvolvimento/build; Vite tem correção major proposta. | Planejar atualização de Vite/plugin/ESLint em PR dedicado, com compatibilidade e build. Não aplicar `audit fix --force` sem avaliar. Não equivale a 8 falhas exploráveis do produto publicado. |
| P2 | Site tinha `npm run check` apontando para arquivo inexistente. | Corrigido: verificação de referências locais do artefato público, rotas limpas e redirects exatos. |
| P2 | App importa quase todas as telas no início; bundle principal ~849 kB (~230 kB gzip). | Próximo passo: lazy loading por módulo com estados de erro/carregamento, medir em dispositivo real. |
| P2 | Coexistem Netlify e Cloudflare. `@netlify/database` sem uso em `src`; site ainda usa `netlify dev`, funções antigas e gerador de formulários Netlify. | Dependência do app removida. Configurações antigas preservadas até confirmar quais ambientes ainda existem. Usar Cloudflare/dist como referência de publicação. |
| P2 | `app_state` concentra dados operacionais e usa sincronização global. | Auditar concorrência, conflitos entre recepcionistas e permissões por operação antes de ampliar backoffice. Não migrar JSON em massa sem ensaio/backup. |
| P2 | Área do cliente real não funciona no modo demo. | Layout e navegação verificados; CRUD e valores reais não certificados por screenshot de demonstração. Preparar conta e dados sintéticos de homologação. |
| P2 | Vitrine/cidades mantêm HTML anterior se catálogo estiver indisponível; números fixos também existem na home. | Monitorar atualização e reconciliar preços públicos com catálogo. Nenhum preço comercial alterado. |
| P3 | CSS do site tem muitas regras sobrepostas e `!important`; aparência e ações iniciais pouco focadas na experiência. | Home mais humana com fotografia real, localização e cafeteria pública; app com atalhos de reserva/recepção; manter consolidação de CSS como próxima etapa. |

## Autorização e banco: o que foi conferido

- Migrações de RLS por papel e isolamento de `clientes` restringem dados próprios; migration de abertura de empresa exclui contabilidade de staff genérico.
- Financeiro possui checagem específica master/financeiro/plataforma no servidor. Não basta confiar nos módulos visíveis no navegador.
- `criar-reserva` autentica usuário, verifica unidade/sala, calcula preço/créditos no servidor; RPC de criação usa trava transacional. Cancelamento e direitos do plano têm testes próprios.
- Isso é revisão estática, não prova da configuração de produção. Falta testar políticas efetivas, Storage, funções publicadas, JWT, webhooks duplicados, pagamento aprovado/cancelado e conflito simultâneo de reserva em homologação.
- Sessão em localStorage exige cuidado com XSS. Valores de ambiente e tokens não foram incluídos no relatório nem nas capturas.

## Variáveis e segredos

Públicos no navegador: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; configuração equivalente em `assets/js/loja-config.js` no site e chave pública Turnstile. Anon key não substitui RLS.

Somente servidor: `SUPABASE_SERVICE_ROLE_KEY`, `ASAAS_API_KEY`, `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, credenciais OAuth/Graph, bancos e certificados. Configurações operacionais observadas: `APP_URL`, `ALLOWED_ORIGINS`, `ASAAS_AMBIENTE`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `EMAIL_EQUIPE`, `EMAIL_CONTABILIDADE`, `UNIDADE_FISCAL_PLATAFORMA`. Cloudflare tem `POWER_AUTOMATE_LEAD_WEBHOOK` e `POWER_AUTOMATE_RESERVA_WEBHOOK`; atualização agendada da vitrine usa `CF_PAGES_DEPLOY_HOOK` no GitHub. Confirmar presença por ambiente sem copiar valores para PRs. Inventário não garante configuração ativa.

## Validação

Antes: site 40/40 testes; check falhava por script ausente. App lint e build passaram; execução inicial do build precisou superar restrição local de leitura do Windows. Deno precisou resolver tipos e permitir variáveis de ambiente.

Depois: app 2/2 testes Node, lint sem erros e build aprovado; backend 183/183 testes Deno com `--node-modules-dir=auto --allow-env` (sem `--allow-net`). Site 41/41 testes, build estático e 74 páginas verificadas sem referências locais ausentes. O check não valida destinos externos, âncoras, funções executadas no servidor nem o catálogo ao vivo.

Inspeção visual: desktop e 390 px, sem overflow horizontal observado na home/site e início/cliente; atalho Reservar um espaço abre `?p=reservas`. Capturas locais da demonstração, sem transações reais. O build local do site empacota HTML existente; não atualiza a vitrine/cidades a partir do serviço remoto nem substitui o pipeline completo documentado no wrangler.

## Entrega e próxima etapa

Branches independentes e PRs de revisão; sem merge, deploy ou alterações de banco. Implementação focada em reserva, início do cliente, home, acessibilidade e verificações; não é redesenho completo dos módulos financeiros/PDV/ERP. Próxima rodada deve usar homologação para fechar a jornada de contratação, pagamento, crédito, reserva, cancelamento, correspondência e atendimento, com revisão de políticas efetivas e atualização de dependências.
