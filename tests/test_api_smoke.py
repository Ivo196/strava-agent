from fastapi.testclient import TestClient
from pathlib import Path

import api
from strava_agent.database import Database
from strava_agent.metrics import activities_frame


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
        "confidence",
        "load_7d",
            "sleep_utility",
            "journal",
            "physiological_stress",
            "energy",
            "recovery_guidance",
            "trends",
        }
    assert len(dashboard.json()["daily_state"]["morning_recovery"]["factors"]) == 6
    assert len(dashboard.json()["daily_state"]["load_7d"]["trend"]) == 7
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


def test_new_calendar_pattern_starts_in_week_four() -> None:
    client = TestClient(api.app)

    response = client.get("/api/plan?today=2026-08-10")

    assert response.status_code == 200
    payload = response.json()
    week = next(item for item in payload["weeks"] if item["number"] == 4)
    assert week["sessions"][0].startswith("Lunes: 7 km regenerativos")
    assert week["sessions"][1].startswith("Miércoles: 7 km totales de pasadas")
    assert week["sessions"][2].startswith("Sábado: tirada larga de 14 km")

    days = {
        day["date"]: day
        for day in payload["calendar"]
        if "2026-08-10" <= day["date"] <= "2026-08-16"
    }
    assert days["2026-08-10"]["category"] == "run"
    assert "regenerativos" in days["2026-08-10"]["title"]
    assert days["2026-08-11"]["title"] == "Gimnasio · tren superior y core"
    assert days["2026-08-12"]["category"] == "run"
    assert "pasadas" in days["2026-08-12"]["title"]
    assert days["2026-08-13"]["title"] == "Gimnasio · tren superior y core"
    assert days["2026-08-14"]["title"] == "Gimnasio · piernas"
    assert days["2026-08-15"]["category"] == "run"
    assert "14 km" in days["2026-08-15"]["title"]
    assert days["2026-08-16"]["title"] == "Gimnasio · piernas"
    week_starts = {
        day["week_number"]: day["date"]
        for day in payload["calendar"]
        if day["day"] == "Lunes"
    }
    assert set(week_starts) == set(range(1, 13))
    assert payload["calendar"][-1]["date"] == "2026-10-11"


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


def test_body_composition_endpoint_saves_history(tmp_path: Path, monkeypatch) -> None:
    test_database = Database(tmp_path / "body.db")
    test_database.save_profile({"running_days": 3, "weight_kg": 78})
    monkeypatch.setattr(api, "database", test_database)
    client = TestClient(api.app)

    saved = client.post(
        "/api/body-composition",
        json={
            "measurement_date": "2026-07-22",
            "source": "InBody",
            "weight_kg": 81.7,
            "muscle_mass_kg": 23.0,
            "body_fat_percent": 47.8,
            "height_cm": 185,
            "age": 30,
            "sex": "M",
        },
    )
    history = client.get("/api/body-composition")

    assert saved.status_code == 200
    assert saved.json()["measurement"]["measurement_date"] == "2026-07-22"
    assert history.status_code == 200
    assert history.json()["count"] == 1
    assert history.json()["latest"]["body_fat_percent"] == 47.8


def test_body_composition_reads_fitbit_weight_without_manual_entry(
    tmp_path: Path,
    monkeypatch,
) -> None:
    test_database = Database(tmp_path / "fitbit-weight.db")
    test_database.upsert_google_health_data_point(
        "weight",
        "weight-2026-07-31",
        "2026-07-31T07:30:00+02:00",
        "FITBIT",
        {"weight": {"weightGrams": 80500}},
    )
    monkeypatch.setattr(api, "database", test_database)
    client = TestClient(api.app)

    history = client.get("/api/body-composition")

    assert history.status_code == 200
    assert history.json()["count"] == 1
    assert history.json()["latest"]["source"] == "Fitbit"
    assert history.json()["latest"]["weight_kg"] == 80.5
    assert history.json()["latest"]["muscle_mass_kg"] is None


def test_plan_exposes_body_composition_as_secondary_context(tmp_path: Path, monkeypatch) -> None:
    test_database = Database(tmp_path / "plan-body.db")
    test_database.save_profile({"running_days": 3, "weight_kg": 81.9})
    for measurement in (
        {
            "measurement_date": "2026-08-01",
            "source": "InBody",
            "weight_kg": 81.9,
            "muscle_mass_kg": 41.8,
            "body_fat_percent": 11.3,
        },
        {
            "measurement_date": "2026-08-09",
            "source": "InBody",
            "weight_kg": 80.7,
            "muscle_mass_kg": 41.4,
            "body_fat_percent": 10.7,
        },
    ):
        test_database.upsert_body_composition(measurement)
    monkeypatch.setattr(api, "database", test_database)
    client = TestClient(api.app)

    response = client.get("/api/plan?today=2026-08-09")

    assert response.status_code == 200
    context = response.json()["body_composition"]
    assert context["latest"]["weight_kg"] == 80.7
    assert context["previous_date"] == "2026-08-01"
    assert context["change_since_previous"] == {
        "weight_kg": -1.2,
        "muscle_mass_kg": -0.4,
        "body_fat_percent": -0.6,
    }
    assert "no cambia el calendario" in context["guidance"]


def test_plan_ignores_incompatible_body_composition_history(tmp_path: Path, monkeypatch) -> None:
    test_database = Database(tmp_path / "plan-body-outlier.db")
    test_database.save_profile({"running_days": 3, "weight_kg": 80.7})
    for measurement in (
        {
            "measurement_date": "2026-07-22",
            "source": "InBody",
            "weight_kg": 81.7,
            "muscle_mass_kg": 23.0,
            "body_fat_percent": 47.8,
        },
        {
            "measurement_date": "2026-08-09",
            "source": "InBody",
            "weight_kg": 80.7,
            "muscle_mass_kg": 41.4,
            "body_fat_percent": 10.7,
        },
    ):
        test_database.upsert_body_composition(measurement)
    monkeypatch.setattr(api, "database", test_database)
    client = TestClient(api.app)

    context = client.get("/api/plan?today=2026-08-09").json()["body_composition"]

    assert context["previous_date"] is None
    assert context["change_since_previous"] is None


def test_daily_checkin_endpoint_starts_and_updates_journal(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(api, "database", Database(tmp_path / "journal.db"))
    client = TestClient(api.app)

    response = client.post("/api/daily-checkin", json={
        "local_date": "2026-07-31",
        "fatigue": 3,
        "stress": 2,
        "soreness": 1,
        "injury_note": "",
        "alcohol_units": 0,
        "caffeine_after_14": False,
        "notes": "Normal",
    })
    fetched = client.get("/api/daily-checkin?local_date=2026-07-31")

    assert response.status_code == 200
    assert fetched.status_code == 200
    assert fetched.json()["checkin"]["fatigue"] == 3
    assert fetched.json()["entry_count"] == 1


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


def test_calendar_apple_watch_activity_includes_average_pace() -> None:
    frame = activities_frame([{
        "id": 1,
        "name": "Carrera · Apple Watch",
        "sport_type": "Run",
        "device_name": "Apple Watch",
        "start_date_local": "2026-08-10T07:00:00+02:00",
        "distance_m": 7040,
        "moving_time_s": 2340,
        "elevation_gain_m": 0,
        "average_heartrate": 145,
        "max_heartrate": 168,
        "suffer_score": None,
        "calories": 500,
        "streams_loaded": False,
    }])

    activities = api._actual_activities_by_date(frame, {})

    assert activities["2026-08-10"][0]["pace"] == "5:32 min/km"
