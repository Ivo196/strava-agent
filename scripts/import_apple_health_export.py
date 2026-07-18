#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from strava_agent.apple_health_export import dumps_result, import_apple_health_export_zip
from strava_agent.config import get_settings
from strava_agent.database import Database


def main() -> int:
    parser = argparse.ArgumentParser(description="Importa el ZIP oficial exportado desde Apple Health.")
    parser.add_argument("zip_path", help="Ruta al export.zip de Apple Health.")
    args = parser.parse_args()

    zip_path = Path(args.zip_path).expanduser()
    if not zip_path.exists():
        parser.error(f"No existe el archivo: {zip_path}")

    settings = get_settings()
    database = Database(settings.database_path)
    result = import_apple_health_export_zip(str(zip_path), database)
    print(dumps_result(result))
    print(f"DB: {settings.database_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
