$taskProjectRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$taskStage = [System.IO.Path]::GetFullPath((Join-Path $taskProjectRoot ".eas-build-staging-current"))
$taskRootPrefix = $taskProjectRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar

if (-not $taskStage.StartsWith($taskRootPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or
    (Split-Path -Leaf $taskStage) -ne ".eas-build-staging-current") {
  throw "La carpeta temporal de compilacion no es segura: $taskStage"
}

if (Test-Path -LiteralPath $taskStage) {
  Remove-Item -LiteralPath $taskStage -Recurse -Force
}
New-Item -ItemType Directory -Path $taskStage | Out-Null

$taskExcludedNames = @(
  "node_modules", ".expo", ".git", "docs", "play-store",
  ".eas-build-staging", ".eas-build-staging-current"
)

Get-ChildItem -LiteralPath $taskProjectRoot -Force |
  Where-Object {
    $taskExcludedNames -notcontains $_.Name -and
    $_.Name -notlike ".expo-export-*" -and
    $_.Extension -notin @(".apk", ".aab")
  } |
  ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $taskStage -Recurse -Force
  }

Get-Item -LiteralPath $taskStage | ForEach-Object {
  $_.Attributes = $_.Attributes -band (-bnot [System.IO.FileAttributes]::ReadOnly)
}
Get-ChildItem -LiteralPath $taskStage -Recurse -Force | ForEach-Object {
  $_.Attributes = $_.Attributes -band (-bnot [System.IO.FileAttributes]::ReadOnly)
}

$taskNpx = (Get-Command npx.cmd -ErrorAction Stop).Source
$taskPreviousNoVcs = $env:EAS_NO_VCS
$env:EAS_NO_VCS = "1"

Push-Location $taskStage
try {
  Write-Host ""
  Write-Host "Enviando la version actual a Expo para generar el AAB de Google Play..." -ForegroundColor Cyan
  & $taskNpx eas-cli@latest build --platform android --profile production --non-interactive --wait
  if ($LASTEXITCODE -ne 0) {
    throw "Expo no pudo completar la compilacion. La solicitud puede seguir activa en expo.dev."
  }

  $taskBuildJson = & $taskNpx eas-cli@latest build:list --platform android --build-profile production --limit 1 --json --non-interactive
  if ($LASTEXITCODE -ne 0) {
    throw "No se pudo consultar el resultado de la compilacion."
  }
} finally {
  Pop-Location
  if ($null -eq $taskPreviousNoVcs) {
    Remove-Item Env:EAS_NO_VCS -ErrorAction SilentlyContinue
  } else {
    $env:EAS_NO_VCS = $taskPreviousNoVcs
  }
}

$taskBuilds = @($taskBuildJson | ConvertFrom-Json)
$taskBuild = $taskBuilds[0]
if (-not $taskBuild -or $taskBuild.status -ne "FINISHED" -or -not $taskBuild.artifacts.buildUrl) {
  throw "La compilacion todavia no tiene un AAB disponible. Revisa su estado en expo.dev."
}

$taskAab = Join-Path $taskProjectRoot "Taller-de-Ceramica.aab"
Write-Host "Descargando AAB..." -ForegroundColor Cyan
Invoke-WebRequest -Uri $taskBuild.artifacts.buildUrl -OutFile $taskAab -UseBasicParsing

$taskAabFile = Get-Item -LiteralPath $taskAab
if ($taskAabFile.Length -lt 1000000) {
  throw "El archivo descargado no parece un AAB valido."
}

Write-Host ""
Write-Host "AAB listo para Google Play:" -ForegroundColor Green
Write-Host $taskAabFile.FullName
Write-Host ("Tamano: {0:N1} MB" -f ($taskAabFile.Length / 1MB))
