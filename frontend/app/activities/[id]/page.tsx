import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityDetailCharts } from "@/components/activity-detail-charts";
import { ActivityRouteMap } from "@/components/activity-route-map";
import { RunningDynamicsCharts } from "@/components/running-dynamics-charts";
import { LiveDateBadge } from "@/components/live-date-badge";
import { getActivityDetail } from "@/lib/api";
import { activityDetailName } from "@/lib/activity-display";

export const dynamic = "force-dynamic";
const dateFormat = new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

function splitHeartRate(split: { average_heartrate: number | null; heartrate_source: "stream" | "workout_average" | null }) {
  return `${split.heartrate_source === "workout_average" ? "~" : ""}${split.average_heartrate} bpm`;
}

export default async function ActivityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const data = await getActivityDetail(id).catch(() => null);
  if (!data) notFound();
  const activity = data.activity;

  return (
    <div className="page-wrap activity-detail-page">
      <Link className="back-link" href="/activities">← Volver al historial</Link>
      <LiveDateBadge />
      <header className="simple-header activity-detail-header">
        <span className="eyebrow">Chicago 2026 · Análisis de carrera</span>
        <h1>{activityDetailName(activity)}</h1>
        <p><span className="activity-date-label">Fecha de la actividad</span>{dateFormat.format(new Date(`${activity.date}T12:00:00`))}</p>
      </header>

      <section className="activity-summary" aria-label="Resumen de la carrera">
        <div><span>Distancia</span><strong>{activity.distance_km} km</strong></div>
        <div><span>Tiempo</span><strong>{activity.moving_time}</strong></div>
        <div><span>Ritmo medio</span><strong>{activity.pace}</strong></div>
        {activity.average_heartrate != null && <div><span>Pulso medio</span><strong>{activity.average_heartrate} bpm</strong></div>}
        {activity.calories != null && <div><span>Calorías</span><strong>{activity.calories} kcal</strong></div>}
        {activity.elevation_gain_m != null && <div><span>Desnivel</span><strong>{activity.elevation_gain_m} m</strong></div>}
      </section>

      {data.route_available && <ActivityRouteMap route={data.route} />}

      {data.streams_available ? (
        <>
          <ActivityDetailCharts
            data={data.series}
            heartRateSummary={{ average: activity.average_heartrate, max: activity.max_heartrate }}
          />
          {data.running_dynamics_available && (
            <RunningDynamicsCharts data={data.running_dynamics} summary={data.running_dynamics_summary} />
          )}
          <section className="splits-section">
            <div className="section-heading"><div><span className="eyebrow">Parciales</span><h2>Kilómetro por kilómetro.</h2></div></div>
            <div className="table-scroll">
              <table className="data-table splits-table">
                <thead><tr><th>Tramo</th><th>Distancia</th><th>Ritmo</th>{data.splits.every((split) => split.average_heartrate != null) && <th>FC media</th>}{data.splits.every((split) => split.average_power_w != null) && <th>Potencia</th>}{data.splits.every((split) => split.ground_contact_ms != null) && <th>Contacto</th>}{data.splits.every((split) => split.stride_m != null) && <th>Zancada</th>}<th>Subida</th></tr></thead>
                <tbody>{data.splits.map((split) => (
                  <tr key={`${split.kilometer}-${split.label}`}>
                    <td><strong>{split.label}</strong></td>
                    <td>{split.distance_km} km</td>
                    <td>{split.pace}</td>
                    {data.splits.every((item) => item.average_heartrate != null) && <td>{splitHeartRate(split)}</td>}
                    {data.splits.every((item) => item.average_power_w != null) && <td>{split.average_power_w} W</td>}
                    {data.splits.every((item) => item.ground_contact_ms != null) && <td>{split.ground_contact_ms} ms</td>}
                    {data.splits.every((item) => item.stride_m != null) && <td>{split.stride_m} m</td>}
                    <td>+{split.elevation_gain_m} m</td>
                  </tr>
                ))}</tbody>
              </table>
              {data.splits.some((split) => split.heartrate_source === "workout_average") && (
                <p className="table-note">~ FC estimada con el promedio del workout porque Apple Health no incluyó una serie de pulso por segundo en este export.</p>
              )}
            </div>
          </section>
        </>
      ) : <div className="empty-row">Esta actividad no incluye muestras FIT/GPX para crear gráficos.</div>}
    </div>
  );
}
