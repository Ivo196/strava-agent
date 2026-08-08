from __future__ import annotations

import json
import re
import unicodedata
from collections.abc import Iterable
from datetime import datetime, timedelta
from typing import Any


_DIRECT_WORKOUT_SOURCE_KEYS = (
    "sourceName",
    "source",
    "device",
    "deviceName",
    "sourceRevision",
)
_NESTED_SOURCE_KEYS = {"source", "sourcename", "device", "devicename"}
_PACEOS_APPLE_IMPORT_SOURCES = {"health_auto_export", "apple_health_export"}


def is_apple_watch_workout(workout: dict[str, Any]) -> bool:
    """Require positive Apple Watch evidence for a running workout.

    Native Apple Health exports expose the workout's source at the top level.
    Health Auto Export v2 usually exposes sources on the attached workout
    measurements instead. A Fitbit marker always wins when those nested
    measurements are the only available evidence.
    """
    direct_labels = list(_direct_source_labels(workout))
    if _has_fitbit(direct_labels):
        return False
    if _has_apple_watch(direct_labels):
        return True

    nested_labels = list(_nested_source_labels(workout))
    return (
        bool(nested_labels)
        and _has_apple_watch(nested_labels)
        and not _has_fitbit(nested_labels)
    )


def is_apple_watch_activity(activity: dict[str, Any]) -> bool:
    """Return whether a stored run came from a PaceOS Apple import."""
    raw = activity.get("raw_json")
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return False
    if not isinstance(raw, dict):
        return False

    import_source = str(raw.get("source") or "").strip().casefold()
    if import_source not in _PACEOS_APPLE_IMPORT_SOURCES:
        return False

    device_name = activity.get("device_name")
    if device_name:
        labels = list(_flatten_text(device_name))
        return _has_apple_watch(labels) and not _has_fitbit(labels)
    return is_apple_watch_workout(raw)


def deduplicate_apple_watch_activities(
    activities: Iterable[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Keep the richest representation when overlapping imports describe one run."""
    rows = list(activities)
    groups: list[list[dict[str, Any]]] = []
    for row in rows:
        for group in groups:
            if any(_activities_overlap(row, candidate) for candidate in group):
                group.append(row)
                break
        else:
            groups.append([row])

    selected_ids = {
        id(max(group, key=_activity_quality))
        for group in groups
    }
    return [row for row in rows if id(row) in selected_ids]


def is_apple_watch_source(source: Any) -> bool:
    """Return whether a metric/source value explicitly identifies Apple Watch."""
    labels = list(_flatten_text(source))
    return _has_apple_watch(labels) and not _has_fitbit(labels)


def workout_device_name(workout: dict[str, Any]) -> str:
    """Choose the most useful source label for a persisted activity."""
    direct = list(_direct_source_labels(workout))
    nested = list(_nested_source_labels(workout))
    for label in (*direct, *nested):
        if _is_apple_watch_label(label):
            return label
    for label in (*direct, *nested):
        if label.strip():
            return label
    return "Apple Health"


def _direct_source_labels(workout: dict[str, Any]) -> Iterable[str]:
    for key in _DIRECT_WORKOUT_SOURCE_KEYS:
        if key in workout:
            yield from _flatten_text(workout[key])


def _nested_source_labels(workout: dict[str, Any]) -> Iterable[str]:
    for key, value in workout.items():
        if key in _DIRECT_WORKOUT_SOURCE_KEYS:
            continue
        yield from _source_labels_in_value(value)


def _source_labels_in_value(value: Any) -> Iterable[str]:
    if isinstance(value, dict):
        for key, nested in value.items():
            if str(key).casefold() in _NESTED_SOURCE_KEYS:
                yield from _flatten_text(nested)
            else:
                yield from _source_labels_in_value(nested)
    elif isinstance(value, list):
        for nested in value:
            yield from _source_labels_in_value(nested)


def _flatten_text(value: Any) -> Iterable[str]:
    if isinstance(value, str):
        if value.strip():
            yield value
    elif isinstance(value, dict):
        for nested in value.values():
            yield from _flatten_text(nested)
    elif isinstance(value, list):
        for nested in value:
            yield from _flatten_text(nested)


def _has_apple_watch(labels: Iterable[str]) -> bool:
    return any(_is_apple_watch_label(label) for label in labels)


def _has_fitbit(labels: Iterable[str]) -> bool:
    return any("fitbit" in _normalize_label(label) for label in labels)


def _is_apple_watch_label(label: str) -> bool:
    return "apple watch" in _normalize_label(label)


def _normalize_label(label: str) -> str:
    normalized = unicodedata.normalize("NFKC", label).casefold()
    return re.sub(r"\s+", " ", normalized).strip()


def _activities_overlap(first: dict[str, Any], second: dict[str, Any]) -> bool:
    first_start = _activity_datetime(first.get("start_date"))
    second_start = _activity_datetime(second.get("start_date"))
    if first_start is None or second_start is None:
        return False
    if abs((first_start - second_start).total_seconds()) > 12 * 60:
        return False

    first_seconds = max(
        int(first.get("elapsed_time_s") or first.get("moving_time_s") or 0),
        1,
    )
    second_seconds = max(
        int(second.get("elapsed_time_s") or second.get("moving_time_s") or 0),
        1,
    )
    first_end = first_start + timedelta(seconds=first_seconds)
    second_end = second_start + timedelta(seconds=second_seconds)
    overlap = max(
        0.0,
        (min(first_end, second_end) - max(first_start, second_start)).total_seconds(),
    )
    return overlap / min(first_seconds, second_seconds) >= 0.65


def _activity_datetime(value: Any) -> datetime | None:
    try:
        return datetime.fromisoformat(str(value or "").replace("Z", "+00:00"))
    except ValueError:
        return None


def _activity_quality(activity: dict[str, Any]) -> tuple[int, int, int, str]:
    return (
        int(bool(activity.get("streams_loaded"))),
        int(bool(activity.get("detail_loaded"))),
        int(float(activity.get("elevation_gain_m") or 0) > 0),
        str(activity.get("synced_at") or ""),
    )
