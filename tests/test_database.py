from pathlib import Path

from strava_agent.database import Database


def sample_activity(activity_id: int = 123) -> dict:
    return {
        "id": activity_id,
        "name": "Rodaje fácil",
        "sport_type": "Run",
        "start_date": "2026-07-10T06:00:00Z",
        "start_date_local": "2026-07-10T08:00:00Z",
        "distance": 10000,
        "moving_time": 3000,
        "elapsed_time": 3100,
        "total_elevation_gain": 50,
        "average_speed": 3.333,
        "average_heartrate": 145,
        "has_heartrate": True,
    }


def test_activity_round_trip_and_enrichment(tmp_path: Path) -> None:
    database = Database(tmp_path / "coach.db")
    database.upsert_activity(sample_activity())
    assert database.activity_count() == 1
    assert len(database.list_runs_missing_streams()) == 1

    streams = {"heartrate": {"data": [140, 145]}, "velocity_smooth": {"data": [3.2, 3.3]}}
    database.upsert_activity(sample_activity(), detail_loaded=True, streams=streams)

    stored = database.get_activity(123)
    assert stored is not None
    assert stored["detail_loaded"] == 1
    assert stored["streams_loaded"] == 1
    assert database.list_runs_missing_streams() == []


def test_profile_round_trip(tmp_path: Path) -> None:
    database = Database(tmp_path / "coach.db")
    database.save_profile({"display_name": "Ivo", "running_days": 5, "goal_time_minutes": 207.46, "goal_pace_seconds_km": 295})
    profile = database.get_profile()
    assert profile["display_name"] == "Ivo"
    assert profile["running_days"] == 5
    assert profile["goal_time_minutes"] == 207.46
    assert profile["goal_pace_seconds_km"] == 295


def test_weekly_checkin_round_trip(tmp_path: Path) -> None:
    database = Database(tmp_path / "coach.db")
    database.save_weekly_checkin(
        {
            "week_start": "2026-07-13",
            "local_date": "2026-07-19",
            "fatigue": 3,
            "knee_pain": 1,
            "effort_controlled": True,
            "notes": "Semana controlada",
        }
    )

    checkin = database.latest_weekly_checkin()
    assert checkin is not None
    assert checkin["fatigue"] == 3
    assert checkin["knee_pain"] == 1


def test_plan_session_completion_round_trip(tmp_path: Path) -> None:
    database = Database(tmp_path / "coach.db")
    initial_version = database.data_version()

    database.set_plan_session_completed("2026-07-21", True)

    completions = database.list_plan_session_completions("2026-07-20", "2026-07-22")
    assert len(completions) == 1
    assert completions[0]["session_date"] == "2026-07-21"
    assert completions[0]["source"] == "manual"
    assert database.data_version() != initial_version

    database.set_plan_session_completed("2026-07-21", False)
    assert database.list_plan_session_completions() == []


def test_body_composition_history_upserts_by_date_and_updates_weight(tmp_path: Path) -> None:
    database = Database(tmp_path / "coach.db")
    database.save_profile({"display_name": "Ivo", "running_days": 3, "weight_kg": 78})
    initial_version = database.data_version()

    database.upsert_body_composition(
        {
            "measurement_date": "2026-07-22",
            "source": "InBody",
            "weight_kg": 81.7,
            "muscle_mass_kg": 23.0,
            "body_fat_percent": 47.8,
            "height_cm": 185,
            "age": 30,
            "sex": "M",
        }
    )
    database.upsert_body_composition(
        {
            "measurement_date": "2026-07-22",
            "source": "InBody",
            "weight_kg": 81.6,
            "muscle_mass_kg": 23.1,
            "body_fat_percent": 47.7,
        }
    )

    history = database.list_body_composition()
    assert len(history) == 1
    assert history[0]["weight_kg"] == 81.6
    assert database.get_profile()["weight_kg"] == 81.6
    assert database.get_profile()["height_cm"] == 185
    assert database.get_profile()["age"] == 30
    assert database.data_version() != initial_version


def test_finds_matching_activity_from_another_source(tmp_path: Path) -> None:
    database = Database(tmp_path / "coach.db")
    database.upsert_activity(sample_activity())

    match = database.find_matching_activity("2026-07-10T06:02:00+00:00", 10150)

    assert match is not None
    assert match["id"] == 123


def test_data_version_changes_when_training_data_changes(tmp_path: Path) -> None:
    database = Database(tmp_path / "coach.db")
    initial = database.data_version()

    database.upsert_activity(sample_activity())

    assert database.data_version() != initial
