import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, ArrowLeft, Clock3, Flame, Gauge, HeartPulse, MapPinned, Mountain, Trophy, Watch } from "lucide-react";
import { ActivityDetailCharts } from "@/components/activity-detail-charts";
import { ActivityRouteMap } from "@/components/activity-route-map";
import { RunningDynamicsCharts } from "@/components/running-dynamics-charts";
import { LiveDateBadge } from "@/components/live-date-badge";
import { getActivityDetail } from "@/lib/api";
import { activityDetailName } from "@/lib/activity-display";

export const dynamic = "force-dynamic";
const dateFormat = new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const distanceFormat = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function splitHeartRate(split: { average_heartrate: number | null; heartrate_source: "stream" | "workout_average" | null }) {
  return `${split.heartrate_source === "workout_average" ? "~" : ""}${split.average_heartrate} bpm`;
}

export default async function ActivityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const data = await getActivityDetail(id).catch(() => null);
  if (!data) notFound();
  const activity = data.activity;
  const fullSplits = data.splits.filter((split) => split.distance_km >= 0.9 && split.pace_seconds > 0);
  const fastestSplit = fullSplits.reduce<(typeof fullSplits)[number] | null>(
    (fastest, split) => !fastest || split.pace_seconds < fastest.pace_seconds ? split : fastest,
    null,
  );

  return (
    <div className="page-wrap activity-detail-page activity-detail-page-v2">
      <div className="activity-detail-topbar">
        <Link className="activity-detail-back" href="/activities"><ArrowLeft aria-hidden="true" size={15} /> Todas las carreras</Link>
        <LiveDateBadge />
      </div>

      <header className="activity-performance-hero">
        <div className="activity-performance-main">
          <div className="activity-performance-copy">
            <span className="eyebrow">Actividad individual · Apple Watch</span>
            <h1>{activityDetailName(activity)}</h1>
            <time dateTime={activity.date}>{dateFormat.format(new Date(`${activity.date}T12:00:00`))}</time>
          </div>
          <div className="activity-distance-lockup" aria-label={`${activity.distance_km} kilómetros`}>
            <strong>{distanceFormat.format(activity.distance_km)}</strong>
            <span>km</span>
          </div>
        </div>

        <div className="activity-performance-metrics" aria-label="Métricas principales de la carrera">
          <article>
            <Clock3 aria-hidden="true" size={18} />
            <span>Tiempo en movimiento</span>
            <strong>{activity.moving_time}</strong>
          </article>
          <article className="is-accent">
            <Gauge aria-hidden="true" size={18} />
            <span>Ritmo medio</span>
            <strong>{activity.pace}</strong>
          </article>
          <article>
            <HeartPulse aria-hidden="true" size={18} />
            <span>Pulso</span>
            <strong>{activity.average_heartrate ?? "—"}<small> bpm promedio</small></strong>
            {activity.max_heartrate != null && <em>{activity.max_heartrate} bpm máximo</em>}
          </article>
          <article>
            <Flame aria-hidden="true" size={18} />
            <span>Energía activa</span>
            <strong>{activity.calories != null ? Math.round(activity.calories).toLocaleString("es-ES") : "—"}<small> kcal</small></strong>
          </article>
        </div>

        <div className="activity-performance-insights" aria-label="Lectura rápida de la carrera">
          <div>
            <Trophy aria-hidden="true" size={17} />
            <span>Parcial más rápido</span>
            <strong>{fastestSplit ? `${fastestSplit.label} · ${fastestSplit.pace}` : "Sin parcial completo"}</strong>
          </div>
          <div>
            <Mountain aria-hidden="true" size={17} />
            <span>Desnivel acumulado</span>
            <strong>{activity.elevation_gain_m != null ? `${Math.round(activity.elevation_gain_m)} m` : "Sin dato"}</strong>
          </div>
          <div>
            {data.route_available ? <MapPinned aria-hidden="true" size={17} /> : <Watch aria-hidden="true" size={17} />}
            <span>Registro</span>
            <strong>{data.route_available ? "Ruta y sensores completos" : "Datos de Apple Watch"}</strong>
          </div>
        </div>
      </header>

      {data.route_available && <ActivityRouteMap route={data.route} />}

      {data.streams_available ? (
        <>
          <section className="activity-detail-story-section" aria-labelledby="activity-effort-title">
            <div className="activity-detail-section-heading">
              <div><span className="eyebrow">La carrera por dentro</span><h2 id="activity-effort-title">Ritmo, pulso y terreno</h2></div>
              <p>Recorré las curvas para entender cómo cambió el esfuerzo a lo largo de la distancia.</p>
            </div>
            <ActivityDetailCharts
              data={data.series}
              heartRateSummary={{ average: activity.average_heartrate, max: activity.max_heartrate }}
            />
          </section>
          {data.running_dynamics_available && (
            <RunningDynamicsCharts data={data.running_dynamics} summary={data.running_dynamics_summary} />
          )}
          <section className="splits-section">
            <div className="activity-detail-section-heading">
              <div><span className="eyebrow">Parciales</span><h2>Kilómetro por kilómetro</h2></div>
              <p>El detalle exacto de cada tramo, desde la salida hasta el último metro.</p>
            </div>
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
      ) : <div className="empty-row"><Activity aria-hidden="true" size={18} /> Esta actividad no incluye muestras FIT/GPX para crear gráficos.</div>}
    </div>
  );
}
