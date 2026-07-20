$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

if (-not (Test-Path ".venv\Scripts\python.exe")) {
    throw "PaceOS no esta instalado. Ejecuta primero ./setup.ps1."
}
if (-not (Test-Path "frontend\node_modules")) {
    throw "Las dependencias del frontend no estan instaladas. Ejecuta primero ./setup.ps1."
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

function Stop-PaceOsListener([int]$Port, [string]$Name) {
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($listener) {
        & taskkill.exe /PID $listener.OwningProcess /T /F | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
        }
        for ($attempt = 0; $attempt -lt 20; $attempt++) {
            Start-Sleep -Milliseconds 100
            if (-not (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)) {
                break
            }
        }
    }
    $pidFile = Join-Path $runDirectory "$Name.pid"
    if (Test-Path $pidFile) {
        Remove-Item -LiteralPath $pidFile -Force
    }
}

$frontendStamp = Join-Path $root "frontend\.next\paceos-build-stamp"
$frontendInputs = @(
    Get-ChildItem (Join-Path $root "frontend\app") -Recurse -File
    Get-ChildItem (Join-Path $root "frontend\components") -Recurse -File
    Get-ChildItem (Join-Path $root "frontend\lib") -Recurse -File
    Get-Item (Join-Path $root "frontend\package.json")
    Get-Item (Join-Path $root "frontend\package-lock.json")
    Get-Item (Join-Path $root "frontend\tsconfig.json")
)
$frontendNeedsBuild = -not (Test-Path "frontend\.next\BUILD_ID") -or -not (Test-Path $frontendStamp)
if (-not $frontendNeedsBuild) {
    $builtAt = (Get-Item $frontendStamp).LastWriteTimeUtc
    $frontendNeedsBuild = $null -ne (
        $frontendInputs |
            Where-Object { $_.LastWriteTimeUtc -gt $builtAt } |
            Select-Object -First 1
    )
}
if ($frontendNeedsBuild) {
    Stop-PaceOsListener 3100 "web"
    Push-Location (Join-Path $root "frontend")
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) {
            throw "No se pudo compilar el frontend actualizado."
        }
        Set-Content -LiteralPath $frontendStamp -Value ([DateTime]::UtcNow.ToString("O")) -Encoding UTF8
    } finally {
        Pop-Location
    }
}

$apiStamp = Join-Path $runDirectory "api-source-stamp"
$apiInputs = @(
    Get-Item (Join-Path $root "api.py")
    Get-Item (Join-Path $root "requirements.txt")
    Get-ChildItem (Join-Path $root "src") -Recurse -Filter "*.py" -File
)
$apiNeedsRestart = -not (Test-Path $apiStamp)
if (-not $apiNeedsRestart) {
    $apiStartedAt = (Get-Item $apiStamp).LastWriteTimeUtc
    $apiNeedsRestart = $null -ne (
        $apiInputs |
            Where-Object { $_.LastWriteTimeUtc -gt $apiStartedAt } |
            Select-Object -First 1
    )
}
if ($apiNeedsRestart -and (Test-PaceOsEndpoint "http://127.0.0.1:8000/api/health")) {
    Stop-PaceOsListener 8000 "api"
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
    Set-Content -LiteralPath $apiStamp -Value ([DateTime]::UtcNow.ToString("O")) -Encoding UTF8
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
    throw "PaceOS no respondio a tiempo. Revisa los archivos .run/*.err.log."
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

Write-Host "PaceOS esta activo."
Write-Host "Aplicacion: http://localhost:3100"
Write-Host "API:        http://localhost:8000/api/health"
