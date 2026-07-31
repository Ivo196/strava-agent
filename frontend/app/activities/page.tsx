import Link from "next/link";
import { ArrowUpRight, Clock3, Gauge, HeartPulse, Mountain, Route } from "lucide-react";
import { OfflineState } from "@/components/offline-state";
import { activityDisplayName, activityDisplaySource } from "@/lib/activity-display";
import { getActivities } from "@/lib/api";

export const dynamic = "force-dynamic";

const fullDate = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" });

export default async function ActivitiesPage() {
  const data = await getActivities().catch(() => null);
  if (!data) return <OfflineState />;
  const totalDistance = data.activities.reduce((sum, activity) => sum + activity.distance_km, 0);

  return (
    <div className="page-wrap runs-page">
      <header className="simple-header section-page-header">
        <div><span className="eyebrow">Apple Watch</span><h1>Carreras</h1><p>Cada kilómetro, sin ruido.</p></div>
        <div className="runs-summary"><span>{data.activities.length}<small>carreras</small></span><span>{Math.round(totalDistance)}<small>km totales</small></span></div>
      </header>
      {data.activities.length ? (
        <section className="runs-grid" aria-label="Historial de carreras">
          {data.activities.map((activity, index) => (
            <Link className={index === 0 ? "run-card run-card-latest" : "run-card"} href={`/activities/${activity.id}`} key={activity.id}>
              <header>
                <div><span>{index === 0 ? "Última carrera" : activityDisplaySource(activity)}</span><time>{fullDate.format(new Date(activity.date))}</time></div>
                <ArrowUpRight size={19} />
              </header>
              <h2>{activityDisplayName(activity)}</h2>
              <div className="run-card-distance"><strong>{activity.distance_km}</strong><small>km</small></div>
              <div className="run-card-metrics">
                <span><Gauge size={15} /><small>Ritmo</small><strong>{activity.pace}</strong></span>
                <span><Clock3 size={15} /><small>Tiempo</small><strong>{activity.moving_minutes ? `${activity.moving_minutes} min` : "—"}</strong></span>
                <span><HeartPulse size={15} /><small>Pulso</small><strong>{activity.average_heartrate ? `${Math.round(activity.average_heartrate)} bpm` : "—"}</strong></span>
                <span><Mountain size={15} /><small>Desnivel</small><strong>{activity.elevation_gain_m != null ? `${Math.round(activity.elevation_gain_m)} m` : "—"}</strong></span>
              </div>
              <footer><Route size={15} /> Ver mapa, parciales y dinámica de carrera <ArrowUpRight size={15} /></footer>
            </Link>
          ))}
        </section>
      ) : (
        <div className="empty-row">Todavía no hay carreras. Conecta Apple Health desde Ajustes.</div>
      )}
    </div>
  );
}
