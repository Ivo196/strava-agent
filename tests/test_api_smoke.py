from fastapi.testclient import TestClient

import api


def test_dashboard_and_coach_status_are_available() -> None:
    client = TestClient(api.app)

    dashboard = client.get("/api/dashboard")
    coach_status = client.get("/api/coach/status")

    assert dashboard.status_code == 200
    assert dashboard.json()["profile"]["running_days"] == 3
    assert "apple_watch" in dashboard.json()["devices"]
    assert "fitbit" in dashboard.json()["devices"]
    assert "series" in dashboard.json()["devices"]["fitbit"]["heart_rate"]
    assert len(dashboard.json()["daily_agenda"]) == 7
    assert dashboard.json()["daily_agenda"][0]["relative_label"] == "Hoy"
    assert dashboard.json()["daily_agenda"][0]["category"] in {"run", "strength", "bike", "rest"}
    assert coach_status.status_code == 200
    assert "configured" in coach_status.json()


def test_google_health_runs_automatically_every_six_hours() -> None:
    client = TestClient(api.app)

    status = client.get("/api/google-health/status")

    assert status.status_code == 200
    assert status.json()["auto_sync"]["enabled"] is True
    assert status.json()["auto_sync"]["interval_hours"] == 6
