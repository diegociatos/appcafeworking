# Publica em producao o ciclo de vida das assinaturas e a reserva de sala pelo site.
# Cada etapa pede confirmacao. Pode rodar de novo: o que ja foi feito e conferido.
#
#   powershell -ExecutionPolicy Bypass -File C:\dev\appcafe\scripts\publicar-ciclo-assinaturas.ps1
#
# Etapas:
#   1. banco: migration 20260915120000 (colunas, tabela e bucket de documentos, rotina diaria)
#   2. funcoes do Supabase (8)
#   3. token da rotina diaria (gerado aqui, gravado no secret e no Vault, sem aparecer na tela)
#   4. e-mail da equipe para avisos internos
#   5. app: envia a main para o GitHub (Netlify publica)
#   6. site: publica o branch venda-endereco-fiscal (opcional)

$ref = 'lmgbysfrbtgqzbtouzft'
$app = 'C:\dev\appcafe'
$site = 'C:\dev\cafeworking'
$url = "https://$ref.supabase.co/functions/v1"

function Titulo([string]$t) { Write-Host ''; Write-Host "=== $t ===" -ForegroundColor Cyan }
function Ok([string]$t) { Write-Host "OK: $t" -ForegroundColor Green }
function Falha([string]$t) { Write-Host "ERRO: $t" -ForegroundColor Red; exit 1 }
function Confirma([string]$pergunta) {
  $r = Read-Host "$pergunta (s/n)"
  return ($r.Trim() -match '^(s|sim|y|yes)$')
}

Set-Location $app

# 1) banco -------------------------------------------------------------------
Titulo '1. Banco de dados'
$pendente = (supabase migration list --linked 2>$null | Select-String '20260915120000 \|\s+\|')
if (-not $pendente) {
  Ok 'migration 20260915120000 ja aplicada'
} elseif (Confirma 'Aplicar a migration 20260915120000 em producao?') {
  'y' | supabase db push --linked
  if ($LASTEXITCODE -ne 0) { Falha 'a migration nao foi aplicada. Veja a mensagem acima.' }
  Ok 'migration aplicada'
} else {
  Falha 'sem a migration as funcoes novas nao funcionam. Rode de novo quando quiser.'
}

# 2) funcoes -------------------------------------------------------------------
Titulo '2. Funcoes do Supabase'
$funcoes = 'status-pagamento', 'asaas-webhook', 'cancelar-assinatura', 'rotina-diaria', 'documentos-assinatura', 'minha-assinatura', 'gestao-assinaturas', 'lead-site', 'enviar-email'
if (Confirma "Publicar $($funcoes.Count) funcoes ($($funcoes -join ', '))?") {
  foreach ($f in $funcoes) {
    # todas validam o login por conta propria (ou o token da rotina / do Asaas)
    supabase functions deploy $f --project-ref $ref --no-verify-jwt
    if ($LASTEXITCODE -ne 0) { Falha "a funcao $f nao foi publicada." }
  }
  Ok 'funcoes publicadas'
}

# 3) token da rotina diaria ------------------------------------------------------
Titulo '3. Rotina diaria (aviso de renovacao, encerramento de cancelamentos)'
$temToken = supabase secrets list --project-ref $ref 2>$null | Select-String 'ROTINA_DIARIA_TOKEN'
if ($temToken -and -not (Confirma 'O token da rotina ja existe. Gerar um novo mesmo assim?')) {
  Ok 'token mantido'
} else {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $token = -join ($bytes | ForEach-Object { $_.ToString('x2') })

  supabase secrets set "ROTINA_DIARIA_TOKEN=$token" --project-ref $ref | Out-Null
  if ($LASTEXITCODE -ne 0) { Falha 'nao gravou o secret ROTINA_DIARIA_TOKEN.' }

  $sql = @"
do `$`$
declare v uuid;
begin
  select id into v from vault.secrets where name = 'rotina_diaria_token';
  if v is null then
    perform vault.create_secret('$token', 'rotina_diaria_token', 'Token da rotina diaria (pg_cron -> rotina-diaria)');
  else
    perform vault.update_secret(v, '$token');
  end if;
end
`$`$;
"@
  $tmp = [IO.Path]::GetTempFileName() + '.sql'
  [IO.File]::WriteAllText($tmp, $sql, (New-Object Text.UTF8Encoding $false))
  supabase db query --linked -f $tmp | Out-Null
  $codigo = $LASTEXITCODE
  Remove-Item $tmp -Force
  if ($codigo -ne 0) { Falha 'nao gravou o token no Vault.' }
  Ok 'token gravado no secret e no Vault'

  Write-Host 'Aguardando o secret chegar nas funcoes...'
  Start-Sleep -Seconds 20
  try {
    $r = Invoke-RestMethod -Uri "$url/rotina-diaria" -Method Post -Headers @{ 'x-rotina-token' = $token } -ContentType 'application/json' -Body '{}'
    Ok "rotina respondeu: avisos=$($r.avisos_renovacao) encerradas=$($r.encerradas) reservas_liberadas=$($r.reservas_liberadas) erros=$($r.erros.Count)"
  } catch {
    Write-Host "ATENCAO: a rotina nao respondeu agora ($($_.Exception.Message)). Ela roda sozinha todo dia as 8h." -ForegroundColor Yellow
  }
  Remove-Variable token
}

# 4) e-mail da equipe --------------------------------------------------------------
Titulo '4. E-mail da equipe (documentos para conferir, cancelamentos, estornos, propostas)'
$temEquipe = supabase secrets list --project-ref $ref 2>$null | Select-String 'EMAIL_EQUIPE'
if ($temEquipe) { Write-Host 'Ja existe um EMAIL_EQUIPE configurado.' }
$emails = Read-Host 'E-mails da equipe separados por virgula (Enter para pular)'
if ($emails.Trim()) {
  if ($emails -notmatch '^[^@\s,]+@[^@\s,]+\.[^@\s,]+(\s*,\s*[^@\s,]+@[^@\s,]+\.[^@\s,]+)*$') { Falha 'lista de e-mails invalida.' }
  supabase secrets set "EMAIL_EQUIPE=$($emails.Trim())" --project-ref $ref | Out-Null
  if ($LASTEXITCODE -ne 0) { Falha 'nao gravou EMAIL_EQUIPE.' }
  Ok 'EMAIL_EQUIPE gravado'
}

# 5) app ------------------------------------------------------------------------------
Titulo '5. App (Meu plano, Assinaturas e contratos)'
$frente = git -C $app rev-list --count origin/main..main
if ([int]$frente -eq 0) {
  Ok 'app ja esta no GitHub'
} elseif (Confirma "Enviar $frente commit(s) da main do app para o GitHub (a Netlify publica)?") {
  git -C $app push origin main
  if ($LASTEXITCODE -ne 0) { Falha 'o push do app falhou.' }
  Ok 'app enviado; a Netlify publica em 1 a 2 minutos'
}

# 6) site -----------------------------------------------------------------------------
Titulo '6. Site (contratacao, reserva de sala, proposta)'
Write-Host 'Publica o branch venda-endereco-fiscal na main do site. Sem planos publicados no app, o site segue mostrando os cards atuais.'
if (Confirma 'Publicar o site agora?') {
  $status = git -C $site status --porcelain
  if ($status) { Falha 'o repositorio do site tem alteracoes nao salvas. Me chame antes de publicar.' }
  git -C $site fetch origin
  git -C $site switch main
  git -C $site pull --ff-only origin main
  if ($LASTEXITCODE -ne 0) { Falha 'nao consegui atualizar a main do site.' }
  git -C $site merge --no-ff venda-endereco-fiscal -m 'merge: contratacao pelo site (planos, reserva de sala, proposta)'
  if ($LASTEXITCODE -ne 0) { Falha 'o merge do site deu conflito. Rode: git -C C:\dev\cafeworking merge --abort  e me chame.' }
  git -C $site push origin main
  if ($LASTEXITCODE -ne 0) { Falha 'o push do site falhou.' }
  Ok 'site enviado; a Netlify publica em alguns minutos'
}

Write-Host ''
Write-Host 'Pronto. Me mande o print desta tela.' -ForegroundColor Green
