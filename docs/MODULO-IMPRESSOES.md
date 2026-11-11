# Módulo de Gestão de Impressões — Diagnóstico técnico, arquitetura e plano

> Documento de análise. **Nenhum código foi alterado.** Objetivo: diagnóstico da
> aplicação atual, proposta de arquitetura e plano de implementação por etapas
> para controlar impressão por cliente na HP LaserJet Pro MFP 4103fdw, sem
> duplicar o que já existe. Base: leitura do código em `C:\dev\appcafe-main`
> (branch `main`, produção).

---

## 0. Resumo executivo (leia isto primeiro)

1. **Não precisa de sistema novo nem de duplicar nada.** O app CafeWorking já tem
   cadastro de clientes, login, papéis/permissões (RLS), planos com "direitos",
   um **ledger de créditos** e um padrão de **consumo mensal faturado no
   fechamento**. O módulo de impressão encaixa **quase 1:1** nesses padrões.

2. **O software é a parte fácil.** O trabalho real e o risco estão no **elo físico
   com a impressora**: um pequeno **agente local** no computador da recepção que
   recebe o trabalho, manda pra 4103fdw e **conta as páginas efetivamente
   impressas**. O resto é reaproveitar o que já roda.

3. **A 4103fdw é monocromática** (laser P&B, com duplex e rede). Isso simplifica:
   a franquia é só de páginas P&B — não há contabilidade de cor.

4. **Nunca bloqueia** (requisito atendido por desenho): impressão sempre acontece;
   franquia e excedente são **contabilidade**, não trava. O excedente é somado no
   mês e **faturado no fechamento**, exatamente como a cafeteria hoje → a
   integração com o financeiro sai "de graça" no futuro.

---

## 1. Diagnóstico da aplicação atual

### 1.1 Linguagens, frameworks e arquitetura

- **Frontend:** React 18 + Vite 5, SPA (single-page app). Ícones `lucide-react`.
  **`xlsx` (SheetJS) já é dependência** → exportação pra Excel já existe no app e
  será reusada nos relatórios. Lint com ESLint. Pacote `cafeworking-admin` v2.0.0.
- **Comunicação com o backend:** **sem SDK do Supabase** — tudo por `fetch` REST.
  Auth pelo GoTrue (`/auth/v1/*`), leitura por PostgREST (`/rest/v1/*`), escrita
  privilegiada por **Edge Functions** (`/functions/v1/*`). O JWT do usuário vai em
  toda chamada (`src/lib/supabaseAuth.js`, `src/lib/supabaseDb.js`).
- **Backend:** **Supabase** — Postgres com **RLS** (segurança por linha), ~60
  **Edge Functions** em Deno/TypeScript, **Storage** com buckets privados, e Auth.
- **Multi-tenant:** tudo é escopado por **`unidade_id`** (a unidade de coworking).
  Unidades agrupadas por conta/franqueado.
- **Deploy:** frontend no **Cloudflare Pages** (push na `main`); Edge Functions por
  `supabase functions deploy`. **Cobrança via Asaas** (tabela `cobrancas`, webhooks).
- **Modo demo:** sem as variáveis `VITE_SUPABASE_*`, o app roda com dados de
  semente e sem login (útil pra desenvolver telas sem tocar produção).

### 1.2 Estrutura do banco de dados

Dois estilos convivem:

- **Tabelas relacionais dedicadas** (fonte da verdade do que é sensível/financeiro):
  `contas`, `unidades`, `clientes`, `usuarios`, `unidade_members`,
  `platform_admins`, `assinaturas`, `contratos_modelos`, `aceites_contrato`,
  `creditos_ledger`, `cobrancas`, `boletos`, `notas_fiscais`, `reservas`,
  `consumos_cafeteria`, `fechamentos_cafeteria`, `bank_accounts`, `config_fiscal`,
  `audit_logs`. (Esquema consolidado em `supabase/setup_completo.sql`.)
- **Estado operacional em JSON** na tabela genérica **`app_state`** (um documento
  por unidade e por entidade: `salas`, `reservas`, `leads`, `estoque`, **`planos`**,
  pedidos, recibos, etc.). Só **staff** lê/escreve `app_state`; o cliente **nunca**.

### 1.3 Cadastro e autenticação de clientes

- **Mesmo login pra cliente e equipe** (`src/pages/Login.jsx`); o cliente pode se
  autocadastrar escolhendo cidade+unidade (Edge `cadastrar-cliente`). O acesso
  também pode ser provisionado pela equipe (Edge `convidar-cliente`, que cria o
  login e manda e-mail de definição de senha).
- **Papéis:** `unidade_members.role` ∈ {`master`, `financeiro`, `recepcao`,
  `cliente`, …}; super-admin da plataforma em `platform_admins`. No frontend os
  perfis (`PERFIS` em `src/lib/storeSeeds.js`) controlam **quais telas aparecem** —
  mas isso é só UI; **a segurança real é a RLS** no banco.
- **Elo usuário ↔ cliente é por E-MAIL** (não há FK de `auth`): as políticas RLS
  casam `clientes.email = auth.jwt()->>'email'` dentro da mesma `unidade_id`
  (ex.: `20260627120000_rls_por_papel.sql`, `20260630140000_clientes_isolamento.sql`).
  O frontend espelha isso (`src/lib/clienteAtual.js`), sem nunca cair no "cliente 0".
- **Três camadas de acesso** (migration-chave `20260627120000_rls_por_papel.sql`):
  `is_platform_admin()` (tudo) · `is_unidade_staff()` (vínculo com role≠cliente,
  opera a unidade) · **cliente** (só os próprios dados, por e-mail/documento).

### 1.4 Contratos e informações comerciais

- **Planos** ficam no `app_state` (entidade `planos`), geridos em
  `src/pages/Planos.jsx`. Cada plano tem `{ nome, preco, recorrencia, emiteNF,
  ativo, direitos }`. O vínculo **cliente ↔ plano é por NOME** (`clientes.plano`).
- **`direitos` (jsonb) = as franquias que já existem:** `horasReuniao`,
  `horasCoworking`, `dayPass`, `correspondencias` (contagens mensais), `cafeIncluso`,
  `descontoSala`, `descontoCafe`, `aberturaEmpresa`, `certificadoDigital`.
  **É aqui que entra a franquia de impressão** (ver 2.6).
- **`assinaturas`** (tabela relacional, `20260914120000_venda_site.sql`): assinatura
  mensal no Asaas por cliente, com `direitos` jsonb também no servidor, ciclo de
  cobrança, status (ativa/inadimplente/cancelada), fidelidade, documentos.
- **Contrato com prova:** `contratos_modelos` (texto versionado e **imutável**, hash
  sha256) + `aceites_contrato` (aceite append-only, IP/navegador).

### 1.5 Como reutilizar cadastros e permissões (o ponto central)

O módulo **não cria usuários nem permissões próprias**. Ele herda tudo:

- **Login:** o mesmo. O cliente já autenticado é identificado pelo **e-mail do JWT**
  — exatamente a chave que todo o resto do sistema usa.
- **Permissões:** as **mesmas policies RLS** (admin/staff/cliente). As tabelas novas
  nascem com as mesmas três regras de leitura e com escrita de consumo **só via
  Edge Function `service_role`** (o cliente não escreve direto — invariante do app).
- **Dois moldes prontos para copiar:**
  - **`creditos_ledger`** (`20260630120000_creditos_ledger.sql`): ledger append-only,
    `saldo = Σ quantidade` (+ concessão, − consumo), com `tipo` e `origem` — e a
    `origem` **já inclui `excedente`**. Hoje serve horas de sala, coworking, day
    pass, correspondência. **Basta um novo `tipo = 'impressao'`.**
  - **`consumos_cafeteria` + `fechamentos_cafeteria`** + função
    `fechar-consumos-cafeteria` (`20260921210000_...`): consumo mensal por cliente
    acumulado e **faturado uma vez no fechamento** via `cobrancas`/Asaas. **É o
    molde exato de "franquia + excedente + cobrança no fim do mês".**

---

## 2. Arquitetura proposta do módulo

### 2.1 Visão geral do fluxo

```
Cliente (notebook/celular)
   │  (1) envia documento — JÁ LOGADO no portal, ou por e-mail
   ▼
Edge Function  imprimir-enviar  ──►  Storage (bucket privado 'impressoes')
   │                                   + linha em impressao_jobs (status 'fila')
   ▼
Agente local da recepção (serviço no PC)
   │  (2) puxa a fila (fila-impressao) e baixa o arquivo (URL assinada)
   │  (3) imprime na 4103fdw (spooler do SO / IPP / raw 9100)
   │  (4) conta páginas realmente impressas (frente/verso) + resultado
   ▼
Edge Function  impressao-concluida
   │  (5) grava consumo no creditos_ledger (tipo 'impressao') + consumos_impressao
   ▼
Fechamento mensal (rotina-diaria → fechar-impressoes)
       cobra o EXCEDENTE no Asaas (molde cafeteria). Nunca bloqueia.
```

### 2.2 A impressora (HP LaserJet Pro MFP 4103fdw) e o agente local

- **Perfil do equipamento:** laser **monocromática**, multifuncional, com **duplex
  automático** (o "d"), ADF, **rede Ethernet/Wi-Fi** e fax. Fala IPP/AirPrint,
  **RAW 9100**, PCL6/PostScript e expõe **SNMP** (contadores de página). Como é P&B,
  **não há contabilidade de cor** — a franquia é só de páginas preto-e-branco.
- **Agente local (serviço no computador da recepção):** é a única peça nova fora do
  app. Responsabilidades:
  1. Autentica nas Edge Functions com um **token de dispositivo por impressora**
     (guardado no cofre de credenciais do SO, **nunca no repositório**).
  2. **Puxa** os trabalhos pendentes da sua impressora (polling a cada poucos
     segundos, ou via Supabase Realtime) e baixa o arquivo por **URL assinada**.
  3. **Imprime** na 4103fdw pelo spooler do SO (driver HP) ou IPP/RAW 9100,
     aplicando cópias e frente-e-verso.
  4. **Conta as páginas efetivamente impressas** e reporta o **resultado**
     (impresso / falha / parcial).
  5. É **resiliente:** fila offline, re-tentativas; se a impressora estiver fora,
     marca falha e **não conta**.
- **Por que um agente, e não imprimir direto do navegador:** navegador de celular
  não imprime em impressora de rede com contagem confiável nem identifica o usuário
  pro nosso sistema. O agente centraliza fila, contagem e resultado num ponto só.

### 2.3 Canais de envio (identificando o usuário)

- **Fase 1 — Portal logado (recomendado começar por aqui):** o cliente já
  autenticado abre a tela **"Impressões"**, sobe um PDF/arquivo, escolhe cópias e
  frente-verso e envia. Identidade = **JWT (e-mail)** — perfeita, sem cadastro
  novo. Funciona de notebook e do navegador do celular.
- **Fase 4 — E-mail-para-imprimir (opcional):** o cliente manda o documento pra um
  e-mail da unidade (ex.: `imprimir@…`); o remetente é casado com `clientes.email`
  (a **mesma chave** de identidade). Ótimo pra celular. Reaproveita a integração de
  e-mail que já existe (`email-ms365`).
- **Liberação segura no painel (opcional):** o cliente libera o trabalho na própria
  impressora com um PIN — evita papel esquecido na bandeja. Fase posterior.

### 2.4 Contagem de páginas (frente/verso) e resultado

- **Unidade de cobrança (DECIDIDO): por FOLHA.** Um PDF de 10 páginas = **10
  folhas** em simplex, ou **5 folhas** em frente-e-verso (o duplex reduz pela
  metade — vantagem pro cliente). A franquia e o excedente contam **folhas**;
  registramos também o nº de páginas e a flag **duplex** pro relatório de papel.
  Fórmula: `folhas = ceil(paginas / (duplex ? 2 : 1)) × copias`.
- **Fonte primária da contagem:** o agente conhece o PDF (nº de páginas) × cópias e
  as opções (duplex), então calcula de forma **determinística**.
- **Reconciliação:** cruza com o **contador da impressora via SNMP** (variação do
  total impresso naquele trabalho). Divergência → marca pra conferência manual.
- **Falha/atolamento:** conta só o que saiu (pelo contador) ou marca **parcial**
  pra revisão; nunca "cobra" página que não imprimiu.

### 2.5 Franquia, excedente e não-bloqueio

- A franquia mensal vive em **`direitos.impressaoMensal`** (nº de **folhas**) e
  **varia por plano** (cada plano tem seu valor, ajustável na tela de Planos) —
  mesmo mecanismo das horas de sala. A concessão mensal entra no `creditos_ledger`
  (`tipo='impressao'`, `origem='plano'`), igual às horas hoje.
- Cada trabalho impresso gera um **consumo** (`quantidade` negativa, em folhas) no
  ledger. Quando o saldo passa de zero, o excesso é **`origem='excedente'`** e vale
  **R$ 1,50 por folha excedente**, faturado no fechamento.
- **Não bloqueia nunca:** não existe trava em lugar nenhum do fluxo. Saldo negativo
  é só contabilidade. Ajuste manual pela equipe (cortesia, correção) = lançamento
  `ajuste_manual`, já auditado por gatilho.

### 2.6 Relatórios por cliente/período + Excel

- Tela admin **"Impressões"**: trabalhos (quem, documento, páginas, folhas, duplex,
  resultado, data), com filtro por cliente e por período (competência `AAAA-MM`).
- Relatório individual de consumo e **excedentes de franquia** por cliente.
- **Exportação pra Excel** reusa o `xlsx` que já está no projeto (mesmo padrão dos
  relatórios atuais).

### 2.7 Integração financeira futura

- No **fechamento mensal** (`rotina-diaria` chamando uma nova `fechar-impressoes`),
  o excedente de cada cliente vira **uma cobrança no Asaas** — **exatamente** o
  caminho de `fechar-consumos-cafeteria`. Idempotência por cliente/unidade/
  competência (molde `fechamentos_cafeteria`). Zero integração nova com o Asaas.

---

## 3. Alterações necessárias (proposta — sem código ainda)

### 3.1 Banco de dados (novas tabelas, todas com a RLS de três camadas)

- **`impressoras`** — registro das impressoras por unidade: `id, unidade_id, nome,
  modelo, device_token_hash, ativo`. O agente se autentica com o token (hash no
  banco, como o token do webhook do Asaas).
- **`impressao_jobs`** — fila + contabilidade por trabalho: `id, unidade_id,
  cliente_id, cliente_email, impressora_id, documento_nome, storage_path,
  paginas_declaradas, copias, duplex (bool), paginas_impressas, folhas, status
  (fila|enviado|impresso|falha|cancelado), origem (portal|email), criado_em,
  impresso_em, erro`. RLS: staff/admin tudo; **cliente só os próprios** (por e-mail).
- **`consumos_impressao` + `fechamentos_impressao`** — espelho do padrão da
  cafeteria, pro fechamento mensal e a cobrança do excedente.

### 3.2 Reaproveitamento (sem tabela nova)

- **`creditos_ledger`**: novo `tipo='impressao'` (concessão mensal e consumos).
- **`direitos`** (planos/assinaturas): novo campo `impressaoMensal` (em **folhas**,
  varia por plano).
- **`cobrancas`/Asaas**: cobrança do excedente no fechamento (via função nova).
- **Storage**: bucket privado novo **`impressoes`**, com as mesmas policies do
  bucket `correspondencias`; URLs assinadas curtas; **expurgo do arquivo após
  imprimir** (LGPD — documento do cliente não fica guardado).

### 3.3 Novas Edge Functions

- `imprimir-enviar` — **cliente (JWT)**: recebe o upload, grava no bucket, cria o
  `impressao_jobs` (status `fila`). (verify_jwt = true.)
- `fila-impressao` — **agente (device token)**: devolve os trabalhos pendentes da
  impressora + URL assinada; marca `enviado`.
- `impressao-concluida` — **agente (device token)**: recebe `paginas_impressas`/
  resultado; grava consumo no ledger + `consumos_impressao`; audita.
- `fechar-impressoes` — **cron/`rotina-diaria`** (service_role): fecha o mês e cobra
  o excedente no Asaas.
- ⚠️ **`fila-impressao` e `impressao-concluida` são públicas** (autenticadas por
  device token no corpo, não por JWT do gateway). **Precisam entrar na lista de
  `verify_jwt = false` do `supabase/config.toml`** — senão um deploy futuro volta a
  exigir JWT e derruba o agente em silêncio (foi o que pausou a fila do Asaas por
  14 dias). Lição já registrada no projeto.

### 3.4 Frontend

- **Cliente:** nova tela `cli_impressoes` em `src/pages/cliente/` (upload, saldo da
  franquia, histórico), via `src/lib/clienteApi.js` (Edge Functions com o JWT).
- **Admin:** nova tela no `NAV` (fila, trabalhos, relatório, Excel).
- Nada disso mexe no `app_state` do cliente (invariante preservada).

### 3.5 O agente local (fora do repositório do app)

- Serviço pequeno (Node.js ou .NET; serviço do Windows, dado o parque da recepção).
- **Não** vai no mesmo deploy do app — é instalado na recepção, com o device token.
- Começa como **conector de impressão + contador**; evolui pra liberação por PIN e
  multi-impressora depois.

---

## 4. Segurança, desempenho e manutenção

- **Segurança**
  - Mesma **RLS de três camadas**; cliente só vê/envia o que é dele.
  - **Token por impressora** (hash no banco, rotacionável), no cofre do SO, nunca no
    código. O agente não usa credencial de usuário.
  - Documentos em **bucket privado**, URL assinada curta, **expurgo após imprimir**
    (LGPD; documento pode ter dado sensível). Política de retenção definida na Fase 0.
  - Funções públicas do agente **fixadas** em `config.toml` (ver 3.3).
- **Desempenho**
  - Trabalho pesado (render/impressão) fica **no agente**, fora da requisição. As
    Edge Functions respondem rápido — respeitando a lição do timeout 408 do Asaas
    (nada de trabalho lento bloqueando a resposta).
  - Polling leve ou Realtime; contagem reconciliada por SNMP sem travar a fila.
- **Manutenção**
  - Tudo **aditivo**: tabelas/funções/telas novas, isoladas por RLS. **Não altera**
    nenhum fluxo existente (reservas, cafeteria, financeiro).
  - Reusa padrões já testados (ledger, fechamento, buckets, auditoria) → menos
    código próprio, menos superfície de bug.
  - Piloto em **uma unidade** antes de abrir pras demais.

---

## 5. Plano de implementação por etapas

| Fase | Entrega | Precisa de hardware? |
|------|---------|----------------------|
| **0 — Decisões** | Definir unidade de cobrança (página × folha), franquia por plano, preço do excedente, canal inicial (portal), retenção LGPD, IP fixo da 4103fdw. (Ver seção 6.) | Não |
| **1 — Dados + portal (software)** | Migrations (`impressoras`, `impressao_jobs`, `consumos/fechamentos_impressao`, bucket), Edge Functions `imprimir-enviar`/`fila-impressao`/`impressao-concluida`, tela do cliente e tela admin com Excel. Testável **sem impressora** (status manual) pra validar RLS e contabilização. | Não |
| **2 — Agente local + impressão real** | Serviço na recepção, device token, puxar+imprimir na 4103fdw, contagem real + reconciliação SNMP, re-tentativas/offline. **Piloto em 1 unidade.** | Sim |
| **3 — Franquia + excedente + financeiro** | `direitos.impressaoMensal`, concessão mensal no ledger, `fechar-impressoes` no `rotina-diaria`, cobrança do excedente no Asaas, relatórios por período. **Nunca bloqueia.** | Não |
| **4 — Opcionais** | E-mail-para-imprimir (identidade pelo remetente via MS365), liberação por PIN no painel, multi-impressora/multi-unidade. | Parcial |

Cada fase é independente e entregável sozinha. A Fase 1 já dá valor (envio e
histórico); a cobrança só entra na Fase 3, depois da contagem real validada.

---

## 6. Decisões da Fase 0 — FECHADAS

| # | Decisão | Definido |
|---|---------|----------|
| 1 | Unidade de cobrança | **Por FOLHA** (duplex = 1 folha / 2 páginas) |
| 2 | Franquia por plano | **Varia por plano** — campo `impressaoMensal` (folhas) ajustável em cada plano |
| 3 | Preço do excedente | **R$ 1,50 por folha** excedente |
| 4 | Canal inicial | **Só portal logado** nesta fase (e-mail fica pra Fase 4) |
| 5 | Retenção do documento | **Apagar após impresso** (LGPD) |
| 6 | Impressora / recepção | **IP fixo liberado**; PC da recepção pode rodar serviço em 2º plano |

---

## 7. Riscos e mitigação

- **Contagem divergente (atolamento/parcial):** mitigado pela reconciliação SNMP e
  pelo status `parcial` com conferência manual; nunca cobra o que não imprimiu.
- **Agente offline:** fila local no agente + re-tentativa; o envio do cliente não
  falha (fica `fila` até o agente voltar).
- **Deploy futuro quebrar as funções públicas do agente:** mitigado fixando-as no
  `config.toml` (lição do Asaas).
- **Documento sensível:** bucket privado + expurgo + URL curta.
- **Escopo inflar (cor, cobrança em tempo real, PIN):** mantidos como fases
  opcionais; o núcleo (enviar, imprimir, contar, faturar no fechamento) fecha nas
  Fases 1–3.

---

---

## 8. Especificação detalhada da Fase 1 (software, sem hardware)

> Parâmetros travados na Fase 0. Esta seção é **especificação** — os blocos SQL/
> contratos abaixo são rascunho de referência, **ainda não aplicados em produção**.
> Entregável da Fase 1: envio pelo portal, fila, contabilização e relatório, tudo
> testável **sem a impressora** (a conclusão do trabalho é lançada manualmente por
> um endpoint de teste, simulando o agente).

### 8.1 Banco — migration nova (rascunho)

Tudo aditivo, idempotente, com a RLS de três camadas (admin / staff / cliente).

```sql
-- impressoras: registro por unidade; o agente se autentica por token (hash)
create table if not exists public.impressoras (
  id                text primary key,
  unidade_id        text not null references public.unidades(id) on delete cascade,
  nome              text not null,
  modelo            text,                         -- 'HP LaserJet Pro MFP 4103fdw'
  device_token_hash text not null,               -- sha256 do token do agente
  ativo             boolean not null default true,
  created_at        timestamptz not null default now()
);

-- impressao_jobs: fila + contabilidade (folhas é a unidade cobrada)
create table if not exists public.impressao_jobs (
  id               uuid primary key default gen_random_uuid(),
  unidade_id       text not null references public.unidades(id) on delete cascade,
  cliente_id       text references public.clientes(id) on delete set null,
  cliente_email    text not null,
  impressora_id    text references public.impressoras(id) on delete set null,
  documento_nome   text not null,
  storage_path     text,                          -- apagado após impresso
  paginas          int,                           -- páginas do PDF
  copias           int  not null default 1 check (copias > 0),
  duplex           boolean not null default true,
  folhas           int,                           -- ceil(paginas/(duplex?2:1))*copias
  folhas_impressas int,                           -- confirmado pelo agente (fase 2)
  status           text not null default 'fila'
                    check (status in ('fila','enviado','impresso','falha','cancelado')),
  origem           text not null default 'portal' check (origem in ('portal','email')),
  erro             text,
  criado_em        timestamptz not null default now(),
  impresso_em      timestamptz
);
create index if not exists impressao_jobs_fila_idx
  on public.impressao_jobs (unidade_id, impressora_id, status);
create index if not exists impressao_jobs_cliente_idx
  on public.impressao_jobs (unidade_id, cliente_email, criado_em);

-- consumos/fechamentos: espelho do padrão da cafeteria (competência AAAA-MM)
create table if not exists public.consumos_impressao (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null, cliente_id text, cliente_email text not null,
  competencia text not null check (competencia ~ '^\d{4}-\d{2}$'),
  folhas int not null, folhas_franquia int not null default 0,
  folhas_excedente int not null default 0,
  valor_excedente numeric(12,2) not null default 0,  -- folhas_excedente * 1.50
  status text not null default 'aberto' check (status in ('aberto','faturado','cancelado')),
  cobranca_id uuid references public.cobrancas(id) on delete set null,
  created_at timestamptz not null default now()
);
-- fechamentos_impressao: trava de idempotência (unidade,cliente,competencia) única
```

RLS por tabela (mesmo molde de `consumos_cafeteria`): `is_platform_admin()` ou
`is_unidade_staff(unidade_id)` para staff; cliente lê o próprio por
`lower(cliente_email) = lower(auth.jwt()->>'email')`. **Escrita de consumo só
`service_role`** (Edge Functions).

### 8.2 Reaproveitamento

- `creditos_ledger`: usar `tipo='impressao'` (concessão mensal `origem='plano'`,
  consumos por trabalho, `origem='excedente'` acima da franquia). Unidade = folhas.
- `direitos.impressaoMensal` (int, folhas) no editor de planos (`src/pages/Planos.jsx`)
  e no `direitos` de `assinaturas`.
- Bucket **`impressoes`** (privado), mesmas policies do `correspondencias`; arquivo
  **apagado assim que o trabalho vira `impresso`**.

### 8.3 Edge Functions (contratos)

- **`imprimir-enviar`** — cliente (JWT, verify_jwt=true):
  `POST { documento_nome, paginas, copias, duplex, arquivo(base64/▶ upload) }`
  → valida cliente pelo e-mail do JWT, grava no bucket, calcula `folhas`, cria
  `impressao_jobs` (`fila`). Resp: `{ job_id, folhas }`.
- **`fila-impressao`** — agente (header `x-device-token`, verify_jwt=false):
  `GET` → trabalhos `fila` da impressora + URL assinada (10 min); marca `enviado`.
- **`impressao-concluida`** — agente (device token, verify_jwt=false):
  `POST { job_id, folhas_impressas, status, erro? }` → grava consumo no ledger +
  `consumos_impressao` do mês, marca `impresso`/`falha`, **apaga o arquivo**, audita.
  (Na Fase 1, um endpoint de teste equivalente simula o agente.)
- **`fechar-impressoes`** — Fase 3, chamado pelo `rotina-diaria` (service_role).

⚠️ **`fila-impressao` e `impressao-concluida` entram na lista `verify_jwt = false`
do `supabase/config.toml`** (autenticam por device token, não por JWT do gateway).

### 8.4 Frontend

- **Cliente** — nova tela `cli_impressoes` (`src/pages/cliente/Impressoes.jsx`):
  upload do arquivo, cópias, frente-e-verso, **saldo da franquia** (folhas restantes)
  e histórico dos próprios trabalhos. Via `src/lib/clienteApi.js`.
- **Admin** — item novo no `NAV`: fila da unidade, trabalhos, **relatório por cliente
  e período** com **exportação Excel** (reusa `xlsx`).

### 8.5 Teste da Fase 1 (sem impressora)

1. Criar impressora de teste e um plano com `impressaoMensal` (ex.: 50 folhas).
2. Cliente envia PDF pelo portal → confere `folhas` calculadas e status `fila`.
3. Simular agente (`impressao-concluida`) → confere consumo no ledger, saldo,
   excedente a R$ 1,50/folha e arquivo apagado do bucket.
4. Conferir RLS: cliente A não vê trabalho do cliente B; staff vê os da unidade.
5. Relatório + Excel batendo com o ledger.

### 8.6 Explicitamente fora da Fase 1 (vem depois)

- Impressão real e contagem por SNMP (Fase 2 — agente local).
- Concessão mensal automática + fechamento/cobrança do excedente (Fase 3).
- E-mail-para-imprimir, PIN no painel, multi-impressora (Fase 4).

---

*Próximo passo: com seu "pode ir", começo a **implementar a Fase 1** (migration +
Edge Functions + telas) numa branch separada, testo no modo demo e te mostro
funcionando **antes de qualquer deploy em produção**. Nada vai pra produção sem sua
conferência.*
