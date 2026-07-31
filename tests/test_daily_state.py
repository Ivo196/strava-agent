from datetime import date
import json

import api
import pytest


def exercise_row(exercise_type: str) -> dict[str, str]:
    return {
        "data_type": "exercise",
        "recorded_at": "2026-07-20T14:49:36.800Z",
        "source": "FITBIT",
        "value_json": json.dumps(
            {
                "exercise": {
                    "interval": {
                        "startTime": "2026-07-20T14:28:03.200Z",
                        "endTime": "2026-07-20T14:49:36.800Z",
                    },
                    "exerciseType": exercise_type,
                    "activeDuration": "1293.600s",
                    "displayName": exercise_type.title(),
                    "metricsSummary": {
                        "caloriesKcal": 133,
                        "averageHeartRateBeatsPerMinute": "103",
                        "activeZoneMinutes": "15",
                    },
                }
            }
        ),
    }


def test_fitbit_exercises_keep_bike_and_ignore_running() -> None:
    exercises = api._fitbit_exercises(
        [exercise_row("RUNNING"), exercise_row("BIKING")]
    )

    assert len(exercises) == 1
    assert exercises[0]["type"] == "BIKING"
    assert exercises[0]["duration_minutes"] == 22
    assert exercises[0]["zone_minutes"] == 15


def test_short_sleep_and_bike_never_recommend_another_intense_session() -> None:
    fitbit = {
        "sleep": {
            "goal": 8,
            "days": [
                {"date": "2026-07-18", "hours": 8.1},
                {"date": "2026-07-19", "hours": 6.3},
                {"date": "2026-07-20", "hours": 4.6},
            ],
        },
        "recovery_history": [
            {"date": "2026-07-20", "hrv": 103.3, "resting_hr": 46},
        ],
        "exercises": api._fitbit_exercises([exercise_row("BIKING")]),
    }
    apple_activity = {
        "count": 0,
        "moving_minutes": 0,
        "training_load": 0,
        "calories": None,
    }

    state = api._dashboard_daily_state(
        fitbit,
        apple_activity,
        date(2026, 7, 20),
    )

    assert state["calibration"] == {"ready": False, "nights": 3, "required": 7}
    assert state["morning_recovery"]["score"] is None
    assert state["morning_recovery"]["label"] == "Recuperación limitada"
    assert state["today_load"]["label"] == "Carga moderada"
    assert state["recommendation"]["title"] == "La carga de hoy ya es suficiente"
    assert state["recommendation"]["remaining"] == "Solo recuperación suave"


@pytest.mark.parametrize(
    ("scenario", "ready", "score", "load_level"),
    [
        ("recovered", True, "numeric", "none"),
        ("sleep-debt", True, 39, "none"),
        ("heavy-load", True, "numeric", "high"),
        ("calibrating", False, None, "none"),
    ],
)
def test_fake_dashboard_scenarios_recalculate_consistently(
    scenario: str,
    ready: bool,
    score: int | str | None,
    load_level: str,
) -> None:
    fitbit = {
        "sleep": {"goal": 8, "latest": None, "days": []},
        "recovery": {},
        "recovery_history": [],
        "steps": {"latest": None, "days": [], "goal": 10_000},
        "active_energy": {"latest": None, "days": [], "goal": 600},
        "total_calories": {"latest": None, "days": []},
        "daily_activity": {
            "latest": None,
            "days": [],
            "active_minutes_goal": 30,
            "zone_minutes_goal": 22,
        },
        "exercises": [],
    }
    demo = api._dashboard_demo_fitbit(
        fitbit,
        scenario,
        date(2026, 7, 20),
    )
    state = api._dashboard_daily_state(
        demo,
        {
            "count": 0,
            "moving_minutes": 0,
            "training_load": 0,
            "calories": None,
        },
        date(2026, 7, 20),
    )

    assert state["calibration"]["ready"] is ready
    if score == "numeric":
        assert isinstance(state["morning_recovery"]["score"], int)
    else:
        assert state["morning_recovery"]["score"] == score
    assert state["today_load"]["level"] == load_level
    if scenario == "recovered":
        assert state["morning_recovery"]["label"] == "Buena recuperación"
    if scenario == "heavy-load":
        assert state["recommendation"]["title"] == "Entrenamiento del día completado"


def test_performance_state_uses_six_signals_and_multisport_load() -> None:
    days = [f"2026-07-{day:02d}" for day in range(13, 21)]
    fitbit = {
        "sleep": {
            "goal": 8,
            "latest": {"date": days[-1], "hours": 7.5, "efficiency": 91},
            "days": [{"date": day, "hours": 7.5} for day in days],
        },
        "recovery_history": [
            {
                "date": day,
                "hrv": 95 + index,
                "resting_hr": 50,
                "respiratory_rate": 14.2,
                "temperature": 0.1,
                "oxygen": 96,
            }
            for index, day in enumerate(days)
        ],
        "exercises": [{
            "date": days[-1],
            "type": "STRENGTH_TRAINING",
            "duration_minutes": 40,
            "zone_minutes": 12,
        }],
        "daily_activity": {"days": [{
            "date": days[-1], "zone_minutes": 25, "active_minutes": 50,
        }]},
    }
    state = api._performance_daily_state(
        fitbit,
        {"count": 0, "moving_minutes": 0, "training_load": 0, "calories": 0},
        date(2026, 7, 20),
        activity_rows=[{
            "start_date_local": "2026-07-19T08:00:00+02:00",
            "sport_type": "Run",
            "moving_time_s": 3600,
            "suffer_score": 55,
        }],
        daily_checkins=[],
    )

    assert len(state["morning_recovery"]["factors"]) == 6
    assert state["confidence"]["available_signals"] == 6
    assert isinstance(state["morning_recovery"]["score"], int)
    assert state["load_7d"]["categories"]["running"] == 55
    assert state["load_7d"]["categories"]["strength"] > 0
    assert state["load_7d"]["risk"] == "Sin base"
    assert state["sleep_utility"]["debt_hours"] == 3.5
    assert state["journal"]["insights"] == []
