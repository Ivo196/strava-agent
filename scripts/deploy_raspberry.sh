#!/usr/bin/env bash
set -euo pipefail

readonly REPO_DIR="/home/ivo196/.openclaw/workspace/strava-agent"
readonly API_HEALTH_URL="http://127.0.0.1:8000/api/health"
readonly WEB_HEALTH_URL="http://127.0.0.1:3000/"

cd "$REPO_DIR"
mkdir -p .run

exec 9>.run/deploy.lock
if ! flock -n 9; then
  echo "Ya hay otro despliegue de PaceOS en curso."
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "El despliegue se detuvo porque hay cambios locales en archivos versionados."
  git status --short
  exit 1
fi

previous_revision="$(git rev-parse HEAD)"
git fetch --prune origin main
git merge --ff-only origin/main
current_revision="$(git rev-parse HEAD)"

if [[ "$previous_revision" == "$current_revision" ]]; then
  echo "PaceOS ya está actualizado en $current_revision."
else
  echo "Actualizando PaceOS de $previous_revision a $current_revision."
fi

.venv/bin/python -m pip install --disable-pip-version-check -r requirements.txt
npm --prefix frontend ci
npm --prefix frontend run lint
npm --prefix frontend run build

systemctl --user restart strava-agent-api.service strava-agent-web.service

for _ in {1..60}; do
  if curl --silent --fail "$API_HEALTH_URL" >/dev/null &&
     curl --silent --fail "$WEB_HEALTH_URL" >/dev/null; then
    echo "PaceOS desplegado correctamente en $current_revision."
    exit 0
  fi
  sleep 1
done

echo "PaceOS no superó las comprobaciones de salud tras el despliegue."
systemctl --user --no-pager status strava-agent-api.service strava-agent-web.service || true
exit 1
