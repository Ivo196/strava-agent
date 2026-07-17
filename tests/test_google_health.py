from __future__ import annotations

import json
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from strava_agent.database import Database
from strava_agent.google_health import (
    GoogleHealthCredentials,
    GoogleHealthService,
    data_point_time,
    normalized_recovery_value,
)


class FakeResponse:
    def __init__(self, payload: dict, status_code: int = 200) -> None:
        self._payload = payload
        self.status_code = status_code
        self.ok = status_code < 400
        self.text = json.dumps(payload)

    def json(self) -> dict:
        return self._payload


class FakeSession:
    def __init__(self) -> None:
        self.posts: list[tuple[str, dict]] = []
        self.gets: list[tuple[str, dict]] = []

    def post(self, url: str, data: dict, timeout: int) -> FakeResponse:
        self.posts.append((url, data))
        return FakeResponse(
            {
                "access_token": "access",
                "refresh_token": "refresh",
                "expires_in": 3600,
                "scope": "scope",
            }
        )

    def get(self, url: str, headers: dict, params: dict, timeout: int) -> FakeResponse:
        self.gets.append((url, params))
        data_type = url.split("/dataTypes/")[1].split("/")[0]
        if data_type == "daily-resting-heart-rate":
            return FakeResponse(
                {
                    "dataPoints": [
                        {
                            "dataSource": {
                                "platform": "FITBIT",
                                "device": {"displayName": "Fitbit Air"},
                            },
                            "dailyRestingHeartRate": {
                                "date": {"year": 2026, "month": 7, "day": 18},
                                "beatsPerMinute": "54",
                            },
                        }
                    ]
                }
            )
        return FakeResponse({"dataPoints": []})


def credentials_file(tmp_path: Path) -> Path:
    path = tmp_path / "client.json"
    path.write_text(
        json.dumps(
            {
                "web": {
                    "client_id": "client-id",
                    "client_secret": "client-secret",
                    "redirect_uris": [
                        "http://localhost:8000/api/google-health/callback"
                    ],
                }
            }
        ),
        encoding="utf-8",
    )
    return path


def test_credentials_and_authorization_url(tmp_path: Path) -> None:
    database = Database(tmp_path / "coach.db")
    credentials = GoogleHealthCredentials.load(credentials_file(tmp_path))
    service = GoogleHealthService(credentials, database, FakeSession())

    query = parse_qs(urlparse(service.authorization_url()).query)

    assert query["client_id"] == ["client-id"]
    assert query["access_type"] == ["offline"]
    assert "googlehealth.sleep.readonly" in query["scope"][0]
    assert query["redirect_uri"] == [
        "http://localhost:8000/api/google-health/callback"
    ]


def test_sync_saves_available_google_health_points(tmp_path: Path) -> None:
    database = Database(tmp_path / "coach.db")
    database.save_google_health_tokens(
        {
            "access_token": "access",
            "refresh_token": "refresh",
            "token_expiry": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
            "scope": "scope",
        }
    )
    service = GoogleHealthService(
        GoogleHealthCredentials.load(credentials_file(tmp_path)),
        database,
        FakeSession(),
    )

    result = service.sync()
    status = database.google_health_status()

    assert result["points_received"] == 1
    assert result["data_types_received"] > 10
    assert status["connected"] is True
    assert status["point_count"] == 1
    assert status["fitbit_sensor_points"] == 0
    assert status["consolidated_points"] == 1
    assert status["data_types"][0]["data_type"] == "daily-resting-heart-rate"
    daily_request = next(
        params
        for url, params in service.session.gets
        if "/daily-resting-heart-rate/" in url
    )
    assert "daily_resting_heart_rate.date" in daily_request["filter"]

    service.sync()
    incremental_request = [
        params
        for url, params in service.session.gets
        if "/daily-resting-heart-rate/" in url
    ][-1]
    assert (date.today() - timedelta(days=2)).isoformat() in incremental_request["filter"]


def test_status_separates_passive_fitbit_samples_from_derived_data(
    tmp_path: Path,
) -> None:
    database = Database(tmp_path / "coach.db")
    database.upsert_google_health_data_point(
        "heart-rate",
        "fitbit-sensor-sample",
        "2026-07-18T12:00:00Z",
        "FITBIT",
        {
            "dataSource": {
                "platform": "FITBIT",
                "recordingMethod": "PASSIVELY_MEASURED",
            },
            "heartRate": {"beatsPerMinute": 62},
        },
    )
    database.upsert_google_health_data_point(
        "daily-vo2-max",
        "google-derived-value",
        "2026-07-18",
        "FITBIT",
        {
            "dataSource": {
                "platform": "FITBIT",
                "recordingMethod": "DERIVED",
            },
            "dailyVo2Max": {"vo2MillilitersPerMinuteKilogram": 54.9},
        },
    )

    status = database.google_health_status()

    assert status["point_count"] == 2
    assert status["fitbit_sensor_points"] == 1
    assert status["fitbit_sensor_first"] == "2026-07-18T12:00:00Z"
    assert status["consolidated_points"] == 1


def test_normalizes_recovery_values() -> None:
    hrv = {
        "dailyHeartRateVariability": {
            "date": {"year": 2026, "month": 7, "day": 18},
            "averageHeartRateVariabilityMilliseconds": 61.5,
        }
    }
    sleep = {
        "sleep": {
            "interval": {
                "startTime": "2026-07-17T22:00:00Z",
                "endTime": "2026-07-18T06:00:00Z",
            },
            "summary": {"minutesAsleep": "435"},
        }
    }

    assert normalized_recovery_value(
        "daily-heart-rate-variability", hrv
    ) == (61.5, "ms")
    assert normalized_recovery_value("sleep", sleep) == (7.25, "h")
    assert data_point_time("sleep", sleep) == "2026-07-18T06:00:00Z"
