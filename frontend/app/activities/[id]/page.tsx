import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityDetailCharts } from "@/components/activity-detail-charts";
import { ActivityRouteMap } from "@/components/activity-route-map";
import { RunningDynamicsCharts } from "@/components/running-dynamics-charts";
import { LiveDateBadge } from "@/components/live-date-badge";
import { getActivityDetail } from "@/lib/api";

export const dynamic = "force-dynamic";
const dateFormat = new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export default async function ActivityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const activityId = Number(id);
  if (!Number.isSafeInteger(activityId)) notFound();
  const data = await getActivityDetail(activityId).catch(() => null);
  if (!data) notFound();
  const activity = data.activity;

  return (
    <div className="page-wrap activity-detail-page">
      <Link className="back-link" href="/activities">← Volver al historial</Link>
      <LiveDateBadge />
      <header className="simple-header activity-detail-header">
        <span className="eyebrow">Activity intelligence</span>
        <h1>{activity.name}</h1>
        <p><span className="activity-date-label">Fecha de la actividad</span>{dateFormat.format(new Date(`${activity.date}T12:00:00`))}</p>
      </header>

      <section className="activity-summary" aria-label="Resumen de la carrera">
        <div><span>Distancia</span><strong>{activity.distance_km} km</strong></div>
        <div><span>Tiempo</span><strong>{activity.moving_time}</strong></div>
        <div><span>Ritmo medio</span><strong>{activity.pace}</strong></div>
        <div><span>Pulso medio</span><strong>{activity.average_heartrate ? `${activity.average_heartrate} bpm` : "—"}</strong></div>
        <div><span>Desnivel</span><strong>{activity.elevation_gain_m ?? 0} m</strong></div>
      </section>

      {data.route_available && <ActivityRouteMap route={data.route} />}

      {data.streams_available ? (
        <>
          <ActivityDetailCharts data={data.series} />
          {data.running_dynamics_available && (
            <RunningDynamicsCharts data={data.running_dynamics} summary={data.running_dynamics_summary} />
          )}
          <section className="splits-section">
            <div className="section-heading"><div><span className="eyebrow">Parciales</span><h2>Kilómetro por kilómetro.</h2></div></div>
            <div className="table-scroll">
              <table className="data-table splits-table">
                <thead><tr><th>Tramo</th><th>Distancia</th><th>Ritmo</th><th>FC media</th><th>Subida</th></tr></thead>
                <tbody>{data.splits.map((split) => <tr key={`${split.kilometer}-${split.label}`}><td><strong>{split.label}</strong></td><td>{split.distance_km} km</td><td>{split.pace}</td><td>{split.average_heartrate ? `${split.average_heartrate} bpm` : "—"}</td><td>+{split.elevation_gain_m} m</td></tr>)}</tbody>
              </table>
            </div>
          </section>
        </>
      ) : <div className="empty-row">Esta actividad no incluye muestras FIT/GPX para crear gráficos.</div>}
    </div>
  );
}
