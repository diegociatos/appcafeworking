# Publica em producao: turno (manha/tarde) do coworking meio periodo, vagas e
# "Ocupada" da sala privativa no site, e a atribuicao de sala pela equipe.
#
#   powershell -ExecutionPolicy Bypass -File C:\dev\appcafe\scripts\publicar-turno-salas.ps1
#
# Etapas:
#   1. banco: migration 20260915180000 (colunas turno e sala_id)
#   2. funcoes do Supabase (4) - so depois do banco
#   3. app: envia a main para o GitHub (Netlify publica)

$ref = 'lmgbysfrbtgqzbtouzft'
$app = 'C:\dev\appcafe'

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
$pendente = (supabase migration list --linked 2>$null | Select-String '20260915180000 \|\s+\|')
if (-not $pendente) {
  Ok 'migration 20260915180000 ja aplicada'
} elseif (Confirma 'Aplicar a migration 20260915180000 em producao?') {
  'y' | supabase db push --linked
  if ($LASTEXITCODE -ne 0) { Falha 'a migration nao foi aplicada. Veja a mensagem acima.' }
  Ok 'migration aplicada'
} else {
  # o webhook grava o turno: publicar as funcoes sem a coluna quebraria a ativacao
  Falha 'sem a migration as funcoes nao podem ser publicadas. Rode de novo quando quiser.'
}

# 2) funcoes -------------------------------------------------------------------
Titulo '2. Funcoes do Supabase'
$funcoes = 'planos-publicos', 'iniciar-assinatura', 'asaas-webhook', 'gestao-assinaturas'
if (Confirma "Publicar $($funcoes.Count) funcoes ($($funcoes -join ', '))?") {
  foreach ($f in $funcoes) {
    supabase functions deploy $f --project-ref $ref --no-verify-jwt
    if ($LASTEXITCODE -ne 0) { Falha "a funcao $f nao foi publicada." }
  }
  Ok 'funcoes publicadas'
}

# 3) app -----------------------------------------------------------------------
Titulo '3. App (tela Assinaturas: turno e Atribuir sala)'
if (Confirma 'Enviar a main do app para o GitHub?') {
  git push origin main
  if ($LASTEXITCODE -ne 0) { Falha 'o push do app falhou.' }
  Ok 'app enviado (Netlify publica em 1 a 2 minutos)'
}

Write-Host ''
Write-Host 'Pronto. Me avise que eu confiro o site e a vitrine.' -ForegroundColor Green
