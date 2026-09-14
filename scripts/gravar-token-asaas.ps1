# Confere (e se preciso grava) no Supabase o token do webhook do Asaas. Uso:
#   1. powershell -ExecutionPolicy Bypass -File C:\dev\appcafe\scripts\gravar-token-asaas.ps1
#   2. Quando pedir, copie o token no Asaas, clique com o botao direito no PowerShell e tecle Enter

$ref = 'lmgbysfrbtgqzbtouzft'

function Sha256Hex([string]$texto) {
  $bytes = [Text.Encoding]::UTF8.GetBytes($texto)
  -join ([Security.Cryptography.SHA256]::Create().ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') })
}

Write-Host ''
Write-Host 'Agora copie o token do webhook no Asaas.'
$seguro = Read-Host 'Cole o token aqui (botao direito do mouse; nao aparece na tela) e tecle Enter' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
$token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
if ($null -eq $token) { $token = '' }
$token = $token.Trim()

if ($token -eq '' -or $token -eq 'SEU_TOKEN') {
  Write-Host 'ERRO: nada foi colado. Copie o token do webhook no Asaas e rode de novo.' -ForegroundColor Red
  exit 1
}
if ($token -match '\s') {
  Write-Host 'ERRO: o que foi colado tem espaco no meio; nao e o token. Copie so o token no Asaas e rode de novo.' -ForegroundColor Red
  exit 1
}
if ($token.Length -lt 16) {
  Write-Host "ERRO: o que foi colado tem so $($token.Length) caracteres; nao parece o token. Copie de novo." -ForegroundColor Red
  exit 1
}

$hash = Sha256Hex $token
Write-Host ''
Write-Host "Token recebido: $($token.Length) caracteres (codigo $($hash.Substring(0,12))...)"

$atual = supabase secrets list --project-ref $ref | Select-String 'ASAAS_WEBHOOK_TOKEN'
if ($atual -and ($atual.ToString() -match $hash)) {
  Write-Host 'OK: o Supabase ja tem exatamente este token. Nada a fazer.' -ForegroundColor Green
  exit 0
}

$resp = Read-Host 'O Supabase tem outro valor. Gravar este token no lugar? (s/n)'
if ($resp -ne 's') {
  Write-Host 'Nada foi alterado.'
  exit 0
}

supabase secrets set "ASAAS_WEBHOOK_TOKEN=$token" --project-ref $ref | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host 'ERRO: o Supabase recusou a gravacao. Veja a mensagem acima.' -ForegroundColor Red
  exit 1
}

$depois = supabase secrets list --project-ref $ref | Select-String 'ASAAS_WEBHOOK_TOKEN'
if ($depois -and ($depois.ToString() -match $hash)) {
  Write-Host 'OK: token gravado e conferido. Supabase e Asaas agora usam o mesmo token.' -ForegroundColor Green
} else {
  Write-Host 'ATENCAO: gravou, mas a conferencia nao bateu. Me mande o print desta tela.' -ForegroundColor Yellow
}
Remove-Variable token
