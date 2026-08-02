from datetime import date

import pytest

from strava_agent.metrics import activities_frame
from strava_agent.run_progress import (
    build_run_progress,
    get_aerobic_efficiency_trend,
    get_consistency_status,
    get_long_run_progression,
    get_period_summary,
    get_run_quality_flags,
    get_weekly_mileage,
)


def row(
    activity_id: int,
    start: str,
    *,
    distance_km: float = 6.0,
    minutes: float = 33.0,
    heartrate: float | None = 150,
    elevation_m: float = 20.0,
) -> dict:
    return {
        "id": activity_id,
        "name": "Carrera · Apple Health",
        "sport_type": "Run",
        "start_date": start,
        "start_date_local": start,
        "distance_m": distance_km * 1000,
        "moving_time_s": round(minutes * 60),
        "elevation_gain_m": elevation_m,
        "average_heartrate": heartrate,
        "max_heartrate": 175 if heartrate else None,
        "suffer_score": None,
        "streams_loaded": 0,
        "device_name": "Apple Watch",
    }


def test_period_totals_and_previous_equivalent_windows() -> None:
    frame = activities_frame(
        [
            row(1, "2026-07-31T08:00:00Z", distance_km=10),
            row(2, "2026-07-24T08:00:00Z", distance_km=5),
            row(3, "2026-07-20T08:00:00Z", distance_km=20, minutes=105),
            row(4, "2026-07-01T08:00:00Z", distance_km=15, minutes=80),
            row(5, "2026-06-15T08:00:00Z", distance_km=5),
        ]
    )
    quality = get_run_quality_flags(frame)
    seven = get_period_summary(frame, quality, today=date(2026, 8, 1), days=7)
    twenty_eight = get_period_summary(frame, quality, today=date(2026, 8, 1), days=28)

    assert seven["current"]["distance_km"] == pytest.approx(10)
    assert seven["previous"]["distance_km"] == pytest.approx(25)
    assert seven["distance_change_percent"] == -60
    assert twenty_eight["current"]["distance_km"] == pytest.approx(35)
    assert twenty_eight["previous"]["distance_km"] == pytest.approx(20)
    assert twenty_eight["distance_change_percent"] == 75


def test_percentage_is_omitted_when_previous_period_is_too_small() -> None:
    frame = activities_frame([row(1, "2026-07-31T08:00:00Z", distance_km=10)])
    quality = get_run_quality_flags(frame)
    summary = get_period_summary(frame, quality, today=date(2026, 8, 1), days=7)
    assert summary["previous"]["distance_km"] == 0
    assert summary["distance_change_percent"] is None


def test_weekly_mileage_keeps_iso_week_together_across_year_boundary() -> None:
    frame = activities_frame(
        [
            row(1, "2025-12-29T08:00:00Z", distance_km=5),
            row(2, "2026-01-02T08:00:00Z", distance_km=7),
            row(3, "2026-01-05T08:00:00Z", distance_km=4),
        ]
    )
    weekly = get_weekly_mileage(frame, get_run_quality_flags(frame), today=date(2026, 1, 5))
    by_week = {point["week"]: point for point in weekly["points"]}
    assert by_week["2025-12-29"]["distance_km"] == pytest.approx(12)
    assert by_week["2025-12-29"]["runs"] == 2
    assert by_week["2026-01-05"]["distance_km"] == pytest.approx(4)
    assert by_week["2026-01-05"]["is_current"] is True


def test_quality_flags_keep_bad_rows_visible_but_exclude_unreliable_trends() -> None:
    frame = activities_frame(
        [
            row(1, "2026-07-20T08:00:00Z"),
            row(2, "2026-07-20T08:05:00Z", distance_km=6.1, minutes=33.5),
            row(3, "2026-07-21T08:00:00Z", distance_km=0, minutes=0),
            row(4, "2026-07-22T08:00:00Z", distance_km=0.8, minutes=6),
            row(5, "2026-07-23T08:00:00Z", heartrate=None),
            row(6, "2026-07-24T08:00:00Z", distance_km=10, minutes=20),
            row(7, "2026-07-25T08:00:00Z", distance_km=6, minutes=66, heartrate=120),
        ]
    )
    quality = get_run_quality_flags(frame)

    assert "posible duplicado" in quality["1"]["flags"]
    assert "posible duplicado" in quality["2"]["flags"]
    assert quality["2"]["duplicate_excluded"] is True
    assert "datos incompletos" in quality["3"]["flags"]
    assert "actividad corta" in quality["4"]["flags"]
    assert "sin pulso" in quality["5"]["flags"]
    assert "valor atípico" in quality["6"]["flags"]
    assert "posible caminata" in quality["7"]["flags"]
    assert all(quality[str(activity_id)]["excluded_from_trend"] for activity_id in range(2, 8))

    progress = build_run_progress(frame, today=date(2026, 8, 1))
    assert progress["lifetime"]["runs"] == 5  # zero row and one duplicate-like row do not count
    assert progress["quality_summary"]["duplicate_like_excluded_from_aggregates"] == 1


def test_aerobic_trend_uses_same_distance_group_and_ignores_missing_hr_and_outlier() -> None:
    frame = activities_frame(
        [
            row(1, "2026-05-25T08:00:00Z", minutes=33, heartrate=151, elevation_m=18),
            row(2, "2026-06-05T08:00:00Z", minutes=33, heartrate=149, elevation_m=20),
            row(3, "2026-07-10T08:00:00Z", minutes=33, heartrate=145, elevation_m=19),
            row(4, "2026-07-20T08:00:00Z", minutes=33, heartrate=143, elevation_m=21),
            row(5, "2026-07-22T08:00:00Z", distance_km=14, minutes=75, heartrate=140),
            row(6, "2026-07-23T08:00:00Z", minutes=33, heartrate=None),
            row(7, "2026-07-24T08:00:00Z", distance_km=6, minutes=15, heartrate=150),
        ]
    )
    quality = get_run_quality_flags(frame)
    trend = get_aerobic_efficiency_trend(frame, quality, today=date(2026, 8, 1))

    assert trend["selected_group"] == "5-8"
    assert trend["status"] == "improving"
    assert trend["insight"] == "Ritmo similar con menor pulso."
    assert {point["id"] for point in trend["points"]} == {"1", "2", "3", "4"}


def test_aerobic_trend_reports_insufficient_data_without_heart_rate() -> None:
    frame = activities_frame(
        [
            row(1, "2026-07-10T08:00:00Z", heartrate=None),
            row(2, "2026-07-20T08:00:00Z", heartrate=None),
        ]
    )
    quality = get_run_quality_flags(frame)
    trend = get_aerobic_efficiency_trend(frame, quality, today=date(2026, 8, 1))
    assert trend["status"] == "insufficient"
    assert trend["points"] == []


def test_consistency_states_are_deterministic() -> None:
    good_frame = activities_frame(
        [
            row(1, "2026-07-07T08:00:00Z"),
            row(2, "2026-07-14T08:00:00Z"),
            row(3, "2026-07-21T08:00:00Z"),
            row(4, "2026-07-29T08:00:00Z"),
        ]
    )
    good = get_consistency_status(good_frame, get_run_quality_flags(good_frame), today=date(2026, 8, 1))
    assert good["status"] == "good"
    assert good["consecutive_active_weeks"] == 4

    recovering_frame = activities_frame(
        [
            row(10, "2026-07-07T08:00:00Z"),
            row(11, "2026-07-21T08:00:00Z"),
            row(12, "2026-07-23T08:00:00Z"),
            row(13, "2026-07-29T08:00:00Z"),
            row(14, "2026-07-31T08:00:00Z"),
        ]
    )
    recovering = get_consistency_status(
        recovering_frame,
        get_run_quality_flags(recovering_frame),
        today=date(2026, 8, 1),
    )
    assert recovering["status"] == "recovering"

    irregular_frame = activities_frame(
        [
            row(20, "2026-07-05T08:00:00Z"),
            row(21, "2026-07-06T08:00:00Z"),
            row(22, "2026-07-31T08:00:00Z"),
        ]
    )
    irregular = get_consistency_status(
        irregular_frame,
        get_run_quality_flags(irregular_frame),
        today=date(2026, 8, 1),
    )
    assert irregular["status"] == "irregular"

    insufficient_frame = activities_frame([row(30, "2026-07-31T08:00:00Z")])
    insufficient = get_consistency_status(
        insufficient_frame,
        get_run_quality_flags(insufficient_frame),
        today=date(2026, 8, 1),
    )
    assert insufficient["status"] == "insufficient"


def test_long_run_progression_and_configured_target() -> None:
    frame = activities_frame(
        [
            row(1, "2026-07-12T08:00:00Z", distance_km=8, minutes=44),
            row(2, "2026-07-19T08:00:00Z", distance_km=8, minutes=44),
            row(3, "2026-07-26T08:00:00Z", distance_km=10, minutes=55),
        ]
    )
    progression = get_long_run_progression(
        frame,
        get_run_quality_flags(frame),
        today=date(2026, 8, 1),
        planned_target_km=12,
    )
    assert progression["recent_km"] == pytest.approx(10)
    assert progression["previous_week_km"] == pytest.approx(8)
    assert progression["change_km"] == pytest.approx(2)
    assert progression["progression_warning"] is True
    assert progression["target_progress_percent"] == 83


def test_training_summary_has_insufficient_state_for_too_few_recent_runs() -> None:
    frame = activities_frame([row(1, "2026-07-31T08:00:00Z")])
    progress = build_run_progress(frame, today=date(2026, 8, 1), planned_long_run_km=None)
    assert progress["summary"]["state"] == "Datos insuficientes"
    assert "suficientes" in progress["summary"]["text"]
