from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT_DIR / "data"
DATABASE_PATH = DATA_DIR / "strava_agent.db"


def load_local_env(path: Path | None = None) -> None:
    """Carga un .env sencillo sin sobrescribir variables del sistema."""
    env_path = path or ROOT_DIR / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


@dataclass(frozen=True)
class Settings:
    database_path: Path
    openai_api_key: str = ""
    openai_model: str = "gpt-5.6-luna"
    apple_health_api_key: str = ""
    google_health_credentials_file: Path = DATA_DIR / "google-health-client.json"
    paceos_frontend_url: str = "http://localhost:3100"

    @property
    def ai_is_configured(self) -> bool:
        return bool(self.openai_api_key)

    @property
    def google_health_is_configured(self) -> bool:
        return self.google_health_credentials_file.exists()


def get_settings() -> Settings:
    load_local_env()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return Settings(
        database_path=DATABASE_PATH,
        openai_api_key=os.getenv("OPENAI_API_KEY", "").strip(),
        openai_model=os.getenv("OPENAI_MODEL", "gpt-5.6-luna").strip() or "gpt-5.6-luna",
        apple_health_api_key=os.getenv("APPLE_HEALTH_API_KEY", "").strip(),
        google_health_credentials_file=Path(
            os.getenv(
                "GOOGLE_HEALTH_CREDENTIALS_FILE",
                str(DATA_DIR / "google-health-client.json"),
            )
        ),
        paceos_frontend_url=os.getenv("PACEOS_FRONTEND_URL", "http://localhost:3100").rstrip("/"),
    )
