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
```

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
`certificado_ref`. Guarde o certificado no Vault (uma vez por unidade):
```sql
select vault.create_secret(
  '{"cert_pfx_base64":"<base64 do .pfx>","cert_senha":"<senha>"}',
  'cert_nfse_luxemburgo', 'Certificado A1 e-CNPJ — Luxemburgo (NFS-e)'
);
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
| Boletos: emitir/consultar/cancelar/webhook | ✅ | 4 bancos; Inter testado estruturalmente |
| E-mail ao cliente (Resend) + opt-in | ✅ | Fase 1+2 |
| RLS + Vault | ✅ | revisar policies antes do go-live |
| **Escrita no banco** (criar/editar unidade, cliente, lançamento, etc.) | ⏳ | hoje as mutações são locais (sessão). Falta o *write-through* p/ o DB |
| **Demais entidades** (salas, catálogo, financeiro, contratos) | ⏳ | tabelas a criar + hidratar |
| Documentos do cliente (`docs`) | ⏳ | precisa de tabela própria + Storage |
| Validação dos campos Itaú/BTG/Bradesco | ⏳ | conferir contra o sandbox de cada banco |

**Resumo:** a malha de **autenticação, multi-tenancy (leitura) e cobrança por
boleto** está completa e pronta para piloto. O maior trabalho restante para
operação plena é o **write-through** (persistir as edições no banco) e a
**hidratação das demais entidades** — feito por área, no mesmo padrão de
`fetchTenant`/`hydrateFromDb`.
