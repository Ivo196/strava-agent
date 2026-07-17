from __future__ import annotations

import sys
import json
import math
import secrets
from dataclasses import asdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Literal

from fastapi import BackgroundTasks, FastAPI, File, Header, HTTPException, Request, UploadFile
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
from strava_agent.importers import import_strava_archive
from strava_agent.google_health import (
    GoogleHealthCredentials,
    GoogleHealthService,
    normalized_recovery_value,
)
from strava_agent.training_plan import RACE_DATE, build_adaptive_plan


settings = get_settings()
database = Database(settings.database_path)
app = FastAPI(title="PaceOS API", version="0.3.0")
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


@app.get("/api/google-health/status")
def google_health_status() -> dict[str, Any]:
    return {
        "configured": settings.google_health_is_configured,
        **database.google_health_status(),
    }


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
    background_tasks.add_task(service.sync)
    return RedirectResponse(f"{target}?google_health=connected")


@app.post("/api/google-health/sync")
def sync_google_health() -> dict[str, Any]:
    try:
        return _google_health_service().sync()
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
        return result_dict(import_health_auto_export(payload, database))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/dashboard")
def dashboard() -> dict[str, Any]:
    rows = database.list_activities()
    frame = activities_frame(rows)
    today = date.today()
    metrics = dashboard_metrics(frame, today=today)
    weeks = weekly_summary(frame).tail(16)
    profile = database.get_profile()
    checkin = database.latest_weekly_checkin()
    days_to_race = max((RACE_DATE - today).days, 0)
    status, notes = readiness_assessment(metrics, days_to_race)
    plan = build_adaptive_plan(
        metrics,
        running_days=int(profile.get("running_days") or 4),
        goal_pace_seconds_km=profile.get("goal_pace_seconds_km"),
        checkin=checkin,
        today=today,
    )

    recent = frame.sort_values("start_date", ascending=False).head(5)
    activities = [
        {
            "id": int(row.id),
            "name": row.name,
            "date": row.start_date.date().isoformat(),
            "distance_km": round(float(row.distance_km), 2),
            "pace": format_pace(float(row.pace_min_km)),
            "average_heartrate": None if _is_nan(row.average_heartrate) else round(float(row.average_heartrate)),
            "elevation_gain_m": round(float(row.elevation_gain_m)),
            "training_load": round(float(row.training_load)),
        }
        for row in recent.itertuples()
    ]
    next_week = _serialize_week(plan[0]) if plan else None

    return {
        "activity_count": database.activity_count(),
        "days_to_race": days_to_race,
        "race_date": RACE_DATE.isoformat(),
        "profile": profile,
        "metrics": {key: round(float(value), 1) for key, value in metrics.items()},
        "readiness": {"status": status, "notes": notes},
        "recovery": _recovery_snapshot(),
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
        "next_week": next_week,
        "upcoming_weeks": [_serialize_week(week) for week in plan[:2]],
    }


@app.get("/api/activities")
def activities() -> dict[str, Any]:
    frame = activities_frame(database.list_activities()).sort_values("start_date", ascending=False)
    items = [
        {
            "id": int(row.id),
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
    detail = _activity_series(streams) if streams else {"series": [], "splits": []}
    dynamics = _running_dynamics(activity)
    return {
        "activity": {
            "id": int(activity["id"]),
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


def _recovery_snapshot() -> dict[str, Any]:
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
    result = {
        "hrv": metric("heart_rate_variability", average_7d=True),
        "resting_hr": metric("resting_heart_rate", average_7d=True),
        "vo2_max": metric("vo2_max"),
        "sleep": sleep,
        "weight": metric("weight_&_body_mass"),
    }
    google = _google_recovery_snapshot()
    combined = {key: google.get(key) or value for key, value in result.items()}
    google_status = database.google_health_status()
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


def _parse_health_datetime(value: Any) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None


def _activity_series(streams: dict[str, Any]) -> dict[str, Any]:
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
        split_altitude = [_value_at(altitude, i) for i in range(start_index, end_index + 1)]
        split_altitude = [float(value) for value in split_altitude if value is not None]
        elevation_gain = sum(max(0, second - first) for first, second in zip(split_altitude, split_altitude[1:]))
        splits.append(
            {
                "kilometer": split_number,
                "label": f"Km {split_number}" if split_distance >= 900 else "Final",
                "distance_km": round(split_distance / 1000, 2),
                "pace": _format_pace_seconds(normalized_pace_seconds),
                "pace_seconds": round(normalized_pace_seconds),
                "average_heartrate": round(sum(split_hr) / len(split_hr)) if split_hr else None,
                "elevation_gain_m": round(elevation_gain),
            }
        )
        start_index = end_index
        split_number += 1
        threshold += 1000
        if end_index == length - 1:
            break
    return {"series": series, "splits": splits}


def _stream_data(streams: dict[str, Any], key: str) -> list[Any]:
    value = streams.get(key) or {}
    return value.get("data", []) if isinstance(value, dict) else []


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
def plan() -> dict[str, Any]:
    frame = activities_frame(database.list_activities())
    metrics = dashboard_metrics(frame)
    profile = database.get_profile()
    checkin = database.latest_weekly_checkin()
    weeks = build_adaptive_plan(
        metrics,
        running_days=int(profile.get("running_days") or 4),
        goal_pace_seconds_km=profile.get("goal_pace_seconds_km"),
        checkin=checkin,
    )
    return {
        "fixed": True,
        "policy": "Los datos reales actualizan el estado del atleta, nunca las sesiones planificadas.",
        "weeks": [_serialize_week(week) for week in weeks],
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
            "id": int(row.id),
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


@app.post("/api/import/strava-archive")
async def import_strava_export(file: UploadFile = File(...)) -> dict[str, Any]:
    if not (file.filename or "").lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Selecciona el ZIP completo enviado por Strava.")
    archive_bytes = await file.read(500_000_001)
    if len(archive_bytes) > 500_000_000:
        raise HTTPException(status_code=413, detail="El ZIP supera el límite de 500 MB.")
    try:
        return asdict(import_strava_archive(archive_bytes, database))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


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


def _is_nan(value: Any) -> bool:
    try:
        return value != value
    except TypeError:
        return False
