import { OfflineState } from "@/components/offline-state";
import { RunAnalytics } from "@/components/run-analytics";
import { RunHistory } from "@/components/run-history";
import { RunSeasonHero } from "@/components/run-season-hero";
import { getActivities, getActivitiesProgress } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function ActivitiesPage() {
  const result = await Promise.all([getActivities(), getActivitiesProgress()]).catch(() => null);
  if (!result) return <OfflineState />;
  const [data, progress] = result;

  return (
    <div className="page-wrap runs-page runs-progress-page">
      <RunSeasonHero activities={data.activities} progress={progress} />

      <RunAnalytics activities={data.activities} progress={progress} />

      {data.activities.length ? (
        <RunHistory activities={data.activities} progress={progress} />
      ) : (
        <div className="empty-row">Todavía no hay carreras. Conectá Apple Health desde Ajustes.</div>
      )}
    </div>
  );
}
