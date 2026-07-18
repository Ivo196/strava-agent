$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$runDirectory = Join-Path $root ".run"

foreach ($name in @("web", "api")) {
    $pidFile = Join-Path $runDirectory "$name.pid"
    if (-not (Test-Path $pidFile)) {
        continue
    }
    $processId = [int](Get-Content $pidFile -Raw)
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($process) {
        & taskkill.exe /PID $processId /T /F | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        }
    }
    Remove-Item -LiteralPath $pidFile -Force
}

Write-Host "PaceOS detenido."
