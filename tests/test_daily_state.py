from datetime import UTC, date, datetime, timedelta
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
            "start_date_local": "2026-07-20T08:00:00+02:00",
            "sport_type": "Run",
            "moving_time_s": 3600,
            "suffer_score": 55,
        }],
        daily_checkins=[],
    )

    assert len(state["morning_recovery"]["factors"]) == 6
    assert all("numeric_value" in factor for factor in state["morning_recovery"]["factors"])
    assert all("impact" in factor for factor in state["morning_recovery"]["factors"])
    assert state["confidence"]["available_signals"] == 6
    assert isinstance(state["morning_recovery"]["score"], int)
    assert state["load_7d"]["categories"]["running"] == 55
    assert state["load_7d"]["categories"]["strength"] > 0
    assert state["load_7d"]["risk"] == "Sin base"
    assert state["load_7d"]["week_start"] == "2026-07-14"
    assert state["load_7d"]["week_end"] == "2026-07-20"
    assert [day["date"] for day in state["load_7d"]["trend"]] == [
        "2026-07-14",
        "2026-07-15",
        "2026-07-16",
        "2026-07-17",
        "2026-07-18",
        "2026-07-19",
        "2026-07-20",
    ]
    assert len(state["load_7d"]["history"]) == 28
    assert state["load_7d"]["today_status"] == "Sin base"
    assert state["sleep_utility"]["debt_hours"] == 3.5
    assert state["recovery_guidance"]["level"] in {"go", "flex", "limit", "uncertain"}
    assert state["journal"]["insights"] == []


def test_performance_state_uses_previous_night_without_rendering_false_gaps() -> None:
    fitbit = {
        "sleep": {
            "goal": 8,
            "days": [
                {"date": f"2026-07-{day:02d}", "hours": 7.5}
                for day in range(25, 32)
            ],
        },
        "recovery_history": [
            {
                "date": f"2026-07-{day:02d}",
                "hrv": 92 + day % 3,
                "resting_hr": 50,
                "respiratory_rate": 14.2,
                "temperature": 0.1,
                "oxygen": 96,
            }
            for day in range(25, 32)
        ],
        "exercises": [],
        "daily_activity": {"days": []},
    }

    state = api._performance_daily_state(
        fitbit,
        {"count": 0, "moving_minutes": 0, "training_load": 0, "calories": 0},
        date(2026, 8, 1),
        activity_rows=[],
        daily_checkins=[],
    )

    assert state["morning_recovery"]["sleep_hours"] == 7.5
    assert state["confidence"]["available_signals"] == 6
    assert all(factor["value"] != "Sin dato" for factor in state["morning_recovery"]["factors"])
    assert all(factor["measurement_date"] == "2026-07-31" for factor in state["morning_recovery"]["factors"])
    assert all(factor["detail"].startswith("Última noche") for factor in state["morning_recovery"]["factors"])
    assert state["physiological_stress"]["score"] is not None
    assert state["physiological_stress"]["source"].startswith("Estimación nocturna")
    assert 0 <= state["energy"]["score"] <= 100
    assert state["load_7d"]["target_min"] is None
    assert state["load_7d"]["target_max"] is None


def test_fitbit_stress_is_calculated_automatically_from_day_and_night_signals() -> None:
    fitbit = {
        "sleep": {
            "goal": 8,
            "days": [
                {"date": f"2026-07-{day:02d}", "hours": 7.6}
                for day in range(25, 32)
            ],
        },
        "recovery_history": [
            {
                "date": f"2026-07-{day:02d}",
                "hrv": 90 + day % 3,
                "resting_hr": 50,
                "respiratory_rate": 14.5,
                "temperature": 0.1,
                "oxygen": 96,
            }
            for day in range(25, 32)
        ],
        "heart_rate": {
            "date": "2026-08-01",
            "latest": 72,
            "coverage_hours": 20,
            "series": [
                {"time": f"{hour:02d}:00", "bpm": bpm}
                for hour, bpm in enumerate([58, 61, 64, 69, 71, 72, 70, 73])
            ],
            "stress_series": [
                {"time": f"{hour:02d}:00", "bpm": bpm}
                for hour, bpm in enumerate([58, 61, 64, 69, 71, 72, 70, 73])
            ],
            "stress_coverage_hours": 6,
            "stress_classification_available": True,
            "stress_excluded_samples": 24,
        },
        "exercises": [],
        "daily_activity": {"days": []},
    }

    state = api._performance_daily_state(
        fitbit,
        {"count": 0, "moving_minutes": 0, "training_load": 0, "calories": 0},
        date(2026, 8, 1),
        activity_rows=[],
        daily_checkins=[],
    )

    stress = state["physiological_stress"]
    assert stress["score"] is not None
    assert stress["source"].startswith("Estimación Google Health v4")
    assert stress["components"]["daytime_activation"] is not None
    assert stress["components"]["nightly_strain"] is not None
    assert stress["components"]["coverage_hours"] == 6
    assert stress["components"]["total_coverage_hours"] == 20
    assert stress["components"]["classified"] is True
    assert stress["components"]["excluded_samples"] == 24
    assert "60%" in stress["method"]


def test_stress_uses_personal_resting_baseline_instead_of_todays_rhr() -> None:
    days = [f"2026-08-{day:02d}" for day in range(1, 11)]

    def calculate(today_rhr: float) -> dict[str, object]:
        recovery_history = [
            {
                "date": day,
                "hrv": 90,
                "resting_hr": 50,
                "respiratory_rate": 15,
                "temperature": 33.5,
                "oxygen": 96,
            }
            for day in days[:-1]
        ]
        recovery_history.append({
            "date": days[-1],
            "hrv": 90,
            "resting_hr": today_rhr,
            "respiratory_rate": 15,
            "temperature": 33.5,
            "oxygen": 96,
        })
        fitbit = {
            "sleep": {
                "goal": 8,
                "days": [{"date": day, "hours": 8} for day in days],
            },
            "recovery_history": recovery_history,
            "heart_rate": {
                "date": days[-1],
                "latest": 70,
                "coverage_hours": 6,
                "stress_coverage_hours": 6,
                "stress_classification_available": True,
                "stress_excluded_samples": 0,
                "stress_series": [
                    {"time": f"{hour:02d}:00", "bpm": 70}
                    for hour in range(6, 12)
                ],
            },
            "exercises": [],
        }
        return api._performance_daily_state(
            fitbit,
            {"count": 0, "moving_minutes": 0, "training_load": 0, "calories": 0},
            date(2026, 8, 10),
            activity_rows=[],
            daily_checkins=[],
        )["physiological_stress"]

    baseline_day = calculate(50)
    elevated_rhr_day = calculate(60)

    assert baseline_day["components"]["resting_reference_bpm"] == 50
    assert elevated_rhr_day["components"]["resting_reference_bpm"] == 50
    assert (
        baseline_day["components"]["daytime_activation"]
        == elevated_rhr_day["components"]["daytime_activation"]
    )
    assert elevated_rhr_day["score"] > baseline_day["score"]


def test_energy_is_unknown_when_recovery_and_stress_are_missing() -> None:
    state = api._performance_daily_state(
        {
            "sleep": {"goal": 8, "days": []},
            "recovery_history": [],
            "exercises": [],
        },
        {"count": 0, "moving_minutes": 0, "training_load": 0, "calories": 0},
        date(2026, 8, 10),
        activity_rows=[],
        daily_checkins=[],
    )

    assert state["morning_recovery"]["score"] is None
    assert state["physiological_stress"]["score"] is None
    assert state["energy"] == {
        "score": None,
        "label": "Sin datos",
        "recharged": None,
        "used": None,
        "explanation": "Faltan señales suficientes de recuperación o activación.",
        "method": "Balance estimado entre recuperación nocturna, carga de hoy y activación fisiológica.",
    }


def test_recovery_baseline_uses_median_to_resist_one_outlier() -> None:
    days = [f"2026-08-{day:02d}" for day in range(5, 11)]
    hrv_values = [100, 101, 5, 102, 100, 101]
    fitbit = {
        "sleep": {
            "goal": 8,
            "days": [{"date": day, "hours": 8} for day in days],
        },
        "recovery_history": [
            {"date": day, "hrv": hrv}
            for day, hrv in zip(days, hrv_values)
        ],
        "exercises": [],
    }

    state = api._performance_daily_state(
        fitbit,
        {"count": 0, "moving_minutes": 0, "training_load": 0, "calories": 0},
        date(2026, 8, 10),
        activity_rows=[],
        daily_checkins=[],
    )
    hrv = next(
        factor
        for factor in state["morning_recovery"]["factors"]
        if factor["key"] == "hrv"
    )

    assert hrv["baseline"] == 100
    assert hrv["score"] == 52


def test_recovery_score_is_provisional_before_seven_nights() -> None:
    fitbit = {
        "sleep": {
            "goal": 8,
            "days": [
                {"date": f"2026-07-{day:02d}", "hours": 7.4}
                for day in range(26, 32)
            ],
        },
        "recovery_history": [
            {
                "date": f"2026-07-{day:02d}",
                "hrv": 88 + day % 4,
                "resting_hr": 51,
                "respiratory_rate": 14.3,
                "temperature": 0.1,
                "oxygen": 96,
            }
            for day in range(26, 32)
        ],
        "exercises": [],
        "daily_activity": {"days": []},
    }

    state = api._performance_daily_state(
        fitbit,
        {"count": 0, "moving_minutes": 0, "training_load": 0, "calories": 0},
        date(2026, 8, 1),
        activity_rows=[],
        daily_checkins=[],
    )

    assert state["calibration"]["ready"] is False
    assert state["confidence"]["available_signals"] == 6
    assert isinstance(state["morning_recovery"]["score"], int)
    assert state["morning_recovery"]["provisional"] is True
    assert state["morning_recovery"]["summary"].startswith("Estimación provisional")
    assert state["confidence"]["note"].startswith("Estimación provisional")


def test_recovery_explanation_uses_real_baseline_differences() -> None:
    hrv = api._factor_comparison("hrv", 105, 100, sleep_goal=8)
    resting = api._factor_comparison("resting_hr", 53, 50, sleep_goal=8)
    temperature = api._factor_comparison("temperature", 0.1, 0.0, sleep_goal=8)

    assert hrv["impact"] == "help"
    assert hrv["difference_text"] == "+5% vs base"
    assert resting["impact"] == "brake"
    assert resting["difference_text"] == "+3 bpm vs base"
    assert temperature["impact"] == "help"
    assert temperature["status_label"] == "Estable"


def test_recovery_guidance_limits_training_when_activation_is_high() -> None:
    guidance = api._recovery_guidance(
        recovery_score=72,
        activation_score=78,
        sleep_hours=7.8,
        sleep_goal=8,
        sleep_debt=0.8,
        load={"current_today": 10, "target_max": 20, "risk": "Bajo"},
        confidence="Alta",
        factors=[],
    )

    assert guidance["level"] == "limit"
    assert guidance["title"] == "Baja la exigencia hoy"
    assert "activación fisiológica" in guidance["body"]


def test_weekly_load_never_claims_training_happened_today() -> None:
    guidance = api._recovery_guidance(
        recovery_score=74,
        activation_score=38,
        sleep_hours=8.8,
        sleep_goal=8,
        sleep_debt=0,
        load={"current_today": 0, "target_max": 20, "risk": "Alto"},
        confidence="Alta",
        factors=[],
    )

    assert guidance["level"] == "limit"
    assert guidance["title"] == "Protege la próxima sesión"
    assert guidance["body"].startswith("Hoy no hay entrenamiento registrado")
    assert guidance["reasons"] == ["Carga semanal por encima de tu base"]


def test_daily_movement_is_not_counted_as_training_load() -> None:
    load = api._aggregate_load_7d(
        [],
        {
            "exercises": [],
            "daily_activity": {"days": [{
                "date": "2026-08-09",
                "zone_minutes": 24,
                "active_minutes": 35,
            }]},
        },
        date(2026, 8, 9),
    )

    assert load["total"] == 0
    assert load["history"][-1] == {"date": "2026-08-09", "total": 0}
    assert load["trend"][-1]["total"] == 0


def test_load_7d_is_a_rolling_window_and_requires_three_baselines() -> None:
    one_baseline = api._aggregate_load_7d(
        [
            {
                "start_date_local": "2026-08-02T08:00:00+02:00",
                "sport_type": "Run",
                "moving_time_s": 3600,
                "suffer_score": 70,
            },
            {
                "start_date_local": "2026-08-04T08:00:00+02:00",
                "sport_type": "Run",
                "moving_time_s": 1800,
                "suffer_score": 20,
            },
        ],
        {"exercises": []},
        date(2026, 8, 10),
    )

    assert one_baseline["window_start"] == "2026-08-04"
    assert one_baseline["window_end"] == "2026-08-10"
    assert [day["date"] for day in one_baseline["trend"]] == [
        f"2026-08-{day:02d}" for day in range(4, 11)
    ]
    assert one_baseline["total"] == 20
    assert one_baseline["baseline_weeks"] == 1
    assert one_baseline["baseline"] is None
    assert one_baseline["ratio"] is None
    assert one_baseline["risk"] == "Sin base"

    three_baselines = api._aggregate_load_7d(
        [
            {
                "start_date_local": f"2026-07-{day:02d}T08:00:00+02:00",
                "sport_type": "Run",
                "moving_time_s": 3600,
                "suffer_score": 70,
            }
            for day in (19, 26)
        ] + [{
            "start_date_local": "2026-08-02T08:00:00+02:00",
            "sport_type": "Run",
            "moving_time_s": 3600,
            "suffer_score": 70,
        }],
        {"exercises": []},
        date(2026, 8, 10),
    )

    assert three_baselines["baseline_weeks"] == 3
    assert three_baselines["baseline"] == 70
    assert three_baselines["ratio"] == 0
    assert three_baselines["risk"] == "Bajo"


def test_fitbit_insights_load_the_full_recent_heart_rate_window(monkeypatch: pytest.MonkeyPatch) -> None:
    start = datetime(2026, 8, 1, 6, tzinfo=UTC)
    heart_rows = []
    for minute in range(601):
        recorded = start + timedelta(minutes=minute)
        heart_rows.append({
            "data_type": "heart-rate",
            "recorded_at": recorded.isoformat().replace("+00:00", "Z"),
            "source": "FITBIT",
            "value_json": json.dumps({
                "dataSource": {
                    "platform": "FITBIT",
                    "recordingMethod": "PASSIVELY_MEASURED",
                },
                "heartRate": {
                    "sampleTime": {
                        "physicalTime": recorded.isoformat().replace("+00:00", "Z"),
                        "civilTime": {
                            "date": {"year": 2026, "month": 8, "day": 1},
                            "time": {"hours": recorded.hour, "minutes": recorded.minute},
                        },
                    },
                    "beatsPerMinute": "62",
                },
            }),
        })

    class WindowDatabase:
        def list_google_health_data_points_since(self, *args: object, **kwargs: object) -> list[dict[str, str]]:
            return heart_rows

        def list_latest_google_health_data_points(self, *args: object, **kwargs: object) -> list[dict[str, str]]:
            raise AssertionError("No debe truncar el pulso a las últimas 5.000 muestras")

        def list_google_health_data_points(self, *args: object, **kwargs: object) -> list[dict[str, str]]:
            return []

    monkeypatch.setattr(api, "database", WindowDatabase())
    fitbit = api._fitbit_insights({
        "fitbit_sensor_first": heart_rows[0]["recorded_at"],
        "fitbit_sensor_last": heart_rows[-1]["recorded_at"],
        "fitbit_sensor_points": len(heart_rows),
    })

    assert fitbit["heart_rate"]["coverage_hours"] == 10
    assert fitbit["heart_rate"]["stress_coverage_hours"] == 10
    assert len(fitbit["heart_rate"]["series"]) <= 96


def test_fitbit_stress_series_excludes_sleep_and_active_intervals(monkeypatch: pytest.MonkeyPatch) -> None:
    start = datetime(2026, 8, 1, 8, tzinfo=UTC)
    heart_rows = []
    for minute in range(241):
        recorded = start + timedelta(minutes=minute)
        heart_rows.append({
            "data_type": "heart-rate",
            "recorded_at": recorded.isoformat().replace("+00:00", "Z"),
            "source": "FITBIT",
            "value_json": json.dumps({
                "dataSource": {
                    "platform": "FITBIT",
                    "recordingMethod": "PASSIVELY_MEASURED",
                },
                "heartRate": {
                    "sampleTime": {
                        "physicalTime": recorded.isoformat().replace("+00:00", "Z"),
                        "civilTime": {
                            "date": {"year": 2026, "month": 8, "day": 1},
                            "time": {"hours": recorded.hour, "minutes": recorded.minute},
                        },
                    },
                    "beatsPerMinute": "64",
                },
            }),
        })

    def context_row(data_type: str, payload_name: str, start_hour: int, end_hour: int, **payload: str) -> dict[str, str]:
        return {
            "data_type": data_type,
            "recorded_at": f"2026-08-01T{start_hour:02d}:00:00Z",
            "source": "FITBIT",
            "value_json": json.dumps({
                "dataSource": {"platform": "FITBIT", "recordingMethod": "DERIVED"},
                payload_name: {
                    "interval": {
                        "startTime": f"2026-08-01T{start_hour:02d}:00:00Z",
                        "endTime": f"2026-08-01T{end_hour:02d}:00:00Z",
                    },
                    **payload,
                },
            }),
        }

    context_rows = [
        context_row("sedentary-period", "sedentaryPeriod", 8, 10),
        context_row(
            "activity-level",
            "activityLevel",
            10,
            11,
            activityLevelType="MODERATELY_ACTIVE",
        ),
        context_row("sleep", "sleep", 11, 12),
    ]

    class ContextDatabase:
        def list_google_health_data_points_since(self, *args: object, **kwargs: object) -> list[dict[str, str]]:
            return heart_rows

        def list_latest_google_health_data_points(self, *args: object, **kwargs: object) -> list[dict[str, str]]:
            return []

        def list_google_health_data_points(self, *args: object, **kwargs: object) -> list[dict[str, str]]:
            return context_rows

    monkeypatch.setattr(api, "database", ContextDatabase())
    fitbit = api._fitbit_insights({
        "fitbit_sensor_first": heart_rows[0]["recorded_at"],
        "fitbit_sensor_last": heart_rows[-1]["recorded_at"],
        "fitbit_sensor_points": len(heart_rows),
    })

    heart_rate = fitbit["heart_rate"]
    assert heart_rate["stress_classification_available"] is True
    assert heart_rate["stress_coverage_hours"] == 2
    assert heart_rate["stress_excluded_samples"] == 121
    assert heart_rate["stress_series"][-1]["time"] == "09:59"
