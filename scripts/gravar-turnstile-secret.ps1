# Grava no Supabase a chave secreta do Cloudflare Turnstile (anti-robo da
# contratacao pelo site) e confere se ficou igual. Uso:
#   1. powershell -ExecutionPolicy Bypass -File C:\dev\appcafe\scripts\gravar-turnstile-secret.ps1
#   2. Quando pedir, copie a "Secret key" do widget no Cloudflare, clique com o
#      botao direito no PowerShell e tecle Enter

$ref = 'lmgbysfrbtgqzbtouzft'

function Sha256Hex([string]$texto) {
  $bytes = [Text.Encoding]::UTF8.GetBytes($texto)
  -join ([Security.Cryptography.SHA256]::Create().ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') })
}

function Erro([string]$msg) {
  Write-Host "ERRO: $msg" -ForegroundColor Red
  exit 1
}

Write-Host ''
Write-Host 'Agora copie a Secret key do widget no Cloudflare (Turnstile > CafeWorking - contratacao pelo site).'
$seguro = Read-Host 'Cole a chave aqui (botao direito do mouse; nao aparece na tela) e tecle Enter' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
$chave = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
if ($null -eq $chave) { $chave = '' }
$chave = $chave.Trim()

if ($chave -eq '') { Erro 'nada foi colado. Copie a Secret key e rode de novo.' }
if ($chave -match '\s') { Erro 'o que foi colado tem espaco no meio. Copie so a chave e rode de novo.' }
if ($chave -eq '0x4AAAAAAE0Ouo1U5AMh92-D') { Erro 'esta e a Site key (publica). Copie a Secret key, que fica logo abaixo.' }
if (-not $chave.StartsWith('0x')) { Erro 'isso nao parece a Secret key do Turnstile (ela comeca com 0x). Copie de novo.' }
if ($chave.Length -lt 30) { Erro "o que foi colado tem so $($chave.Length) caracteres; nao parece a Secret key." }

$hash = Sha256Hex $chave
Write-Host "Chave recebida: $($chave.Length) caracteres (codigo $($hash.Substring(0,12))...)"

$resp = Read-Host 'Gravar no Supabase como TURNSTILE_SECRET_KEY? (s/n)'
if ($resp.Trim() -notmatch '^(s|sim|y|yes)$') {
  Write-Host 'Nada foi alterado.'
  exit 0
}

supabase secrets set "TURNSTILE_SECRET_KEY=$chave" --project-ref $ref | Out-Null
if ($LASTEXITCODE -ne 0) { Erro 'o Supabase recusou a gravacao. Veja a mensagem acima.' }

$depois = supabase secrets list --project-ref $ref | Select-String 'TURNSTILE_SECRET_KEY'
if ($depois -and ($depois.ToString() -match $hash)) {
  Write-Host 'OK: chave gravada e conferida. A verificacao anti-robo da contratacao esta ligada.' -ForegroundColor Green
} else {
  Write-Host 'ATENCAO: gravou, mas a conferencia nao bateu. Me mande o print desta tela.' -ForegroundColor Yellow
}
Remove-Variable chave
