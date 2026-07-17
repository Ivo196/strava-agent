from pathlib import Path
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

import api
from strava_agent.apple_health import import_health_auto_export
from strava_agent.database import Database


def health_payload() -> dict:
    return {
        "data": {
            "workouts": [
                {
                    "id": "run-2026-07-17",
                    "name": "Running",
                    "start": "2026-07-17 07:00:00 +0200",
                    "end": "2026-07-17 07:30:00 +0200",
                    "duration": 1800,
                    "distance": {"qty": 5, "units": "km"},
                    "elevationUp": {"qty": 30, "units": "m"},
                    "activeEnergyBurned": {"qty": 390, "units": "kcal"},
                    "heartRateData": [
                        {
                            "date": "2026-07-17 07:00:00 +0200",
                            "Min": 130,
                            "Avg": 140,
                            "Max": 150,
                            "units": "bpm",
                            "source": "Apple Watch",
                        },
                        {
                            "date": "2026-07-17 07:30:00 +0200",
                            "Min": 145,
                            "Avg": 155,
                            "Max": 165,
                            "units": "bpm",
                            "source": "Apple Watch",
                        },
                    ],
                    "route": [
                        {
                            "latitude": 41.88,
                            "longitude": -87.63,
                            "altitude": 180,
                            "timestamp": "2026-07-17 07:00:00 +0200",
                        },
                        {
                            "latitude": 41.925,
                            "longitude": -87.63,
                            "altitude": 185,
                            "timestamp": "2026-07-17 07:30:00 +0200",
                        },
                    ],
                }
            ],
            "metrics": [
                {
                    "name": "heart_rate_variability",
                    "units": "ms",
                    "data": [
                        {
                            "qty": 61.5,
                            "date": "2026-07-17 06:00:00 +0200",
                            "source": "Apple Watch",
                        }
                    ],
                }
            ],
        }
    }


def test_imports_health_auto_export_and_is_idempotent(tmp_path: Path) -> None:
    database = Database(tmp_path / "coach.db")

    first = import_health_auto_export(health_payload(), database)
    second = import_health_auto_export(health_payload(), database)

    assert first.runs_imported == 1
    assert first.metrics_imported == 1
    assert second.runs_updated == 1
    assert second.metrics_updated == 1
    assert database.activity_count() == 1
    activity = database.list_activities()[0]
    assert activity["distance_m"] == pytest.approx(5000)
    assert activity["average_heartrate"] == pytest.approx(147.5)
    assert activity["streams_loaded"] == 1
    status = database.apple_health_status()
    assert status["workout_count"] == 1
    assert status["metric_count"] == 1
    assert status["last_sync"]["workouts_received"] == 1


def test_rejects_payload_without_supported_data(tmp_path: Path) -> None:
    database = Database(tmp_path / "coach.db")

    with pytest.raises(ValueError, match="no contiene"):
        import_health_auto_export({"data": {}}, database)


def test_rest_receiver_requires_shared_key(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(api, "database", Database(tmp_path / "receiver.db"))
    monkeypatch.setattr(
        api,
        "settings",
        replace(api.settings, apple_health_api_key="test-private-key"),
    )
    client = TestClient(api.app)

    unauthorized = client.post("/api/import/apple-health", json=health_payload())
    accepted = client.post(
        "/api/import/apple-health",
        json=health_payload(),
        headers={"X-API-Key": "test-private-key"},
    )

    assert unauthorized.status_code == 401
    assert accepted.status_code == 200
    assert accepted.json()["runs_imported"] == 1
