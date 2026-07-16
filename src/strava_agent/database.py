from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Iterator


SCHEMA = """
CREATE TABLE IF NOT EXISTS athlete_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    display_name TEXT NOT NULL DEFAULT '',
    age INTEGER,
    height_cm REAL,
    weight_kg REAL,
    resting_hr INTEGER,
    max_hr INTEGER,
    running_days INTEGER NOT NULL DEFAULT 4,
    goal_time_minutes INTEGER,
    goal_pace_seconds_km INTEGER,
    injury_notes TEXT NOT NULL DEFAULT '',
    training_notes TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    sport_type TEXT NOT NULL,
    start_date TEXT NOT NULL,
    start_date_local TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT '',
    distance_m REAL NOT NULL DEFAULT 0,
    moving_time_s INTEGER NOT NULL DEFAULT 0,
    elapsed_time_s INTEGER NOT NULL DEFAULT 0,
    elevation_gain_m REAL NOT NULL DEFAULT 0,
    average_speed_mps REAL,
    max_speed_mps REAL,
    average_heartrate REAL,
    max_heartrate REAL,
    suffer_score REAL,
    calories REAL,
    has_heartrate INTEGER NOT NULL DEFAULT 0,
    device_name TEXT,
    detail_loaded INTEGER NOT NULL DEFAULT 0,
    streams_loaded INTEGER NOT NULL DEFAULT 0,
    raw_json TEXT NOT NULL,
    streams_json TEXT,
    synced_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activities_start_date ON activities(start_date);
CREATE INDEX IF NOT EXISTS idx_activities_sport_type ON activities(sport_type);

CREATE TABLE IF NOT EXISTS weekly_checkins (
    week_start TEXT PRIMARY KEY,
    local_date TEXT NOT NULL,
    fatigue INTEGER NOT NULL,
    knee_pain INTEGER NOT NULL,
    effort_controlled INTEGER NOT NULL DEFAULT 1,
    altered_gait INTEGER NOT NULL DEFAULT 0,
    swelling INTEGER NOT NULL DEFAULT 0,
    pain_walking INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
);
"""


def utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


class Database:
    def __init__(self, path: Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as connection:
            connection.executescript(SCHEMA)
            columns = {row["name"] for row in connection.execute("PRAGMA table_info(athlete_profile)")}
            if "training_notes" not in columns:
                connection.execute("ALTER TABLE athlete_profile ADD COLUMN training_notes TEXT NOT NULL DEFAULT ''")
            if "goal_pace_seconds_km" not in columns:
                connection.execute("ALTER TABLE athlete_profile ADD COLUMN goal_pace_seconds_km INTEGER")

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    def save_profile(self, profile: dict[str, Any]) -> None:
        values = (
            profile.get("display_name", ""),
            profile.get("age"),
            profile.get("height_cm"),
            profile.get("weight_kg"),
            profile.get("resting_hr"),
            profile.get("max_hr"),
            profile.get("running_days", 4),
            profile.get("goal_time_minutes"),
            profile.get("goal_pace_seconds_km"),
            profile.get("injury_notes", ""),
            profile.get("training_notes", ""),
            utc_now_iso(),
        )
        with self.connect() as connection:
            connection.execute(
                """INSERT INTO athlete_profile(
                       id, display_name, age, height_cm, weight_kg, resting_hr, max_hr,
                       running_days, goal_time_minutes, goal_pace_seconds_km, injury_notes, training_notes, updated_at
                   ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET
                       display_name=excluded.display_name,
                       age=excluded.age,
                       height_cm=excluded.height_cm,
                       weight_kg=excluded.weight_kg,
                       resting_hr=excluded.resting_hr,
                       max_hr=excluded.max_hr,
                       running_days=excluded.running_days,
                       goal_time_minutes=excluded.goal_time_minutes,
                       goal_pace_seconds_km=excluded.goal_pace_seconds_km,
                       injury_notes=excluded.injury_notes,
                       training_notes=excluded.training_notes,
                       updated_at=excluded.updated_at""",
                values,
            )

    def get_profile(self) -> dict[str, Any]:
        with self.connect() as connection:
            row = connection.execute("SELECT * FROM athlete_profile WHERE id = 1").fetchone()
        return dict(row) if row else {
            "display_name": "",
            "age": None,
            "height_cm": None,
            "weight_kg": None,
            "resting_hr": None,
            "max_hr": None,
            "running_days": 4,
            "goal_time_minutes": None,
            "goal_pace_seconds_km": None,
            "injury_notes": "",
            "training_notes": "",
        }

    def save_weekly_checkin(self, checkin: dict[str, Any]) -> None:
        with self.connect() as connection:
            connection.execute(
                """INSERT INTO weekly_checkins(
                       week_start, local_date, fatigue, knee_pain, effort_controlled,
                       altered_gait, swelling, pain_walking, notes, updated_at
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(week_start) DO UPDATE SET
                       local_date=excluded.local_date,
                       fatigue=excluded.fatigue,
                       knee_pain=excluded.knee_pain,
                       effort_controlled=excluded.effort_controlled,
                       altered_gait=excluded.altered_gait,
                       swelling=excluded.swelling,
                       pain_walking=excluded.pain_walking,
                       notes=excluded.notes,
                       updated_at=excluded.updated_at""",
                (
                    checkin["week_start"],
                    checkin["local_date"],
                    int(checkin["fatigue"]),
                    int(checkin["knee_pain"]),
                    int(bool(checkin.get("effort_controlled", True))),
                    int(bool(checkin.get("altered_gait", False))),
                    int(bool(checkin.get("swelling", False))),
                    int(bool(checkin.get("pain_walking", False))),
                    checkin.get("notes", ""),
                    utc_now_iso(),
                ),
            )

    def latest_weekly_checkin(self) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM weekly_checkins ORDER BY week_start DESC LIMIT 1"
            ).fetchone()
        return dict(row) if row else None

    def upsert_activity(
        self,
        activity: dict[str, Any],
        *,
        detail_loaded: bool = False,
        streams: dict[str, Any] | None = None,
    ) -> None:
        activity_id = int(activity["id"])
        existing = self.get_activity(activity_id)
        detail_flag = int(detail_loaded or bool(existing and existing["detail_loaded"]))
        streams_flag = int(streams is not None or bool(existing and existing["streams_loaded"]))
        streams_json = json.dumps(streams) if streams is not None else (existing["streams_json"] if existing else None)

        fields = (
            activity_id,
            activity.get("name") or "Actividad sin nombre",
            activity.get("sport_type") or activity.get("type") or "Unknown",
            activity.get("start_date") or "",
            activity.get("start_date_local") or activity.get("start_date") or "",
            activity.get("timezone") or "",
            float(activity.get("distance") or 0),
            int(activity.get("moving_time") or 0),
            int(activity.get("elapsed_time") or 0),
            float(activity.get("total_elevation_gain") or 0),
            activity.get("average_speed"),
            activity.get("max_speed"),
            activity.get("average_heartrate"),
            activity.get("max_heartrate"),
            activity.get("suffer_score"),
            activity.get("calories"),
            int(bool(activity.get("has_heartrate"))),
            activity.get("device_name"),
            detail_flag,
            streams_flag,
            json.dumps(activity),
            streams_json,
            utc_now_iso(),
        )
        with self.connect() as connection:
            connection.execute(
                """INSERT INTO activities VALUES (
                       ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                   ) ON CONFLICT(id) DO UPDATE SET
                       name=excluded.name,
                       sport_type=excluded.sport_type,
                       start_date=excluded.start_date,
                       start_date_local=excluded.start_date_local,
                       timezone=excluded.timezone,
                       distance_m=excluded.distance_m,
                       moving_time_s=excluded.moving_time_s,
                       elapsed_time_s=excluded.elapsed_time_s,
                       elevation_gain_m=excluded.elevation_gain_m,
                       average_speed_mps=excluded.average_speed_mps,
                       max_speed_mps=excluded.max_speed_mps,
                       average_heartrate=excluded.average_heartrate,
                       max_heartrate=excluded.max_heartrate,
                       suffer_score=excluded.suffer_score,
                       calories=excluded.calories,
                       has_heartrate=excluded.has_heartrate,
                       device_name=COALESCE(excluded.device_name, activities.device_name),
                       detail_loaded=excluded.detail_loaded,
                       streams_loaded=excluded.streams_loaded,
                       raw_json=excluded.raw_json,
                       streams_json=excluded.streams_json,
                       synced_at=excluded.synced_at""",
                fields,
            )

    def get_activity(self, activity_id: int) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute("SELECT * FROM activities WHERE id = ?", (activity_id,)).fetchone()
        return dict(row) if row else None

    def list_activities(self) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute("SELECT * FROM activities ORDER BY start_date DESC").fetchall()
        return [dict(row) for row in rows]

    def list_runs_missing_streams(self, limit: int = 75) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                """SELECT * FROM activities
                   WHERE sport_type IN ('Run', 'TrailRun', 'VirtualRun') AND streams_loaded = 0
                   ORDER BY start_date DESC LIMIT ?""",
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]

    def activity_count(self) -> int:
        with self.connect() as connection:
            row = connection.execute("SELECT COUNT(*) AS count FROM activities").fetchone()
        return int(row["count"])
