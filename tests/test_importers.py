import io
import zipfile
from pathlib import Path

import pytest

from strava_agent.database import Database
from strava_agent.importers import import_strava_archive


def strava_zip(csv_text: str) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("activities.csv", csv_text)
    return buffer.getvalue()


def test_imports_running_history_from_bulk_export(tmp_path: Path) -> None:
    database = Database(tmp_path / "coach.db")
    payload = strava_zip(
        "Activity ID,Activity Date,Activity Name,Activity Type,Distance,Moving Time,Elapsed Time,Elevation Gain,Average Heart Rate,Max Heart Rate\n"
        '123,"Jul 12, 2026, 7:30:00 AM",Morning Run,Run,10500,3150,3200,82,148,169\n'
        '124,"Jul 13, 2026, 6:00:00 PM",Evening Ride,Ride,30000,3600,3700,120,135,160\n'
    )

    result = import_strava_archive(payload, database)
    stored = database.get_activity(123)

    assert result.discovered == 2
    assert result.imported == 1
    assert result.skipped == 1
    assert stored is not None
    assert stored["distance_m"] == pytest.approx(10_500)
    assert stored["average_heartrate"] == pytest.approx(148)


def test_rejects_zip_without_activities_csv(tmp_path: Path) -> None:
    database = Database(tmp_path / "coach.db")
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("profile.csv", "name\nIvo\n")

    with pytest.raises(ValueError, match="activities.csv"):
        import_strava_archive(buffer.getvalue(), database)
