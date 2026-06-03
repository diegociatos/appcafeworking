# CafeWorking · Módulo de Boletos (Supabase)

Emissão de boletos bancários com **adapter pattern** por banco, rodando em
**Edge Functions (Deno)** — as credenciais e certificados **mTLS nunca tocam o
front-end** (ficam no **Vault**).

## Estrutura

```
supabase/
├─ migrations/
│  └─ 20260602120000_boletos.sql      # schema + RLS + Vault helper
└─ functions/
   ├─ _shared/
   │  ├─ cors.ts
   │  ├─ supabaseAdmin.ts             # userClient (RLS) / adminClient (service_role)
   │  ├─ vault.ts                     # lê credenciais via get_bank_credentials()
   │  ├─ storage.ts                   # sobe o PDF pro bucket privado "boletos"
   │  └─ banks/
   │     ├─ types.ts                  # tipos compartilhados
   │     ├─ BankProvider.ts           # INTERFACE comum (adapter)
   │     ├─ InterProvider.ts          # ★ implementação de referência (mTLS + PIX)
   │     ├─ ItauProvider.ts           # stub (assinatura pronta)
   │     ├─ BtgProvider.ts            # stub
   │     ├─ BradescoProvider.ts       # stub
   │     └─ index.ts                  # getProvider() + parseWebhook()
   ├─ emitir-boleto/index.ts          # emissão genérica
   ├─ consultar-boleto/index.ts
   ├─ cancelar-boleto/index.ts
   └─ webhook-boletos/index.ts        # baixa automática (--no-verify-jwt)
```

## Deploy

```bash
# 1. Schema
supabase db push

# 2. Bucket privado para os PDFs
supabase storage create boletos

# 3. Secrets do projeto (lidos pelas functions)
supabase secrets set SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...

# 4. Functions (webhook sem verificação de JWT — bancos não mandam JWT do Supabase)
supabase functions deploy emitir-boleto
supabase functions deploy consultar-boleto
supabase functions deploy cancelar-boleto
supabase functions deploy webhook-boletos --no-verify-jwt
```

## Credenciais no Vault

Nunca em colunas. Cadastre o segredo e referencie por nome em
`bank_accounts.credenciais_ref`:

```sql
select vault.create_secret(
  '{"client_id":"...","client_secret":"...",
    "cert_pem":"-----BEGIN CERTIFICATE-----\n...",
    "key_pem":"-----BEGIN PRIVATE KEY-----\n...",
    "conta_corrente":"123456"}',
  'inter_grupo_ciatos_prod',
  'Inter Cobrança v3 (mTLS) — Grupo Ciatos'
);
```

## Membership / RLS

Cada usuário só enxerga `bank_accounts` e `boletos` das unidades em que é
membro (`public.unidade_members`). Popule essa tabela no fluxo de convite/login:

```sql
insert into public.unidade_members (user_id, unidade_id, franqueado_id, role)
values (auth.uid(), 'lux', 'fr_ciatos', 'master');
```

## Webhook de baixa

Registre no banco a URL (Inter via `provider.registrarWebhook`):

```
https://<project>.supabase.co/functions/v1/webhook-boletos?banco=inter
```

A function casa o evento pelo `banco_boleto_id`/`nosso_numero`, marca
`status = 'pago'` e grava `paid_at` + o payload em `webhook_evento`.

## Particularidades por banco  (os 4 estão implementados)

| Banco    | Auth                          | mTLS | Credenciais no Vault (`credenciais_ref`)            | Webhook |
|----------|-------------------------------|------|----------------------------------------------------|---------|
| Inter    | OAuth2 client_credentials     | sim  | client_id, client_secret, cert_pem, key_pem, conta_corrente | API (registrarWebhook) · PIX híbrido |
| Itaú     | OAuth2 (STS) + x-itau-apikey  | sim  | client_id, client_secret, cert_pem, key_pem, id_beneficiario | portal |
| BTG      | OAuth2 (Basic → token)        | não  | client_id, client_secret                           | API (subscriptions) |
| Bradesco | JWT client assertion (RS256)  | sim  | client_id, client_secret, cert_pem, key_pem (PKCS#8) | portal |

Notas:
- **Itaú/Bradesco** exigem o certificado mTLS (`cert_pem`/`key_pem`); o **Bradesco**
  assina um JWT (RS256) com a `key_pem` em **PKCS#8** para obter o token.
- **BTG** usa só client_id/secret (sem mTLS) e registra o webhook via API.
- Os paths/campos de Itaú/BTG/Bradesco seguem o padrão documentado de cada portal —
  **valide contra a versão da sua API** antes do go-live (há variações de envelope).

Adicionar um banco = implementar `BankProvider` e registrar em `banks/index.ts`.
Nada muda nas Edge Functions nem no front-end.

---

## Estrutura multi-tenant no banco (contas / unidades / equipe / clientes)

`migrations/...tenant.sql` cria as tabelas `contas`, `unidades`, `usuarios` e
`clientes` (+ `platform_admins`) com RLS: o usuário enxerga os dados da(s)
conta(s) em que é membro (`unidade_members`); o admin da plataforma vê tudo.

Popular com os dados de demonstração (espelha o seed do front):
```bash
psql "$DATABASE_URL" -f supabase/seed_demo.sql   # ou cole no SQL editor
```
Depois, vincule os logins reais (ver fim do seed_demo.sql): `unidade_members`
para cada usuário e `platform_admins` para o admin.

O front (store) carrega `contas`/`unidades`/`usuarios` do banco automaticamente
quando há **login** (App.jsx → `fetchTenant` → `hydrateFromDb`); sem Supabase
configurado, mantém o seed de demonstração. **Clientes**: tabela e seed prontos —
falta migrar as telas (hoje leem de `src/lib/data.js`).

## Notificações ao cliente (e-mail) — Fase 1

Mesma arquitetura: provedor abstraído + Edge Function + segredos no backend.

```
functions/_shared/notify/
├─ NotificationProvider.ts   # interface (enviar)
├─ EmailProvider.ts          # ★ Resend (referência)
├─ WhatsAppProvider.ts       # stub (Fase 2)
├─ templates.ts              # HTML com a marca por evento
└─ index.ts                  # getNotifProvider + renderTemplate
functions/enviar-email/index.ts   # renderiza, envia e registra em `notificacoes`
migrations/...notificacoes.sql     # outbox/log + opt-in do cliente
```

Deploy:
```bash
supabase secrets set RESEND_API_KEY=... EMAIL_FROM="CafeWorking <nao-responda@grupociatos.com.br>" APP_URL=https://app.cafeworking.com.br
supabase functions deploy enviar-email
```

Configure **SPF/DKIM** no DNS do domínio do remetente (Resend gera os registros).
Eventos cobertos: `boleto_nova`, `boleto_lembrete`, `boleto_pago`, `boleto_vencido`,
`correspondencia`, `cafe_pedido`, `cafe_pronto`, `reserva`. Adicionar um evento =
um template em `templates.ts`. Adicionar um canal = implementar
`NotificationProvider` e registrar em `notify/index.ts`.
