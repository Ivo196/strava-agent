from __future__ import annotations

import csv
import hashlib
import io
import zipfile
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import pandas as pd

from .database import Database
from .activity_streams import parse_activity_stream


MAX_ARCHIVE_FILES = 25_000
MAX_UNCOMPRESSED_BYTES = 2_000_000_000


@dataclass(frozen=True)
class ImportResult:
    discovered: int
    imported: int
    updated: int
    skipped: int


def import_strava_archive(archive_bytes: bytes, database: Database) -> ImportResult:
    """Importa el activities.csv incluido en la exportación oficial de Strava."""
    try:
        archive = zipfile.ZipFile(io.BytesIO(archive_bytes))
    except zipfile.BadZipFile as error:
        raise ValueError("El archivo no es un ZIP válido de Strava.") from error

    members = archive.infolist()
    if len(members) > MAX_ARCHIVE_FILES:
        raise ValueError("El ZIP contiene demasiados archivos.")
    if sum(member.file_size for member in members) > MAX_UNCOMPRESSED_BYTES:
        raise ValueError("El contenido descomprimido supera el límite de seguridad.")

    activities_member = next(
        (member for member in members if member.filename.replace("\\", "/").lower().endswith("activities.csv")),
        None,
    )
    if activities_member is None:
        raise ValueError("No encontré activities.csv dentro del ZIP de Strava.")

    raw_csv = archive.read(activities_member)
    text = raw_csv.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))

    members_by_name = {member.filename.replace("\\", "/").lower(): member for member in members}
    discovered = imported = updated = skipped = 0
    for raw_row in reader:
        discovered += 1
        row = {str(key or "").strip(): value for key, value in raw_row.items()}
        activity = _strava_csv_activity(row)
        if activity is None:
            skipped += 1
            continue
        existed = database.get_activity(int(activity["id"])) is not None
        stream_filename = _first(row, "Filename")
        stream_member = members_by_name.get(stream_filename.replace("\\", "/").lower())
        streams = parse_activity_stream(stream_filename, archive.read(stream_member)) if stream_member else None
        database.upsert_activity(activity, streams=streams)
        if existed:
            updated += 1
        else:
            imported += 1

    return ImportResult(discovered, imported, updated, skipped)


def _strava_csv_activity(row: dict[str, Any]) -> dict[str, Any] | None:
    activity_type = (_first(row, "Sport Type", "Activity Type", "Type") or "").strip()
    sport_type = _normalize_sport_type(activity_type)
    if sport_type not in {"Run", "TrailRun", "VirtualRun"}:
        return None

    date_value = _first(row, "Activity Date", "Start Time")
    timestamp = pd.to_datetime(date_value, utc=True, errors="coerce")
    if pd.isna(timestamp):
        return None
    start_date = timestamp.to_pydatetime().astimezone(UTC).isoformat().replace("+00:00", "Z")

    activity_id_value = _first(row, "Activity ID", "Activity Id", "id")
    activity_id = _integer(activity_id_value)
    if not activity_id:
        identity = f"{start_date}|{_first(row, 'Activity Name')}|{_first(row, 'Distance')}"
        activity_id = int.from_bytes(hashlib.sha256(identity.encode()).digest()[:8], "big") & ((1 << 63) - 1)

    distance_m = _number(_first(row, "Distance"))
    moving_time = _integer(_first(row, "Moving Time"))
    elapsed_time = _integer(_first(row, "Elapsed Time")) or moving_time
    average_hr = _number_or_none(_first(row, "Average Heart Rate", "Average HR"))
    max_hr = _number_or_none(_first(row, "Max Heart Rate", "Maximum Heart Rate"))
    average_speed = distance_m / moving_time if distance_m and moving_time else None

    return {
        "id": activity_id,
        "name": _first(row, "Activity Name", "Name") or "Carrera",
        "sport_type": sport_type,
        "type": "Run",
        "start_date": start_date,
        "start_date_local": start_date,
        "timezone": "",
        "distance": distance_m,
        "moving_time": moving_time,
        "elapsed_time": elapsed_time,
        "total_elevation_gain": _number(_first(row, "Elevation Gain")),
        "average_speed": average_speed,
        "max_speed": _number_or_none(_first(row, "Max Speed")),
        "average_heartrate": average_hr,
        "max_heartrate": max_hr,
        "suffer_score": _number_or_none(_first(row, "Relative Effort")),
        "calories": _number_or_none(_first(row, "Calories")),
        "has_heartrate": average_hr is not None,
        "device_name": _first(row, "From Upload") or None,
        "source": "strava_bulk_export",
    }


def _normalize_sport_type(value: str) -> str:
    normalized = value.lower().replace("_", " ").strip()
    if "virtual" in normalized and "run" in normalized:
        return "VirtualRun"
    if "trail" in normalized and "run" in normalized:
        return "TrailRun"
    if normalized in {"run", "running"}:
        return "Run"
    return value.replace(" ", "")


def _first(row: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = row.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""


def _number(value: Any) -> float:
    parsed = _number_or_none(value)
    return parsed if parsed is not None else 0.0


def _number_or_none(value: Any) -> float | None:
    text = str(value or "").strip().replace(" ", "")
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        try:
            return float(text.replace(",", "."))
        except ValueError:
            return None


def _integer(value: Any) -> int:
    number = _number_or_none(value)
    return int(number) if number is not None else 0
