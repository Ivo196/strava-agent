#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

command -v python3 >/dev/null || { echo "Falta Python 3.11 o superior."; exit 1; }
command -v npm >/dev/null || { echo "Falta Node.js 20 o superior."; exit 1; }

python3 - <<'PY'
import sys
if sys.version_info < (3, 11):
    raise SystemExit(f"Se requiere Python 3.11 o superior; detectado {sys.version.split()[0]}.")
PY

node -e 'const major=Number(process.versions.node.split(".")[0]); if(major<20){throw new Error("Se requiere Node.js 20 o superior")}'

if [[ ! -x .venv/bin/python ]]; then
  python3 -m venv .venv
fi

.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements.txt

(
  cd frontend
  npm ci
  npm run build
)

if [[ ! -f .env ]]; then
  cp .env.example .env
  key="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
  python3 - "$key" <<'PY'
from pathlib import Path
import sys
path = Path(".env")
key = sys.argv[1]
lines = path.read_text(encoding="utf-8").splitlines()
path.write_text(
    "\n".join(
        f"APPLE_HEALTH_API_KEY={key}" if line.startswith("APPLE_HEALTH_API_KEY=") else line
        for line in lines
    ) + "\n",
    encoding="utf-8",
)
PY
fi

echo
echo "Instalación completa."
echo "Inicia PaceOS con: ./start.sh"
echo "Luego abre: http://localhost:3100"
echo "Las claves y datos locales permanecen fuera de Git."
