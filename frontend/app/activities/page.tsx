import { OfflineState } from "@/components/offline-state";
import { getActivities } from "@/lib/api";
import Link from "next/link";
import { activityDisplayName, activityDisplaySource } from "@/lib/activity-display";

export const dynamic = "force-dynamic";

export default async function ActivitiesPage() {
  const data = await getActivities().catch(() => null);
  if (!data) return <OfflineState />;
  return (
    <div className="page-wrap">
      <header className="simple-header">
        <span className="eyebrow">Chicago 2026 · Apple Watch</span>
        <h1>Historial de carreras.</h1>
        <p>Solo las variables que usamos para tomar decisiones de entrenamiento.</p>
      </header>
      {data.activities.length ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Entrenamiento</th><th>Distancia</th><th>Ritmo</th><th>FC media</th><th>Desnivel</th><th><span className="sr-only">Detalle</span></th></tr></thead>
            <tbody>
              {data.activities.map((activity) => (
                <tr key={activity.id}>
                  <td><Link className="activity-table-link" href={`/activities/${activity.id}`}><strong>{activityDisplayName(activity)}</strong><span>{activityDisplaySource(activity)}</span></Link></td>
                  <td>{activity.distance_km} km</td>
                  <td>{activity.pace}</td>
                  <td>{activity.average_heartrate ? `${activity.average_heartrate} bpm` : "—"}</td>
                  <td>{activity.elevation_gain_m ?? 0} m</td>
                  <td><Link className="detail-link" href={`/activities/${activity.id}`}>Ver carrera →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="empty-row">Todavía no hay actividades. Conecta Apple Health desde Datos.</div>}
    </div>
  );
}
