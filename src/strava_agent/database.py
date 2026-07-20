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

CREATE TABLE IF NOT EXISTS apple_health_workouts (
    workout_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    raw_json TEXT NOT NULL,
    synced_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_apple_health_workouts_start_date
ON apple_health_workouts(start_date);

CREATE TABLE IF NOT EXISTS apple_health_metrics (
    metric_name TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT '',
    units TEXT NOT NULL DEFAULT '',
    value_json TEXT NOT NULL,
    synced_at TEXT NOT NULL,
    PRIMARY KEY(metric_name, recorded_at, source)
);

CREATE INDEX IF NOT EXISTS idx_apple_health_metrics_recorded_at
ON apple_health_metrics(recorded_at);

CREATE TABLE IF NOT EXISTS apple_health_syncs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    received_at TEXT NOT NULL,
    workouts_received INTEGER NOT NULL DEFAULT 0,
    metrics_received INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS google_health_oauth (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL DEFAULT '',
    token_expiry TEXT NOT NULL,
    scopes TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS google_health_data_points (
    data_type TEXT NOT NULL,
    point_key TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT '',
    value_json TEXT NOT NULL,
    synced_at TEXT NOT NULL,
    PRIMARY KEY(data_type, point_key)
);

CREATE INDEX IF NOT EXISTS idx_google_health_data_points_recorded_at
ON google_health_data_points(recorded_at);

CREATE INDEX IF NOT EXISTS idx_google_health_data_points_type_recorded
ON google_health_data_points(data_type, recorded_at);

CREATE INDEX IF NOT EXISTS idx_google_health_data_points_source_type_recorded
ON google_health_data_points(source, data_type, recorded_at);

CREATE TABLE IF NOT EXISTS google_health_syncs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    received_at TEXT NOT NULL,
    points_received INTEGER NOT NULL DEFAULT 0,
    data_types_received INTEGER NOT NULL DEFAULT 0,
    errors_json TEXT NOT NULL DEFAULT '[]'
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

    def data_version(self) -> str:
        """Return a cheap version token for every input that affects rendered pages."""
        with self.connect() as connection:
            row = connection.execute(
                """SELECT
                       COALESCE((SELECT MAX(synced_at) FROM activities), ''),
                       COALESCE((SELECT MAX(received_at) FROM apple_health_syncs), ''),
                       COALESCE((SELECT MAX(received_at) FROM google_health_syncs), ''),
                       COALESCE((SELECT MAX(updated_at) FROM google_health_oauth), ''),
                       COALESCE((SELECT MAX(updated_at) FROM athlete_profile), ''),
                       COALESCE((SELECT MAX(updated_at) FROM weekly_checkins), '')"""
            ).fetchone()
        return "|".join(str(value or "") for value in row)

    def find_matching_activity(
        self,
        start_date: str,
        distance_m: float,
        *,
        time_tolerance_seconds: int = 180,
        distance_tolerance_m: float = 300,
    ) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                """SELECT * FROM activities
                   WHERE ABS((julianday(start_date) - julianday(?)) * 86400) <= ?
                     AND ABS(distance_m - ?) <= ?
                   ORDER BY ABS((julianday(start_date) - julianday(?)) * 86400)
                   LIMIT 1""",
                (
                    start_date,
                    time_tolerance_seconds,
                    distance_m,
                    distance_tolerance_m,
                    start_date,
                ),
            ).fetchone()
        return dict(row) if row else None

    def upsert_apple_health_workout(self, workout: dict[str, Any]) -> bool:
        workout_id = str(workout["id"])
        with self.connect() as connection:
            existed = connection.execute(
                "SELECT 1 FROM apple_health_workouts WHERE workout_id = ?",
                (workout_id,),
            ).fetchone() is not None
            connection.execute(
                """INSERT INTO apple_health_workouts(
                       workout_id, name, start_date, end_date, raw_json, synced_at
                   ) VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(workout_id) DO UPDATE SET
                       name=excluded.name,
                       start_date=excluded.start_date,
                       end_date=excluded.end_date,
                       raw_json=excluded.raw_json,
                       synced_at=excluded.synced_at""",
                (
                    workout_id,
                    str(workout.get("name") or "Workout"),
                    str(workout.get("start") or ""),
                    str(workout.get("end") or ""),
                    json.dumps(workout),
                    utc_now_iso(),
                ),
            )
        return existed

    def list_apple_health_workouts(self) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT * FROM apple_health_workouts ORDER BY start_date DESC"
            ).fetchall()
        return [dict(row) for row in rows]

    def upsert_apple_health_metric(
        self,
        metric_name: str,
        measurement: dict[str, Any],
        *,
        default_units: str = "",
    ) -> bool:
        recorded_at = str(
            measurement.get("date")
            or measurement.get("sleepEnd")
            or measurement.get("sleepStart")
            or ""
        )
        source = str(measurement.get("source") or "")
        units = str(measurement.get("units") or default_units)
        with self.connect() as connection:
            existed = connection.execute(
                """SELECT 1 FROM apple_health_metrics
                   WHERE metric_name = ? AND recorded_at = ? AND source = ?""",
                (metric_name, recorded_at, source),
            ).fetchone() is not None
            connection.execute(
                """INSERT INTO apple_health_metrics(
                       metric_name, recorded_at, source, units, value_json, synced_at
                   ) VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(metric_name, recorded_at, source) DO UPDATE SET
                       units=excluded.units,
                       value_json=excluded.value_json,
                       synced_at=excluded.synced_at""",
                (
                    metric_name,
                    recorded_at,
                    source,
                    units,
                    json.dumps(measurement),
                    utc_now_iso(),
                ),
            )
        return existed

    def record_apple_health_sync(self, workouts_received: int, metrics_received: int) -> None:
        with self.connect() as connection:
            connection.execute(
                """INSERT INTO apple_health_syncs(received_at, workouts_received, metrics_received)
                   VALUES (?, ?, ?)""",
                (utc_now_iso(), workouts_received, metrics_received),
            )

    def apple_health_status(self) -> dict[str, Any]:
        with self.connect() as connection:
            sync = connection.execute(
                "SELECT * FROM apple_health_syncs ORDER BY id DESC LIMIT 1"
            ).fetchone()
            workout_count = connection.execute(
                "SELECT COUNT(*) AS count FROM apple_health_workouts"
            ).fetchone()
            metric_count = connection.execute(
                "SELECT COUNT(*) AS count FROM apple_health_metrics"
            ).fetchone()
        return {
            "last_sync": dict(sync) if sync else None,
            "workout_count": int(workout_count["count"]),
            "metric_count": int(metric_count["count"]),
        }

    def list_apple_health_metrics(self, metric_names: list[str]) -> list[dict[str, Any]]:
        if not metric_names:
            return []
        placeholders = ",".join("?" for _ in metric_names)
        with self.connect() as connection:
            rows = connection.execute(
                f"""SELECT metric_name, recorded_at, source, units, value_json
                    FROM apple_health_metrics
                    WHERE metric_name IN ({placeholders})
                    ORDER BY recorded_at""",
                metric_names,
            ).fetchall()
        return [dict(row) for row in rows]

    def save_google_health_tokens(self, token: dict[str, Any]) -> None:
        current = self.get_google_health_tokens()
        refresh_token = str(token.get("refresh_token") or (current or {}).get("refresh_token") or "")
        with self.connect() as connection:
            connection.execute(
                """INSERT INTO google_health_oauth(
                       id, access_token, refresh_token, token_expiry, scopes, updated_at
                   ) VALUES (1, ?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET
                       access_token=excluded.access_token,
                       refresh_token=excluded.refresh_token,
                       token_expiry=excluded.token_expiry,
                       scopes=excluded.scopes,
                       updated_at=excluded.updated_at""",
                (
                    str(token["access_token"]),
                    refresh_token,
                    str(token["token_expiry"]),
                    str(token.get("scope") or (current or {}).get("scopes") or ""),
                    utc_now_iso(),
                ),
            )

    def get_google_health_tokens(self) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM google_health_oauth WHERE id = 1"
            ).fetchone()
        return dict(row) if row else None

    def upsert_google_health_data_point(
        self,
        data_type: str,
        point_key: str,
        recorded_at: str,
        source: str,
        point: dict[str, Any],
    ) -> bool:
        with self.connect() as connection:
            existed = connection.execute(
                """SELECT 1 FROM google_health_data_points
                   WHERE data_type = ? AND point_key = ?""",
                (data_type, point_key),
            ).fetchone() is not None
            connection.execute(
                """INSERT INTO google_health_data_points(
                       data_type, point_key, recorded_at, source, value_json, synced_at
                   ) VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(data_type, point_key) DO UPDATE SET
                       recorded_at=excluded.recorded_at,
                       source=excluded.source,
                       value_json=excluded.value_json,
                       synced_at=excluded.synced_at""",
                (
                    data_type,
                    point_key,
                    recorded_at,
                    source,
                    json.dumps(point),
                    utc_now_iso(),
                ),
            )
        return existed

    def upsert_google_health_data_points_batch(
        self,
        data_type: str,
        points: list[tuple[str, str, str, dict[str, Any]]],
    ) -> tuple[int, int]:
        imported = updated = 0
        synced_at = utc_now_iso()
        with self.connect() as connection:
            for point_key, recorded_at, source, point in points:
                existed = connection.execute(
                    """SELECT 1 FROM google_health_data_points
                       WHERE data_type = ? AND point_key = ?""",
                    (data_type, point_key),
                ).fetchone() is not None
                connection.execute(
                    """INSERT INTO google_health_data_points(
                           data_type, point_key, recorded_at, source, value_json, synced_at
                       ) VALUES (?, ?, ?, ?, ?, ?)
                       ON CONFLICT(data_type, point_key) DO UPDATE SET
                           recorded_at=excluded.recorded_at,
                           source=excluded.source,
                           value_json=excluded.value_json,
                           synced_at=excluded.synced_at""",
                    (
                        data_type,
                        point_key,
                        recorded_at,
                        source,
                        json.dumps(point),
                        synced_at,
                    ),
                )
                if existed:
                    updated += 1
                else:
                    imported += 1
        return imported, updated

    def record_google_health_sync(
        self,
        points_received: int,
        data_types_received: int,
        errors: list[str],
    ) -> None:
        with self.connect() as connection:
            connection.execute(
                """INSERT INTO google_health_syncs(
                       received_at, points_received, data_types_received, errors_json
                   ) VALUES (?, ?, ?, ?)""",
                (utc_now_iso(), points_received, data_types_received, json.dumps(errors)),
            )

    def google_health_status(self) -> dict[str, Any]:
        with self.connect() as connection:
            sync = connection.execute(
                "SELECT * FROM google_health_syncs ORDER BY id DESC LIMIT 1"
            ).fetchone()
            total = connection.execute(
                "SELECT COUNT(*) AS count FROM google_health_data_points"
            ).fetchone()
            types = connection.execute(
                """SELECT data_type, COUNT(*) AS count,
                          MAX(recorded_at) AS latest
                   FROM google_health_data_points
                   GROUP BY data_type ORDER BY data_type"""
            ).fetchall()
            fitbit_sensor = connection.execute(
                """SELECT COUNT(*) AS count, MIN(recorded_at) AS first_at,
                          MAX(recorded_at) AS last_at
                   FROM google_health_data_points
                   WHERE source = 'FITBIT'
                     AND data_type = 'heart-rate'"""
            ).fetchone()
        last_sync = dict(sync) if sync else None
        if last_sync:
            last_sync["errors"] = json.loads(last_sync.pop("errors_json"))
        return {
            "connected": self.get_google_health_tokens() is not None,
            "last_sync": last_sync,
            "point_count": int(total["count"]),
            "fitbit_sensor_points": int(fitbit_sensor["count"]),
            "fitbit_sensor_first": fitbit_sensor["first_at"],
            "fitbit_sensor_last": fitbit_sensor["last_at"],
            "consolidated_points": int(total["count"]) - int(fitbit_sensor["count"]),
            "data_types": [dict(row) for row in types],
        }

    def list_google_health_data_points(
        self,
        data_types: list[str],
        *,
        source: str | None = None,
    ) -> list[dict[str, Any]]:
        if not data_types:
            return []
        placeholders = ",".join("?" for _ in data_types)
        source_filter = " AND source = ?" if source else ""
        parameters: list[Any] = [*data_types]
        if source:
            parameters.append(source)
        with self.connect() as connection:
            rows = connection.execute(
                f"""SELECT data_type, recorded_at, source, value_json
                    FROM google_health_data_points
                    WHERE data_type IN ({placeholders})
                    {source_filter}
                    ORDER BY recorded_at""",
                parameters,
            ).fetchall()
        return [dict(row) for row in rows]

    def list_latest_google_health_data_points(
        self,
        data_type: str,
        *,
        source: str,
        limit: int,
    ) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                """SELECT data_type, recorded_at, source, value_json
                   FROM google_health_data_points
                   WHERE data_type = ? AND source = ?
                   ORDER BY recorded_at DESC
                   LIMIT ?""",
                (data_type, source, limit),
            ).fetchall()
        return [dict(row) for row in reversed(rows)]
