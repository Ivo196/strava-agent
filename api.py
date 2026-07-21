from __future__ import annotations

import asyncio
import sys
import json
import math
import secrets
from bisect import bisect_left
from copy import deepcopy
from contextlib import asynccontextmanager, suppress
from datetime import date, datetime, timedelta
from pathlib import Path
from threading import Lock
from time import monotonic
from typing import Any, Literal

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field


ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "src"))

from strava_agent.config import get_settings
from strava_agent.apple_health import import_health_auto_export, result_dict
from strava_agent.ai_coach import ask_coach, build_coach_context
from strava_agent.database import Database
from strava_agent.metrics import (
    activities_frame,
    dashboard_metrics,
    format_pace,
    readiness_assessment,
    weekly_summary,
)
from strava_agent.google_health import (
    GoogleHealthCredentials,
    GoogleHealthService,
    normalized_recovery_value,
)
from strava_agent.training_plan import RACE_DATE, build_adaptive_plan


settings = get_settings()
database = Database(settings.database_path)
GOOGLE_HEALTH_SYNC_INTERVAL = timedelta(hours=6)
GOOGLE_HEALTH_RETRY_INTERVAL = timedelta(minutes=15)
google_health_scheduler_state: dict[str, Any] = {
    "running": False,
    "last_attempt": None,
    "last_error": None,
}
google_health_sync_lock = Lock()
health_insights_cache_lock = Lock()
health_insights_cache: dict[str, Any] = {
    "expires_at": 0.0,
    "activity_id": None,
    "analysis_date": None,
    "data_version": None,
    "value": None,
}
HEALTH_INSIGHTS_CACHE_SECONDS = 5 * 60
DASHBOARD_DEMO_SCENARIOS = {
    "recovered",
    "sleep-debt",
    "heavy-load",
    "calibrating",
}


def _invalidate_health_insights_cache() -> None:
    with health_insights_cache_lock:
        health_insights_cache.update(
            {
                "expires_at": 0.0,
                "activity_id": None,
                "analysis_date": None,
                "data_version": None,
                "value": None,
            }
        )


def _next_google_health_sync(status: dict[str, Any] | None = None) -> datetime | None:
    status = status or database.google_health_status()
    if not settings.google_health_is_configured or not status["connected"]:
        return None
    last_sync = status.get("last_sync")
    if not last_sync:
        return datetime.now().astimezone()
    recorded = datetime.fromisoformat(
        str(last_sync["received_at"]).replace("Z", "+00:00")
    )
    if recorded.tzinfo is None:
        recorded = recorded.astimezone()
    return recorded + GOOGLE_HEALTH_SYNC_INTERVAL


def _google_health_auto_sync_status(status: dict[str, Any]) -> dict[str, Any]:
    next_sync = _next_google_health_sync(status)
    return {
        "enabled": True,
        "interval_hours": 6,
        "next_sync": next_sync.isoformat() if next_sync else None,
        **google_health_scheduler_state,
    }


async def _google_health_sync_loop() -> None:
    while True:
        status = database.google_health_status()
        next_sync = _next_google_health_sync(status)
        if next_sync is None:
            await asyncio.sleep(300)
            continue
        now = datetime.now().astimezone()
        delay = (next_sync - now).total_seconds()
        if delay > 0:
            await asyncio.sleep(delay)
            continue
        google_health_scheduler_state["running"] = True
        google_health_scheduler_state["last_attempt"] = now.isoformat()
        google_health_scheduler_state["last_error"] = None
        try:
            await asyncio.to_thread(_sync_google_health_now)
        except Exception as error:
            google_health_scheduler_state["last_error"] = str(error)
            await asyncio.sleep(GOOGLE_HEALTH_RETRY_INTERVAL.total_seconds())
        finally:
            google_health_scheduler_state["running"] = False


@asynccontextmanager
async def lifespan(_: FastAPI):
    scheduler = asyncio.create_task(_google_health_sync_loop())
    try:
        yield
    finally:
        scheduler.cancel()
        with suppress(asyncio.CancelledError):
            await scheduler


app = FastAPI(title="PaceOS API", version="0.3.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class ProfileInput(BaseModel):
    display_name: str = ""
    age: int | None = Field(default=None, ge=16, le=90)
    height_cm: float | None = Field(default=None, ge=130, le=220)
    weight_kg: float | None = Field(default=None, ge=40, le=180)
    resting_hr: int | None = Field(default=None, ge=30, le=100)
    max_hr: int | None = Field(default=None, ge=100, le=230)
    running_days: int = Field(default=4, ge=3, le=6)
    goal_time_minutes: float | None = Field(default=None, ge=120, le=420)
    goal_pace_seconds_km: int | None = Field(default=None, ge=180, le=600)
    injury_notes: str = ""
    training_notes: str = ""


class CoachMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class CoachChatInput(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[CoachMessage] = Field(default_factory=list, max_length=10)
    local_date: date | None = None


class WeeklyCheckinInput(BaseModel):
    local_date: date
    fatigue: int = Field(ge=1, le=5)
    knee_pain: int = Field(ge=0, le=10)
    effort_controlled: bool = True
    altered_gait: bool = False
    swelling: bool = False
    pain_walking: bool = False
    notes: str = Field(default="", max_length=1000)


class PlanCompletionInput(BaseModel):
    session_date: date
    completed: bool


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/apple-health/status")
def apple_health_status() -> dict[str, Any]:
    return {
        "configured": bool(settings.apple_health_api_key),
        "endpoint": "/api/import/apple-health",
        **database.apple_health_status(),
    }


def _google_health_service() -> GoogleHealthService:
    if not settings.google_health_is_configured:
        raise HTTPException(
            status_code=503,
            detail="Agrega las credenciales de Google Health en data/google-health-client.json.",
        )
    try:
        credentials = GoogleHealthCredentials.load(settings.google_health_credentials_file)
    except ValueError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    return GoogleHealthService(credentials, database)


def _sync_google_health_now() -> dict[str, Any]:
    with google_health_sync_lock:
        result = _google_health_service().sync()
        _invalidate_health_insights_cache()
        return result


@app.get("/api/google-health/status")
def google_health_status() -> dict[str, Any]:
    status = database.google_health_status()
    return {
        "configured": settings.google_health_is_configured,
        **status,
        "auto_sync": _google_health_auto_sync_status(status),
    }


@app.get("/api/data-version")
def data_version() -> dict[str, str]:
    return {"version": database.data_version()}


@app.get("/api/google-health/connect")
def google_health_connect() -> RedirectResponse:
    return RedirectResponse(_google_health_service().authorization_url())


@app.get("/api/google-health/callback")
def google_health_callback(
    background_tasks: BackgroundTasks,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
) -> RedirectResponse:
    target = f"{settings.paceos_frontend_url}/settings"
    if error:
        return RedirectResponse(f"{target}?google_health=denied")
    if not code or not state:
        return RedirectResponse(f"{target}?google_health=invalid")
    service = _google_health_service()
    try:
        service.exchange_code(code, state)
    except ValueError as sync_error:
        detail = str(sync_error).lower()
        reason = "scope" if "scope" in detail or "permiso" in detail else "error"
        return RedirectResponse(f"{target}?google_health={reason}")
    background_tasks.add_task(_sync_google_health_now)
    return RedirectResponse(f"{target}?google_health=connected")


@app.post("/api/google-health/sync")
def sync_google_health() -> dict[str, Any]:
    try:
        return _sync_google_health_now()
    except ValueError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@app.post("/api/import/apple-health")
async def import_apple_health(
    request: Request,
    x_api_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    if not settings.apple_health_api_key:
        raise HTTPException(
            status_code=503,
            detail="Configura APPLE_HEALTH_API_KEY en .env y reinicia la API.",
        )
    bearer = authorization.removeprefix("Bearer ").strip() if authorization else ""
    supplied_key = x_api_key or bearer
    if not supplied_key or not secrets.compare_digest(supplied_key, settings.apple_health_api_key):
        raise HTTPException(status_code=401, detail="Clave de Apple Health inválida.")
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > 25_000_000:
            raise HTTPException(status_code=413, detail="El envío supera el límite de 25 MB.")
    try:
        payload = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise HTTPException(status_code=400, detail="El cuerpo no es JSON válido.") from error
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="El cuerpo debe ser un objeto JSON.")
    try:
        result = result_dict(import_health_auto_export(payload, database))
        _invalidate_health_insights_cache()
        return result
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/dashboard")
def dashboard(today: date | None = None, scenario: str | None = None) -> dict[str, Any]:
    rows = database.list_activities()
    frame = activities_frame(rows)
    analysis_date = today or date.today()
    metrics = dashboard_metrics(frame, today=analysis_date)
    weeks = weekly_summary(frame).tail(16)
    profile = database.get_profile()
    checkin = database.latest_weekly_checkin()
    days_to_race = max((RACE_DATE - analysis_date).days, 0)
    status, notes = readiness_assessment(metrics, days_to_race)
    plan = build_adaptive_plan(
        metrics,
        running_days=int(profile.get("running_days") or 4),
        goal_pace_seconds_km=profile.get("goal_pace_seconds_km"),
        checkin=checkin,
        today=analysis_date,
    )

    recent = frame.sort_values("start_date", ascending=False).head(5)
    activity_dates = frame["start_date"].dt.date if not frame.empty else None
    today_runs = frame[activity_dates == analysis_date] if activity_dates is not None else frame
    today_average_hr = today_runs["average_heartrate"].dropna().mean() if not today_runs.empty else math.nan
    today_calories = today_runs["calories"].dropna().sum() if not today_runs.empty else 0
    today_activity = {
        "count": int(len(today_runs)),
        "distance_km": round(float(today_runs["distance_km"].sum()), 2),
        "moving_minutes": round(float(today_runs["moving_minutes"].sum()), 1),
        "training_load": round(float(today_runs["training_load"].sum()), 1),
        "calories": round(float(today_calories)) if today_calories else None,
        "average_heartrate": None if _is_nan(today_average_hr) else round(float(today_average_hr)),
    }
    activities = [
        {
            "id": str(row.id),
            "name": row.name,
            "date": row.start_date.date().isoformat(),
            "distance_km": round(float(row.distance_km), 2),
            "moving_minutes": round(float(row.moving_minutes), 1),
            "pace": format_pace(float(row.pace_min_km)),
            "average_heartrate": None if _is_nan(row.average_heartrate) else round(float(row.average_heartrate)),
            "elevation_gain_m": round(float(row.elevation_gain_m)),
            "training_load": round(float(row.training_load)),
            "calories": None if _is_nan(row.calories) else round(float(row.calories)),
        }
        for row in recent.itertuples()
    ]
    next_week = _serialize_week(plan[0]) if plan else None

    health = _health_dashboard_snapshot(rows, analysis_date)
    demo_scenario = scenario if scenario in DASHBOARD_DEMO_SCENARIOS else None
    if demo_scenario:
        demo_fitbit = _dashboard_demo_fitbit(
            health["devices"]["fitbit"],
            demo_scenario,
            analysis_date,
        )
        health = {
            **health,
            "devices": {
                **health["devices"],
                "fitbit": demo_fitbit,
            },
        }
    dashboard_today_activity = today_activity
    if demo_scenario:
        dashboard_today_activity = {
            "count": 0,
            "distance_km": 0.0,
            "moving_minutes": 0.0,
            "training_load": 0.0,
            "calories": None,
            "average_heartrate": None,
        }
    daily_state = _dashboard_daily_state(
        health["devices"]["fitbit"],
        dashboard_today_activity,
        analysis_date,
    )
    return {
        "current_date": analysis_date.isoformat(),
        "activity_count": database.activity_count(),
        "days_to_race": days_to_race,
        "race_date": RACE_DATE.isoformat(),
        "profile": profile,
        "metrics": {key: round(float(value), 1) for key, value in metrics.items()},
        "readiness": {"status": status, "notes": notes},
        "recovery": health["recovery"],
        "devices": health["devices"],
        "weeks": [
            {
                "week": row.week.isoformat(),
                "distance_km": round(float(row.distance_km), 1),
                "training_load": round(float(row.training_load), 1),
                "runs": int(row.runs),
            }
            for row in weeks.itertuples()
        ],
        "recent_activities": activities,
        "today_activity": dashboard_today_activity,
        "daily_state": daily_state,
        "demo_scenario": demo_scenario,
        "next_week": next_week,
        "upcoming_weeks": [_serialize_week(week) for week in plan[:2]],
        "daily_agenda": _agenda_with_completion(
            _daily_agenda(plan, analysis_date),
            frame,
            health["devices"]["fitbit"],
        ),
    }


@app.get("/api/activities")
def activities() -> dict[str, Any]:
    frame = activities_frame(database.list_activities()).sort_values("start_date", ascending=False)
    items = [
        {
            "id": str(row.id),
            "name": row.name,
            "date": row.start_date.date().isoformat(),
            "distance_km": round(float(row.distance_km), 2),
            "moving_minutes": round(float(row.moving_minutes)),
            "pace": format_pace(float(row.pace_min_km)),
            "average_heartrate": None if _is_nan(row.average_heartrate) else round(float(row.average_heartrate)),
            "elevation_gain_m": round(float(row.elevation_gain_m)),
            "training_load": round(float(row.training_load)),
        }
        for row in frame.itertuples()
    ]
    return {"activities": items}


@app.get("/api/activities/{activity_id}")
def activity_detail(activity_id: int) -> dict[str, Any]:
    activity = database.get_activity(activity_id)
    if activity is None:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")

    distance_km = float(activity["distance_m"]) / 1000
    moving_time = int(activity["moving_time_s"])
    streams = json.loads(activity["streams_json"]) if activity.get("streams_json") else None
    streams = _streams_with_apple_health_heart_rate(activity, streams) if streams else None
    detail = _activity_series(streams, activity) if streams else {"series": [], "splits": []}
    route = _activity_route(streams) if streams else []
    dynamics = _running_dynamics(activity)
    return {
        "activity": {
            "id": str(activity["id"]),
            "name": activity["name"],
            "date": str(activity["start_date"])[:10],
            "distance_km": round(distance_km, 2),
            "moving_time": _format_duration(moving_time),
            "moving_time_seconds": moving_time,
            "pace": format_pace(moving_time / 60 / distance_km) if distance_km else "—",
            "average_heartrate": _rounded_or_none(activity["average_heartrate"]),
            "max_heartrate": _rounded_or_none(activity["max_heartrate"]),
            "elevation_gain_m": round(float(activity["elevation_gain_m"] or 0)),
            "calories": _rounded_or_none(activity["calories"]),
        },
        "streams_available": bool(detail["series"]),
        "route_available": bool(route),
        "route": route,
        **dynamics,
        **detail,
    }


RUNNING_DYNAMICS = {
    "running_power": "power_w",
    "running_speed": "speed_kmh",
    "running_ground_contact_time": "ground_contact_ms",
    "running_stride_length": "stride_m",
    "running_vertical_oscillation": "vertical_oscillation_cm",
}


def _running_dynamics(activity: dict[str, Any]) -> dict[str, Any]:
    start = _parse_health_datetime(activity.get("start_date"))
    if start is None:
        return {
            "running_dynamics_available": False,
            "running_dynamics": [],
            "running_dynamics_summary": {},
        }
    duration = int(activity.get("elapsed_time_s") or activity.get("moving_time_s") or 0)
    end = start + timedelta(seconds=duration + 180)
    rows = database.list_apple_health_metrics(list(RUNNING_DYNAMICS))
    points: dict[int, dict[str, Any]] = {}
    values: dict[str, list[float]] = {target: [] for target in RUNNING_DYNAMICS.values()}
    for row in rows:
        recorded = _parse_health_datetime(row["recorded_at"])
        if recorded is None or recorded < start or recorded > end:
            continue
        measurement = json.loads(row["value_json"])
        value = measurement.get("qty", measurement.get("Avg"))
        if value is None:
            continue
        target = RUNNING_DYNAMICS[row["metric_name"]]
        elapsed_min = max(0, round((recorded - start).total_seconds() / 60, 2))
        minute_key = round(elapsed_min)
        point = points.setdefault(minute_key, {"elapsed_min": elapsed_min})
        point[target] = round(float(value), 2)
        values[target].append(float(value))

    series = [points[key] for key in sorted(points)]
    summary = {
        key: round(sum(items) / len(items), 1 if key not in {"stride_m"} else 2)
        for key, items in values.items()
        if items
    }
    return {
        "running_dynamics_available": bool(series),
        "running_dynamics": series,
        "running_dynamics_summary": summary,
    }


def _apple_recovery_snapshot() -> dict[str, Any]:
    names = [
        "heart_rate_variability",
        "resting_heart_rate",
        "vo2_max",
        "sleep_analysis",
        "weight_&_body_mass",
    ]
    rows = database.list_apple_health_metrics(names)
    cutoff = datetime.now().astimezone() - timedelta(days=7)
    grouped: dict[str, list[tuple[datetime, float, str]]] = {name: [] for name in names}
    sleep_latest: dict[str, Any] | None = None
    for row in rows:
        recorded = _parse_health_datetime(row["recorded_at"])
        if recorded is None:
            continue
        measurement = json.loads(row["value_json"])
        if row["metric_name"] == "sleep_analysis":
            if sleep_latest is None or recorded > sleep_latest["date"]:
                total = sum(float(measurement.get(key) or 0) for key in ("core", "rem", "deep"))
                sleep_latest = {"date": recorded, "value": total, "unit": "h"}
            continue
        value = measurement.get("qty", measurement.get("Avg"))
        if value is not None:
            grouped[row["metric_name"]].append((recorded, float(value), row["units"]))

    def metric(name: str, *, average_7d: bool = False) -> dict[str, Any] | None:
        samples = grouped[name]
        if not samples:
            return None
        recent = [sample for sample in samples if sample[0] >= cutoff]
        selected = recent or samples
        if average_7d and recent:
            value = sum(sample[1] for sample in recent) / len(recent)
            recorded = max(sample[0] for sample in recent)
            unit = recent[-1][2]
        else:
            recorded, value, unit = max(selected, key=lambda sample: sample[0])
        return {
            "value": round(value, 1),
            "unit": "bpm" if unit == "count/min" else unit,
            "date": recorded.date().isoformat(),
        }

    sleep = None
    if sleep_latest:
        sleep = {
            "value": round(float(sleep_latest["value"]), 1),
            "unit": "h",
            "date": sleep_latest["date"].date().isoformat(),
        }
    return {
        "hrv": metric("heart_rate_variability", average_7d=True),
        "resting_hr": metric("resting_heart_rate", average_7d=True),
        "vo2_max": metric("vo2_max"),
        "sleep": sleep,
        "weight": metric("weight_&_body_mass"),
    }


def _recovery_snapshot(
    apple: dict[str, Any] | None = None,
    *,
    google_status: dict[str, Any] | None = None,
) -> dict[str, Any]:
    result = apple or _apple_recovery_snapshot()
    google = _google_recovery_snapshot()
    combined = {key: google.get(key) or value for key, value in result.items()}
    google_status = google_status or database.google_health_status()
    combined["_context"] = {
        "fitbit_sensor_points": google_status["fitbit_sensor_points"],
        "fitbit_sensor_first": google_status["fitbit_sensor_first"],
        "note": (
            "La pulsera Fitbit es nueva. Solo sus muestras pasivas desde la primera "
            "fecha registrada cuentan como historial propio de Fitbit; los valores "
            "anteriores pueden provenir de Apple Health o ser derivados por Google."
        ),
    }
    return combined


def _health_dashboard_snapshot(rows: list[dict[str, Any]], analysis_date: date) -> dict[str, Any]:
    latest_activity_id = rows[0]["id"] if rows else None
    data_version = database.data_version()
    with health_insights_cache_lock:
        now = monotonic()
        cached = health_insights_cache["value"]
        if (
            cached is not None
            and health_insights_cache["expires_at"] > now
            and health_insights_cache["activity_id"] == latest_activity_id
            and health_insights_cache["analysis_date"] == analysis_date
            and health_insights_cache["data_version"] == data_version
        ):
            return cached

        google_status = database.google_health_status()
        apple_recovery = _apple_recovery_snapshot()
        recovery = _recovery_snapshot(
            apple_recovery,
            google_status=google_status,
        )
        value = {
            "recovery": recovery,
            "devices": _device_insights(
                rows,
                analysis_date,
                apple_recovery=apple_recovery,
                google_status=google_status,
            ),
        }
        health_insights_cache.update(
            {
                "expires_at": monotonic() + HEALTH_INSIGHTS_CACHE_SECONDS,
                "activity_id": latest_activity_id,
                "analysis_date": analysis_date,
                "data_version": data_version,
                "value": value,
            }
        )
        return value


def _google_recovery_snapshot() -> dict[str, Any]:
    data_types = [
        "daily-heart-rate-variability",
        "daily-resting-heart-rate",
        "daily-vo2-max",
        "run-vo2-max",
        "vo2-max",
        "sleep",
        "weight",
    ]
    rows = database.list_google_health_data_points(data_types)
    cutoff = datetime.now().astimezone() - timedelta(days=7)
    grouped: dict[str, list[tuple[datetime, float, str]]] = {
        "hrv": [],
        "resting_hr": [],
        "vo2_max": [],
        "sleep": [],
        "weight": [],
    }
    key_map = {
        "daily-heart-rate-variability": "hrv",
        "daily-resting-heart-rate": "resting_hr",
        "daily-vo2-max": "vo2_max",
        "run-vo2-max": "vo2_max",
        "vo2-max": "vo2_max",
        "sleep": "sleep",
        "weight": "weight",
    }
    for row in rows:
        recorded = _parse_health_datetime(row["recorded_at"])
        if recorded is None:
            continue
        if recorded.tzinfo is None:
            recorded = recorded.astimezone()
        normalized = normalized_recovery_value(
            row["data_type"],
            json.loads(row["value_json"]),
        )
        if normalized:
            value, unit = normalized
            grouped[key_map[row["data_type"]]].append((recorded, value, unit))

    def select(key: str, *, average_7d: bool = False) -> dict[str, Any] | None:
        samples = grouped[key]
        if not samples:
            return None
        recent = [sample for sample in samples if sample[0] >= cutoff]
        if average_7d and recent:
            value = sum(sample[1] for sample in recent) / len(recent)
            recorded = max(sample[0] for sample in recent)
            unit = recent[-1][2]
        else:
            recorded, value, unit = max(samples, key=lambda sample: sample[0])
        return {
            "value": round(value, 1),
            "unit": unit,
            "date": recorded.date().isoformat(),
        }

    return {
        "hrv": select("hrv", average_7d=True),
        "resting_hr": select("resting_hr", average_7d=True),
        "vo2_max": select("vo2_max"),
        "sleep": select("sleep"),
        "weight": select("weight"),
    }


def _device_insights(
    rows: list[dict[str, Any]],
    today: date,
    *,
    apple_recovery: dict[str, Any] | None = None,
    google_status: dict[str, Any],
) -> dict[str, Any]:
    apple_runs_by_id = {
        int(row["id"]): row
        for row in rows
        if "apple" in str(row.get("device_name") or "").lower()
        or json.loads(row.get("raw_json") or "{}").get("source") == "health_auto_export"
    }
    activity_times = [
        (row, _parse_health_datetime(row.get("start_date")))
        for row in rows
    ]
    for workout in database.list_apple_health_workouts():
        workout_start = _parse_health_datetime(workout.get("start_date"))
        if workout_start is None:
            continue
        matches = [
            (abs((activity_start - workout_start).total_seconds()), row)
            for row, activity_start in activity_times
            if activity_start is not None
            and abs((activity_start - workout_start).total_seconds()) <= 180
        ]
        if matches:
            _, matched = min(matches, key=lambda item: item[0])
            apple_runs_by_id[int(matched["id"])] = matched
    apple_runs = list(apple_runs_by_id.values())
    apple_runs.sort(key=lambda row: str(row.get("start_date") or ""), reverse=True)
    week_start = today - timedelta(days=today.weekday())
    current_week = [
        row
        for row in apple_runs
        if (recorded := _parse_health_datetime(row.get("start_date")))
        and recorded.date() >= week_start
    ]
    latest_run = apple_runs[0] if apple_runs else None
    latest_summary: dict[str, Any] | None = None
    if latest_run:
        distance_km = float(latest_run.get("distance_m") or 0) / 1000
        moving_seconds = int(latest_run.get("moving_time_s") or 0)
        dynamics = _running_dynamics(latest_run)
        recorded = _parse_health_datetime(latest_run.get("start_date"))
        latest_summary = {
            "id": str(latest_run["id"]),
            "date": recorded.date().isoformat() if recorded else str(latest_run.get("start_date") or "")[:10],
            "distance_km": round(distance_km, 2),
            "pace": format_pace(moving_seconds / 60 / distance_km) if distance_km else "—",
            "average_heartrate": _rounded_or_none(latest_run.get("average_heartrate")),
            "calories": _rounded_or_none(latest_run.get("calories")),
            "dynamics": dynamics["running_dynamics_summary"],
        }

    apple_status = database.apple_health_status()
    fitbit = _fitbit_insights(google_status)
    return {
        "apple_watch": {
            "status": "Activo" if apple_runs else "Sin datos",
            "last_sync": (apple_status.get("last_sync") or {}).get("received_at"),
            "workouts": len(apple_runs),
            "week": {
                "distance_km": round(
                    sum(float(row.get("distance_m") or 0) for row in current_week) / 1000,
                    1,
                ),
                "runs": len(current_week),
                "calories": round(sum(float(row.get("calories") or 0) for row in current_week)),
            },
            "latest_run": latest_summary,
            "recovery": apple_recovery or _apple_recovery_snapshot(),
        },
        "fitbit": fitbit,
    }


def _fitbit_insights(google_status: dict[str, Any]) -> dict[str, Any]:
    rows = database.list_latest_google_health_data_points(
        "heart-rate",
        source="FITBIT",
        limit=5000,
    )
    rows.extend(database.list_google_health_data_points(
        [
            "daily-heart-rate-variability",
            "daily-resting-heart-rate",
            "daily-oxygen-saturation",
            "daily-respiratory-rate",
            "daily-sleep-temperature-derivations",
            "daily-vo2-max",
            "daily-heart-rate-zones",
            "sleep",
            "steps",
            "active-energy-burned",
            "total-calories",
            "active-minutes",
            "active-zone-minutes",
            "distance",
            "sedentary-period",
            "time-in-heart-rate-zone",
            "exercise",
        ],
        source="FITBIT",
    ))
    heart_rate_samples: list[tuple[datetime, str, str, float]] = []
    for row in rows:
        if row["data_type"] != "heart-rate" or row["source"] != "FITBIT":
            continue
        point = json.loads(row["value_json"])
        source = point.get("dataSource") or {}
        if source.get("recordingMethod") != "PASSIVELY_MEASURED":
            continue
        payload = point.get("heartRate") or {}
        value = payload.get("beatsPerMinute")
        recorded = _parse_health_datetime(row["recorded_at"])
        if value is None or recorded is None:
            continue
        civil = ((payload.get("sampleTime") or {}).get("civilTime") or {})
        civil_date = civil.get("date") or {}
        civil_time = civil.get("time") or {}
        local_date = (
            f"{int(civil_date['year']):04d}-{int(civil_date['month']):02d}-{int(civil_date['day']):02d}"
            if all(key in civil_date for key in ("year", "month", "day"))
            else recorded.date().isoformat()
        )
        local_clock = (
            f"{int(civil_time.get('hours', 0) if civil else recorded.hour):02d}:"
            f"{int(civil_time.get('minutes', 0) if civil else recorded.minute):02d}"
        )
        heart_rate_samples.append((recorded, local_date, local_clock, float(value)))

    heart_rate_samples.sort(key=lambda sample: sample[0])
    latest_date = heart_rate_samples[-1][1] if heart_rate_samples else None
    latest_day = [
        sample for sample in heart_rate_samples if sample[1] == latest_date
    ]
    series: list[dict[str, Any]] = []
    if latest_day:
        bucket_size = max(1, math.ceil(len(latest_day) / 96))
        for index in range(0, len(latest_day), bucket_size):
            bucket = latest_day[index : index + bucket_size]
            series.append(
                {
                    "time": bucket[-1][2],
                    "bpm": round(sum(sample[3] for sample in bucket) / len(bucket)),
                }
            )
    values = [sample[3] for sample in latest_day]
    coverage_hours = (
        (latest_day[-1][0] - latest_day[0][0]).total_seconds() / 3600
        if len(latest_day) > 1
        else 0
    )
    recovery = _fitbit_recovery_metrics(rows)
    sleep_days = _fitbit_sleep_days(rows)
    sleep_detail = _fitbit_sleep_detail(rows)
    step_days = _fitbit_step_days(rows)
    active_energy_days = _fitbit_active_energy_days(rows)
    total_calorie_days = _fitbit_total_calorie_days(rows)
    activity_days = _fitbit_activity_days(rows)
    exercises = _fitbit_exercises(rows)
    recovery_history = _fitbit_recovery_history(rows)
    recovery_ready = all(
        recovery[key] is not None for key in ("sleep", "hrv", "resting_hr")
    )
    return {
        "status": (
            "Activo"
            if recovery_ready
            else "Calibrando"
            if heart_rate_samples
            else "Esperando datos"
        ),
        "first_seen": google_status["fitbit_sensor_first"],
        "last_seen": google_status["fitbit_sensor_last"],
        "sensor_samples": google_status["fitbit_sensor_points"],
        "heart_rate": {
            "date": latest_date,
            "latest": round(latest_day[-1][3]) if latest_day else None,
            "average": round(sum(values) / len(values), 1) if values else None,
            "minimum": round(min(values)) if values else None,
            "maximum": round(max(values)) if values else None,
            "coverage_hours": round(coverage_hours, 1),
            "series": series,
        },
        "sleep": {
            "latest": (
                {**sleep_days[-1], **sleep_detail}
                if sleep_days and sleep_detail
                else sleep_days[-1] if sleep_days else None
            ),
            "days": sleep_days,
            "goal": 8,
        },
        "steps": {
            "latest": step_days[-1] if step_days else None,
            "days": step_days,
            "goal": 10000,
        },
        "active_energy": {
            "latest": active_energy_days[-1] if active_energy_days else None,
            "days": active_energy_days,
            "goal": 600,
        },
        "total_calories": {
            "latest": total_calorie_days[-1] if total_calorie_days else None,
            "days": total_calorie_days,
        },
        "daily_activity": {
            "latest": activity_days[-1] if activity_days else None,
            "days": activity_days,
            "active_minutes_goal": 30,
            "zone_minutes_goal": 22,
        },
        "exercises": exercises,
        "recovery_history": recovery_history,
        "recovery": recovery,
    }


def _fitbit_sleep_days(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    nights: dict[str, float] = {}
    for row in rows:
        if row["data_type"] != "sleep" or row["source"] != "FITBIT":
            continue
        normalized = normalized_recovery_value(row["data_type"], json.loads(row["value_json"]))
        if normalized is None:
            continue
        recorded = _parse_health_datetime(row["recorded_at"])
        day = recorded.date().isoformat() if recorded else str(row["recorded_at"])[:10]
        value, _unit = normalized
        nights[day] = max(nights.get(day, 0), float(value))
    return [
        {"date": day, "hours": round(hours, 1)}
        for day, hours in sorted(nights.items())[-7:]
    ]


def _fitbit_sleep_detail(rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    sessions: list[tuple[str, float, dict[str, Any]]] = []
    for row in rows:
        if row["data_type"] != "sleep" or row["source"] != "FITBIT":
            continue
        point = json.loads(row["value_json"])
        sleep = point.get("sleep") or {}
        summary = sleep.get("summary") or {}
        if (sleep.get("metadata") or {}).get("nap"):
            continue
        minutes_asleep = float(summary.get("minutesAsleep") or 0)
        if minutes_asleep <= 0:
            continue
        recorded = _parse_health_datetime(row["recorded_at"])
        day = recorded.date().isoformat() if recorded else str(row["recorded_at"])[:10]
        sessions.append((day, minutes_asleep, sleep))
    if not sessions:
        return None
    _day, minutes_asleep, sleep = max(sessions, key=lambda item: (item[0], item[1]))
    summary = sleep.get("summary") or {}
    stage_minutes = {
        str(stage.get("type") or "").lower(): int(stage.get("minutes") or 0)
        for stage in summary.get("stagesSummary") or []
    }
    period = float(summary.get("minutesInSleepPeriod") or minutes_asleep)
    return {
        "deep_minutes": stage_minutes.get("deep", 0),
        "rem_minutes": stage_minutes.get("rem", 0),
        "light_minutes": stage_minutes.get("light", 0),
        "awake_minutes": stage_minutes.get("awake", 0),
        "efficiency": round(minutes_asleep / period * 100) if period else None,
    }


def _fitbit_active_energy_days(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    totals: dict[str, float] = {}
    for row in rows:
        if row["data_type"] != "active-energy-burned" or row["source"] != "FITBIT":
            continue
        point = json.loads(row["value_json"])
        payload = point.get("activeEnergyBurned") or {}
        kcal = payload.get("kcal")
        if kcal is None:
            continue
        recorded = _parse_health_datetime(row["recorded_at"])
        day = recorded.date().isoformat() if recorded else str(row["recorded_at"])[:10]
        totals[day] = totals.get(day, 0) + float(kcal)
    return [
        {"date": day, "kcal": round(kcal)}
        for day, kcal in sorted(totals.items())[-7:]
    ]


def _fitbit_total_calorie_days(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    totals: dict[str, float] = {}
    for row in rows:
        if row["data_type"] != "total-calories" or row["source"] != "FITBIT":
            continue
        point = json.loads(row["value_json"])
        payload = point.get("totalCalories") or point.get("totalCaloriesRollupValue") or {}
        kcal = payload.get("kcal", payload.get("kcalSum", payload.get("totalKcal")))
        if kcal is None:
            continue
        recorded = _parse_health_datetime(row["recorded_at"])
        day = recorded.date().isoformat() if recorded else str(row["recorded_at"])[:10]
        totals[day] = max(totals.get(day, 0), float(kcal))
    return [
        {"date": day, "kcal": round(kcal)}
        for day, kcal in sorted(totals.items())[-7:]
    ]


def _fitbit_activity_days(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    days: dict[str, dict[str, float]] = {}

    def bucket(row: dict[str, Any], payload: dict[str, Any]) -> dict[str, float]:
        interval = payload.get("interval") or {}
        recorded = _parse_health_datetime(interval.get("startTime") or row["recorded_at"])
        day = recorded.date().isoformat() if recorded else str(row["recorded_at"])[:10]
        return days.setdefault(
            day,
            {
                "active_minutes": 0,
                "zone_minutes": 0,
                "distance_km": 0,
                "sedentary_minutes": 0,
            },
        )

    for row in rows:
        if row["source"] != "FITBIT":
            continue
        point = json.loads(row["value_json"])
        if row["data_type"] == "active-minutes":
            payload = point.get("activeMinutes") or {}
            target = bucket(row, payload)
            target["active_minutes"] += sum(
                float(item.get("activeMinutes") or 0)
                for item in payload.get("activeMinutesByActivityLevel") or []
                if item.get("activityLevel") in {"MODERATE", "VIGOROUS"}
            )
        elif row["data_type"] == "active-zone-minutes":
            payload = point.get("activeZoneMinutes") or {}
            target = bucket(row, payload)
            target["zone_minutes"] += float(payload.get("activeZoneMinutes") or 0)
        elif row["data_type"] == "distance":
            payload = point.get("distance") or {}
            target = bucket(row, payload)
            target["distance_km"] += float(payload.get("millimeters") or 0) / 1_000_000
        elif row["data_type"] == "sedentary-period":
            payload = point.get("sedentaryPeriod") or {}
            target = bucket(row, payload)
            interval = payload.get("interval") or {}
            start = _parse_health_datetime(interval.get("startTime"))
            end = _parse_health_datetime(interval.get("endTime"))
            if start and end:
                target["sedentary_minutes"] += max(0, (end - start).total_seconds() / 60)
    return [
        {
            "date": day,
            "active_minutes": round(values["active_minutes"]),
            "zone_minutes": round(values["zone_minutes"]),
            "distance_km": round(values["distance_km"], 1),
            "sedentary_minutes": round(values["sedentary_minutes"]),
        }
        for day, values in sorted(days.items())[-7:]
    ]


def _duration_seconds(value: Any) -> float:
    text = str(value or "0").strip().lower()
    if text.endswith("s"):
        text = text[:-1]
    try:
        return max(0, float(text))
    except (TypeError, ValueError):
        return 0


def _fitbit_exercises(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    exercises: list[dict[str, Any]] = []
    labels = {
        "BIKING": "Bicicleta",
        "WALKING": "Caminata",
        "HIKING": "Senderismo",
        "SWIMMING": "Natación",
        "ELLIPTICAL": "Elíptica",
        "STRENGTH_TRAINING": "Fuerza",
        "OTHER_WORKOUT": "Entrenamiento",
    }
    for row in rows:
        if row["data_type"] != "exercise" or row["source"] != "FITBIT":
            continue
        point = json.loads(row["value_json"])
        payload = point.get("exercise") or {}
        exercise_type = str(payload.get("exerciseType") or "OTHER_WORKOUT").upper()
        # Las carreras pertenecen a Apple Watch. Excluirlas evita duplicar carga,
        # calorías y distancia cuando Fitbit también las detecta.
        if exercise_type == "RUNNING":
            continue
        interval = payload.get("interval") or {}
        start = _parse_health_datetime(interval.get("startTime"))
        end = _parse_health_datetime(interval.get("endTime"))
        if start is None:
            continue
        local_start = start + timedelta(
            seconds=_duration_seconds(interval.get("startUtcOffset"))
        )
        duration_seconds = _duration_seconds(payload.get("activeDuration"))
        if not duration_seconds and end:
            duration_seconds = max(0, (end - start).total_seconds())
        summary = payload.get("metricsSummary") or {}
        zone_durations = summary.get("heartRateZoneDurations") or {}
        moderate_seconds = _duration_seconds(zone_durations.get("moderateTime"))
        vigorous_seconds = _duration_seconds(zone_durations.get("vigorousTime"))
        peak_seconds = _duration_seconds(zone_durations.get("peakTime"))
        zone_minutes = summary.get("activeZoneMinutes")
        if zone_minutes is None:
            zone_minutes = (moderate_seconds + 2 * (vigorous_seconds + peak_seconds)) / 60
        distance_mm = summary.get("distanceMillimeters")
        exercises.append(
            {
                "type": exercise_type,
                "label": labels.get(
                    exercise_type,
                    str(payload.get("displayName") or "Actividad"),
                ),
                "date": local_start.date().isoformat(),
                "start_time": start.isoformat(),
                "duration_minutes": round(duration_seconds / 60),
                "calories": _rounded_or_none(summary.get("caloriesKcal")),
                "distance_km": (
                    round(float(distance_mm) / 1_000_000, 2)
                    if distance_mm is not None
                    else None
                ),
                "average_heartrate": _rounded_or_none(
                    summary.get("averageHeartRateBeatsPerMinute")
                ),
                "zone_minutes": round(float(zone_minutes)),
                "source": "Fitbit",
            }
        )
    exercises.sort(key=lambda item: item["start_time"], reverse=True)
    return exercises[:30]


def _fitbit_recovery_history(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    supported = {
        "daily-heart-rate-variability": "hrv",
        "daily-resting-heart-rate": "resting_hr",
    }
    days: dict[str, dict[str, Any]] = {}
    for row in rows:
        key = supported.get(row["data_type"])
        if key is None or row["source"] != "FITBIT":
            continue
        normalized = normalized_recovery_value(
            row["data_type"],
            json.loads(row["value_json"]),
        )
        recorded = _parse_health_datetime(row["recorded_at"])
        if normalized is None or recorded is None:
            continue
        target = days.setdefault(recorded.date().isoformat(), {"date": recorded.date().isoformat()})
        target[key] = round(float(normalized[0]), 1)
    return [values for _day, values in sorted(days.items())[-28:]]


def _dashboard_demo_fitbit(
    fitbit: dict[str, Any],
    scenario: str,
    analysis_date: date,
) -> dict[str, Any]:
    """Build a read-only QA snapshot without writing synthetic health data."""
    demo = deepcopy(fitbit)
    current_day = analysis_date.isoformat()
    scenario_values = {
        "recovered": {
            "sleep": [7.8, 8.0, 7.7, 8.1, 7.9, 8.0, 8.2],
            "hrv": [95, 97, 96, 98, 95, 97, 108],
            "rhr": [50, 49, 50, 48, 49, 50, 45],
            "steps": 3240,
            "active_kcal": 210,
            "total_kcal": 1760,
            "zone_minutes": 0,
        },
        "sleep-debt": {
            "sleep": [7.6, 7.9, 7.4, 8.0, 7.5, 7.8, 4.2],
            "hrv": [95, 97, 96, 98, 95, 97, 96],
            "rhr": [49, 50, 49, 48, 50, 49, 51],
            "steps": 1860,
            "active_kcal": 125,
            "total_kcal": 1520,
            "zone_minutes": 0,
        },
        "heavy-load": {
            "sleep": [7.5, 7.8, 7.4, 7.9, 7.6, 7.7, 7.4],
            "hrv": [95, 97, 96, 98, 95, 97, 94],
            "rhr": [49, 50, 49, 48, 50, 49, 50],
            "steps": 12840,
            "active_kcal": 1080,
            "total_kcal": 3260,
            "zone_minutes": 88,
        },
        "calibrating": {
            "sleep": [7.6, 6.9, 7.1],
            "hrv": [94, 97, 96],
            "rhr": [50, 49, 49],
            "steps": 4480,
            "active_kcal": 275,
            "total_kcal": 1850,
            "zone_minutes": 8,
        },
    }[scenario]
    nights = scenario_values["sleep"]
    start_offset = len(nights) - 1
    sleep_days = [
        {
            "date": (analysis_date - timedelta(days=start_offset - index)).isoformat(),
            "hours": hours,
        }
        for index, hours in enumerate(nights)
    ]
    recovery_history = [
        {
            "date": night["date"],
            "hrv": scenario_values["hrv"][index],
            "resting_hr": scenario_values["rhr"][index],
        }
        for index, night in enumerate(sleep_days)
    ]
    latest_sleep = {
        **(demo.get("sleep", {}).get("latest") or {}),
        **sleep_days[-1],
        "deep_minutes": 92 if scenario == "recovered" else 61,
        "rem_minutes": 104 if scenario == "recovered" else 72,
        "light_minutes": 276 if scenario == "recovered" else 244,
        "awake_minutes": 20 if scenario == "recovered" else 43,
        "efficiency": 94 if scenario == "recovered" else 86,
    }
    demo["sleep"] = {
        **demo.get("sleep", {}),
        "latest": latest_sleep,
        "days": sleep_days,
        "goal": 8,
    }
    demo["recovery_history"] = recovery_history
    demo["recovery"] = {
        **demo.get("recovery", {}),
        "hrv": {
            "value": scenario_values["hrv"][-1],
            "unit": "ms",
            "date": current_day,
            "method": "QA_SCENARIO",
        },
        "resting_hr": {
            "value": scenario_values["rhr"][-1],
            "unit": "bpm",
            "date": current_day,
            "method": "QA_SCENARIO",
        },
    }
    demo["steps"] = {
        **demo.get("steps", {}),
        "latest": {"date": current_day, "count": scenario_values["steps"]},
    }
    demo["active_energy"] = {
        **demo.get("active_energy", {}),
        "latest": {"date": current_day, "kcal": scenario_values["active_kcal"]},
    }
    demo["total_calories"] = {
        **demo.get("total_calories", {}),
        "latest": {"date": current_day, "kcal": scenario_values["total_kcal"]},
    }
    demo["daily_activity"] = {
        **demo.get("daily_activity", {}),
        "latest": {
            "date": current_day,
            "active_minutes": round(scenario_values["zone_minutes"] * 0.75),
            "zone_minutes": scenario_values["zone_minutes"],
            "distance_km": round(scenario_values["steps"] * 0.00076, 1),
            "sedentary_minutes": 410 if scenario == "heavy-load" else 570,
        },
    }
    exercises = [
        item
        for item in demo.get("exercises", [])
        if item.get("date") != current_day
    ]
    if scenario == "heavy-load":
        exercises = [
            {
                "type": "BIKING",
                "label": "Bicicleta intensa",
                "date": current_day,
                "start_time": f"{current_day}T08:05:00+02:00",
                "duration_minutes": 76,
                "calories": 720,
                "distance_km": 31.4,
                "average_heartrate": 146,
                "zone_minutes": 88,
                "source": "Fitbit",
            },
            *exercises,
        ]
    demo["exercises"] = exercises
    demo["status"] = "Activo" if len(nights) >= 7 else "Calibrando"
    return demo


def _dashboard_daily_state(
    fitbit: dict[str, Any],
    apple_activity: dict[str, Any],
    analysis_date: date,
) -> dict[str, Any]:
    current_day = analysis_date.isoformat()
    sleep_days = [
        night
        for night in fitbit.get("sleep", {}).get("days", [])
        if str(night.get("date") or "") <= current_day
    ]
    latest_sleep = next(
        (night for night in reversed(sleep_days) if night.get("date") == current_day),
        None,
    )
    sleep_hours = float(latest_sleep["hours"]) if latest_sleep else None
    sleep_goal = float(fitbit.get("sleep", {}).get("goal") or 8)
    history = [
        item
        for item in fitbit.get("recovery_history", [])
        if str(item.get("date") or "") <= current_day
    ]
    today_recovery = next(
        (item for item in reversed(history) if item.get("date") == current_day),
        {},
    )
    prior_history = [item for item in history if item.get("date") != current_day]
    hrv_baseline_values = [
        float(item["hrv"]) for item in prior_history if item.get("hrv") is not None
    ]
    rhr_baseline_values = [
        float(item["resting_hr"])
        for item in prior_history
        if item.get("resting_hr") is not None
    ]
    hrv = today_recovery.get("hrv")
    resting_hr = today_recovery.get("resting_hr")
    hrv_baseline = (
        sum(hrv_baseline_values) / len(hrv_baseline_values)
        if hrv_baseline_values
        else None
    )
    rhr_baseline = (
        sum(rhr_baseline_values) / len(rhr_baseline_values)
        if rhr_baseline_values
        else None
    )
    calibration_nights = len({night["date"] for night in sleep_days})
    calibrated = (
        calibration_nights >= 7
        and len(hrv_baseline_values) >= 6
        and len(rhr_baseline_values) >= 6
    )

    sleep_score = min(100, max(0, (sleep_hours or 0) / sleep_goal * 100))
    hrv_score = 50.0
    if hrv is not None and hrv_baseline:
        hrv_score = min(100, max(0, 50 + ((float(hrv) / hrv_baseline) - 1) * 250))
    rhr_score = 50.0
    if resting_hr is not None and rhr_baseline:
        rhr_score = min(
            100,
            max(0, 50 - ((float(resting_hr) / rhr_baseline) - 1) * 250),
        )
    score = round(sleep_score * 0.5 + hrv_score * 0.3 + rhr_score * 0.2)
    if sleep_hours is not None and sleep_hours < 5:
        score = min(score, 39)
    elif sleep_hours is not None and sleep_hours < 6:
        score = min(score, 55)

    if sleep_hours is not None and sleep_hours < 5:
        recovery_label = "Recuperación limitada"
        recovery_summary = (
            f"Dormiste {sleep_hours:g} h. Aunque las señales cardíacas sean buenas, "
            "el sueño corto limita la capacidad para otra carga intensa."
        )
    elif sleep_hours is not None and sleep_hours < 6:
        recovery_label = "Recuperación baja"
        recovery_summary = "El sueño quedó corto. Conviene reducir intensidad y vigilar sensaciones."
    elif not calibrated:
        recovery_label = "Fitbit está calibrando"
        recovery_summary = (
            f"Hay {calibration_nights} de 7 noches necesarias. "
            "Mostramos las señales reales sin inventar una puntuación precisa."
        )
    elif score >= 75:
        recovery_label = "Buena recuperación"
        recovery_summary = "Sueño y señales nocturnas acompañan una sesión de calidad."
    elif score >= 50:
        recovery_label = "Recuperación moderada"
        recovery_summary = "Hay señales mixtas. Mantén flexibilidad con la intensidad."
    else:
        recovery_label = "Prioriza recuperar"
        recovery_summary = "Tus señales sugieren bajar la carga y favorecer la recuperación."

    today_exercises = [
        exercise
        for exercise in fitbit.get("exercises", [])
        if exercise.get("date") == current_day
    ]
    fitbit_minutes = sum(float(item.get("duration_minutes") or 0) for item in today_exercises)
    fitbit_zone_minutes = sum(float(item.get("zone_minutes") or 0) for item in today_exercises)
    fitbit_calories = sum(float(item.get("calories") or 0) for item in today_exercises)
    apple_count = int(apple_activity.get("count") or 0)
    apple_minutes = float(apple_activity.get("moving_minutes") or 0)
    apple_calories = float(apple_activity.get("calories") or 0)
    activity_count = len(today_exercises) + apple_count
    total_minutes = round(fitbit_minutes + apple_minutes)
    total_calories = round(fitbit_calories + apple_calories)
    training_load = float(apple_activity.get("training_load") or 0)
    if training_load >= 65 or fitbit_zone_minutes >= 40:
        load_level, load_label = "high", "Carga alta"
    elif training_load >= 25 or fitbit_zone_minutes >= 15:
        load_level, load_label = "moderate", "Carga moderada"
    elif activity_count:
        load_level, load_label = "light", "Carga ligera"
    else:
        load_level, load_label = "none", "Sin carga registrada"

    if sleep_hours is not None and sleep_hours < 5 and activity_count:
        recommendation_title = "La carga de hoy ya es suficiente"
        recommendation_body = (
            "Con menos de 5 horas de sueño y actividad ya registrada, evita otra sesión "
            "intensa. Hidrátate, come bien y elige movilidad o una caminata suave."
        )
        remaining = "Solo recuperación suave"
    elif sleep_hours is not None and sleep_hours < 5:
        recommendation_title = "Cambia intensidad por recuperación"
        recommendation_body = (
            "Si entrenas, que sea muy suave. No persigas ritmo, potencia ni volumen hoy."
        )
        remaining = "Movimiento suave opcional"
    elif activity_count and load_level in {"moderate", "high"}:
        recommendation_title = "Entrenamiento del día completado"
        recommendation_body = (
            "La carga registrada ya cuenta. El resto del día debe favorecer la recuperación."
        )
        remaining = "Recuperar y completar actividad cotidiana"
    elif calibrated and score >= 75:
        recommendation_title = "Puedes seguir la sesión prevista"
        recommendation_body = "Calienta de forma progresiva y ajusta si las sensaciones no acompañan."
        remaining = "Sesión prevista disponible"
    else:
        recommendation_title = "Mantén el plan flexible"
        recommendation_body = "Usa las sensaciones del calentamiento para decidir la intensidad final."
        remaining = "Carga moderada como máximo"

    factors = [
        {
            "key": "sleep",
            "label": "Sueño",
            "value": f"{sleep_hours:g} h" if sleep_hours is not None else "Sin dato",
            "state": (
                "low"
                if sleep_hours is not None and sleep_hours < 6
                else "good"
                if sleep_hours is not None and sleep_hours >= 7
                else "neutral"
            ),
            "detail": f"Meta personal {sleep_goal:g} h",
        },
        {
            "key": "hrv",
            "label": "HRV nocturna",
            "value": f"{float(hrv):g} ms" if hrv is not None else "Calibrando",
            "state": "neutral" if not calibrated else "good" if hrv_score >= 55 else "low",
            "detail": (
                "Comparación personal disponible"
                if calibrated
                else "Falta construir tu línea personal"
            ),
        },
        {
            "key": "resting_hr",
            "label": "Pulso en reposo",
            "value": f"{float(resting_hr):g} bpm" if resting_hr is not None else "Calibrando",
            "state": "neutral" if not calibrated else "good" if rhr_score >= 55 else "low",
            "detail": (
                "Comparación personal disponible"
                if calibrated
                else "Falta construir tu línea personal"
            ),
        },
    ]
    return {
        "calibration": {
            "ready": calibrated,
            "nights": calibration_nights,
            "required": 7,
        },
        "morning_recovery": {
            "score": score if calibrated else None,
            "label": recovery_label,
            "summary": recovery_summary,
            "sleep_hours": sleep_hours,
            "factors": factors,
        },
        "today_load": {
            "level": load_level,
            "label": load_label,
            "activities_count": activity_count,
            "duration_minutes": total_minutes,
            "zone_minutes": round(fitbit_zone_minutes),
            "calories": total_calories,
            "fitbit_exercises": today_exercises,
            "apple_runs": apple_count,
        },
        "recommendation": {
            "title": recommendation_title,
            "body": recommendation_body,
            "remaining": remaining,
        },
    }


def _fitbit_step_days(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    totals: dict[str, int] = {}
    for row in rows:
        if row["data_type"] != "steps" or row["source"] != "FITBIT":
            continue
        point = json.loads(row["value_json"])
        payload = point.get("steps") or {}
        count = payload.get("count")
        if count is None:
            continue
        recorded = _parse_health_datetime(row["recorded_at"])
        day = recorded.date().isoformat() if recorded else str(row["recorded_at"])[:10]
        totals[day] = totals.get(day, 0) + int(count)
    return [
        {"date": day, "count": count}
        for day, count in sorted(totals.items())[-7:]
    ]


def _fitbit_recovery_metrics(rows: list[dict[str, Any]]) -> dict[str, Any]:
    key_map = {
        "daily-heart-rate-variability": "hrv",
        "daily-resting-heart-rate": "resting_hr",
        "daily-oxygen-saturation": "oxygen",
        "daily-respiratory-rate": "respiratory_rate",
        "daily-sleep-temperature-derivations": "temperature",
        "daily-vo2-max": "vo2_max",
        "sleep": "sleep",
    }
    result: dict[str, Any] = {key: None for key in key_map.values()}
    for row in rows:
        key = key_map.get(row["data_type"])
        if key is None or row["source"] != "FITBIT":
            continue
        point = json.loads(row["value_json"])
        normalized = normalized_recovery_value(row["data_type"], point)
        if normalized is None:
            continue
        recorded = _parse_health_datetime(row["recorded_at"])
        existing = result[key]
        if existing and recorded and recorded <= _parse_health_datetime(existing["date"]):
            continue
        value, unit = normalized
        result[key] = {
            "value": round(value, 1),
            "unit": unit,
            "date": row["recorded_at"],
            "method": (point.get("dataSource") or {}).get("recordingMethod", "UNKNOWN"),
        }
    return result


def _parse_health_datetime(value: Any) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        pass
    for fmt in ("%Y-%m-%d %H:%M:%S %z", "%Y-%m-%d %H:%M:%S %Z"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def _streams_with_apple_health_heart_rate(activity: dict[str, Any], streams: dict[str, Any]) -> dict[str, Any]:
    if _stream_data(streams, "heartrate"):
        return streams
    elapsed = _stream_data(streams, "time")
    if not elapsed:
        return streams
    start = _parse_health_datetime(activity.get("start_date"))
    if start is None:
        return streams
    duration = int(activity.get("elapsed_time_s") or activity.get("moving_time_s") or 0)
    end = start + timedelta(seconds=duration + 180)
    samples: list[tuple[float, float]] = []
    for row in database.list_apple_health_metrics(["heart_rate"]):
        recorded = _parse_health_datetime(row["recorded_at"])
        if recorded is None or recorded < start - timedelta(seconds=90) or recorded > end:
            continue
        measurement = json.loads(row["value_json"])
        value = measurement.get("qty", measurement.get("Avg"))
        if value is None:
            continue
        samples.append(((recorded - start).total_seconds(), float(value)))
    if not samples:
        return streams
    samples.sort(key=lambda sample: sample[0])
    sample_times = [sample[0] for sample in samples]
    heartrate = [_nearest_heart_rate_sample(float(seconds), samples, sample_times) for seconds in elapsed]
    enriched = dict(streams)
    enriched["heartrate"] = {"data": heartrate}
    return enriched


def _nearest_heart_rate_sample(elapsed_s: float, samples: list[tuple[float, float]], sample_times: list[float]) -> int | None:
    index = bisect_left(sample_times, elapsed_s)
    candidates = []
    if index < len(samples):
        candidates.append(samples[index])
    if index > 0:
        candidates.append(samples[index - 1])
    nearest = min(candidates, key=lambda sample: abs(sample[0] - elapsed_s))
    if abs(nearest[0] - elapsed_s) > 45:
        return None
    return round(nearest[1])


def _activity_series(streams: dict[str, Any], activity: dict[str, Any]) -> dict[str, Any]:
    distance = _stream_data(streams, "distance")
    elapsed = _stream_data(streams, "time")
    speed = _stream_data(streams, "velocity_smooth")
    heartrate = _stream_data(streams, "heartrate")
    altitude = _stream_data(streams, "altitude")
    length = min(len(distance), len(elapsed))
    if length < 2:
        return {"series": [], "splits": []}

    sample_step = max(1, math.ceil(length / 450))
    selected = list(range(0, length, sample_step))
    if selected[-1] != length - 1:
        selected.append(length - 1)
    series = []
    for index in selected:
        velocity = _value_at(speed, index)
        pace = 1000 / velocity / 60 if velocity and velocity > 0 else None
        series.append(
            {
                "distance_km": round(float(distance[index]) / 1000, 3),
                "pace_min_km": round(pace, 2) if pace and 2.5 <= pace <= 12 else None,
                "heartrate": _rounded_or_none(_value_at(heartrate, index)),
                "altitude_m": _one_decimal_or_none(_value_at(altitude, index)),
            }
        )

    dynamics = _activity_dynamics_samples(activity)
    activity_average_hr = _rounded_or_none(activity.get("average_heartrate"))
    splits = []
    start_index = 0
    split_number = 1
    threshold = 1000.0
    while start_index < length - 1:
        end_index = next((i for i in range(start_index + 1, length) if float(distance[i]) >= threshold), length - 1)
        split_distance = float(distance[end_index]) - float(distance[start_index])
        split_seconds = float(elapsed[end_index]) - float(elapsed[start_index])
        if split_distance < 100 or split_seconds <= 0:
            break
        normalized_pace_seconds = split_seconds * 1000 / split_distance
        split_hr = [_value_at(heartrate, i) for i in range(start_index, end_index + 1)]
        split_hr = [float(value) for value in split_hr if value is not None]
        split_dynamics = _average_dynamics_for_window(
            dynamics,
            float(elapsed[start_index]),
            float(elapsed[end_index]),
        )
        split_altitude = [_value_at(altitude, i) for i in range(start_index, end_index + 1)]
        split_altitude = [float(value) for value in split_altitude if value is not None]
        elevation_gain = sum(max(0, second - first) for first, second in zip(split_altitude, split_altitude[1:]))
        average_heartrate = round(sum(split_hr) / len(split_hr)) if split_hr else activity_average_hr
        splits.append(
            {
                "kilometer": split_number,
                "label": f"Km {split_number}" if split_distance >= 900 else "Final",
                "distance_km": round(split_distance / 1000, 2),
                "pace": _format_pace_seconds(normalized_pace_seconds),
                "pace_seconds": round(normalized_pace_seconds),
                "average_heartrate": average_heartrate,
                "heartrate_source": "stream" if split_hr else "workout_average" if average_heartrate is not None else None,
                "elevation_gain_m": round(elevation_gain),
                **split_dynamics,
            }
        )
        start_index = end_index
        split_number += 1
        threshold += 1000
        if end_index == length - 1:
            break
    return {"series": series, "splits": splits}


def _activity_dynamics_samples(activity: dict[str, Any]) -> list[dict[str, Any]]:
    start = _parse_health_datetime(activity.get("start_date"))
    if start is None:
        return []
    duration = int(activity.get("elapsed_time_s") or activity.get("moving_time_s") or 0)
    end = start + timedelta(seconds=duration + 180)
    rows = database.list_apple_health_metrics(list(RUNNING_DYNAMICS))
    samples: list[dict[str, Any]] = []
    for row in rows:
        recorded = _parse_health_datetime(row["recorded_at"])
        if recorded is None or recorded < start or recorded > end:
            continue
        measurement = json.loads(row["value_json"])
        value = measurement.get("qty", measurement.get("Avg"))
        if value is None:
            continue
        samples.append(
            {
                "elapsed_s": max(0, (recorded - start).total_seconds()),
                RUNNING_DYNAMICS[row["metric_name"]]: float(value),
            }
        )
    return samples


def _average_dynamics_for_window(samples: list[dict[str, Any]], start_s: float, end_s: float) -> dict[str, Any]:
    values: dict[str, list[float]] = {target: [] for target in RUNNING_DYNAMICS.values()}
    for sample in samples:
        elapsed_s = float(sample["elapsed_s"])
        if elapsed_s < start_s or elapsed_s > end_s:
            continue
        for key in values:
            if key in sample:
                values[key].append(float(sample[key]))
    return {
        "average_power_w": round(sum(values["power_w"]) / len(values["power_w"])) if values["power_w"] else None,
        "average_speed_kmh": round(sum(values["speed_kmh"]) / len(values["speed_kmh"]), 1) if values["speed_kmh"] else None,
        "ground_contact_ms": round(sum(values["ground_contact_ms"]) / len(values["ground_contact_ms"])) if values["ground_contact_ms"] else None,
        "stride_m": round(sum(values["stride_m"]) / len(values["stride_m"]), 2) if values["stride_m"] else None,
        "vertical_oscillation_cm": round(sum(values["vertical_oscillation_cm"]) / len(values["vertical_oscillation_cm"]), 1) if values["vertical_oscillation_cm"] else None,
    }


def _activity_route(streams: dict[str, Any]) -> list[dict[str, float]]:
    latlng = _stream_data(streams, "latlng")
    distance = _stream_data(streams, "distance")
    elapsed = _stream_data(streams, "time")
    altitude = _stream_data(streams, "altitude")
    points: list[dict[str, float]] = []
    for index, point in enumerate(latlng):
        if not isinstance(point, list | tuple) or len(point) < 2:
            continue
        latitude = _coerce_coordinate(point[0], minimum=-90, maximum=90)
        longitude = _coerce_coordinate(point[1], minimum=-180, maximum=180)
        if latitude is None or longitude is None:
            continue
        route_point = {"latitude": round(latitude, 6), "longitude": round(longitude, 6)}
        distance_m = _value_at(distance, index)
        elapsed_s = _value_at(elapsed, index)
        altitude_m = _value_at(altitude, index)
        if distance_m is not None:
            route_point["distance_km"] = round(float(distance_m) / 1000, 3)
        if elapsed_s is not None:
            route_point["elapsed_s"] = round(float(elapsed_s))
        if altitude_m is not None:
            route_point["altitude_m"] = round(float(altitude_m), 1)
        points.append(route_point)

    if len(points) < 2:
        return []

    sample_step = max(1, math.ceil(len(points) / 700))
    sampled = points[::sample_step]
    if sampled[-1] != points[-1]:
        sampled.append(points[-1])
    return sampled


def _stream_data(streams: dict[str, Any], key: str) -> list[Any]:
    value = streams.get(key) or {}
    return value.get("data", []) if isinstance(value, dict) else []


def _coerce_coordinate(value: Any, *, minimum: float, maximum: float) -> float | None:
    try:
        coordinate = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(coordinate) or coordinate < minimum or coordinate > maximum:
        return None
    return coordinate


def _value_at(values: list[Any], index: int) -> Any:
    return values[index] if index < len(values) else None


def _rounded_or_none(value: Any) -> int | None:
    return round(float(value)) if value is not None else None


def _one_decimal_or_none(value: Any) -> float | None:
    return round(float(value), 1) if value is not None else None


def _format_pace_seconds(seconds: float) -> str:
    minutes, remainder = divmod(round(seconds), 60)
    return f"{minutes}:{remainder:02d} /km"


def _format_duration(seconds: int) -> str:
    hours, remainder = divmod(seconds, 3600)
    minutes, final_seconds = divmod(remainder, 60)
    return f"{hours}:{minutes:02d}:{final_seconds:02d}" if hours else f"{minutes}:{final_seconds:02d}"


@app.get("/api/plan")
def plan(today: date | None = None) -> dict[str, Any]:
    activity_rows = database.list_activities()
    frame = activities_frame(activity_rows)
    analysis_date = today or date.today()
    metrics = dashboard_metrics(frame, today=analysis_date)
    profile = database.get_profile()
    checkin = database.latest_weekly_checkin()
    weeks = build_adaptive_plan(
        metrics,
        running_days=int(profile.get("running_days") or 4),
        goal_pace_seconds_km=profile.get("goal_pace_seconds_km"),
        checkin=checkin,
        today=analysis_date,
        include_past=True,
    )
    current_week = next(
        (week for week in weeks if week.start <= analysis_date <= week.end),
        None,
    )
    fitbit = _health_dashboard_snapshot(activity_rows, analysis_date)["devices"]["fitbit"]
    daily_agenda = _agenda_with_completion(_daily_agenda(weeks, analysis_date), frame, fitbit)
    calendar = _agenda_with_completion(
        _plan_calendar(weeks, analysis_date, frame),
        frame,
        fitbit,
    )
    return {
        "fixed": True,
        "policy": "El calendario usa el plan ajustado de 12 semanas. El bloque 2 se revisará al cerrar el bloque 1 según sensaciones, recuperación y rodilla; ninguna sesión se reescribe sin confirmación.",
        "current_date": analysis_date.isoformat(),
        "current_week_number": current_week.number if current_week else None,
        "current_week_start": (analysis_date - timedelta(days=analysis_date.weekday())).isoformat(),
        "current_week_end": (analysis_date - timedelta(days=analysis_date.weekday()) + timedelta(days=6)).isoformat(),
        "profile": profile,
        "weeks": [_serialize_week(week) for week in weeks],
        "daily_agenda": daily_agenda,
        "calendar": calendar,
    }


@app.post("/api/plan/completion")
def save_plan_completion(payload: PlanCompletionInput) -> dict[str, Any]:
    session_date = payload.session_date.isoformat()
    database.set_plan_session_completed(session_date, payload.completed)
    return {
        "session_date": session_date,
        "completed": payload.completed,
        "source": "manual" if payload.completed else None,
    }


@app.get("/api/checkin")
def get_checkin() -> dict[str, Any]:
    return {"checkin": database.latest_weekly_checkin()}


@app.post("/api/checkin")
def save_checkin(checkin: WeeklyCheckinInput) -> dict[str, Any]:
    week_start = checkin.local_date - timedelta(days=checkin.local_date.weekday())
    payload = checkin.model_dump(mode="json")
    payload["week_start"] = week_start.isoformat()
    database.save_weekly_checkin(payload)
    return {"checkin": database.latest_weekly_checkin()}


@app.get("/api/profile")
def get_profile() -> dict[str, Any]:
    return database.get_profile()


@app.get("/api/coach/status")
def coach_status() -> dict[str, Any]:
    return {
        "configured": settings.ai_is_configured,
        "model": settings.openai_model,
        "privacy": "Métricas agregadas, perfil, molestias y plan; nunca rutas GPS ni archivos.",
    }


@app.get("/api/coach/summary")
def coach_summary() -> dict[str, Any]:
    frame = activities_frame(database.list_activities())
    metrics = dashboard_metrics(frame)
    return {
        "profile": database.get_profile(),
        "metrics": {
            key: round(float(metrics[key]), 1)
            for key in (
                "distance_current_week",
                "average_weekly_28d",
                "longest_42d",
            )
        },
    }


@app.post("/api/coach/chat")
def coach_chat(payload: CoachChatInput) -> dict[str, str]:
    if not settings.ai_is_configured:
        raise HTTPException(
            status_code=503,
            detail="Configura OPENAI_API_KEY en el archivo .env y reinicia la API.",
        )

    frame = activities_frame(database.list_activities())
    today = payload.local_date or date.today()
    metrics = dashboard_metrics(frame, today=today)
    profile = database.get_profile()
    checkin = database.latest_weekly_checkin()
    plan = build_adaptive_plan(
        metrics,
        running_days=int(profile.get("running_days") or 4),
        goal_pace_seconds_km=profile.get("goal_pace_seconds_km"),
        checkin=checkin,
        today=today,
    )
    recent = frame.sort_values("start_date", ascending=False).head(8)
    recent_activities = [
        {
            "id": str(row.id),
            "date": row.start_date.date().isoformat(),
            "distance_km": round(float(row.distance_km), 2),
            "pace": format_pace(float(row.pace_min_km)),
            "average_heartrate": None if _is_nan(row.average_heartrate) else round(float(row.average_heartrate)),
            "elevation_gain_m": round(float(row.elevation_gain_m)),
            "training_load": round(float(row.training_load)),
            "running_dynamics": _running_dynamics(database.get_activity(int(row.id)) or {}).get(
                "running_dynamics_summary",
                {},
            ),
        }
        for row in recent.itertuples()
    ]
    context = build_coach_context(
        profile=profile,
        metrics=metrics,
        recent_activities=recent_activities,
        plan_weeks=[_serialize_week(week) for week in plan[:3]],
        days_to_race=max((RACE_DATE - today).days, 0),
        current_date=today.isoformat(),
        recovery=_recovery_snapshot(),
    )
    try:
        answer = ask_coach(
            api_key=settings.openai_api_key,
            model=settings.openai_model,
            context=context,
            message=payload.message,
            history=[item.model_dump() for item in payload.history],
        )
    except ValueError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    return {"answer": answer}


@app.post("/api/profile")
def save_profile(profile: ProfileInput) -> dict[str, Any]:
    profile_data = profile.model_dump()
    if profile.goal_pace_seconds_km:
        profile_data["goal_time_minutes"] = profile.goal_pace_seconds_km * 42.195 / 60
    database.save_profile(profile_data)
    return database.get_profile()


def _serialize_week(week: Any) -> dict[str, Any]:
    return {
        "number": week.number,
        "start": week.start.isoformat(),
        "end": week.end.isoformat(),
        "phase": week.phase,
        "target_km": week.target_km,
        "long_run_km": week.long_run_km,
        "sessions": list(week.sessions),
        "session_objectives": list(week.session_objectives),
        "strength_recommendation": week.strength_recommendation,
        "bike_recommendation": week.bike_recommendation,
        "risk_level": week.risk_level,
        "change_reason": week.change_reason,
        "goal_status": week.goal_status,
        "actual_km": week.actual_km,
        "completion_percentage": week.completion_percentage,
    }


def _daily_agenda(plan: list[Any], today: date, days: int = 7) -> list[dict[str, Any]]:
    """Convierte el plan fijo en instrucciones concretas para cada día."""
    relative_names = ("Hoy", "Mañana", "Pasado mañana")
    agenda: list[dict[str, Any]] = []

    for offset in range(days):
        target = today + timedelta(days=offset)
        item = _planned_day(plan, target)
        if item is None:
            continue
        item["relative_label"] = relative_names[offset] if offset < len(relative_names) else item["day"]
        agenda.append(item)
    return agenda


def _plan_calendar(
    plan: list[Any],
    today: date,
    frame: Any,
    past_weeks: int = 4,
    future_weeks: int = 3,
) -> list[dict[str, Any]]:
    if not plan:
        return []
    week_start = today - timedelta(days=today.weekday())
    calendar_start = max(plan[0].start, week_start - timedelta(weeks=past_weeks))
    calendar_end = min(plan[-1].end, week_start + timedelta(weeks=future_weeks, days=6))
    days = (calendar_end - calendar_start).days + 1
    calendar: list[dict[str, Any]] = []

    for offset in range(days):
        target = calendar_start + timedelta(days=offset)
        item = _planned_day(plan, target)
        if item is None:
            continue
        item.update(
            {
                "relative_label": "Hoy" if target == today else item["day"],
                "is_today": target == today,
                "is_past": target < today,
                "is_current_week": week_start <= target <= week_start + timedelta(days=6),
            }
        )
        calendar.append(item)
    return calendar


def _agenda_with_completion(
    agenda: list[dict[str, Any]],
    frame: Any,
    fitbit: dict[str, Any],
) -> list[dict[str, Any]]:
    if not agenda:
        return agenda
    start_date = min(item["date"] for item in agenda)
    end_date = max(item["date"] for item in agenda)
    manual_dates = {
        row["session_date"]
        for row in database.list_plan_session_completions(start_date, end_date)
        if row["completed"]
    }
    run_dates = _completed_activity_dates(frame)
    actual_by_date = _actual_activities_by_date(frame, fitbit)
    daily_metrics_by_date = _fitbit_daily_metrics_by_date(fitbit)
    fitbit_by_date: dict[str, set[str]] = {}
    for exercise in fitbit.get("exercises", []):
        exercise_date = exercise.get("date")
        exercise_type = exercise.get("type")
        if exercise_date and exercise_type:
            fitbit_by_date.setdefault(str(exercise_date), set()).add(str(exercise_type))

    for item in agenda:
        session_date = item["date"]
        category = item["category"]
        source: str | None = None
        if category == "run" and session_date in run_dates:
            source = "apple_watch"
        elif category == "bike" and "BIKING" in fitbit_by_date.get(session_date, set()):
            source = "fitbit"
        elif category == "strength" and "STRENGTH_TRAINING" in fitbit_by_date.get(session_date, set()):
            source = "fitbit"
        elif session_date in manual_dates:
            source = "manual"
        item.update(
            {
                "completed": source is not None,
                "completion_source": source,
                "completion_locked": source in {"apple_watch", "fitbit"},
                "actual_activities": actual_by_date.get(session_date, []),
                "daily_metrics": daily_metrics_by_date.get(session_date),
            }
        )
    return agenda


def _actual_activities_by_date(
    frame: Any,
    fitbit: dict[str, Any],
) -> dict[str, list[dict[str, Any]]]:
    actual: dict[str, list[dict[str, Any]]] = {}
    if not getattr(frame, "empty", True):
        for row in frame.itertuples():
            session_date = row.start_date.date().isoformat()
            actual.setdefault(session_date, []).append(
                {
                    "type": "RUNNING",
                    "label": str(row.name),
                    "source": "Apple Watch",
                    "duration_minutes": round(float(row.moving_minutes)),
                    "distance_km": round(float(row.distance_km), 2),
                    "calories": None if _is_nan(row.calories) else round(float(row.calories)),
                    "average_heartrate": (
                        None
                        if _is_nan(row.average_heartrate)
                        else round(float(row.average_heartrate))
                    ),
                    "zone_minutes": None,
                }
            )
    for exercise in fitbit.get("exercises", []):
        session_date = exercise.get("date")
        if not session_date:
            continue
        actual.setdefault(str(session_date), []).append(
            {
                key: exercise.get(key)
                for key in (
                    "type",
                    "label",
                    "source",
                    "duration_minutes",
                    "distance_km",
                    "calories",
                    "average_heartrate",
                    "zone_minutes",
                )
            }
        )
    return actual


def _fitbit_daily_metrics_by_date(fitbit: dict[str, Any]) -> dict[str, dict[str, Any]]:
    metrics: dict[str, dict[str, Any]] = {}

    def merge(series: str, mappings: dict[str, str]) -> None:
        for day in (fitbit.get(series) or {}).get("days", []):
            session_date = day.get("date")
            if not session_date:
                continue
            target = metrics.setdefault(str(session_date), {})
            for source_key, target_key in mappings.items():
                if day.get(source_key) is not None:
                    target[target_key] = day[source_key]

    merge("steps", {"count": "steps"})
    merge("active_energy", {"kcal": "active_energy_kcal"})
    merge("total_calories", {"kcal": "total_calories_kcal"})
    merge(
        "daily_activity",
        {
            "active_minutes": "active_minutes",
            "zone_minutes": "zone_minutes",
            "distance_km": "distance_km",
            "sedentary_minutes": "sedentary_minutes",
        },
    )
    return metrics


def _planned_day(plan: list[Any], target: date) -> dict[str, Any] | None:
    day_names = ("Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo")
    day_name = day_names[target.weekday()]
    week = next((item for item in plan if item.start <= target <= item.end), None)
    if week is None:
        return None

    session = _session_for_day(week, day_name)
    if session is not None:
        session_index, instruction = session
        lowered = instruction.casefold()
        if "descanso" in lowered or "sin tirada" in lowered or "no correr" in lowered:
            category = "rest"
        elif "bicicleta" in lowered:
            category = "bike"
        else:
            category = "run"
        detail = (
            week.session_objectives[session_index]
            if session_index < len(week.session_objectives)
            else f"Sesión de la semana {week.number} del plan fijo."
        )
        title = _sentence_case(instruction)
    elif target.weekday() == 2:
        category = "strength"
        title = "Gimnasio · fuerza de piernas"
        detail = _recommendation_for_day(week.strength_recommendation, day_name)
    elif target.weekday() == 4:
        category = "rest"
        title = "Movilidad y core · sin piernas"
        detail = _recommendation_for_day(week.strength_recommendation, day_name)
    elif target.weekday() == 0:
        category = "bike"
        title = "Bicicleta suave opcional"
        detail = _recommendation_for_day(week.bike_recommendation, day_name)
    else:
        category = "rest"
        if target.weekday() == 5:
            title = "Descanso previo a la tirada larga"
            detail = "Movilidad suave y buena hidratación. Nada de fuerza pesada para llegar fresco al domingo."
        else:
            title = "Descanso y movilidad"
            detail = "Recuperación completa; una sesión perdida no se acumula en este día."

    return {
        "date": target.isoformat(),
        "day": day_name,
        "relative_label": day_name,
        "category": category,
        "title": title,
        "detail": detail,
        "week_number": week.number,
        "phase": week.phase,
        "week_target_km": week.target_km,
    }


def _completed_activity_dates(frame: Any) -> set[str]:
    if getattr(frame, "empty", True):
        return set()
    try:
        return {value.date().isoformat() for value in frame["start_date"].dropna()}
    except Exception:
        return set()


def _session_for_day(week: Any, day_name: str) -> tuple[int, str] | None:
    for index, session in enumerate(week.sessions):
        label, separator, instruction = session.partition(":")
        if separator and label.strip().casefold() == day_name.casefold():
            return index, instruction.strip()
    return None


def _recommendation_for_day(recommendation: str, day_name: str) -> str:
    for sentence in recommendation.split("."):
        label, separator, instruction = sentence.partition(":")
        if separator and day_name.casefold() in label.casefold():
            return instruction.strip()
    return recommendation.strip()


def _sentence_case(value: str) -> str:
    return value[:1].upper() + value[1:] if value else value


def _is_nan(value: Any) -> bool:
    try:
        return value != value
    except TypeError:
        return False
