$taskProjectRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$taskCredentialsPath = Join-Path $taskProjectRoot "credentials.json"
$taskAndroidRoot = Join-Path $taskProjectRoot "android"
$taskGradle = Join-Path $taskAndroidRoot "gradlew.bat"
$taskBuildOutputRoot = [System.IO.Path]::GetFullPath(
  (Join-Path $taskAndroidRoot "app\build")
)
$taskOutput = Join-Path $taskAndroidRoot "app\build\outputs\bundle\release\app-release.aab"
$taskDestination = Join-Path $taskProjectRoot "Taller-de-Ceramica.aab"
$taskNpx = (Get-Command npx.cmd -ErrorAction Stop).Source

if (-not (Test-Path -LiteralPath $taskCredentialsPath)) {
  throw "Falta credentials.json. Descargalo con: npx eas-cli@latest credentials -p android"
}
if (-not (Test-Path -LiteralPath $taskGradle)) {
  throw "Falta la carpeta android. Ejecuta: npx expo prebuild --platform android"
}

$taskCredentials = Get-Content -LiteralPath $taskCredentialsPath -Raw | ConvertFrom-Json
$taskKeystore = $taskCredentials.android.keystore
if (-not $taskKeystore) {
  throw "credentials.json no contiene android.keystore."
}

$taskKeystorePath = [string]$taskKeystore.keystorePath
if (-not [System.IO.Path]::IsPathRooted($taskKeystorePath)) {
  $taskKeystorePath = Join-Path $taskProjectRoot $taskKeystorePath
}
$taskKeystorePath = [System.IO.Path]::GetFullPath($taskKeystorePath)
if (-not (Test-Path -LiteralPath $taskKeystorePath)) {
  throw "No se encontro el archivo de firma indicado por credentials.json."
}

$taskJavaCandidates = @()
if ($env:JAVA_HOME) {
  $taskJavaCandidates += $env:JAVA_HOME
}
$taskAdoptiumRoot = "C:\Program Files\Eclipse Adoptium"
if (Test-Path -LiteralPath $taskAdoptiumRoot) {
  $taskJavaCandidates += Get-ChildItem -LiteralPath $taskAdoptiumRoot -Directory |
    Where-Object { $_.Name -like "jdk-17*" } |
    Sort-Object Name -Descending |
    Select-Object -ExpandProperty FullName
}
$taskJavaCandidates += "C:\Program Files\Android\Android Studio\jbr"
$taskJavaHome = $taskJavaCandidates | Where-Object {
  $taskReleaseFile = Join-Path $_ "release"
  (Test-Path -LiteralPath (Join-Path $_ "bin\java.exe")) -and
    (Test-Path -LiteralPath $taskReleaseFile) -and
    ((Get-Content -LiteralPath $taskReleaseFile -Raw) -match 'JAVA_VERSION="17[\.]')
} | Select-Object -First 1
if (-not $taskJavaHome) {
  throw "No se encontro JDK 17. Instala Eclipse Temurin/OpenJDK 17."
}

$taskAndroidSdk = $env:ANDROID_HOME
if (-not $taskAndroidSdk) {
  $taskAndroidSdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
}
if (-not (Test-Path -LiteralPath $taskAndroidSdk)) {
  throw "No se encontro Android SDK. Abrilo una vez desde Android Studio > SDK Manager."
}

$taskEnvironmentNames = @(
  "NODE_ENV",
  "JAVA_HOME",
  "ANDROID_HOME",
  "ANDROID_SDK_ROOT",
  "ORG_GRADLE_PROJECT_MYAPP_UPLOAD_STORE_FILE",
  "ORG_GRADLE_PROJECT_MYAPP_UPLOAD_STORE_PASSWORD",
  "ORG_GRADLE_PROJECT_MYAPP_UPLOAD_KEY_ALIAS",
  "ORG_GRADLE_PROJECT_MYAPP_UPLOAD_KEY_PASSWORD"
)
$taskPreviousEnvironment = @{}
foreach ($taskName in $taskEnvironmentNames) {
  $taskPreviousEnvironment[$taskName] = [Environment]::GetEnvironmentVariable($taskName, "Process")
}

try {
  $env:NODE_ENV = "production"
  $env:JAVA_HOME = $taskJavaHome
  $env:ANDROID_HOME = $taskAndroidSdk
  $env:ANDROID_SDK_ROOT = $taskAndroidSdk
  $env:ORG_GRADLE_PROJECT_MYAPP_UPLOAD_STORE_FILE = $taskKeystorePath
  $env:ORG_GRADLE_PROJECT_MYAPP_UPLOAD_STORE_PASSWORD = [string]$taskKeystore.keystorePassword
  $env:ORG_GRADLE_PROJECT_MYAPP_UPLOAD_KEY_ALIAS = [string]$taskKeystore.keyAlias
  $env:ORG_GRADLE_PROJECT_MYAPP_UPLOAD_KEY_PASSWORD = [string]$taskKeystore.keyPassword

  # Mantiene la carpeta nativa local sincronizada con app.json antes de compilar.
  # La compilacion remota no envia android/ y deja que EAS haga este paso.
  Write-Host "Sincronizando la configuracion nativa de Android..." -ForegroundColor Cyan
  & $taskNpx expo prebuild --platform android --no-install
  if ($LASTEXITCODE -ne 0) {
    throw "Expo no pudo sincronizar la configuracion nativa de Android."
  }

  # Gradle puede dejar archivos generados bloqueados o marcados como solo lectura
  # después de una compilación interrumpida. Se detiene el daemon y se limpia
  # exclusivamente android/app/build, que contiene solo resultados regenerables.
  Push-Location $taskAndroidRoot
  try {
    & $taskGradle --stop *> $null
  } finally {
    Pop-Location
  }

  $taskExpectedBuildRoot = [System.IO.Path]::GetFullPath(
    (Join-Path $taskProjectRoot "android\app\build")
  )
  if ($taskBuildOutputRoot -ne $taskExpectedBuildRoot) {
    throw "La ruta de limpieza de Android no es segura."
  }
  if (Test-Path -LiteralPath $taskBuildOutputRoot) {
    Get-ChildItem -LiteralPath $taskBuildOutputRoot -Recurse -Force -ErrorAction SilentlyContinue |
      ForEach-Object {
        if (($_.Attributes -band [System.IO.FileAttributes]::ReadOnly) -ne 0) {
          $_.Attributes = $_.Attributes -bxor [System.IO.FileAttributes]::ReadOnly
        }
      }
    $taskBuildItem = Get-Item -LiteralPath $taskBuildOutputRoot -Force
    if (($taskBuildItem.Attributes -band [System.IO.FileAttributes]::ReadOnly) -ne 0) {
      $taskBuildItem.Attributes =
        $taskBuildItem.Attributes -bxor [System.IO.FileAttributes]::ReadOnly
    }
    Remove-Item -LiteralPath $taskBuildOutputRoot -Recurse -Force
  }

  Write-Host "Generando AAB local firmado para Google Play..." -ForegroundColor Cyan
  Push-Location $taskAndroidRoot
  try {
    & $taskGradle app:bundleRelease
    if ($LASTEXITCODE -ne 0) {
      throw "Gradle no pudo generar el AAB."
    }
  } finally {
    Pop-Location
  }

  if (-not (Test-Path -LiteralPath $taskOutput)) {
    throw "Gradle termino pero no se encontro app-release.aab."
  }
  Copy-Item -LiteralPath $taskOutput -Destination $taskDestination -Force
  $taskFile = Get-Item -LiteralPath $taskDestination
  if ($taskFile.Length -lt 1000000) {
    throw "El archivo generado no parece un AAB valido."
  }

  Write-Host ""
  Write-Host "AAB local listo para Google Play:" -ForegroundColor Green
  Write-Host $taskFile.FullName
  Write-Host ("Tamano: {0:N1} MB" -f ($taskFile.Length / 1MB))
} finally {
  foreach ($taskName in $taskEnvironmentNames) {
    [Environment]::SetEnvironmentVariable($taskName, $taskPreviousEnvironment[$taskName], "Process")
  }
}
