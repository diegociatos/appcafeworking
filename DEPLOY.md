# CafeWorking — Guia de operação (go-live)

Este guia leva o app do **modo demonstração** (dados em memória) para **operação
real** com Supabase. O código já está pronto: sem as variáveis de ambiente, tudo
roda em demo; **ao configurar, o app passa a usar o backend automaticamente** —
sem mexer no código.

---

## 0. Pré-requisitos
- Projeto **Supabase** (URL + anon key + service_role key).
- **Resend** (e-mail) com o domínio do coworking verificado (SPF/DKIM).
- **Certificados/credenciais** de cada banco que for usar (Inter/Itaú/BTG/Bradesco),
  gerados no portal de cada banco.
- CLI: `supabase` e `psql` (ou o SQL editor do painel).

### 0.1 Instalar e logar o Supabase CLI
**Windows (PowerShell, via Scoop — recomendado):**
```powershell
# instala o Scoop (se não tiver)
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
iwr -useb get.scoop.sh | iex
# instala o Supabase CLI
scoop install supabase
supabase --version
```
Alternativas: `npm i -g supabase` (ou usar `npx supabase ...` sem instalar),
ou baixar o .exe em github.com/supabase/cli/releases.

**Logar e vincular ao projeto:**
```powershell
supabase login                       # abre o navegador p/ autenticar
supabase link --project-ref lmgbysfrbtgqzbtouzft
```
O `project-ref` é o da URL do projeto (`https://<ref>.supabase.co`).

> Sem instalar a CLI dá para fazer **tudo pelo painel**: o SQL (passo 1) no
> *SQL Editor*, os buckets (passo 2) em *Storage*, e as Edge Functions (passo 3)
> em *Edge Functions → Deploy*. A CLI só agiliza.

---

## 1. Banco de dados (schema + dados)
```bash
supabase link --project-ref <ref>
supabase db push                          # roda as migrations de supabase/migrations
psql "$DATABASE_URL" -f supabase/seed_demo.sql   # dados iniciais (contas/unidades/equipe/clientes)
```
Tabelas criadas: `contas, unidades, usuarios, clientes` (tenant), `bank_accounts,
boletos` (cobrança), `notificacoes, cliente_notif_prefs` (e-mail),
`unidade_members, platform_admins` (acesso) — todas com **RLS**.

## 2. Storage (PDF dos boletos e XML/PDF das notas)
```bash
supabase storage create boletos           # bucket privado
supabase storage create notas-fiscais     # bucket privado (XML/DANFSe)
```

## 3. Edge Functions + secrets
```bash
supabase secrets set \
  SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
  RESEND_API_KEY=... EMAIL_FROM="CafeWorking <nao-responda@SEU-DOMINIO>" \
  APP_URL=https://app.SEU-DOMINIO

supabase functions deploy emitir-boleto
supabase functions deploy consultar-boleto
supabase functions deploy cancelar-boleto
supabase functions deploy webhook-boletos --no-verify-jwt
supabase functions deploy enviar-email
supabase functions deploy emitir-nfse
supabase functions deploy cancelar-nfse
supabase functions deploy salvar-certificado
supabase functions deploy criar-coworking
supabase functions deploy criar-usuario-equipe
supabase functions deploy excluir-coworking
supabase functions deploy asaas-cobranca
supabase functions deploy asaas-webhook --no-verify-jwt
supabase functions deploy salvar-integracao
```

> **Integrações cadastradas PELO APP:** a chave Asaas e as credenciais de banco
> são digitadas na própria tela (Cobranças → Configurar; Boletos → Nova conta).
> A função `salvar-integracao` guarda no Vault pelo backend — o cliente do
> coworking **nunca** acessa o Supabase. Há **um só** projeto Supabase (o da
> plataforma), multi-tenant; cada coworking só usa o app.

### Asaas (receber por boleto + PIX + cartão)
Em vez de integrar banco a banco, o **Asaas** é um gateway: 1 conta + 1 chave
de API cobram por boleto, PIX e cartão. Cadastre a chave no Vault por unidade:
```sql
select vault.create_secret(
  '{"api_key":"$aact_SUACHAVE","ambiente":"producao"}',
  'asaas_lux', 'Asaas API key — Luxemburgo'
);
```
(ou defina o secret de função `ASAAS_API_KEY` como fallback global). No painel
do Asaas, configure o **webhook** para
`https://<proj>.supabase.co/functions/v1/asaas-webhook` e o token em
`ASAAS_WEBHOOK_TOKEN` (secret de função). Sandbox: `"ambiente":"sandbox"`.

## 4. Credenciais dos bancos no Vault
Para cada conta bancária (uma vez), guarde o segredo e use o **nome** como
`credenciais_ref` em `bank_accounts`:
```sql
select vault.create_secret(
  '{"client_id":"...","client_secret":"...",
    "cert_pem":"-----BEGIN CERTIFICATE-----\n...",
    "key_pem":"-----BEGIN PRIVATE KEY-----\n...",
    "conta_corrente":"123456"}',
  'inter_grupo_ciatos_prod', 'Inter Cobrança v3 (mTLS)'
);
```
- **Itaú/Bradesco**: incluir `cert_pem`/`key_pem` (Bradesco: chave em **PKCS#8**).
- **BTG**: só `client_id`/`client_secret`.
- Registre o webhook de baixa apontando para
  `https://<proj>.supabase.co/functions/v1/webhook-boletos?banco=<banco>`.

## 4b. Nota Fiscal (NFS-e) — config por unidade + certificado A1 no Vault
Cada **unidade** tem 1 linha em `config_fiscal` (município, IM, regime, código
de serviço, alíquota ISS, `emissor` = `nacional`|`bhiss`, `ambiente`,
`emissao_ativa`) e referencia o certificado A1 (e-CNPJ) pelo **nome** em
`certificado_ref`.

**Upload do certificado pelo app (recomendado):** na tela *Notas Fiscais →
Configuração fiscal*, a unidade anexa o `.pfx` + senha. A Edge Function
`salvar-certificado` (usa `node-forge`) abre o `.pfx`, converte para PEM
(`cert_pem`/`key_pem` — necessários para o mTLS) e grava tudo no Vault via
`upsert_fiscal_secret`, preenchendo `certificado_ref`/titular/validade. O
arquivo **nunca** fica no navegador nem em coluna comum.

Alternativa manual (SQL editor, service_role) — inclua o PEM para o mTLS:
```sql
select vault.create_secret(
  '{"cert_pfx_base64":"<base64 do .pfx>","cert_senha":"<senha>",
    "cert_pem":"-----BEGIN CERTIFICATE-----\n...",
    "key_pem":"-----BEGIN PRIVATE KEY-----\n..."}',
  'cert_nfse_luxemburgo', 'Certificado A1 e-CNPJ — Luxemburgo (NFS-e)'
);
-- converter .pfx → PEM (se for cadastrar manualmente):
--   openssl pkcs12 -in cert.pfx -clcerts -nokeys -out cert.pem
--   openssl pkcs12 -in cert.pfx -nocerts -nodes -out key.pem
```
- `emissor: "nacional"` → NFS-e Nacional. A **emissão** é no módulo **SEFIN
  Nacional** (não no ADN, que é distribuição):
  - Produção restrita: `https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional`
  - Produção: `https://sefin.nfse.gov.br/SefinNacional`
  - Rotas: `POST /nfse` (`{dpsXmlGZipB64}`), `GET /nfse/{chave}`,
    `GET /danfse/{chave}`, `POST /nfse/{chave}/eventos` (cancelamento).
- `emissor: "bhiss"` → emissão municipal de BH (ABRASF 2.x).
- ⚠️ O SEFIN Nacional exige **mTLS** com o A1 (ICP-Brasil) **na conexão** —
  sem o certificado de cliente o endpoint responde HTTP 496. No Deno isso usa
  `Deno.createHttpClient({certChain, privateKey})` com o certificado em **PEM**
  (`cert_pem`+`key_pem` no segredo do Vault). Se só tiver o `.pfx`, converta
  para PEM antes.
- Sem certificado no Vault, a emissão roda em **modo simulado** — útil para
  testar o fluxo antes de ter o A1.
- A assinatura XML (xmldsig enveloped) com o A1 é o ponto de extensão
  `assinarDps()` / `assinar()` nos providers (`_shared/nfse/*`).

## 5. Front-end (Vite)
Defina as variáveis e faça o build/deploy (Netlify):
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```
A partir daí o app **exige login** e usa o backend (boletos via Edge Functions,
perfil/unidade via `unidade_members`).

## 6. Usuários e acesso
1. Crie os usuários no **Supabase Auth** (e-mail/senha).
2. Vincule cada um (ver fim de `supabase/seed_demo.sql`):
```sql
insert into public.unidade_members (user_id, unidade_id, franqueado_id, role) values
  ('<uuid>', 'lux', 'fr_ciatos', 'master');
insert into public.platform_admins (user_id) values ('<uuid-admin>');  -- admin da plataforma
```

---

## Estado do código (o que está pronto × pendente)

| Área | Código | Observação |
|------|:------:|------------|
| Login / sessão / token (Auth) | ✅ | GoTrue REST; token vai às Edge Functions |
| Perfil/unidade por `unidade_members` | ✅ | hidrata no login |
| Tenant: contas, unidades, equipe, clientes (leitura) | ✅ | `fetchTenant` + seed/fallback |
| **Clientes (criar/editar/excluir → DB)** | ✅ | write-through (RLS por unidade) |
| **Config fiscal por unidade (→ DB)** | ✅ | write-through (`config_fiscal`) |
| **Nota Fiscal (NFS-e): emitir/cancelar + certificado** | ✅ | SEFIN Nacional/BHISS; A1 no Vault; validar assinatura em prod. restrita |
| **Entidades operacionais** (salas, reservas, financeiro, estoque, catálogo, patrimônio, contratos, correspondências, pedidos, CRM, eventos) | ✅ | persistem via `app_state` (motor de sync); em produção partem vazias e hidratam do banco |
| **Onboarding de coworkings** (criar conta + login master pela tela) | ✅ | Edge Function `criar-coworking` (só platform admin); devolve senha temporária |
| Boletos: emitir/consultar/cancelar/webhook | ✅ | 4 bancos; Inter testado estruturalmente |
| E-mail ao cliente (Resend) + opt-in | ✅ | Fase 1+2 |
| RLS + Vault | ✅ | revisar policies antes do go-live |
| Contas bancárias (cadastro p/ boletos) | ⏳ | hoje seed; credenciais via Vault no go-live |
| Documentos do cliente (`docs`) | ⏳ | precisa de tabela própria + Storage |
| Validação dos campos Itaú/BTG/Bradesco | ⏳ | conferir contra o sandbox de cada banco |

**Resumo:** com o Supabase configurado, o app **sai do demo**: login obrigatório,
todas as entidades operacionais **partem vazias e persistem no banco**
(`app_state` + tabelas próprias de clientes/config/boletos/notas). Resta cadastrar
contas bancárias reais (Vault) e a tabela de documentos do cliente.

---

## 7. Começar de verdade (sair do demo)
1. **Variáveis na Netlify** (já feito no piloto): `VITE_SUPABASE_URL` e
   `VITE_SUPABASE_ANON_KEY`. Com elas, o app **exige login** e usa o banco —
   não há mais "modo demonstração".
2. **Rode o banco**: cole `supabase/setup_completo.sql` no SQL Editor (idempotente).
3. **Limpe os dados de exemplo**: rode `supabase/limpar_demo.sql` (remove os
   clientes/equipe/Savassi fictícios; mantém Grupo Ciatos + Lux/Estoril + config).
4. **Cadastre o real pela tela**: clientes, salas, reservas, financeiro, CRM,
   eventos — tudo já **persiste no banco**.
5. **Ajuste a config fiscal** (CNPJ/IM/ISS com o contador) e suba o certificado A1.

## 8. Onboarding de coworkings (vender o app)
Para o **dono da plataforma** cadastrar coworkings clientes (cada um com login):
1. Torne o dono **admin da plataforma** (uma vez, com o uuid do Auth dele):
   ```sql
   insert into public.platform_admins (user_id) values ('<uuid-do-dono>')
     on conflict do nothing;
   ```
   No login, ele passa a ver o **painel da plataforma + Contas** (perfil franqueador).
2. Em **Contas → Nova conta**, ele preenche empresa, master, e-mail e a 1ª unidade.
   A Edge Function `criar-coworking` cria o **login do master** + conta + unidade
   e devolve a **senha temporária** para repassar ao cliente.
3. O coworking entra com esse login e cadastra as próprias salas/clientes.
   O dono pode usar **"Entrar"** numa conta para dar suporte.
