$ErrorActionPreference = "Stop"

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw "Python 3.11 o superior no está instalado o no figura en PATH."
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "Node.js 20 o superior no está instalado o npm no figura en PATH."
}

$pythonVersion = python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
if ([version]$pythonVersion -lt [version]"3.11") {
    throw "Se requiere Python 3.11 o superior. Versión detectada: $pythonVersion."
}
$nodeVersion = (node --version).TrimStart("v")
if ([version]$nodeVersion -lt [version]"20.0") {
    throw "Se requiere Node.js 20 o superior. Versión detectada: $nodeVersion."
}

if (-not (Test-Path ".venv\Scripts\python.exe")) {
    python -m venv .venv
    if ($LASTEXITCODE -ne 0) {
        throw "No se pudo crear el entorno virtual de Python."
    }
}

& ".\.venv\Scripts\python.exe" -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) {
    throw "No se pudo actualizar pip."
}
& ".\.venv\Scripts\python.exe" -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) {
    throw "No se pudieron instalar las dependencias de Python."
}

Push-Location frontend
try {
    npm ci
    if ($LASTEXITCODE -ne 0) {
        throw "No se pudieron instalar las dependencias de Next.js. Si PaceOS está activo, ejecuta ./stop.ps1 y vuelve a intentar."
    }
    npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "No se pudo compilar el frontend."
    }
} finally {
    Pop-Location
}

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    $bytes = New-Object byte[] 32
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($bytes)
    } finally {
        $generator.Dispose()
    }
    $apiKey = ([BitConverter]::ToString($bytes)).Replace("-", "").ToLowerInvariant()
    $contents = Get-Content ".env" -Raw
    $contents = $contents -replace "(?m)^APPLE_HEALTH_API_KEY=.*$", "APPLE_HEALTH_API_KEY=$apiKey"
    Set-Content ".env" $contents -Encoding UTF8
}

Write-Host ""
Write-Host "Instalación completa."
Write-Host "Inicia PaceOS con: ./start.ps1"
Write-Host "Luego abre: http://localhost:3100"
Write-Host "Las claves y datos locales permanecen fuera de Git."
