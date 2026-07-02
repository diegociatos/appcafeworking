# Ligar a emissão real de NFS-e (portal nacional / BH)

Este guia lista **exatamente** o que fazer quando você tiver o **certificado digital A1
(.pfx/.p12)** da unidade em mãos. Enquanto o certificado não estiver no Vault, o app
emite em **modo simulado** (nota com `codigoVerificacao: "SIMULADO"`) — nada é enviado
à prefeitura.

> A infraestrutura já está pronta e no ar. Este é um roteiro de **configuração e
> validação**, não de programação.

---

## Visão geral do que já existe

| Peça | Onde | Estado |
|---|---|---|
| Upload do A1 → Vault | Edge Function `salvar-certificado` | ✅ pronto (converte .pfx → PEM, grava no Vault, salva titular/validade em `config_fiscal`) |
| Emissão | Edge Function `emitir-nfse` → `NfseNacionalProvider` | ✅ pronto (monta DPS v1.01, assina XMLDSIG, conecta por **mTLS**) |
| Assinatura digital | `_shared/nfse/xmlsign.ts` (`assinarDpsXmlDsig`) | ⚠️ validar canonicalização em produção restrita |
| Conexão mTLS | `Deno.createHttpClient({ certChain, privateKey })` | ✅ pronto — ativa sozinho quando há `cert_pem`/`key_pem` no Vault |
| Trilha de auditoria | grava `nfse.emitida` em `audit_logs` | ✅ pronto |
| Envio ao cliente por e-mail | Resend (`nfse_emitida`) | ✅ pronto |

**Hosts configurados** (`NfseNacionalProvider.ts`):
- Homologação (produção restrita): `https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional`
- Produção: `https://sefin.nfse.gov.br/SefinNacional`

`tpAmb` = `2` quando `config_fiscal.ambiente = "homologacao"`, `1` quando `"producao"`.

---

## Passo a passo

### 1. Confirmar o convênio de Belo Horizonte com o nacional
BH (código IBGE **3106200**) precisa estar **conveniada** para a Sefin Nacional gerar a
nota. Consultar:
```
GET /parametros_municipais/3106200/convenio
GET /parametros_municipais/3106200/{codServico}   # alíquota/regime/deduções
```
Se BH **não** estiver conveniada ao nacional, a emissão terá de sair pelo emissor
municipal (**BHISS** — já existe o adaptador `BhissProvider.ts`, porém não finalizado).
Decidir aqui qual emissor usar: `config_fiscal.emissor = "nacional"` ou `"bhiss"`.

### 2. Subir o certificado A1 no Vault
Pelo app: **Configurações → Fiscal → Certificado digital** (chama `salvar-certificado`).
O que a função faz: abre o `.pfx` com a senha, extrai `cert_pem` + `key_pem`, grava o
segredo no Vault sob a referência `cert_nfse_<unidade_id>` e salva em `config_fiscal`:
`certificado_titular`, `certificado_validade`, `certificado_enviado_em`.

Se preferir por API:
```
POST /functions/v1/salvar-certificado
{ "unidade_id": "<id>", "pfx_base64": "<.pfx em base64>", "senha": "<senha do A1>" }
```
✅ Sucesso: retorna `{ ok: true, certificado_ref, titular, validade }`.

### 3. Preencher a configuração fiscal nacional da unidade
Em **Configurações → Fiscal**, garantir (por unidade):
- **CNPJ** do prestador + **Inscrição Municipal** (IM);
- **Regime tributário** → vira `opSimpNac` (1 = normal, 2 = MEI, 3 = ME/EPP Simples);
- **Código de tributação nacional** (`cTribNac`, 6 dígitos: item+subitem+desdobro do serviço);
- **Alíquota ISS** (`pAliq`) e **ISS retido?** (`tpRetISSQN`: 1 = não retido);
- **Código do município** de prestação (IBGE — BH `3106200`; usado em `cLocEmi`/`cLocPrestacao`);
- **Ambiente** = `homologacao` para os testes; só troque para `producao` no fim;
- **Emissão ativa** = ligado.

### 4. Testar em produção restrita (homologação) — NÃO pular
Com `ambiente = "homologacao"`, emitir uma nota de teste (valor baixo) por um cliente
com CNPJ/CPF válido. Verificar, nesta ordem:
1. **`emitir-nfse` responde 201** e a nota **não** volta com `codigoVerificacao: "SIMULADO"`
   (se vier "SIMULADO", o certificado não foi lido do Vault — revisar passo 2).
2. **Rejeição da Sefin** (se houver): o `raw` da resposta traz o motivo. Erros comuns:
   - assinatura inválida → validar **canonicalização C14N** e o `refId` em `xmlsign.ts`;
   - `cTribNac`/alíquota divergente do que o município espera (passo 1);
   - IM incorreta / CNPJ fora do convênio.
3. **Consulta e DANFSE**: `GET /nfse/{chave}` e `GET /danfse/{chave}` (PDF).
4. **Cancelamento**: `POST /nfse/{chave}/eventos` (o provider já monta o evento).

### 5. Virar a chave para produção
Só depois de uma emissão + consulta + cancelamento **OK em homologação**:
- `config_fiscal.ambiente = "producao"` (passa a usar o host de produção e `tpAmb = 1`);
- emitir uma nota real de baixo valor e conferir no portal da prefeitura;
- conferir o e-mail ao tomador (Resend) e o registro em **Auditoria** (`nfse.emitida`).

---

## Pontos de atenção (dívidas conhecidas)

- **Host/rota de emissão**: os manuais oficiais citam o swagger do contribuinte em
  `adn.producaorestrita.nfse.gov.br/contribuintes`. O provider usa
  `sefin(.producaorestrita).nfse.gov.br/SefinNacional`. **Confirmar o endpoint correto
  no Swagger/openapi** (ou copiando do ContaOne, que já emite) antes de confiar na produção.
- **XMLDSIG**: `xmlsign.ts` assina a DPS; a **canonicalização (C14N)** e o `Id` da
  `infDPS` (chave de 53 dígitos) são a fonte nº 1 de rejeição. Validar no passo 4.
- **BHISS**: `BhissProvider.ts` existe mas não foi finalizado — só necessário se BH
  não estiver no convênio nacional (passo 1).

## Referências
- Manuais + XSD (`DPS_v1.01.xsd`): `Desktop\EMISSÃO DE NOTA FISCAL` (máquina do Diego).
- Swagger produção restrita: `https://adn.producaorestrita.nfse.gov.br/contribuintes/docs/index.html`
- Layout DPS e mapeamento de campos: memória `nfse-nacional-api`.
