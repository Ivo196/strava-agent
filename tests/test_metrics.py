import json
from datetime import date

import pytest

from strava_agent.metrics import (
    activities_frame,
    dashboard_metrics,
    format_pace,
    heart_rate_drift,
    weekly_summary,
)


def row(activity_id: int, start: str, distance_m: float = 10000) -> dict:
    return {
        "id": activity_id,
        "name": "Carrera",
        "sport_type": "Run",
        "start_date": start,
        "start_date_local": start,
        "distance_m": distance_m,
        "moving_time_s": 3000,
        "elevation_gain_m": 20,
        "average_heartrate": 150,
        "max_heartrate": 170,
        "suffer_score": 50,
        "streams_loaded": 0,
    }


def test_frames_and_dashboard() -> None:
    frame = activities_frame(
        [
            row(1, "2026-07-13T08:00:00Z"),
            row(2, "2026-07-08T08:00:00Z", 20000),
        ]
    )
    metrics = dashboard_metrics(frame, today=date(2026, 7, 15))
    weeks = weekly_summary(frame)

    assert metrics["distance_7d"] == pytest.approx(10)
    assert metrics["distance_current_week"] == pytest.approx(10)
    assert metrics["runs_current_week"] == 1
    assert metrics["distance_28d"] == pytest.approx(30)
    assert metrics["longest_42d"] == pytest.approx(20)
    assert weeks["distance_km"].sum() == pytest.approx(30)
    assert format_pace(5.5) == "5:30 min/km"


def test_heart_rate_drift_detects_efficiency_drop() -> None:
    streams = {
        "heartrate": {"data": [140] * 20 + [150] * 20},
        "velocity_smooth": {"data": [3.0] * 40},
        "moving": {"data": [True] * 40},
    }
    activity = {"streams_json": json.dumps(streams)}
    assert heart_rate_drift(activity) == pytest.approx(6.666, rel=0.01)
