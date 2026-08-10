import { WeeklyMileageChart } from "@/components/weekly-mileage-chart";
import type { Activity, RunProgressData } from "@/lib/types";

export function RunAnalytics({ activities, progress }: { activities: Activity[]; progress: RunProgressData }) {
  return (
    <section className="run-analytics-section" aria-labelledby="run-analytics-title">
      <h2 className="sr-only" id="run-analytics-title">Análisis semanal de carreras</h2>
      <WeeklyMileageChart activities={activities} progress={progress} />
    </section>
  );
}
