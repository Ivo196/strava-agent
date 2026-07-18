#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

for name in web api; do
  pid_file=".run/$name.pid"
  [[ -f "$pid_file" ]] || continue
  pid="$(cat "$pid_file")"
  if kill -0 "$pid" 2>/dev/null; then
    kill -TERM -- "-$pid" 2>/dev/null || kill "$pid"
  fi
  rm -f "$pid_file"
done

echo "PaceOS detenido."
