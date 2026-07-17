from __future__ import annotations

import hashlib
import math
from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Any

from .database import Database


@dataclass(frozen=True)
class AppleHealthImportResult:
    workouts_received: int
    workouts_saved: int
    runs_imported: int
    runs_updated: int
    workouts_skipped: int
    metrics_received: int
    metrics_imported: int
    metrics_updated: int


def import_health_auto_export(payload: dict[str, Any], database: Database) -> AppleHealthImportResult:
    data = payload.get("data")
    if not isinstance(data, dict):
        raise ValueError("El JSON no contiene el objeto data de Health Auto Export.")

    workouts = data.get("workouts") or []
    metrics = data.get("metrics") or []
    if not isinstance(workouts, list) or not isinstance(metrics, list):
        raise ValueError("El formato de workouts o metrics no es válido.")
    if not workouts and not metrics:
        raise ValueError("El envío no contiene entrenamientos ni métricas.")

    workouts_saved = runs_imported = runs_updated = workouts_skipped = 0
    for workout in workouts:
        if not isinstance(workout, dict) or not workout.get("id"):
            workouts_skipped += 1
            continue
        database.upsert_apple_health_workout(workout)
        workouts_saved += 1
        if not _is_running_workout(str(workout.get("name") or "")):
            continue
        activity = _workout_to_activity(workout, database)
        if activity is None:
            workouts_skipped += 1
            continue
        existed = database.get_activity(int(activity["id"])) is not None
        database.upsert_activity(
            activity,
            detail_loaded=True,
            streams=_workout_streams(workout),
        )
        if existed:
            runs_updated += 1
        else:
            runs_imported += 1

    metrics_received = metrics_imported = metrics_updated = 0
    for metric in metrics:
        if not isinstance(metric, dict) or not metric.get("name"):
            continue
        measurements = metric.get("data") or []
        if not isinstance(measurements, list):
            continue
        for measurement in measurements:
            if not isinstance(measurement, dict):
                continue
            metrics_received += 1
            existed = database.upsert_apple_health_metric(
                str(metric["name"]),
                measurement,
                default_units=str(metric.get("units") or ""),
            )
            if existed:
                metrics_updated += 1
            else:
                metrics_imported += 1

    database.record_apple_health_sync(len(workouts), metrics_received)
    return AppleHealthImportResult(
        workouts_received=len(workouts),
        workouts_saved=workouts_saved,
        runs_imported=runs_imported,
        runs_updated=runs_updated,
        workouts_skipped=workouts_skipped,
        metrics_received=metrics_received,
        metrics_imported=metrics_imported,
        metrics_updated=metrics_updated,
    )


def result_dict(result: AppleHealthImportResult) -> dict[str, int]:
    return asdict(result)


def _workout_to_activity(workout: dict[str, Any], database: Database) -> dict[str, Any] | None:
    start = _parse_date(workout.get("start"))
    end = _parse_date(workout.get("end"))
    if start is None:
        return None

    duration = _number(workout.get("duration"))
    if not duration and end:
        duration = max((end - start).total_seconds(), 0)
    moving_time = round(duration or 0)
    distance_m = _distance_m(workout.get("distance"))
    matching = database.find_matching_activity(start.isoformat(), distance_m) if distance_m else None
    activity_id = int(matching["id"]) if matching else _stable_activity_id(str(workout["id"]))

    heart_rate = workout.get("heartRateData") or []
    hr_values = [_heart_rate_value(item) for item in heart_rate if isinstance(item, dict)]
    hr_values = [value for value in hr_values if value is not None]
    average_hr = _quantity(workout.get("avgHeartRate"))
    if average_hr is None and hr_values:
        average_hr = sum(hr_values) / len(hr_values)
    maximum_hr = max(hr_values) if hr_values else None

    average_speed = distance_m / moving_time if distance_m and moving_time else None
    return {
        "id": activity_id,
        "name": "Carrera · Apple Watch",
        "sport_type": "Run",
        "type": "Run",
        "start_date": start.isoformat(),
        "start_date_local": start.isoformat(),
        "timezone": "",
        "distance": distance_m,
        "moving_time": moving_time,
        "elapsed_time": round((end - start).total_seconds()) if end else moving_time,
        "total_elevation_gain": _elevation_m(workout.get("elevationUp")),
        "average_speed": average_speed,
        "max_speed": _speed_mps(workout.get("maxSpeed")),
        "average_heartrate": average_hr,
        "max_heartrate": maximum_hr,
        "suffer_score": None,
        "calories": _quantity(workout.get("activeEnergyBurned")),
        "has_heartrate": average_hr is not None,
        "device_name": _workout_source(workout),
        "source": "health_auto_export",
        "apple_health_workout_id": str(workout["id"]),
    }


def _workout_streams(workout: dict[str, Any]) -> dict[str, dict[str, list[Any]]] | None:
    route = workout.get("route") or []
    if not isinstance(route, list) or len(route) < 2:
        return None

    points: list[tuple[datetime, float, float, float | None, float | None]] = []
    for location in route:
        if not isinstance(location, dict):
            continue
        timestamp = _parse_date(location.get("timestamp"))
        latitude = _number(location.get("latitude", location.get("lat")))
        longitude = _number(location.get("longitude", location.get("lon")))
        if timestamp is None or latitude is None or longitude is None:
            continue
        altitude = _number(location.get("altitude"))
        speed = _number(location.get("speed"))
        points.append((timestamp, latitude, longitude, altitude, speed))
    points.sort(key=lambda point: point[0])
    if len(points) < 2:
        return None

    heart_rates = []
    for sample in workout.get("heartRateData") or []:
        if not isinstance(sample, dict):
            continue
        timestamp = _parse_date(sample.get("date"))
        value = _heart_rate_value(sample)
        if timestamp and value is not None:
            heart_rates.append((timestamp, value))
    heart_rates.sort(key=lambda sample: sample[0])

    start = points[0][0]
    cumulative = 0.0
    distances = [0.0]
    speeds: list[float | None] = [points[0][4]]
    for previous, current in zip(points, points[1:]):
        segment = _haversine((previous[1], previous[2]), (current[1], current[2]))
        cumulative += segment
        distances.append(round(cumulative, 1))
        seconds = (current[0] - previous[0]).total_seconds()
        speeds.append(current[4] if current[4] is not None else (segment / seconds if seconds > 0 else None))

    streams: dict[str, dict[str, list[Any]]] = {
        "time": {"data": [max(0, round((point[0] - start).total_seconds())) for point in points]},
        "distance": {"data": distances},
        "latlng": {"data": [[point[1], point[2]] for point in points]},
        "altitude": {"data": [point[3] for point in points]},
        "velocity_smooth": {"data": speeds},
    }
    if heart_rates:
        streams["heartrate"] = {
            "data": [_nearest_heart_rate(point[0], heart_rates) for point in points]
        }
    return streams


def _nearest_heart_rate(
    timestamp: datetime,
    samples: list[tuple[datetime, float]],
) -> float | None:
    nearest = min(samples, key=lambda sample: abs((sample[0] - timestamp).total_seconds()))
    return nearest[1] if abs((nearest[0] - timestamp).total_seconds()) <= 120 else None


def _parse_date(value: Any) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    for candidate in (text, text.replace("Z", "+00:00")):
        try:
            return datetime.fromisoformat(candidate)
        except ValueError:
            continue
    return None


def _is_running_workout(name: str) -> bool:
    normalized = name.lower().strip()
    return any(token in normalized for token in ("running", "run", "carrera", "correr"))


def _stable_activity_id(workout_id: str) -> int:
    digest = hashlib.sha256(f"apple-health|{workout_id}".encode()).digest()
    return int.from_bytes(digest[:8], "big") & ((1 << 63) - 1)


def _quantity(value: Any) -> float | None:
    if isinstance(value, dict):
        return _number(value.get("qty", value.get("Avg")))
    return _number(value)


def _heart_rate_value(value: dict[str, Any]) -> float | None:
    return _number(value.get("Avg", value.get("qty")))


def _distance_m(value: Any) -> float:
    quantity = _quantity(value) or 0.0
    units = str(value.get("units") or "m").lower() if isinstance(value, dict) else "m"
    if units in {"km", "kilometer", "kilometers"}:
        return quantity * 1000
    if units in {"mi", "mile", "miles"}:
        return quantity * 1609.344
    return quantity


def _elevation_m(value: Any) -> float:
    quantity = _quantity(value) or 0.0
    units = str(value.get("units") or "m").lower() if isinstance(value, dict) else "m"
    return quantity * 0.3048 if units in {"ft", "feet"} else quantity


def _speed_mps(value: Any) -> float | None:
    quantity = _quantity(value)
    if quantity is None:
        return None
    units = str(value.get("units") or "").lower() if isinstance(value, dict) else ""
    if units in {"kmph", "km/h", "kph"}:
        return quantity / 3.6
    if units in {"mph", "mi/h"}:
        return quantity * 0.44704
    return quantity


def _workout_source(workout: dict[str, Any]) -> str:
    for key in ("source", "sourceName", "device"):
        value = workout.get(key)
        if value:
            return str(value)
    for sample in workout.get("heartRateData") or []:
        if isinstance(sample, dict) and sample.get("source"):
            return str(sample["source"])
    return "Apple Health"


def _number(value: Any) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _haversine(first: tuple[float, float], second: tuple[float, float]) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (*first, *second))
    dlat, dlon = lat2 - lat1, lon2 - lon1
    value = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6_371_000 * 2 * math.atan2(math.sqrt(value), math.sqrt(max(1 - value, 0)))
