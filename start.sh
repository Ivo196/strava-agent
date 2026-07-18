#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

[[ -x .venv/bin/python ]] || { echo "Ejecuta primero ./setup.sh"; exit 1; }
[[ -d frontend/.next ]] || { echo "Ejecuta primero ./setup.sh"; exit 1; }

mkdir -p .run

if ! curl --silent --fail http://127.0.0.1:8000/api/health >/dev/null 2>&1; then
  nohup .venv/bin/python -m uvicorn api:app --host 0.0.0.0 --port 8000 \
    >.run/api.out.log 2>.run/api.err.log &
  echo "$!" > .run/api.pid
fi

if ! curl --silent --fail http://127.0.0.1:3100 >/dev/null 2>&1; then
  (
    cd frontend
    nohup npm run start -- -p 3100 \
      >../.run/web.out.log 2>../.run/web.err.log &
    echo "$!" > ../.run/web.pid
  )
fi

for _ in {1..30}; do
  if curl --silent --fail http://127.0.0.1:8000/api/health >/dev/null &&
     curl --silent --fail http://127.0.0.1:3100 >/dev/null; then
    echo "PaceOS está activo en http://localhost:3100"
    exit 0
  fi
  sleep 0.5
done

echo "PaceOS no respondió a tiempo. Revisa .run/*.err.log."
exit 1
