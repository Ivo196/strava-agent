from pathlib import Path
from zipfile import ZipFile

from strava_agent.apple_health_export import import_apple_health_export_zip
from strava_agent.database import Database


EXPORT_XML = """<?xml version="1.0" encoding="UTF-8"?>
<HealthData>
  <Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Ivo's Apple Watch" unit="count/min" startDate="2026-07-21 15:03:03 +0200" endDate="2026-07-21 15:03:03 +0200" value="126" />
  <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30" durationUnit="min" sourceName="Strava" startDate="2026-07-21 15:03:03 +0200" endDate="2026-07-21 15:33:03 +0200">
    <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" sum="5" unit="km" />
  </Workout>
  <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30" durationUnit="min" sourceName="Ivo's Apple Watch" device="Apple Watch" startDate="2026-07-21 15:03:03 +0200" endDate="2026-07-21 15:33:03 +0200">
    <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" sum="5" unit="km" />
    <WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" average="145" maximum="166" unit="count/min" />
    <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" sum="390" unit="kcal" />
  </Workout>
</HealthData>
"""


def test_native_export_batches_metrics_and_uses_apple_watch_runs(tmp_path: Path) -> None:
    archive_path = tmp_path / "export.zip"
    with ZipFile(archive_path, "w") as archive:
        archive.writestr("apple_health_export/export.xml", EXPORT_XML)

    database = Database(tmp_path / "coach.db")
    first = import_apple_health_export_zip(str(archive_path), database)
    second = import_apple_health_export_zip(str(archive_path), database)

    assert first.workouts_received == 2
    assert first.workouts_saved == 2
    assert first.runs_imported == 1
    assert first.metrics_imported == 1
    assert second.runs_updated == 1
    assert second.metrics_updated == 1
    assert database.activity_count() == 1
    activity = database.list_activities()[0]
    assert activity["device_name"] == "Ivo's Apple Watch"
    assert activity["distance_m"] == 5000
    assert len(
        database.list_apple_health_metrics(
            ["heart_rate"],
            start_date="2026-07-21",
            end_date="2026-07-22",
        )
    ) == 1
    assert database.list_apple_health_metrics(
        ["heart_rate"],
        start_date="2026-07-22",
        end_date="2026-07-23",
    ) == []
