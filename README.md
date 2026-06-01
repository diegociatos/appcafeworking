# CafeWorking · Painel Admin v2.0

Centro de comando administrativo do CafeWorking (Grupo Ciatos) —
gestão completa de unidades de coworking, cafeteria, reservas, CRM,
correspondências de endereço fiscal, financeiro, eventos e IA.

**Stack:** React 18 + Vite + lucide-react. Sem dependência de UI framework.
**Identidade:** marrom café `#6E4E3B` + teal escuro `#0E4B4F`, fundo creme,
Playfair Display + DM Sans.

## ✨ Como rodar

```bash
npm install
npm run dev      # abre em http://localhost:5173
npm run build    # gera build de produção em /dist
npm run preview  # pré-visualiza o build
```

## 🗂 Estrutura modular (pronta pro Codex)

```
src/
├── App.jsx               ← shell (sidebar + header + roteamento)
├── main.jsx              ← entrypoint
├── styles.css            ← reset, animações, scrollbar
├── lib/
│   ├── theme.js          ← tokens (cores, fontes, helpers)
│   └── data.js           ← dados mock (substituir por API)
├── components/
│   ├── Logo.jsx          ← logo SVG fiel à marca
│   └── ui.jsx            ← Card, Badge, Btn, Modal, PageHead, Empty
└── pages/
    ├── Dashboard.jsx
    ├── CRM.jsx              ← Kanban drag-and-drop entre etapas
    ├── Unidades.jsx
    ├── Reservas.jsx         ← grade calendário real
    ├── Correspondencias.jsx ← operação endereço fiscal
    ├── PDV.jsx              ← comanda + margem em tempo real
    ├── Clientes.jsx         ← lista + detalhe com documentos
    ├── Financeiro.jsx       ← MRR + faturas + inadimplência
    ├── Eventos.jsx
    ├── Chat.jsx             ← mensagens funcionais
    ├── AreaCliente.jsx      ← preview da experiência do membro
    ├── IA.jsx               ← assistente CafeWorking
    └── Configuracoes.jsx    ← geral/equipe/integrações/segurança/marca
```

## 📦 Módulos incluídos (13)

| Módulo | Destaques |
|---|---|
| **Dashboard** | KPIs, gráfico de receita, **alertas inteligentes**, unidades |
| **CRM · Leads** | Funil Kanban **com drag-and-drop**, integração Instagram/WhatsApp/Site/Google, pipeline ponderado, taxa de conversão |
| **Unidades** | Luxemburgo + Estoril com endereços reais |
| **Reservas** | Grade calendário por hora/sala/dia, criação real |
| **Correspondências** | Endereço fiscal: foto, urgência, notificação por WhatsApp |
| **Cafeteria · PDV** | Comanda funcional, **margem/CMV em tempo real**, pagamento |
| **Clientes** | Lista + detalhe com documentos do endereço fiscal |
| **Chat** | Atendimento com envio funcional, lista de conversas |
| **Financeiro** | **MRR**, faturas, recebido/aberto/inadimplência, Asaas planejado |
| **Eventos** | Workshops/treinamentos/networking, formatos de sala, inscritos |
| **Área do Cliente** | Preview de como o membro vê o app |
| **IA CafeWorking** | Assistente com perguntas frequentes e respostas contextuais |
| **Configurações** | Geral · Equipe · **Integrações futuras** · Segurança · Marca |

## ⚠️ O que falta para produção (próximos passos no Codex)

Os dados mockados estão em **`src/lib/data.js`** — substituir por chamadas
à API real. A arquitetura está preparada:

1. **Supabase** — banco, autenticação, RLS (clientes, reservas, pedidos,
   faturas, documentos). Trocar os arrays em `data.js` por funções
   `async` que chamam o cliente Supabase.
2. **Asaas** — integração de pagamentos no PDV e em `Financeiro.jsx`.
3. **Storage real** — upload/download de PDFs em `Clientes.jsx` (detalhe)
   e fotos em `Correspondencias.jsx`.
4. **Chat WebSocket** — substituir o state local em `Chat.jsx` por uma
   conexão real (Supabase Realtime ou Twilio).
5. **Botpress + WhatsApp** — integração no módulo IA e CRM (captação
   automática de leads).
6. **Microsoft Bookings / Outlook** — sincronizar reservas com calendários
   da equipe.
7. **Auth + permissões** — Gestor / Operador / Financeiro / Cliente.
   A Área do Cliente deve filtrar para mostrar apenas dados do membro logado.

## 🎨 Design system

Tokens em `src/lib/theme.js`:
- Cores da marca: `C.cafe`, `C.teal`, `C.cream`
- Estados: `C.green`, `C.amber`, `C.red`, `C.blue`
- Tipografia: `serif` (Playfair Display), `sans` (DM Sans)
- Helpers: `fmt(n)` para R$, `fmtShort(n)` para R$ k

Classes utilitárias em `styles.css`:
- `.cw-lift` — hover com elevação
- `.cw-btn` — hover de botão
- `.cw-fade`, `.cw-fade-1..4` — entrada com stagger
- `.cw-pulse` — pulso para badges de notificação

## 📱 Responsividade

Breakpoints embutidos no `App.jsx`:
- `< 1050px` — sidebar vira drawer (botão burger no header)
- `< 760px` — busca some, chat empilha, padding reduzido

© 2026 CafeWorking · Grupo Ciatos
