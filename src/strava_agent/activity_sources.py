from __future__ import annotations

import json
import re
import unicodedata
from collections.abc import Iterable
from typing import Any


_DIRECT_WORKOUT_SOURCE_KEYS = (
    "sourceName",
    "source",
    "device",
    "deviceName",
    "sourceRevision",
)
_NESTED_SOURCE_KEYS = {"source", "sourcename", "device", "devicename"}


def is_apple_watch_workout(workout: dict[str, Any]) -> bool:
    """Require positive Apple Watch evidence for a running workout.

    Native Apple Health exports expose the workout's source at the top level.
    Health Auto Export v2 usually exposes sources on the attached workout
    measurements instead. A Fitbit marker always wins when those nested
    measurements are the only available evidence.
    """
    direct_labels = list(_direct_source_labels(workout))
    if direct_labels:
        return _has_apple_watch(direct_labels) and not _has_fitbit(direct_labels)

    nested_labels = list(_nested_source_labels(workout))
    return (
        bool(nested_labels)
        and _has_apple_watch(nested_labels)
        and not _has_fitbit(nested_labels)
    )


def is_apple_watch_activity(activity: dict[str, Any]) -> bool:
    """Return whether a stored running activity has an explicit Watch origin."""
    device_name = activity.get("device_name")
    if device_name:
        labels = list(_flatten_text(device_name))
        return _has_apple_watch(labels) and not _has_fitbit(labels)

    raw = activity.get("raw_json")
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return False
    return isinstance(raw, dict) and is_apple_watch_workout(raw)


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
