# Transmissor fiscal (NFS-e Nacional)

## Por que existe

O SEFIN Nacional **recusa o handshake TLS do Deno**, que é o runtime das Edge
Functions do Supabase. Não é o certificado, não é o IP, não é o país.

Diagnóstico de 22/09/2026, todos os testes do mesmo computador e mesmo IP:

| Cliente | Resultado |
|---|---|
| curl (Schannel), TLS 1.2 | 403 — passa, só falta o certificado |
| curl forçando TLS 1.3 | Connection was reset |
| Node.js 22 (OpenSSL) | 403 — passa, negocia TLS 1.2 sozinho |
| Deno via `node:https` pedindo TLS 1.2 | socket hang up |
| Cloudflare Worker (colo GRU, Brasil) | 520 nos dois ambientes |
| Netlify Functions (Node) | **403, TLS 1.2 — passa** |

O botão *Testar conexão / convênio* em Notas Fiscais roda essas sondas contra a
produção. Se um dia o SEFIN aceitar o TLS do Deno, elas mostram isso na hora e o
transmissor pode ser aposentado.

## Como funciona

```
app (Supabase Edge / Deno)          transmissor (Netlify / Node)        SEFIN
  monta e assina a DPS  ──POST──▶  transmite com o certificado A1  ──▶  emite
                        ◀──────    devolve a resposta crua        ◀──
```

- Repositório do transmissor: `C:\dev\cafeworking-nfse` (site Netlify
  `cafeworking-nfse`, separado de tudo; **nada compartilhado com o ContaOne**).
- O app manda só a requisição: URL, método e corpo. **Certificado e senha nunca
  trafegam pela rede.**
- O transmissor só aceita `sefin.nfse.gov.br` e `sefin.producaorestrita.nfse.gov.br`.
- Autenticação por `x-cw-token`, comparado em tempo constante.

## Segredos

| Onde | Nome | Para quê |
|---|---|---|
| Supabase | `NFSE_TRANSMISSOR_URL` | endereço da função do transmissor |
| Supabase | `NFSE_TRANSMISSOR_TOKEN` | segredo compartilhado |
| Netlify | `TRANSMISSOR_TOKEN` | o mesmo valor do de cima |
| Netlify | `NFSE_PFX_BASE64` | certificado A1 em base64 |
| Netlify | `NFSE_PFX_SENHA` | senha do certificado |

Com mais de uma unidade emitindo, use `NFSE_PFX_<UNIDADE_ID>` e
`NFSE_SENHA_<UNIDADE_ID>` (id em maiúsculas, tudo que não for letra ou número
vira `_`). O par sem sufixo continua valendo como padrão.

## Trocar o certificado A1

O certificado fica em **dois lugares** e os dois precisam ser atualizados:

1. no app, em Notas Fiscais → Configuração fiscal (é o que assina a DPS);
2. no transmissor, nas variáveis do Netlify (é o que fecha a conexão).

Para gerar o valor da variável a partir do `.pfx`, no PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\caminho\certificado.pfx")) | Set-Clipboard
```

Depois cole em **Netlify → cafeworking-nfse → Site configuration → Environment
variables**, em `NFSE_PFX_BASE64`, e ponha a senha em `NFSE_PFX_SENHA`. Publique
o site de novo para as variáveis valerem.

Se esquecer de atualizar aqui, a emissão volta a falhar mesmo com o certificado
novo no app.

## Se precisar desligar

Apague `NFSE_TRANSMISSOR_URL` dos segredos do Supabase. O app volta a tentar a
conexão direta — que hoje não funciona, mas é o caminho certo no dia em que o
governo aceitar o TLS do Deno.
