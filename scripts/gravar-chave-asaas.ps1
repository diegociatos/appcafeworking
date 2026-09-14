# Grava a chave de API do Asaas (producao) no cofre do Supabase, no mesmo lugar
# que a tela Cobrancas do app grava (Vault asaas_<unidade> = { api_key, ambiente }).
# Antes de gravar, testa a chave no Asaas e confere se a conta e a do CafeWorking.
# Uso:
#   1. powershell -ExecutionPolicy Bypass -File C:\dev\appcafe\scripts\gravar-chave-asaas.ps1
#   2. Quando pedir, gere/copie a chave no Asaas, clique com o botao direito no PowerShell e tecle Enter

$ref = 'lmgbysfrbtgqzbtouzft'
$unidade = 'un_cafeworkingluxembu_e78be3'
$cnpjCafe = '20351761000103'
$supabaseUrl = "https://$ref.supabase.co"

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Erro([string]$msg) {
  Write-Host "ERRO: $msg" -ForegroundColor Red
  exit 1
}

# 1. Receber a chave sem mostrar na tela
Write-Host ''
Write-Host 'Agora copie a chave de API no Asaas (Integracoes > Chaves de API).'
$seguro = Read-Host 'Cole a chave aqui (botao direito do mouse; nao aparece na tela) e tecle Enter' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
$chave = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
if ($null -eq $chave) { $chave = '' }
$chave = $chave.Trim()

if ($chave -eq '') { Erro 'nada foi colado. Copie a chave no Asaas e rode de novo.' }
if ($chave -match '\s') { Erro 'o que foi colado tem espaco no meio; nao e a chave. Copie so a chave e rode de novo.' }
if (-not $chave.StartsWith('$aact_')) { Erro 'isso nao parece uma chave do Asaas (ela comeca com $aact_). Copie de novo.' }
if ($chave -notmatch '_prod_') { Erro 'esta chave nao e de producao (parece ser do sandbox). Gere a chave na conta de producao.' }
Write-Host "Chave recebida: $($chave.Length) caracteres."

# 2. Testar no Asaas e conferir a empresa
$cabecalho = @{ access_token = $chave; 'User-Agent' = 'CafeWorking-site' }
try {
  $conta = Invoke-RestMethod -Uri 'https://api.asaas.com/v3/myAccount/commercialInfo/' -Headers $cabecalho -Method Get
} catch {
  $status = $_.Exception.Response.StatusCode.value__
  if ($status -eq 401) { Erro 'o Asaas recusou a chave (401). Confira se ela esta ativa e se copiou inteira.' }
  Erro "nao consegui falar com o Asaas ($status). Tente de novo em instantes."
}
$doc = ($conta.cpfCnpj -replace '\D', '')
if ($doc -ne $cnpjCafe) {
  Erro "esta chave e de outra conta (documento $($conta.cpfCnpj), $($conta.companyName)). Nada foi gravado."
}
Write-Host "Chave valida na conta: $($conta.companyName) (CNPJ $($conta.cpfCnpj))" -ForegroundColor Green

$resp = Read-Host 'Gravar esta chave no cofre do Supabase para a unidade do CafeWorking? (s/n)'
if ($resp -ne 's') {
  Write-Host 'Nada foi alterado.'
  exit 0
}

# 3. Gravar no cofre (mesma funcao usada pelo app)
$chaves = supabase projects api-keys --project-ref $ref -o json | Out-String | ConvertFrom-Json
$serviceRole = ($chaves | Where-Object { $_.name -eq 'service_role' } | Select-Object -First 1).api_key
if (-not $serviceRole) { Erro 'nao consegui obter o acesso ao Supabase. Rode "supabase login" e tente de novo.' }
$admin = @{ apikey = $serviceRole; Authorization = "Bearer $serviceRole"; 'Content-Type' = 'application/json' }

$segredo = @{ api_key = $chave; ambiente = 'producao' } | ConvertTo-Json -Compress
$corpo = @{ p_ref = "asaas_$unidade"; p_secret = $segredo } | ConvertTo-Json -Compress
try {
  Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/rpc/upsert_bank_secret" -Headers $admin -Method Post -Body ([Text.Encoding]::UTF8.GetBytes($corpo)) | Out-Null
} catch {
  Erro "o Supabase recusou a gravacao: $($_.Exception.Message)"
}

# 4. Conferir lendo de volta (sem mostrar)
$lido = Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/rpc/get_bank_credentials" -Headers $admin -Method Post -Body (@{ p_ref = "asaas_$unidade" } | ConvertTo-Json -Compress)
if ($lido.api_key -eq $chave -and $lido.ambiente -eq 'producao') {
  Write-Host 'OK: chave gravada no cofre e conferida. O CafeWorking ja pode cobrar pelo Asaas.' -ForegroundColor Green
} else {
  Write-Host 'ATENCAO: gravou, mas a conferencia nao bateu. Me mande o print desta tela.' -ForegroundColor Yellow
}
Remove-Variable chave, serviceRole, admin, segredo, corpo, lido
