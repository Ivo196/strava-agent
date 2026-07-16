from datetime import date

from strava_agent.training_plan import RACE_DATE, build_adaptive_plan


def test_plan_ends_on_race_day_and_contains_taper() -> None:
    metrics = {"average_weekly_28d": 35, "longest_42d": 18}
    plan = build_adaptive_plan(metrics, running_days=4, today=date(2026, 7, 15))

    assert plan[-1].end == RACE_DATE
    assert plan[-1].phase == "Carrera"
    assert plan[-1].long_run_km == 0.0
    assert plan[-1].target_km == 9.0
    assert any(week.phase == "Taper" for week in plan)
    assert all(len(week.sessions) >= 3 for week in plan)


def test_fixed_plan_keeps_three_running_days() -> None:
    metrics = {"average_weekly_28d": 40, "longest_42d": 20}
    plan = build_adaptive_plan(metrics, running_days=5, today=date(2026, 8, 3))
    build_week = next(week for week in plan if week.phase in {"Construcción", "Específica"})
    assert len(build_week.sessions) == 3
    assert build_week.sessions[0].startswith("Martes:")
    assert build_week.sessions[1].startswith("Jueves:")
    assert build_week.sessions[2].startswith("Domingo:")


def test_current_week_does_not_rewrite_remaining_run() -> None:
    metrics = {
        "average_weekly_28d": 15,
        "longest_42d": 10,
        "distance_current_week": 13.72,
        "runs_current_week": 2,
    }
    plan = build_adaptive_plan(
        metrics,
        running_days=3,
        goal_pace_seconds_km=295,
        today=date(2026, 7, 17),
    )

    assert plan[0].sessions[-1].startswith("Domingo: tirada larga de 10 km")
    assert "5:40–6:15 min/km" in plan[0].sessions[-1]
    assert plan[0].long_run_km == 10.0
    assert max(week.long_run_km for week in plan[:-1]) == 30.0
    assert [week.phase for week in plan[-4:-1]] == ["Taper", "Taper", "Taper"]
    assert max(week.target_km for week in plan[:-1]) == 50.0


def test_weekly_checkin_updates_status_without_changing_plan() -> None:
    metrics = {
        "average_weekly_28d": 20,
        "longest_42d": 12,
        "distance_current_week": 10,
        "runs_current_week": 2,
    }
    checkin = {"fatigue": 4, "knee_pain": 2, "effort_controlled": False}
    plan = build_adaptive_plan(metrics, running_days=3, goal_pace_seconds_km=295, checkin=checkin, today=date(2026, 7, 19))
    reference = build_adaptive_plan({}, running_days=3, goal_pace_seconds_km=295, today=date(2026, 7, 19))

    assert plan[0].completion_percentage == 50
    assert [(week.target_km, week.long_run_km, week.sessions) for week in plan] == [
        (week.target_km, week.long_run_km, week.sessions) for week in reference
    ]
    assert plan[0].risk_level == "Moderado"
    assert "inferior al 75%" in plan[0].change_reason
    assert "permanece fijo" in plan[0].change_reason


def test_red_flags_raise_warning_without_silently_rewriting_plan() -> None:
    metrics = {"average_weekly_28d": 30, "longest_42d": 18, "distance_current_week": 20, "runs_current_week": 3}
    checkin = {"fatigue": 3, "knee_pain": 6, "altered_gait": True}
    plan = build_adaptive_plan(metrics, running_days=3, goal_pace_seconds_km=295, checkin=checkin, today=date(2026, 7, 19))

    assert plan[0].risk_level == "Alto"
    assert plan[0].goal_status == "No respaldado"
    assert plan[1].target_km == 22
    assert plan[1].sessions[-1].startswith("Domingo: tirada larga de 12 km")
