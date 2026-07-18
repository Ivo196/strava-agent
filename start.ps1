$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

if (-not (Test-Path ".venv\Scripts\python.exe")) {
    throw "PaceOS no está instalado. Ejecuta primero ./setup.ps1."
}
if (-not (Test-Path "frontend\.next")) {
    throw "El frontend no está compilado. Ejecuta primero ./setup.ps1."
}

$runDirectory = Join-Path $root ".run"
New-Item -ItemType Directory -Path $runDirectory -Force | Out-Null
$startedApi = $false
$startedWeb = $false

function Test-PaceOsEndpoint([string]$Url) {
    try {
        $response = Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 2
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

if (-not (Test-PaceOsEndpoint "http://127.0.0.1:8000/api/health")) {
    $api = Start-Process `
        -FilePath (Join-Path $root ".venv\Scripts\python.exe") `
        -ArgumentList @("-m", "uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000") `
        -WorkingDirectory $root `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $runDirectory "api.out.log") `
        -RedirectStandardError (Join-Path $runDirectory "api.err.log") `
        -PassThru
    $startedApi = $true
}

if (-not (Test-PaceOsEndpoint "http://127.0.0.1:3100")) {
    $web = Start-Process `
        -FilePath "npm.cmd" `
        -ArgumentList @("run", "start", "--", "-p", "3100") `
        -WorkingDirectory (Join-Path $root "frontend") `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $runDirectory "web.out.log") `
        -RedirectStandardError (Join-Path $runDirectory "web.err.log") `
        -PassThru
    $startedWeb = $true
}

$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 500
    if (
        (Test-PaceOsEndpoint "http://127.0.0.1:8000/api/health") -and
        (Test-PaceOsEndpoint "http://127.0.0.1:3100")
    ) {
        $ready = $true
        break
    }
}

if (-not $ready) {
    throw "PaceOS no respondió a tiempo. Revisa los archivos .run/*.err.log."
}

if ($startedApi) {
    $apiListener = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction Stop |
        Select-Object -First 1
    Set-Content (Join-Path $runDirectory "api.pid") $apiListener.OwningProcess
}
if ($startedWeb) {
    $webListener = Get-NetTCPConnection -LocalPort 3100 -State Listen -ErrorAction Stop |
        Select-Object -First 1
    Set-Content (Join-Path $runDirectory "web.pid") $webListener.OwningProcess
}

Write-Host "PaceOS está activo."
Write-Host "Aplicación: http://localhost:3100"
Write-Host "API:        http://localhost:8000/api/health"
