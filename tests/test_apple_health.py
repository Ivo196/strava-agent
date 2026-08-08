from pathlib import Path
from dataclasses import replace
from copy import deepcopy
import json

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
    assert first.workouts_saved == 1
    assert first.metrics_imported == 1
    assert second.runs_updated == 1
    assert second.workouts_saved == 0
    assert second.metrics_updated == 1
    assert database.activity_count() == 1
    activity = database.list_activities()[0]
    assert activity["distance_m"] == pytest.approx(5000)
    assert activity["average_heartrate"] == pytest.approx(147.5)
    assert activity["streams_loaded"] == 1
    assert database.list_apple_health_workouts()[0]["workout_id"] == "run-2026-07-17"
    status = database.apple_health_status()
    assert status["workout_count"] == 1
    assert status["metric_count"] == 1
    assert status["last_sync"]["workouts_received"] == 1
    assert status["last_sync"]["runs_updated"] == 1
    assert status["last_sync"]["result_recorded"] == 1


def test_activity_detail_includes_route_map_points(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    database = Database(tmp_path / "coach.db")
    import_health_auto_export(health_payload(), database)
    activity = database.list_activities()[0]
    monkeypatch.setattr(api, "database", database)
    client = TestClient(api.app)

    response = client.get(f"/api/activities/{activity['id']}")

    assert response.status_code == 200
    detail = response.json()
    assert detail["route_available"] is True
    assert detail["route"] == [
        {"latitude": 41.88, "longitude": -87.63, "distance_km": 0.0, "elapsed_s": 0, "altitude_m": 180.0},
        {"latitude": 41.925, "longitude": -87.63, "distance_km": 5.004, "elapsed_s": 1800, "altitude_m": 185.0},
    ]


def test_activity_detail_builds_heart_rate_stream_from_apple_metrics(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    database = Database(tmp_path / "coach.db")
    import_health_auto_export(health_payload(), database)
    activity = database.list_activities()[0]
    streams = json.loads(activity["streams_json"])
    streams.pop("heartrate", None)
    with database.connect() as connection:
        connection.execute("UPDATE activities SET streams_json = ? WHERE id = ?", (json.dumps(streams), activity["id"]))
    database.upsert_apple_health_metric(
        "heart_rate",
        {
            "date": "2026-07-17T07:00:00+02:00",
            "qty": 141,
            "source": "Apple Watch",
            "units": "count/min",
        },
    )
    database.upsert_apple_health_metric(
        "heart_rate",
        {
            "date": "2026-07-17T07:00:00+02:00",
            "qty": 199,
            "source": "HUAWEI Health",
            "units": "count/min",
        },
    )
    database.upsert_apple_health_metric(
        "heart_rate",
        {
            "date": "2026-07-17T07:30:00+02:00",
            "qty": 156,
            "source": "Apple Watch",
            "units": "count/min",
        },
    )
    monkeypatch.setattr(api, "database", database)
    client = TestClient(api.app)

    response = client.get(f"/api/activities/{activity['id']}")

    assert response.status_code == 200
    detail = response.json()
    assert [point["heartrate"] for point in detail["series"]] == [141, 156]
    assert detail["splits"][0]["heartrate_source"] == "stream"


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


def test_overlapping_exports_deduplicate_a_workout_even_if_its_id_changes(tmp_path: Path) -> None:
    database = Database(tmp_path / "coach.db")
    first_payload = health_payload()
    repeated_payload = deepcopy(first_payload)
    repeated_payload["data"]["workouts"][0]["id"] = "same-run-new-export-id"

    first = import_health_auto_export(first_payload, database)
    repeated = import_health_auto_export(repeated_payload, database)

    assert first.workouts_saved == 1
    assert repeated.workouts_saved == 0
    assert repeated.runs_updated == 1
    assert database.activity_count() == 1
    assert len(database.list_apple_health_workouts()) == 1


def test_overlapping_exports_match_when_distance_and_start_are_revised(tmp_path: Path) -> None:
    database = Database(tmp_path / "coach.db")
    first_payload = health_payload()
    revised_payload = deepcopy(first_payload)
    revised = revised_payload["data"]["workouts"][0]
    revised["id"] = "same-run-revised"
    revised["start"] = "2026-07-17 07:02:00 +0200"
    revised["end"] = "2026-07-17 07:40:00 +0200"
    revised["duration"] = 2280
    revised["distance"] = {"qty": 6.6, "units": "km"}

    first = import_health_auto_export(first_payload, database)
    second = import_health_auto_export(revised_payload, database)

    assert first.runs_imported == 1
    assert second.runs_updated == 1
    assert database.activity_count() == 1
    assert database.list_activities()[0]["distance_m"] == pytest.approx(6600)


def test_iphone_workout_label_can_use_nested_apple_watch_evidence(tmp_path: Path) -> None:
    database = Database(tmp_path / "coach.db")
    payload = health_payload()
    payload["data"]["workouts"][0]["sourceName"] = "Ivo's iPhone"

    result = import_health_auto_export(payload, database)

    assert result.runs_imported == 1
    assert result.workouts_skipped == 0


def test_three_previous_seven_day_automations_are_idempotent(tmp_path: Path) -> None:
    database = Database(tmp_path / "coach.db")
    workouts_payload = health_payload()
    workouts_payload["data"]["metrics"] = []
    recovery_payload = {
        "data": {
            "metrics": [
                {
                    "name": "heart_rate_variability",
                    "units": "ms",
                    "data": [
                        {"date": "2026-07-16 06:00:00 +0200", "qty": 60, "source": "Apple Watch"},
                        {"date": "2026-07-17 06:00:00 +0200", "qty": 61, "source": "Apple Watch"},
                    ],
                },
                {
                    "name": "resting_heart_rate",
                    "units": "bpm",
                    "data": [
                        {"date": "2026-07-17 06:05:00 +0200", "qty": 49, "source": "Apple Watch"}
                    ],
                },
                {
                    "name": "sleep_analysis",
                    "units": "h",
                    "data": [
                        {
                            "sleepStart": "2026-07-16T23:00:00+02:00",
                            "sleepEnd": "2026-07-17T07:00:00+02:00",
                            "totalSleep": 7.5,
                            "source": "Apple Watch",
                        }
                    ],
                },
            ]
        }
    }
    dynamics_payload = {
        "data": {
            "metrics": [
                {
                    "name": metric_name,
                    "units": units,
                    "data": [
                        {"date": "2026-07-17 07:05:00 +0200", "qty": value, "source": "Apple Watch"},
                        {"date": "2026-07-17 07:06:00 +0200", "qty": value + 1, "source": "Apple Watch"},
                    ],
                }
                for metric_name, units, value in (
                    ("running_power", "W", 250),
                    ("running_speed", "kmph", 11),
                    ("running_ground_contact_time", "ms", 245),
                    ("running_stride_length", "m", 1.1),
                    ("running_vertical_oscillation", "cm", 8.5),
                )
            ]
        }
    }

    first_workouts = import_health_auto_export(workouts_payload, database)
    second_workouts = import_health_auto_export(workouts_payload, database)
    first_recovery = import_health_auto_export(recovery_payload, database)
    second_recovery = import_health_auto_export(recovery_payload, database)
    first_dynamics = import_health_auto_export(dynamics_payload, database)
    second_dynamics = import_health_auto_export(dynamics_payload, database)

    assert (first_workouts.workouts_saved, second_workouts.workouts_saved) == (1, 0)
    assert (first_recovery.metrics_imported, second_recovery.metrics_updated) == (4, 4)
    assert (first_dynamics.metrics_imported, second_dynamics.metrics_updated) == (10, 10)
    assert database.activity_count() == 1
    assert database.apple_health_status()["workout_count"] == 1
    assert database.apple_health_status()["metric_count"] == 14


def test_metric_deduplication_normalizes_equivalent_dates_and_source_spacing(tmp_path: Path) -> None:
    database = Database(tmp_path / "coach.db")
    first_payload = {
        "data": {
            "metrics": [
                {
                    "name": metric_name,
                    "units": units,
                    "data": [
                        {
                            "date": "2026-07-17 06:00:00 +0200",
                            "qty": first_value,
                            "source": "Ivo’s Apple\u00a0Watch",
                        }
                    ],
                }
                for metric_name, units, first_value in (
                    ("heart_rate_variability", "ms", 60),
                    ("running_power", "W", 250),
                )
            ]
        }
    }
    equivalent_payload = deepcopy(first_payload)
    for metric in equivalent_payload["data"]["metrics"]:
        metric["data"][0]["date"] = "2026-07-17T04:00:00Z"
        metric["data"][0]["source"] = "Ivo’s Apple Watch"
        metric["data"][0]["qty"] += 1

    first = import_health_auto_export(first_payload, database)
    equivalent = import_health_auto_export(equivalent_payload, database)

    assert first.metrics_imported == 2
    assert equivalent.metrics_imported == 0
    assert equivalent.metrics_updated == 2
    assert database.apple_health_status()["metric_count"] == 2


def test_fitbit_runs_are_rejected_but_other_fitbit_workouts_are_kept(tmp_path: Path) -> None:
    database = Database(tmp_path / "coach.db")
    payload = health_payload()
    fitbit_run = payload["data"]["workouts"][0]
    fitbit_run["id"] = "fitbit-run"
    fitbit_run["heartRateData"][0]["source"] = "Fitbit"
    fitbit_run["heartRateData"][1]["source"] = "Fitbit"
    fitbit_bike = {
        "id": "fitbit-bike",
        "name": "Cycling",
        "start": "2026-07-18 07:00:00 +0200",
        "end": "2026-07-18 08:00:00 +0200",
        "duration": 3600,
        "distance": {"qty": 20, "units": "km"},
        "heartRateData": [{"date": "2026-07-18 07:00:00 +0200", "Avg": 130, "source": "Fitbit"}],
    }
    payload["data"]["workouts"].append(fitbit_bike)

    result = import_health_auto_export(payload, database)

    assert result.workouts_received == 2
    assert result.workouts_saved == 1
    assert result.workouts_skipped == 1
    assert result.runs_imported == 0
    assert database.activity_count() == 0
    assert [row["workout_id"] for row in database.list_apple_health_workouts()] == ["fitbit-bike"]


def test_run_endpoints_only_use_explicit_apple_watch_activities(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    database = Database(tmp_path / "coach.db")
    import_health_auto_export(health_payload(), database)
    database.upsert_activity(
        {
            "id": 2001,
            "name": "Carrera Fitbit",
            "sport_type": "Run",
            "start_date": "2026-07-18T07:00:00+02:00",
            "start_date_local": "2026-07-18T07:00:00+02:00",
            "distance": 6000,
            "moving_time": 2100,
            "elapsed_time": 2150,
            "device_name": "Fitbit Charge 6",
            "source": "health_auto_export",
        }
    )
    database.upsert_activity(
        {
            "id": 2003,
            "name": "Carrera Strava con reloj Apple",
            "sport_type": "Run",
            "start_date": "2026-07-20T07:00:00+02:00",
            "start_date_local": "2026-07-20T07:00:00+02:00",
            "distance": 8000,
            "moving_time": 2700,
            "elapsed_time": 2750,
            "device_name": "Apple Watch",
        }
    )
    database.upsert_activity(
        {
            "id": 2002,
            "name": "Carrera Strava",
            "sport_type": "Run",
            "start_date": "2026-07-19T07:00:00+02:00",
            "start_date_local": "2026-07-19T07:00:00+02:00",
            "distance": 7000,
            "moving_time": 2400,
            "elapsed_time": 2450,
            "device_name": "Strava",
        }
    )
    monkeypatch.setattr(api, "database", database)
    client = TestClient(api.app)

    activities = client.get("/api/activities")
    dashboard = client.get("/api/dashboard?today=2026-07-19")
    progress = client.get("/api/activities/progress?today=2026-07-19")
    hidden_detail = client.get("/api/activities/2001")

    assert activities.status_code == 200
    assert [item["device_name"] for item in activities.json()["activities"]] == ["Apple Watch"]
    assert dashboard.json()["activity_count"] == 1
    assert progress.json()["lifetime"]["runs"] == 1
    assert hidden_detail.status_code == 404


def test_run_endpoints_keep_rich_copy_of_overlapping_apple_imports(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    database = Database(tmp_path / "coach.db")
    import_health_auto_export(health_payload(), database)
    rich = database.list_activities()[0]
    database.upsert_activity(
        {
            "id": 9999,
            "name": "Carrera incompleta",
            "sport_type": "Run",
            "start_date": "2026-07-17T07:02:00+02:00",
            "start_date_local": "2026-07-17T07:02:00+02:00",
            "distance": 6600,
            "moving_time": 2280,
            "elapsed_time": 2280,
            "average_heartrate": 147,
            "device_name": "Apple Watch",
            "source": "health_auto_export",
        },
        detail_loaded=True,
    )
    monkeypatch.setattr(api, "database", database)
    client = TestClient(api.app)

    response = client.get("/api/activities")

    assert response.status_code == 200
    activities = response.json()["activities"]
    assert [item["id"] for item in activities] == [str(rich["id"])]
    assert activities[0]["distance_km"] == 5.0
