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
cadastro do certificado
  navegador ──(passe de 5 min)──▶ transmissor (guarda por unidade)

emissão
  app (Deno)  monta a DPS  ──sem assinar──▶  transmissor  ──assina e envia──▶  SEFIN
                           ◀── resposta do governo ──────
```

- Repositório do transmissor: `C:\dev\cafeworking-nfse` (site Netlify
  `cafeworking-nfse`). **Nada compartilhado com o ContaOne.**
- **A chave privada existe num lugar só: o transmissor.** Ela vai do navegador
  de quem cadastra direto para lá e não trafega entre serviços.
- Quem assina é quem guarda a chave. Por isso a assinatura XMLDSIG foi para o
  Node (`netlify/functions/lib/assinar.mjs`), portada de
  `supabase/functions/_shared/nfse/xmlsign.ts`. **Os dois arquivos devem bater**:
  se mexer num, confira o outro.
- O transmissor só aceita `sefin.nfse.gov.br` e `sefin.producaorestrita.nfse.gov.br`.

## Cadastrar o certificado (qualquer unidade, qualquer computador)

Pela tela do sistema: **Notas Fiscais → Configuração fiscal → Anexar certificado
A1**, com o arquivo `.pfx` e a senha. Só admin da plataforma ou master/financeiro
da unidade consegue — a mesma régua de antes.

Nos bastidores: o app confere a permissão e emite um passe de 5 minutos
(`ticket-certificado`); o navegador manda o arquivo para o transmissor, que
confere se abre com a senha, guarda e devolve titular e validade para a tela.

Franquia nova não exige nenhuma configuração de servidor: ela cadastra o próprio
certificado pela mesma tela.

## Segredos

| Onde | Nome | Para quê |
|---|---|---|
| Supabase | `NFSE_TRANSMISSOR_URL` | endereço da função do transmissor |
| Supabase | `NFSE_TRANSMISSOR_TOKEN` | segredo compartilhado; também assina o passe |
| Netlify | `TRANSMISSOR_TOKEN` | o mesmo valor do de cima |

Não há mais certificado em variável de ambiente: ele fica no armazenamento do
próprio transmissor, por unidade.

## Renovar o certificado

Basta subir o novo pela tela. Não existe mais "trocar em dois lugares".

## Se precisar desligar

Apague `NFSE_TRANSMISSOR_URL` dos segredos do Supabase. O app volta ao caminho
antigo — certificado no Vault e assinatura no Deno — que hoje não emite, mas é o
caminho certo no dia em que o governo aceitar o TLS do Deno.
