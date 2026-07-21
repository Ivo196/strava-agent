from __future__ import annotations

import hashlib
import json
import math
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import PurePosixPath
from typing import Any
from xml.etree.ElementTree import iterparse
from zipfile import ZipFile

from .database import Database


APPLE_EXPORT_ROOT = "apple_health_export"
METRIC_BATCH_SIZE = 2_000


@dataclass(frozen=True)
class AppleHealthExportImportResult:
    workouts_received: int
    workouts_saved: int
    runs_imported: int
    runs_updated: int
    routes_imported: int
    metrics_imported: int
    metrics_updated: int
    sleep_days_imported: int
    sleep_days_updated: int


RECORD_METRICS = {
    "HKQuantityTypeIdentifierHeartRate": "heart_rate",
    "HKQuantityTypeIdentifierHeartRateVariabilitySDNN": "heart_rate_variability",
    "HKQuantityTypeIdentifierRestingHeartRate": "resting_heart_rate",
    "HKQuantityTypeIdentifierVO2Max": "vo2_max",
    "HKQuantityTypeIdentifierBodyMass": "weight_&_body_mass",
    "HKQuantityTypeIdentifierRunningPower": "running_power",
    "HKQuantityTypeIdentifierRunningSpeed": "running_speed",
    "HKQuantityTypeIdentifierRunningGroundContactTime": "running_ground_contact_time",
    "HKQuantityTypeIdentifierRunningStrideLength": "running_stride_length",
    "HKQuantityTypeIdentifierRunningVerticalOscillation": "running_vertical_oscillation",
}


SLEEP_VALUES = {
    "HKCategoryValueSleepAnalysisAsleepCore": "core",
    "HKCategoryValueSleepAnalysisAsleepREM": "rem",
    "HKCategoryValueSleepAnalysisAsleepDeep": "deep",
    "HKCategoryValueSleepAnalysisAsleepUnspecified": "core",
    "HKCategoryValueSleepAnalysisInBed": "in_bed",
    "HKCategoryValueSleepAnalysisAwake": "awake",
}


def import_apple_health_export_zip(zip_path: str, database: Database) -> AppleHealthExportImportResult:
    workouts_received = workouts_saved = runs_imported = runs_updated = routes_imported = 0
    metrics_imported = metrics_updated = 0
    sleep_days_imported = sleep_days_updated = 0
    sleep_by_day: dict[str, dict[str, Any]] = {}
    metric_batch: list[tuple[str, dict[str, Any], str]] = []

    def flush_metrics() -> None:
        nonlocal metrics_imported, metrics_updated
        if not metric_batch:
            return
        imported, updated = database.upsert_apple_health_metrics_batch(metric_batch)
        metrics_imported += imported
        metrics_updated += updated
        metric_batch.clear()

    with ZipFile(zip_path) as archive:
        export_name = _find_export_xml(archive)
        with archive.open(export_name) as export_xml:
            for _event, elem in iterparse(export_xml, events=("end",)):
                if elem.tag == "Workout":
                    workouts_received += 1
                    workout = _workout_payload(elem)
                    database.upsert_apple_health_workout(workout)
                    workouts_saved += 1

                    if _is_running_workout(workout["workoutActivityType"]) and _is_apple_watch_workout(workout):
                        streams = _route_streams_for_workout(archive, workout)
                        if streams:
                            routes_imported += 1
                        activity = _workout_to_activity(
                            workout,
                            database,
                            elevation_gain=_stream_value(streams, "elevation_gain"),
                            max_speed=_stream_value(streams, "max_speed"),
                        )
                        existed = database.get_activity(int(activity["id"])) is not None
                        database.upsert_activity(activity, detail_loaded=True, streams=streams)
                        if existed:
                            runs_updated += 1
                        else:
                            runs_imported += 1
                    elem.clear()
                    continue

                if elem.tag == "Record":
                    metric_name = RECORD_METRICS.get(elem.attrib.get("type", ""))
                    if metric_name:
                        metric_batch.append(
                            (
                                metric_name,
                                _record_measurement(elem.attrib),
                                elem.attrib.get("unit", ""),
                            )
                        )
                        if len(metric_batch) >= METRIC_BATCH_SIZE:
                            flush_metrics()
                    elif elem.attrib.get("type") == "HKCategoryTypeIdentifierSleepAnalysis":
                        _add_sleep_record(sleep_by_day, elem.attrib)
                    elem.clear()

        flush_metrics()

        for measurement in sleep_by_day.values():
            existed = database.upsert_apple_health_metric("sleep_analysis", measurement, default_units="h")
            if existed:
                sleep_days_updated += 1
            else:
                sleep_days_imported += 1

    database.record_apple_health_sync(workouts_received, metrics_imported + metrics_updated)
    return AppleHealthExportImportResult(
        workouts_received=workouts_received,
        workouts_saved=workouts_saved,
        runs_imported=runs_imported,
        runs_updated=runs_updated,
        routes_imported=routes_imported,
        metrics_imported=metrics_imported,
        metrics_updated=metrics_updated,
        sleep_days_imported=sleep_days_imported,
        sleep_days_updated=sleep_days_updated,
    )


def result_dict(result: AppleHealthExportImportResult) -> dict[str, int]:
    return asdict(result)


def _find_export_xml(archive: ZipFile) -> str:
    for name in archive.namelist():
        if name.endswith("/export.xml"):
            return name
    raise ValueError("El ZIP no contiene apple_health_export/export.xml.")


def _workout_payload(elem: Any) -> dict[str, Any]:
    payload: dict[str, Any] = dict(elem.attrib)
    payload["id"] = _stable_id("workout", _workout_key(payload))
    payload["name"] = payload.get("workoutActivityType", "Workout").removeprefix("HKWorkoutActivityType")
    payload["start"] = payload.get("startDate", "")
    payload["end"] = payload.get("endDate", "")
    payload["source"] = payload.get("sourceName", "Apple Health")
    payload["statistics"] = [dict(child.attrib) for child in list(elem) if child.tag == "WorkoutStatistics"]
    payload["metadata"] = [dict(child.attrib) for child in list(elem) if child.tag == "MetadataEntry"]
    payload["routes"] = [_route_payload(child) for child in list(elem) if child.tag == "WorkoutRoute"]
    return payload


def _route_payload(elem: Any) -> dict[str, Any]:
    payload = dict(elem.attrib)
    payload["metadata"] = [dict(child.attrib) for child in list(elem) if child.tag == "MetadataEntry"]
    references = [dict(child.attrib) for child in list(elem) if child.tag == "FileReference"]
    payload["file_references"] = references
    return payload


def _workout_to_activity(
    workout: dict[str, Any],
    database: Database,
    *,
    elevation_gain: float | None = None,
    max_speed: float | None = None,
) -> dict[str, Any]:
    start = _parse_date(workout.get("startDate"))
    end = _parse_date(workout.get("endDate"))
    duration = _duration_seconds(workout.get("duration"), workout.get("durationUnit"))
    if not duration and start and end:
        duration = max(round((end - start).total_seconds()), 0)
    distance = _workout_stat(workout, "HKQuantityTypeIdentifierDistanceWalkingRunning", "sum")
    distance_m = _distance_m(distance, _workout_stat(workout, "HKQuantityTypeIdentifierDistanceWalkingRunning", "unit"))
    matching = database.find_matching_activity(start.isoformat(), distance_m) if start and distance_m else None
    activity_id = int(matching["id"]) if matching else _stable_id("activity", str(workout["id"]))
    average_hr = _number(_workout_stat(workout, "HKQuantityTypeIdentifierHeartRate", "average"))
    max_hr = _number(_workout_stat(workout, "HKQuantityTypeIdentifierHeartRate", "maximum"))
    calories = _number(_workout_stat(workout, "HKQuantityTypeIdentifierActiveEnergyBurned", "sum"))
    speed = _number(_workout_stat(workout, "HKQuantityTypeIdentifierRunningSpeed", "average"))
    speed_mps = _speed_mps(speed, _workout_stat(workout, "HKQuantityTypeIdentifierRunningSpeed", "unit"))

    return {
        "id": activity_id,
        "name": "Carrera · Apple Health",
        "sport_type": "Run",
        "type": "Run",
        "start_date": start.isoformat() if start else str(workout.get("startDate") or ""),
        "start_date_local": start.isoformat() if start else str(workout.get("startDate") or ""),
        "timezone": "",
        "distance": distance_m,
        "moving_time": duration,
        "elapsed_time": round((end - start).total_seconds()) if start and end else duration,
        "total_elevation_gain": elevation_gain or 0,
        "average_speed": speed_mps or (distance_m / duration if distance_m and duration else None),
        "max_speed": max_speed,
        "average_heartrate": average_hr,
        "max_heartrate": max_hr,
        "suffer_score": None,
        "calories": calories,
        "has_heartrate": average_hr is not None,
        "device_name": workout.get("sourceName") or "Apple Health",
        "source": "apple_health_export",
        "apple_health_workout_id": str(workout["id"]),
        "apple_health_statistics": workout.get("statistics", []),
    }


def _route_streams_for_workout(archive: ZipFile, workout: dict[str, Any]) -> dict[str, dict[str, list[Any]]] | None:
    for route in workout.get("routes", []):
        for reference in route.get("file_references", []):
            path = reference.get("path")
            if not path:
                continue
            archive_name = str(PurePosixPath(APPLE_EXPORT_ROOT) / path.lstrip("/"))
            if archive_name not in archive.namelist():
                continue
            with archive.open(archive_name) as route_file:
                return _gpx_streams(route_file)
    return None


def _gpx_streams(route_file: Any) -> dict[str, dict[str, list[Any]]] | None:
    points: list[tuple[datetime, float, float, float | None, float | None]] = []
    current: dict[str, Any] | None = None
    for event, elem in iterparse(route_file, events=("start", "end")):
        tag = _local_name(elem.tag)
        if event == "start" and tag == "trkpt":
            current = {
                "lat": _number(elem.attrib.get("lat")),
                "lon": _number(elem.attrib.get("lon")),
                "ele": None,
                "time": None,
                "speed": None,
            }
            continue
        if event == "end" and current is not None:
            if tag == "ele":
                current["ele"] = _number(elem.text)
            elif tag == "time":
                current["time"] = _parse_date(elem.text)
            elif tag == "speed":
                current["speed"] = _number(elem.text)
            elif tag == "trkpt":
                if current["lat"] is not None and current["lon"] is not None and current["time"] is not None:
                    points.append(
                        (
                            current["time"],
                            current["lat"],
                            current["lon"],
                            current["ele"],
                            current["speed"],
                        )
                    )
                current = None
        if event == "end":
            elem.clear()

    points.sort(key=lambda point: point[0])
    if len(points) < 2:
        return None

    start = points[0][0]
    cumulative = 0.0
    distances = [0.0]
    speeds = [points[0][4]]
    elevation_gain = 0.0
    for previous, current_point in zip(points, points[1:]):
        segment = _haversine((previous[1], previous[2]), (current_point[1], current_point[2]))
        cumulative += segment
        distances.append(round(cumulative, 1))
        if previous[3] is not None and current_point[3] is not None and current_point[3] > previous[3]:
            elevation_gain += current_point[3] - previous[3]
        seconds = (current_point[0] - previous[0]).total_seconds()
        speeds.append(current_point[4] if current_point[4] is not None else (segment / seconds if seconds > 0 else None))

    return {
        "time": {"data": [max(0, round((point[0] - start).total_seconds())) for point in points]},
        "distance": {"data": distances},
        "latlng": {"data": [[point[1], point[2]] for point in points]},
        "altitude": {"data": [point[3] for point in points]},
        "velocity_smooth": {"data": speeds},
        "elevation_gain": {"data": [round(elevation_gain, 1)]},
        "max_speed": {"data": [max((speed for speed in speeds if speed is not None), default=None)]},
    }


def _stream_value(streams: dict[str, dict[str, list[Any]]] | None, key: str) -> float | None:
    if not streams:
        return None
    values = streams.get(key, {}).get("data", [])
    if not values:
        return None
    return _number(values[0])


def _record_measurement(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "date": record.get("endDate") or record.get("startDate") or "",
        "qty": _number(record.get("value")),
        "source": record.get("sourceName", ""),
        "units": record.get("unit", ""),
        "startDate": record.get("startDate", ""),
        "endDate": record.get("endDate", ""),
    }


def _add_sleep_record(sleep_by_day: dict[str, dict[str, Any]], record: dict[str, Any]) -> None:
    stage = SLEEP_VALUES.get(record.get("value", ""))
    if not stage:
        return
    start = _parse_date(record.get("startDate"))
    end = _parse_date(record.get("endDate"))
    if start is None or end is None or end <= start:
        return
    day = end.date().isoformat()
    measurement = sleep_by_day.setdefault(
        day,
        {
            "sleepEnd": end.isoformat(),
            "date": end.isoformat(),
            "core": 0.0,
            "rem": 0.0,
            "deep": 0.0,
            "in_bed": 0.0,
            "awake": 0.0,
            "source": record.get("sourceName", ""),
            "units": "h",
        },
    )
    measurement[stage] = float(measurement.get(stage) or 0) + (end - start).total_seconds() / 3600
    if end.isoformat() > measurement["sleepEnd"]:
        measurement["sleepEnd"] = end.isoformat()
        measurement["date"] = end.isoformat()


def _workout_stat(workout: dict[str, Any], stat_type: str, field: str) -> Any:
    for stat in workout.get("statistics", []):
        if stat.get("type") == stat_type:
            return stat.get(field)
    return None


def _workout_key(workout: dict[str, Any]) -> str:
    return "|".join(
        str(workout.get(key, ""))
        for key in ("workoutActivityType", "startDate", "endDate", "sourceName", "duration")
    )


def _stable_id(prefix: str, value: str) -> int:
    digest = hashlib.sha256(f"{prefix}|{value}".encode()).digest()
    return int.from_bytes(digest[:8], "big") & ((1 << 63) - 1)


def _is_running_workout(workout_type: str) -> bool:
    return workout_type == "HKWorkoutActivityTypeRunning"


def _is_apple_watch_workout(workout: dict[str, Any]) -> bool:
    source = str(workout.get("sourceName") or workout.get("source") or "").lower()
    device = str(workout.get("device") or "").lower()
    return "apple watch" in source or "apple watch" in device


def _duration_seconds(value: Any, unit: Any) -> int:
    quantity = _number(value) or 0
    normalized = str(unit or "min").lower()
    if normalized in {"h", "hr", "hour", "hours"}:
        quantity *= 3600
    elif normalized in {"min", "mins", "minute", "minutes"}:
        quantity *= 60
    return round(quantity)


def _distance_m(value: Any, unit: Any) -> float:
    quantity = _number(value) or 0.0
    normalized = str(unit or "m").lower()
    if normalized in {"km", "kilometer", "kilometers"}:
        return quantity * 1000
    if normalized in {"mi", "mile", "miles"}:
        return quantity * 1609.344
    return quantity


def _speed_mps(value: float | None, unit: Any) -> float | None:
    if value is None:
        return None
    normalized = str(unit or "").lower()
    if normalized in {"km/hr", "kmph", "km/h", "kph"}:
        return value / 3.6
    if normalized in {"mph", "mi/h"}:
        return value * 0.44704
    return value


def _parse_date(value: Any) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None


def _number(value: Any) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _haversine(first: tuple[float, float], second: tuple[float, float]) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (*first, *second))
    dlat, dlon = lat2 - lat1, lon2 - lon1
    value = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6_371_000 * 2 * math.atan2(math.sqrt(value), math.sqrt(max(1 - value, 0)))


def dumps_result(result: AppleHealthExportImportResult) -> str:
    return json.dumps(result_dict(result), ensure_ascii=False, indent=2)
