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
    assert coach_status.status_code == 200
    assert "configured" in coach_status.json()
