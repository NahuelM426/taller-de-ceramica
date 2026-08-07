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
  "node_modules", ".expo", ".git",
  ".eas-build-staging", ".eas-build-staging-current"
)

Get-ChildItem -LiteralPath $taskProjectRoot -Force |
  Where-Object {
    $taskExcludedNames -notcontains $_.Name -and
    $_.Name -notlike ".expo-export-*" -and
    $_.Extension -ne ".apk"
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

Push-Location $taskStage
try {
  git init | Out-Null
  git config user.email "apk-build@local"
  git config user.name "APK Build"
  git add -A
  git commit -m "APK build snapshot" | Out-Null

  # Git para Windows vuelve a marcar las carpetas del snapshot como solo lectura.
  # EAS clona este snapshot y necesita poder eliminarlo despues de comprimirlo.
  Get-Item -LiteralPath $taskStage | ForEach-Object {
    $_.Attributes = $_.Attributes -band (-bnot [System.IO.FileAttributes]::ReadOnly)
  }
  Get-ChildItem -LiteralPath $taskStage -Recurse -Force | ForEach-Object {
    $_.Attributes = $_.Attributes -band (-bnot [System.IO.FileAttributes]::ReadOnly)
  }

  Write-Host ""
  Write-Host "Enviando la version actual a Expo para generar el APK..." -ForegroundColor Cyan
  & $taskNpx eas-cli@latest build --platform android --profile apk --non-interactive --wait
  if ($LASTEXITCODE -ne 0) {
    throw "Expo no pudo completar la compilacion. La solicitud puede seguir activa en expo.dev."
  }

  $taskBuildJson = & $taskNpx eas-cli@latest build:list --platform android --limit 1 --json --non-interactive
  if ($LASTEXITCODE -ne 0) {
    throw "No se pudo consultar el resultado de la compilacion."
  }
} finally {
  Pop-Location
}

$taskBuilds = @($taskBuildJson | ConvertFrom-Json)
$taskBuild = $taskBuilds[0]
if (-not $taskBuild -or $taskBuild.status -ne "FINISHED" -or -not $taskBuild.artifacts.buildUrl) {
  throw "La compilacion todavia no tiene un APK disponible para descargar. Revisa su estado en expo.dev."
}

$taskApk = Join-Path $taskProjectRoot "Taller-de-Ceramica.apk"
Write-Host "Descargando APK..." -ForegroundColor Cyan
Invoke-WebRequest -Uri $taskBuild.artifacts.buildUrl -OutFile $taskApk -UseBasicParsing

$taskApkFile = Get-Item -LiteralPath $taskApk
if ($taskApkFile.Length -lt 1000000) {
  throw "El archivo descargado no parece un APK valido."
}

Write-Host ""
Write-Host "APK listo:" -ForegroundColor Green
Write-Host $taskApkFile.FullName
Write-Host ("Tamano: {0:N1} MB" -f ($taskApkFile.Length / 1MB))
