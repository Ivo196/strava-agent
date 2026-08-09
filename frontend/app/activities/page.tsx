import { OfflineState } from "@/components/offline-state";
import { RunAnalytics } from "@/components/run-analytics";
import { RunHistory } from "@/components/run-history";
import { getActivities, getActivitiesProgress } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function ActivitiesPage() {
  const result = await Promise.all([getActivities(), getActivitiesProgress()]).catch(() => null);
  if (!result) return <OfflineState />;
  const [data, progress] = result;

  return (
    <div className="page-wrap runs-page runs-progress-page">
      <header className="simple-header section-page-header runs-page-header">
        <div>
          <span className="eyebrow">Camino a Chicago</span>
          <h1>Carreras</h1>
          <p>Tu entrenamiento ordenado por semanas ISO, de lunes a domingo.</p>
        </div>
        <div className="runs-summary" aria-label="Totales históricos contabilizados">
          <span>{progress.lifetime.runs}<small>carreras contabilizadas</small></span>
          <span>{progress.lifetime.distance_km.toFixed(0)}<small>km históricos</small></span>
        </div>
      </header>

      <RunAnalytics progress={progress} />

      {data.activities.length ? (
        <RunHistory activities={data.activities} progress={progress} />
      ) : (
        <div className="empty-row">Todavía no hay carreras. Conectá Apple Health desde Ajustes.</div>
      )}
    </div>
  );
}
