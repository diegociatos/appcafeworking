# CafeWorking

Plataforma SaaS de gestão para coworkings/cafeterias (multi-tenant): reservas de
salas, cafeteria/PDV, financeiro/ERP, cobranças (Asaas), NFS-e, CRM, portal do
cliente e onboarding de contas. Front-end React 18 + Vite; back-end Supabase
(Postgres + RLS + Edge Functions).

## Rodando localmente

```bash
npm install
npm run dev        # Vite em http://localhost:5173
npm run build      # build de produção (gera dist/)
npm run preview    # serve o build
npm run lint       # ESLint (src/)
```

## Variáveis de ambiente

Crie um arquivo `.env` (ou `.env.local`) na raiz:

```
VITE_SUPABASE_URL=https://<seu-projeto>.supabase.co
VITE_SUPABASE_ANON_KEY=<sua-anon-key>
```

Só a **anon key** vai para o front (é pública por design; o RLS protege os
dados). Segredos (service_role, Asaas, certificado A1, Resend) ficam **nos
secrets do Supabase**, nunca no cliente.

## Modo demo × modo real

O app detecta o backend automaticamente:

- **Demo** — sem as envs do Supabase. Não exige login, entra direto com **dados
  de exemplo (seeds)** e um seletor de perfil para pré-visualizar cada papel.
  Nada é persistido — ótimo para explorar a UI.
- **Real** — com as envs configuradas. Exige **login** (Supabase Auth). As
  entidades começam vazias e são **carregadas/persistidas no banco** (tabelas
  próprias + `app_state` para o estado operacional, via PostgREST com RLS).
  Cobranças, NFS-e e e-mails passam pelas Edge Functions.

A chave do mecanismo é `REAL` em `src/lib/store.jsx`: em modo real os seeds são
substituídos pelos dados do banco e o *sync engine* persiste cada alteração.

## Estrutura

- `src/pages/` — telas (Dashboard, Reservas, Salas, Financeiro, Cobranças,
  NotaFiscal, Catálogo, Planos, CRM, Clientes, AreaCliente, Login…).
- `src/components/` — UI compartilhada (`ui.jsx`, `Logo`, `ErrorBoundary`…).
- `src/lib/` — store (estado global), clientes de API (`supabaseDb`, `asaasApi`,
  `nfseApi`, `authPublic`…) e tema.
- `supabase/functions/` — Edge Functions (Deno): cobranças, NFS-e, e-mail,
  onboarding, autocheckout, webhooks.
- `supabase/migrations/` — schema e RLS.

© CafeWorking · Grupo Ciatos
