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
