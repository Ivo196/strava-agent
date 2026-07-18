from fastapi.testclient import TestClient

import api


def test_dashboard_and_coach_status_are_available() -> None:
    client = TestClient(api.app)

    dashboard = client.get("/api/dashboard")
    coach_status = client.get("/api/coach/status")

    assert dashboard.status_code == 200
    assert 3 <= dashboard.json()["profile"]["running_days"] <= 6
    assert "apple_watch" in dashboard.json()["devices"]
    assert "fitbit" in dashboard.json()["devices"]
    assert "series" in dashboard.json()["devices"]["fitbit"]["heart_rate"]
    assert len(dashboard.json()["daily_agenda"]) == 7
    assert dashboard.json()["daily_agenda"][0]["relative_label"] == "Hoy"
    assert dashboard.json()["daily_agenda"][0]["category"] in {"run", "strength", "bike", "rest"}
    assert coach_status.status_code == 200
    assert "configured" in coach_status.json()


def test_dashboard_and_plan_accept_simulated_today() -> None:
    client = TestClient(api.app)

    dashboard = client.get("/api/dashboard?today=2026-08-24")
    plan = client.get("/api/plan?today=2026-08-24")

    assert dashboard.status_code == 200
    assert dashboard.json()["days_to_race"] == 48
    assert plan.status_code == 200
    assert plan.json()["current_date"] == "2026-08-24"
    assert plan.json()["current_week_start"] == "2026-08-24"
    assert plan.json()["daily_agenda"][0]["relative_label"] == "Hoy"


def test_google_health_runs_automatically_every_six_hours() -> None:
    client = TestClient(api.app)

    status = client.get("/api/google-health/status")

    assert status.status_code == 200
    assert status.json()["auto_sync"]["enabled"] is True
    assert status.json()["auto_sync"]["interval_hours"] == 6
