# Rede de Unidades Parceiras — diagnóstico funcional e versão inicial

Inspeção em 18/09/2026. Base app: `d54d0a90cadc38f98e8ee825f33659bc147bc81f`; base site: `ed41f3392c201b9e7305568e27dd94449628b7a2`. Branch nos dois repositórios: `codex/rede-unidades-parceiras`, criada de `main`, sem merge de outras branches.

## Limites da auditoria

Engenharia reversa do código, histórico, migrations versionadas, contratos de API, navegação e regras de acesso. O app tem 41 migrations anteriores e 51 Edge Functions. Não houve consulta ao banco hospedado, execução dos dry-runs que acessam serviços, acesso a dados pessoais, alteração de secrets ou deploy. “Pronto” significa implementado no código, não certificado em produção. Datas futuras em nomes de migrations não demonstram que foram aplicadas. `setup_completo.sql`, schemas de Netlify e `database/schema.sql` são históricos; a evolução Supabase deve seguir a sequência de migrations efetivamente homologada.

## Trabalho em andamento preservado

| Repositório / PR | Branch / base | Tema e cuidado |
| --- | --- | --- |
| app #1 | `codex/auditoria-jornada-cliente` → main | Agenda do cliente, prevenção de resposta fora de ordem e home; telas não alteradas aqui |
| app #2 | `codex/clientes-contratos-cobranca` → main | Contatos financeiros, contratos, bancos e NFS-e; sem alterar essas regras |
| app #3 | `codex/crm-atendimento-retornos` → branch do #2 | Histórico de leads e retornos por e-mail, **não** chat operacional do cliente |
| site #1 | `codex/auditoria-jornada-site` → main | Home, service worker e verificação de links; o `check-links.js` foi reutilizado idêntico, com atribuição, porque main referencia um arquivo ausente |

Branches remotas adicionais inspecionadas: app `blindar-financeiro`, `correcoes-cliente`, `migracao-cloudflare`; site `correcoes-diagnostico`, `migracao-cloudflare`. Seu conteúdo já é ancestral de main; as branches de PR acima são o trabalho não incorporado. Main do app inclui os commits de fundação `090894c`, split `4bb6b88`, telas `769fe32`, candidatura/aprovação `cff4303`, admin `74b84bb` e prazo postal `3f69099`. Não foram recriadas essas funcionalidades.

## Mapa de capacidades antes desta versão

| Capacidade | Estado | Evidência e aproveitamento |
| --- | --- | --- |
| Multiunidade | Pronto | `20260603120000_tenant.sql`, `store.jsx`, `supabaseDb.js`: contas → unidades → memberships; seletor de unidade |
| Luxemburgo / Estoril | Pronto no código | `data.js`, seeds, contratos e SQLs de cadastro; `unidade-luxemburgo.html` e `unidade-estoril.html`. Existência atual no banco não consultada |
| Perfis e permissões | Parcial | `storeSeeds.js`: plataforma, master, recepção, financeiro, contabilidade, cliente. RLS posterior corrige isolamento. Login sem membership caía na visão administrativa; agora falha fechado |
| Supabase / RLS | Parcial | Migrations de tenant, RLS por papel e isolamento de clientes. Algumas helpers antigas usam `role <> cliente`, mais amplo que os papéis estritamente operacionais. Novas RPCs usam whitelist; auditoria integral em staging ainda necessária |
| Contas parceiras / candidatura | Pronto | Fases 1/2, `Parceiros.jsx`, `aprovar-parceiro`, Turnstile e candidatura existente. Aprovação de candidatura não equivale à aprovação de conteúdo público |
| Endereço fiscal | Pronto | Assinaturas, kit privado, contratos e `cliente/EnderecoFiscal.jsx`. Não mudamos contratação nem minutas |
| Documentos do imóvel | Parcial | `unidade_documentos`, `documentos-unidade` privado, tipos e validade já existentes; faltava revisão do documento do imóvel (distinta da revisão dos documentos do cliente) |
| Clientes | Pronto | Cadastro, vínculos por unidade, convite de login, portal e RLS por e-mail do JWT |
| Agenda / reservas | Parcial | Tabelas relacionais, créditos, disponibilidade transacional, pagamento/cancelamento. Estados de presença existiam sem workflow presencial visível; PR #1 corrige a agenda cliente |
| Salas / recursos | Parcial | Capacidade, comodidades, fotos WebP, preços por período, locação e reserva online. Regras de uso explícitas foram acrescentadas; horários avançados por recurso continuam pendentes |
| Correspondências | Parcial | Cliente identificado, anexo privado/foto/PDF, categorias, status, aviso por e-mail e retirada; SLA de dia útil e alerta de parceiro. Encaminhamento logístico completo não identificado |
| Visitantes | Ausente | Plano “Visitante” não é controle de entrada. Não encontrado módulo dedicado de visitantes |
| Chat parceiro ↔ cliente | Ausente | `cliente/FaleConosco.jsx` usa WhatsApp/e-mail; o chat antigo não entregava. O histórico de CRM do PR #3 atende leads e não substitui este canal |
| Pagamentos | Pronto no código | Asaas, bancos, cobranças, boletos, webhook, financeiro e auditoria. Não se chamou nenhum provedor |
| Split / repasses | Parcial | Percentuais configuráveis em contas, snapshots por cobrança, garantia append-only, `recebimentosOnline.js` e “Meus repasses”. Não há base suficiente para chamar um saldo de “disponível para saque” sem conciliar o provedor |
| Dashboards | Parcial | Visão plataforma/unidade e indicadores parceiros existem; faltava home operacional orientada às ações de hoje |
| Páginas públicas | Parcial | Unidades próprias e cidade/endereço fiscal com canonical, FAQ e sitemap. Conteúdo de parceiro não tinha revisão editorial completa nem renderizador por bairro |
| Experiência de onboarding | Parcial | Candidatura cria conta/unidade/master; depois o operador precisava descobrir módulos separados |

## Modelo aproveitado e criado

- Preservados: `contas`, `unidades`, `unidade_members`, `clientes`, `app_state`, `salas`, `reservas`, `assinaturas`, `cobrancas`, `parceiro_garantias`, `parceiro_candidaturas`, `audit_logs` e buckets existentes. Identificadores técnicos legados foram mantidos para não quebrar FKs, contratos ou APIs; na UX falamos em conta/parceiro/unidade.
- Novo `parceiro_unidade_perfis`: um rascunho revisável por unidade, dados complementares em JSONB, status, parecer e revisor. Não duplica documentos de empresa, carteira ou percentuais. Alterar/salvar perfil publicado retira a unidade da vitrine até nova revisão.
- Novo `parceiro_requisitos`: catálogo dos tipos de documento já previstos; nenhum é tornado obrigatório por presunção jurídica. Admin configura requisitos operacionais globais da rede. Exceções por município/unidade são próxima etapa.
- `unidade_documentos`: acrescenta revisão pendente/em análise/aprovado/rejeitado e observações. Vencendo/vencido é derivado da validade. Documentos de parceiros existentes passam a pendentes para revisão; documentos de unidades próprias mantêm compatibilidade.
- Novo `unidade_mensagens`: mensagens imutáveis por cliente/unidade; autor e papel determinados no servidor. Sem insert/update/delete direto pelo navegador. Admin supervisiona/intervém, master/recepção atendem e cliente só acessa seu cadastro. Sem anexos ou realtime nesta versão.
- RPCs privadas de salvar/enviar/revisar/configurar/enviar mensagem/presença; ACLs explícitas, RLS de leitura e trilha de auditoria em ações de perfil e presença. Reutiliza identificação de cliente por e-mail do JWT mais membership local, conforme arquitetura existente.

## Telas e fluxos implementados

`Minha unidade parceira`: Empresa → Imóvel → Documentos → Espaços → Fotos → Serviços → Financeiro → Análise CafeWorking → Publicado. Rascunhos salvos no servidor, feedback de erro/sucesso, etapas roláveis no celular. Endereço fiscal sozinho dispensa conferir sala reservável. Espaços e financeiro abrem os módulos existentes, sem duplicar preços, agenda ou repasses. Galeria existente reaproveitada para upload pelo celular.

Home operacional: reservas do dia, check-in (até 30 minutos antes e dentro do período) / saída, correspondências para tratar, clientes, conversas, financeiro e status/parecer. Presença altera apenas o status da reserva e audita; não baixa pagamento nem devolve crédito.

Admin: lista de perfis, fotos e informações do imóvel, documentos privados com revisão individual, requisitos configuráveis, publicação ou solicitação de correções com parecer. Recebimento ativo/carteira e documentos configurados aprovados/válidos são conferidos no servidor.

Publicação: `unidade_publicavel` e `servico_publicavel` protegem catálogo, seletor e contratação nova. Conta própria preservada; parceiro precisa estar publicado e só oferece seus serviços aprovados. Cobrança operacional anterior permanece independente da revisão da vitrine. Kit do cliente só entrega documento aprovado e válido.

Site: proposta de aproveitar imóvel já pago, evolução de serviços, preparação guiada, candidatura preservada, FAQ e schema corrigidos, sem percentuais públicos fixos/promessa. `unidades-aprovadas.js` prepara uma página canônica por unidade/cidade/bairro, descrição específica mínima e apenas serviços aprovados; não gera páginas combinatórias. É um renderizador puro testado, **ainda não integrado ao build/sitemap**.

## Arquivos alterados por grupo

App: `src/App.jsx`; `src/lib/store.jsx`, `storeSeeds.js`, `documentosUnidadeApi.js`, `redeUnidades.js`, `redeUnidadesApi.js`; `src/pages/MinhaUnidadeParceira.jsx`, `ConversasUnidade.jsx`, `DocumentosUnidade.jsx`, `Unidades.jsx`, `Salas.jsx`; migration `20260927120000_rede_unidades_experiencia.sql`; funções `planos-publicos`, `unidades-publicas`, `kit-endereco`, `iniciar-assinatura`, `reservar-sala-online`; `_shared/parceirosDb.ts` e testes; `package.json`/lock; testes locais e documentação.

Site: `seja-parceiro.html`, `scripts/seo.js`, `scripts/unidades-aprovadas.js`, `scripts/parceiros-rede.test.js`, `scripts/check-links.js`, `package.json` e `REDE-UNIDADES.md`.

## Verificações e limitações

- App: lint e build Vite aprovados; 9 testes novos (incluindo migração real em Postgres WASM, RLS/ACL negativa e check-in); 184 testes Deno existentes/estendidos aprovados. Type-check das funções alteradas aprovado.
- Site: 43 testes aprovados; build local sem consultar APIs; 74 páginas públicas sem referências locais ausentes. Checker reaproveitado do PR #1, idêntico ao original.
- Inspeção visual site em 390×844: sem overflow horizontal; candidatura não submetida. Preview local mantido. Não há screenshot operacional com backend real: homologação Supabase ainda não autorizada.
- Dependências instaladas reportam 8 vulnerabilidades (2 moderadas, 6 altas); não aplicado upgrade massivo fora do escopo. Bundle grande já existente; nenhuma alegação de otimização de desempenho.
- Não concluídos: visitantes, encaminhamento de correspondência, notificações/realtime/anexos do chat, conciliação de disponibilidade financeira, horários avançados por recurso, requisitos por município, geração automática/remoção de páginas de unidades e calculadora. São próximos incrementos, não funcionalidades prontas.

Esta versão é para revisão e staging. Não é liberação de produção nem conclusão de todo o roadmap.
