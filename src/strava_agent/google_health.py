from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import requests

from .database import Database


AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
API_URL = "https://health.googleapis.com/v4"
SCOPES = (
    "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
    "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
    "https://www.googleapis.com/auth/googlehealth.location.readonly",
    "https://www.googleapis.com/auth/googlehealth.profile.readonly",
    "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
)


@dataclass(frozen=True)
class GoogleHealthCredentials:
    client_id: str
    client_secret: str
    redirect_uri: str

    @classmethod
    def load(cls, path: Path) -> "GoogleHealthCredentials":
        try:
            document = json.loads(path.read_text(encoding="utf-8"))
            config = document.get("web") or document.get("installed") or {}
            redirects = [str(value) for value in config.get("redirect_uris") or []]
            redirect_uri = next(
                (
                    value
                    for value in redirects
                    if value.endswith("/api/google-health/callback")
                ),
                "",
            )
            if not config.get("client_id") or not config.get("client_secret") or not redirect_uri:
                raise ValueError
            return cls(
                client_id=str(config["client_id"]),
                client_secret=str(config["client_secret"]),
                redirect_uri=redirect_uri,
            )
        except (OSError, json.JSONDecodeError, ValueError, TypeError) as error:
            raise ValueError(
                "Las credenciales de Google Health no son válidas o no incluyen el callback de PaceOS."
            ) from error


DATA_TYPES: dict[str, tuple[str, str, int]] = {
    "daily-heart-rate-variability": ("daily_heart_rate_variability.date", "daily", 42),
    "daily-resting-heart-rate": ("daily_resting_heart_rate.date", "daily", 42),
    "daily-oxygen-saturation": ("daily_oxygen_saturation.date", "daily", 42),
    "daily-respiratory-rate": ("daily_respiratory_rate.date", "daily", 42),
    "daily-sleep-temperature-derivations": (
        "daily_sleep_temperature_derivations.date",
        "daily",
        42,
    ),
    "daily-vo2-max": ("daily_vo2_max.date", "daily", 42),
    "daily-heart-rate-zones": ("daily_heart_rate_zones.date", "daily", 42),
    "sleep": ("sleep.interval.end_time", "physical", 42),
    "exercise": ("exercise.interval.civil_start_time", "civil", 42),
    "steps": ("steps.interval.start_time", "physical", 14),
    "weight": ("weight.sample_time.physical_time", "physical", 365),
    "run-vo2-max": ("run_vo2_max.sample_time.physical_time", "physical", 90),
    "vo2-max": ("vo2_max.sample_time.physical_time", "physical", 90),
    "heart-rate-variability": (
        "heart_rate_variability.sample_time.physical_time",
        "physical",
        14,
    ),
    "respiratory-rate-sleep-summary": (
        "respiratory_rate_sleep_summary.sample_time.physical_time",
        "physical",
        42,
    ),
    "heart-rate": ("heart_rate.sample_time.physical_time", "physical", 7),
}


class GoogleHealthService:
    def __init__(
        self,
        credentials: GoogleHealthCredentials,
        database: Database,
        session: requests.Session | None = None,
    ) -> None:
        self.credentials = credentials
        self.database = database
        self.session = session or requests.Session()

    def authorization_url(self) -> str:
        state = self._signed_state()
        query = urlencode(
            {
                "client_id": self.credentials.client_id,
                "redirect_uri": self.credentials.redirect_uri,
                "response_type": "code",
                "scope": " ".join(SCOPES),
                "access_type": "offline",
                "include_granted_scopes": "true",
                "prompt": "consent",
                "state": state,
            }
        )
        return f"{AUTH_URL}?{query}"

    def exchange_code(self, code: str, state: str) -> None:
        if not self._valid_state(state):
            raise ValueError("La autorización de Google expiró o no es válida.")
        response = self.session.post(
            TOKEN_URL,
            data={
                "client_id": self.credentials.client_id,
                "client_secret": self.credentials.client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": self.credentials.redirect_uri,
            },
            timeout=30,
        )
        self._raise_for_google(response, "No se pudo completar la autorización")
        self._save_token(response.json())

    def sync(self) -> dict[str, Any]:
        token = self._access_token()
        headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
        total = imported = updated = 0
        completed_types = 0
        errors: list[str] = []
        today = date.today()
        is_incremental = self.database.google_health_status()["last_sync"] is not None

        for data_type, (field, kind, days) in DATA_TYPES.items():
            lookback_days = min(days, 2) if is_incremental else days
            start = today - timedelta(days=lookback_days)
            end = today + timedelta(days=1)
            params: dict[str, Any] = {
                "pageSize": 25 if data_type in {"sleep", "exercise"} else 10000,
                "filter": self._time_filter(field, kind, start, end),
            }
            try:
                collected: list[tuple[str, str, str, dict[str, Any]]] = []
                while True:
                    response = self.session.get(
                        f"{API_URL}/users/me/dataTypes/{data_type}/dataPoints",
                        headers=headers,
                        params=params,
                        timeout=45,
                    )
                    self._raise_for_google(response, f"No se pudo leer {data_type}")
                    payload = response.json()
                    for point in payload.get("dataPoints") or []:
                        if not isinstance(point, dict):
                            continue
                        total += 1
                        recorded_at = data_point_time(data_type, point)
                        source = data_point_source(point)
                        key = data_point_key(data_type, point, recorded_at, source)
                        collected.append((key, recorded_at, source, point))
                    page_token = payload.get("nextPageToken")
                    if not page_token:
                        break
                    params["pageToken"] = page_token
                batch_imported, batch_updated = (
                    self.database.upsert_google_health_data_points_batch(
                        data_type,
                        collected,
                    )
                )
                imported += batch_imported
                updated += batch_updated
                completed_types += 1
            except (requests.RequestException, ValueError) as error:
                errors.append(f"{data_type}: {error}")

        self.database.record_google_health_sync(total, completed_types, errors)
        return {
            "points_received": total,
            "points_imported": imported,
            "points_updated": updated,
            "data_types_received": completed_types,
            "errors": errors,
        }

    def _access_token(self) -> str:
        token = self.database.get_google_health_tokens()
        if not token:
            raise ValueError("Google Health todavía no está conectado.")
        expiry = datetime.fromisoformat(str(token["token_expiry"]).replace("Z", "+00:00"))
        if expiry > datetime.now(UTC) + timedelta(minutes=2):
            return str(token["access_token"])
        refresh_token = str(token.get("refresh_token") or "")
        if not refresh_token:
            raise ValueError("Google Health necesita autorización nuevamente.")
        response = self.session.post(
            TOKEN_URL,
            data={
                "client_id": self.credentials.client_id,
                "client_secret": self.credentials.client_secret,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
            timeout=30,
        )
        self._raise_for_google(response, "No se pudo renovar la autorización")
        self._save_token(response.json())
        return str(response.json()["access_token"])

    def _save_token(self, token: dict[str, Any]) -> None:
        expires_in = int(token.get("expires_in") or 3600)
        token["token_expiry"] = (
            datetime.now(UTC) + timedelta(seconds=expires_in)
        ).isoformat()
        self.database.save_google_health_tokens(token)

    def _signed_state(self) -> str:
        payload = f"{int(datetime.now(UTC).timestamp())}.{secrets.token_urlsafe(18)}"
        signature = hmac.new(
            self.credentials.client_secret.encode(),
            payload.encode(),
            hashlib.sha256,
        ).hexdigest()
        return _b64encode(f"{payload}.{signature}")

    def _valid_state(self, state: str) -> bool:
        try:
            decoded = _b64decode(state)
            timestamp, nonce, signature = decoded.split(".", 2)
            payload = f"{timestamp}.{nonce}"
            expected = hmac.new(
                self.credentials.client_secret.encode(),
                payload.encode(),
                hashlib.sha256,
            ).hexdigest()
            age = datetime.now(UTC).timestamp() - int(timestamp)
            return 0 <= age <= 900 and hmac.compare_digest(signature, expected)
        except (ValueError, TypeError):
            return False

    @staticmethod
    def _time_filter(field: str, kind: str, start: date, end: date) -> str:
        if kind == "daily":
            return f'{field} >= "{start.isoformat()}" AND {field} < "{end.isoformat()}"'
        if kind == "civil":
            return f'{field} >= "{start.isoformat()}" AND {field} < "{end.isoformat()}"'
        start_utc = f"{start.isoformat()}T00:00:00Z"
        end_utc = f"{end.isoformat()}T00:00:00Z"
        return f'{field} >= "{start_utc}" AND {field} < "{end_utc}"'

    @staticmethod
    def _raise_for_google(response: requests.Response, prefix: str) -> None:
        if response.ok:
            return
        try:
            detail = response.json().get("error", {})
            message = detail.get("message") if isinstance(detail, dict) else str(detail)
        except (ValueError, AttributeError):
            message = response.text[:300]
        raise ValueError(f"{prefix} ({response.status_code}): {message or 'error de Google'}")


def data_point_time(data_type: str, point: dict[str, Any]) -> str:
    payload = next(
        (value for key, value in point.items() if key not in {"name", "dataSource"} and isinstance(value, dict)),
        {},
    )
    date_value = payload.get("date")
    if isinstance(date_value, dict):
        return _date_object_iso(date_value)
    for container_name in ("sampleTime", "interval"):
        container = payload.get(container_name)
        if not isinstance(container, dict):
            continue
        for key in ("physicalTime", "endTime", "startTime"):
            if container.get(key):
                return str(container[key])
    return datetime.now(UTC).isoformat()


def data_point_source(point: dict[str, Any]) -> str:
    source = point.get("dataSource") or {}
    device = source.get("device") or {}
    return str(
        device.get("displayName")
        or device.get("manufacturer")
        or source.get("platform")
        or "Google Health"
    )


def data_point_key(data_type: str, point: dict[str, Any], recorded_at: str, source: str) -> str:
    if point.get("name"):
        return str(point["name"])
    raw = f"{data_type}|{recorded_at}|{source}"
    return hashlib.sha256(raw.encode()).hexdigest()


def normalized_recovery_value(data_type: str, point: dict[str, Any]) -> tuple[float, str] | None:
    field_map: dict[str, tuple[str, str, float]] = {
        "daily-heart-rate-variability": (
            "averageHeartRateVariabilityMilliseconds",
            "ms",
            1,
        ),
        "daily-resting-heart-rate": ("beatsPerMinute", "bpm", 1),
        "daily-vo2-max": ("vo2Max", "ml/kg/min", 1),
        "run-vo2-max": ("vo2Max", "ml/kg/min", 1),
        "vo2-max": ("vo2Max", "ml/kg/min", 1),
        "weight": ("weightGrams", "kg", 0.001),
        "daily-oxygen-saturation": ("averagePercentage", "%", 1),
        "daily-respiratory-rate": ("breathsPerMinute", "rpm", 1),
        "daily-sleep-temperature-derivations": ("nightlyTemperatureCelsius", "°C", 1),
    }
    payload = next(
        (value for key, value in point.items() if key not in {"name", "dataSource"} and isinstance(value, dict)),
        {},
    )
    if data_type == "sleep":
        summary = payload.get("summary") or {}
        value = summary.get("minutesAsleep")
        return (float(value) / 60, "h") if value is not None else None
    mapping = field_map.get(data_type)
    if not mapping:
        return None
    field, unit, multiplier = mapping
    value = payload.get(field)
    return (float(value) * multiplier, unit) if value is not None else None


def _date_object_iso(value: dict[str, Any]) -> str:
    return date(
        int(value["year"]),
        int(value["month"]),
        int(value["day"]),
    ).isoformat()


def _b64encode(value: str) -> str:
    return base64.urlsafe_b64encode(value.encode()).decode().rstrip("=")


def _b64decode(value: str) -> str:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4)).decode()
