from __future__ import annotations

import sys
import json
import math
from dataclasses import asdict
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "src"))

from strava_agent.config import get_settings
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
from strava_agent.training_plan import RACE_DATE, build_adaptive_plan


settings = get_settings()
database = Database(settings.database_path)
app = FastAPI(title="Chicago Marathon Coach API", version="0.2.0")
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
        **detail,
    }


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
            "date": row.start_date.date().isoformat(),
            "distance_km": round(float(row.distance_km), 2),
            "pace": format_pace(float(row.pace_min_km)),
            "average_heartrate": None if _is_nan(row.average_heartrate) else round(float(row.average_heartrate)),
            "elevation_gain_m": round(float(row.elevation_gain_m)),
            "training_load": round(float(row.training_load)),
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
