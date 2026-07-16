$ErrorActionPreference = "Stop"

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw "Python 3.11 o superior no está instalado o no figura en PATH."
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "Node.js 20 o superior no está instalado o npm no figura en PATH."
}

if (-not (Test-Path ".venv\Scripts\python.exe")) {
    python -m venv .venv
}

& ".\.venv\Scripts\python.exe" -m pip install --upgrade pip
& ".\.venv\Scripts\python.exe" -m pip install -r requirements.txt

Push-Location frontend
try {
    npm ci
} finally {
    Pop-Location
}

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
}

Write-Host "Instalación completa. Abre dos terminales y sigue la sección Iniciar la aplicación del README."
