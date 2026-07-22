from fastapi.testclient import TestClient
from pathlib import Path

import api
from strava_agent.database import Database


def test_dashboard_and_coach_status_are_available() -> None:
    client = TestClient(api.app)

    dashboard = client.get("/api/dashboard")
    coach_status = client.get("/api/coach/status")
    coach_summary = client.get("/api/coach/summary")

    assert dashboard.status_code == 200
    assert 3 <= dashboard.json()["profile"]["running_days"] <= 6
    assert "apple_watch" in dashboard.json()["devices"]
    assert "fitbit" in dashboard.json()["devices"]
    assert "series" in dashboard.json()["devices"]["fitbit"]["heart_rate"]
    assert "total_calories" in dashboard.json()["devices"]["fitbit"]
    assert "daily_activity" in dashboard.json()["devices"]["fitbit"]
    assert "exercises" in dashboard.json()["devices"]["fitbit"]
    assert "recovery_history" in dashboard.json()["devices"]["fitbit"]
    assert set(dashboard.json()["daily_state"]) == {
        "calibration",
        "morning_recovery",
        "today_load",
        "recommendation",
    }
    assert dashboard.json()["current_date"]
    assert set(dashboard.json()["today_activity"]) == {
        "count",
        "distance_km",
        "moving_minutes",
        "training_load",
        "calories",
        "average_heartrate",
    }
    assert len(dashboard.json()["daily_agenda"]) == 7
    assert dashboard.json()["daily_agenda"][0]["relative_label"] == "Hoy"
    assert dashboard.json()["daily_agenda"][0]["category"] in {"run", "strength", "bike", "rest"}
    assert "completed" in dashboard.json()["daily_agenda"][0]
    assert "completion_source" in dashboard.json()["daily_agenda"][0]
    assert "actual_activities" in dashboard.json()["daily_agenda"][0]
    assert "daily_metrics" in dashboard.json()["daily_agenda"][0]
    assert coach_status.status_code == 200
    assert "configured" in coach_status.json()
    assert coach_summary.status_code == 200
    assert set(coach_summary.json()["metrics"]) == {
        "distance_current_week",
        "average_weekly_28d",
        "longest_42d",
    }


def test_dashboard_and_plan_accept_simulated_today() -> None:
    client = TestClient(api.app)

    dashboard = client.get("/api/dashboard?today=2026-08-24")
    plan = client.get("/api/plan?today=2026-08-24")

    assert dashboard.status_code == 200
    assert dashboard.json()["days_to_race"] == 48
    assert dashboard.json()["current_date"] == "2026-08-24"
    assert dashboard.json()["today_activity"]["count"] == 0
    assert plan.status_code == 200
    assert plan.json()["current_date"] == "2026-08-24"
    assert plan.json()["current_week_start"] == "2026-08-24"
    assert plan.json()["daily_agenda"][0]["relative_label"] == "Hoy"
    assert any(day["is_past"] for day in plan.json()["calendar"])
    assert any(day["is_current_week"] for day in plan.json()["calendar"])


def test_adjusted_plan_exposes_first_block_paces_and_saturday_long_run() -> None:
    client = TestClient(api.app)

    response = client.get("/api/plan?today=2026-07-21")

    assert response.status_code == 200
    payload = response.json()
    assert payload["current_week_number"] == 1
    assert payload["weeks"][0]["target_km"] == 21.0
    assert "objetivo central 5:30 min/km" in payload["weeks"][0]["sessions"][0]
    saturday = next(day for day in payload["calendar"] if day["date"] == "2026-07-25")
    friday = next(day for day in payload["calendar"] if day["date"] == "2026-07-24")
    assert saturday["category"] == "run"
    assert "11 km" in saturday["title"]
    assert "5:35-5:50 min/km" in saturday["title"]
    assert friday["category"] == "rest"
    assert friday["title"] == "Movilidad y core · sin piernas"


def test_dashboard_demo_scenario_is_read_only_and_recalculates() -> None:
    client = TestClient(api.app)
    points_before = api.database.google_health_status()["point_count"]

    response = client.get("/api/dashboard?scenario=heavy-load")

    assert response.status_code == 200
    assert response.json()["demo_scenario"] == "heavy-load"
    assert response.json()["daily_state"]["today_load"]["level"] == "high"
    assert response.json()["daily_state"]["today_load"]["fitbit_exercises"][0]["type"] == "BIKING"
    assert api.database.google_health_status()["point_count"] == points_before


def test_google_health_runs_automatically_every_hour() -> None:
    client = TestClient(api.app)

    status = client.get("/api/google-health/status")

    assert status.status_code == 200
    assert status.json()["auto_sync"]["enabled"] is True
    assert status.json()["auto_sync"]["interval_hours"] == 1


def test_data_version_is_available_for_lightweight_refresh_checks() -> None:
    client = TestClient(api.app)

    response = client.get("/api/data-version")

    assert response.status_code == 200
    assert isinstance(response.json()["version"], str)


def test_plan_completion_endpoint_persists_and_removes(
    tmp_path: Path,
    monkeypatch,
) -> None:
    test_database = Database(tmp_path / "completion.db")
    monkeypatch.setattr(api, "database", test_database)
    client = TestClient(api.app)

    checked = client.post(
        "/api/plan/completion",
        json={"session_date": "2026-07-21", "completed": True},
    )
    assert checked.status_code == 200
    assert checked.json()["source"] == "manual"
    assert test_database.list_plan_session_completions()[0]["session_date"] == "2026-07-21"

    unchecked = client.post(
        "/api/plan/completion",
        json={"session_date": "2026-07-21", "completed": False},
    )
    assert unchecked.status_code == 200
    assert test_database.list_plan_session_completions() == []


def test_fitbit_bike_marks_the_planned_bike_as_detected(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(api, "database", Database(tmp_path / "detected.db"))
    agenda = [{
        "date": "2026-07-20",
        "category": "bike",
    }]

    result = api._agenda_with_completion(
        agenda,
        None,
        {"exercises": [{
            "date": "2026-07-20",
            "type": "BIKING",
            "label": "Bicicleta",
            "source": "Fitbit",
        }]},
    )

    assert result[0]["completed"] is True
    assert result[0]["completion_source"] == "fitbit"
    assert result[0]["completion_locked"] is True
    assert result[0]["actual_activities"][0]["label"] == "Bicicleta"
