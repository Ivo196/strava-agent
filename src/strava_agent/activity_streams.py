from __future__ import annotations

import gzip
import io
import math
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Any

import fitdecode


def parse_activity_stream(filename: str, payload: bytes) -> dict[str, dict[str, list[Any]]] | None:
    """Convierte un FIT o GPX exportado por Strava al formato local de streams."""
    normalized = filename.lower()
    try:
        if normalized.endswith(".fit.gz"):
            return _parse_fit(gzip.decompress(payload))
        if normalized.endswith(".fit"):
            return _parse_fit(payload)
        if normalized.endswith(".gpx.gz"):
            return _parse_gpx(gzip.decompress(payload))
        if normalized.endswith(".gpx"):
            return _parse_gpx(payload)
    except (EOFError, OSError, ValueError, ET.ParseError, fitdecode.FitError):
        return None
    return None


def _parse_fit(payload: bytes) -> dict[str, dict[str, list[Any]]] | None:
    points: list[dict[str, Any]] = []
    with fitdecode.FitReader(io.BytesIO(payload)) as reader:
        for frame in reader:
            if not isinstance(frame, fitdecode.FitDataMessage) or frame.name != "record":
                continue
            timestamp = frame.get_value("timestamp", fallback=None)
            distance = frame.get_value("distance", fallback=None)
            if timestamp is None or distance is None:
                continue
            latitude = _semicircles_to_degrees(frame.get_value("position_lat", fallback=None))
            longitude = _semicircles_to_degrees(frame.get_value("position_long", fallback=None))
            points.append(
                {
                    "timestamp": timestamp,
                    "distance": float(distance),
                    "speed": _first_number(frame.get_value("enhanced_speed", fallback=None), frame.get_value("speed", fallback=None)),
                    "heartrate": _number(frame.get_value("heart_rate", fallback=None)),
                    "altitude": _first_number(frame.get_value("enhanced_altitude", fallback=None), frame.get_value("altitude", fallback=None)),
                    "latlng": [latitude, longitude] if latitude is not None and longitude is not None else None,
                }
            )
    return _points_to_streams(points)


def _parse_gpx(payload: bytes) -> dict[str, dict[str, list[Any]]] | None:
    root = ET.fromstring(payload)
    points: list[dict[str, Any]] = []
    cumulative_distance = 0.0
    previous_latlng: tuple[float, float] | None = None
    previous_time: datetime | None = None
    for element in root.iter():
        if _local_name(element.tag) != "trkpt":
            continue
        latitude = _number(element.attrib.get("lat"))
        longitude = _number(element.attrib.get("lon"))
        timestamp: datetime | None = None
        altitude = heartrate = None
        for child in element.iter():
            name = _local_name(child.tag)
            if name == "time" and child.text:
                timestamp = datetime.fromisoformat(child.text.strip().replace("Z", "+00:00"))
            elif name == "ele" and child.text:
                altitude = _number(child.text)
            elif name in {"hr", "heartrate"} and child.text:
                heartrate = _number(child.text)
        if latitude is None or longitude is None or timestamp is None:
            continue
        segment_distance = _haversine(previous_latlng, (latitude, longitude)) if previous_latlng else 0.0
        cumulative_distance += segment_distance
        seconds = (timestamp - previous_time).total_seconds() if previous_time else 0
        points.append({
            "timestamp": timestamp,
            "distance": cumulative_distance,
            "speed": segment_distance / seconds if seconds > 0 else None,
            "heartrate": heartrate,
            "altitude": altitude,
            "latlng": [latitude, longitude],
        })
        previous_latlng = (latitude, longitude)
        previous_time = timestamp
    return _points_to_streams(points)


def _points_to_streams(points: list[dict[str, Any]]) -> dict[str, dict[str, list[Any]]] | None:
    if len(points) < 2:
        return None
    start = points[0]["timestamp"]
    streams: dict[str, dict[str, list[Any]]] = {
        "time": {"data": [max(0, round((point["timestamp"] - start).total_seconds())) for point in points]},
        "distance": {"data": [round(point["distance"], 1) for point in points]},
    }
    for source, target in (("speed", "velocity_smooth"), ("heartrate", "heartrate"), ("altitude", "altitude"), ("latlng", "latlng")):
        values = [point[source] for point in points]
        if any(value is not None for value in values):
            streams[target] = {"data": values}
    return streams


def _semicircles_to_degrees(value: Any) -> float | None:
    number = _number(value)
    return number * (180 / 2**31) if number is not None else None


def _number(value: Any) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _first_number(*values: Any) -> float | None:
    for value in values:
        number = _number(value)
        if number is not None:
            return number
    return None


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def _haversine(first: tuple[float, float], second: tuple[float, float]) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (*first, *second))
    dlat, dlon = lat2 - lat1, lon2 - lon1
    value = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6_371_000 * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))
