from __future__ import annotations

import json
import math
from datetime import date, timedelta
from typing import Any

import pandas as pd


RUN_TYPES = {"Run", "TrailRun", "VirtualRun"}


def activities_frame(rows: list[dict[str, Any]]) -> pd.DataFrame:
    columns = [
        "id", "name", "sport_type", "start_date", "distance_km", "moving_minutes",
        "elevation_gain_m", "average_heartrate", "max_heartrate", "pace_min_km",
        "training_load", "streams_loaded",
    ]
    if not rows:
        return pd.DataFrame(columns=columns)

    records: list[dict[str, Any]] = []
    for row in rows:
        if row["sport_type"] not in RUN_TYPES:
            continue
        distance_km = float(row["distance_m"] or 0) / 1000
        moving_minutes = float(row["moving_time_s"] or 0) / 60
        pace = moving_minutes / distance_km if distance_km > 0 else math.nan
        records.append(
            {
                "id": int(row["id"]),
                "name": row["name"],
                "sport_type": row["sport_type"],
                "start_date": pd.to_datetime(row["start_date_local"], utc=True, errors="coerce"),
                "distance_km": distance_km,
                "moving_minutes": moving_minutes,
                "elevation_gain_m": float(row["elevation_gain_m"] or 0),
                "average_heartrate": _number_or_nan(row["average_heartrate"]),
                "max_heartrate": _number_or_nan(row["max_heartrate"]),
                "pace_min_km": pace,
                "training_load": activity_training_load(row),
                "streams_loaded": bool(row["streams_loaded"]),
            }
        )

    frame = pd.DataFrame.from_records(records, columns=columns)
    if not frame.empty:
        frame = frame.dropna(subset=["start_date"]).sort_values("start_date")
    return frame


def activity_training_load(row: dict[str, Any], max_hr: int | None = None) -> float:
    """Carga interna aproximada; prefiere Relative Effort y después FC/duración."""
    if row.get("suffer_score") is not None:
        return float(row["suffer_score"])

    duration_minutes = float(row.get("moving_time_s") or 0) / 60
    average_hr = row.get("average_heartrate")
    if average_hr:
        estimated_max = max_hr or max(float(row.get("max_heartrate") or 0), 190)
        intensity = min(max(float(average_hr) / estimated_max, 0.5), 1.0)
        return duration_minutes * intensity * intensity
    return duration_minutes * 0.5


def weekly_summary(frame: pd.DataFrame) -> pd.DataFrame:
    if frame.empty:
        return pd.DataFrame(columns=["week", "distance_km", "moving_minutes", "runs", "elevation_gain_m", "training_load"])

    data = frame.copy()
    local_dates = data["start_date"].dt.tz_convert(None)
    data["week"] = local_dates.dt.to_period("W-SUN").apply(lambda period: period.start_time.date())
    return (
        data.groupby("week", as_index=False)
        .agg(
            distance_km=("distance_km", "sum"),
            moving_minutes=("moving_minutes", "sum"),
            runs=("id", "count"),
            elevation_gain_m=("elevation_gain_m", "sum"),
            training_load=("training_load", "sum"),
        )
        .sort_values("week")
    )


def dashboard_metrics(frame: pd.DataFrame, today: date | None = None) -> dict[str, Any]:
    today = today or date.today()
    if frame.empty:
        return {
            "distance_current_week": 0.0,
            "runs_current_week": 0,
            "distance_7d": 0.0,
            "distance_28d": 0.0,
            "runs_28d": 0,
            "longest_42d": 0.0,
            "load_7d": 0.0,
            "load_previous_7d": 0.0,
            "average_weekly_28d": 0.0,
            "hr_coverage": 0.0,
        }

    activity_dates = frame["start_date"].dt.date
    week_start = today - timedelta(days=today.weekday())
    current_week = frame[activity_dates >= week_start]
    last_7 = frame[activity_dates >= today - timedelta(days=6)]
    previous_7 = frame[(activity_dates >= today - timedelta(days=13)) & (activity_dates < today - timedelta(days=6))]
    last_28 = frame[activity_dates >= today - timedelta(days=27)]
    last_42 = frame[activity_dates >= today - timedelta(days=41)]
    return {
        "distance_current_week": float(current_week["distance_km"].sum()),
        "runs_current_week": int(len(current_week)),
        "distance_7d": float(last_7["distance_km"].sum()),
        "distance_28d": float(last_28["distance_km"].sum()),
        "runs_28d": int(len(last_28)),
        "longest_42d": float(last_42["distance_km"].max()) if not last_42.empty else 0.0,
        "load_7d": float(last_7["training_load"].sum()),
        "load_previous_7d": float(previous_7["training_load"].sum()),
        "average_weekly_28d": float(last_28["distance_km"].sum()) / 4,
        "hr_coverage": float(last_28["average_heartrate"].notna().mean() * 100) if not last_28.empty else 0.0,
    }


def heart_rate_drift(row: dict[str, Any]) -> float | None:
    """Compara eficiencia ritmo/FC entre las dos mitades de una carrera."""
    if not row.get("streams_json"):
        return None
    streams = json.loads(row["streams_json"])
    heartrate = _stream_data(streams, "heartrate")
    velocity = _stream_data(streams, "velocity_smooth")
    moving = _stream_data(streams, "moving")
    if len(heartrate) < 20 or len(heartrate) != len(velocity):
        return None

    samples = [
        (float(speed), float(hr))
        for index, (speed, hr) in enumerate(zip(velocity, heartrate))
        if speed and hr and (not moving or bool(moving[index]))
    ]
    if len(samples) < 20:
        return None
    midpoint = len(samples) // 2
    first = samples[:midpoint]
    second = samples[midpoint:]
    first_efficiency = _mean(speed / hr for speed, hr in first)
    second_efficiency = _mean(speed / hr for speed, hr in second)
    if not first_efficiency:
        return None
    return (first_efficiency - second_efficiency) / first_efficiency * 100


def readiness_assessment(metrics: dict[str, Any], days_to_race: int) -> tuple[str, list[str]]:
    notes: list[str] = []
    weekly = metrics["average_weekly_28d"]
    longest = metrics["longest_42d"]
    frequency = metrics["runs_28d"] / 4

    if weekly < 20:
        notes.append("La base reciente es menor de 20 km/semana; la prioridad es aumentar con prudencia.")
    elif weekly < 35:
        notes.append("Hay una base moderada, pero todavía falta volumen específico de maratón.")
    else:
        notes.append("El volumen reciente ofrece una base útil para el bloque específico.")

    if longest < 15:
        notes.append("La tirada larga reciente aún está por debajo de 15 km.")
    elif longest < 24:
        notes.append("La tirada larga progresa, aunque todavía debe acercarse gradualmente a 28–32 km.")
    else:
        notes.append("La tirada larga ya está entrando en un rango específico de maratón.")

    if frequency < 3:
        notes.append("Conviene consolidar al menos tres días de carrera semanales antes de añadir intensidad.")

    if days_to_race <= 21:
        status = "Taper"
    elif weekly >= 35 and longest >= 24 and frequency >= 3:
        status = "Base sólida"
    elif weekly >= 20 and frequency >= 3:
        status = "En construcción"
    else:
        status = "Base inicial"
    return status, notes


def format_pace(minutes_per_km: float | None) -> str:
    if minutes_per_km is None or pd.isna(minutes_per_km) or minutes_per_km <= 0:
        return "—"
    minutes = int(minutes_per_km)
    seconds = round((minutes_per_km - minutes) * 60)
    if seconds == 60:
        minutes += 1
        seconds = 0
    return f"{minutes}:{seconds:02d} min/km"


def _stream_data(streams: dict[str, Any], key: str) -> list[Any]:
    value = streams.get(key, {})
    return value.get("data", []) if isinstance(value, dict) else []


def _number_or_nan(value: Any) -> float:
    return float(value) if value is not None else math.nan


def _mean(values: Any) -> float:
    items = list(values)
    return sum(items) / len(items) if items else 0.0
