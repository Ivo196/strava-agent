import Link from "next/link";
import { ArrowRight, ChevronRight, Gauge, Route } from "lucide-react";
import { OfflineState } from "@/components/offline-state";
import { TrainingNow } from "@/components/training-now";
import { VolumeChart } from "@/components/volume-chart";
import { DeviceInsights } from "@/components/device-insights";
import { getDashboard } from "@/lib/api";

export const dynamic = "force-dynamic";

const dateFormat = new Intl.DateTimeFormat("es", { day: "numeric", month: "short" });

export default async function DashboardPage() {
  const data = await getDashboard().catch(() => null);
  if (!data) return <OfflineState />;

  const name = data.profile.display_name?.trim();
  const hasTrainingData = data.activity_count > 0;
  const goalSeconds = data.profile.goal_pace_seconds_km;
  const goalPace = goalSeconds ? `${Math.floor(goalSeconds / 60)}:${String(goalSeconds % 60).padStart(2, "0")}` : "—";
  const goalFinishMinutes = goalSeconds ? goalSeconds * 42.195 / 60 : null;
  const goalFinish = goalFinishMinutes
    ? `${Math.floor(goalFinishMinutes / 60)} h ${String(Math.floor(goalFinishMinutes % 60)).padStart(2, "0")} min`
    : "Meta sin configurar";
  const readinessWidth = ({ "Base inicial": 25, "En construcción": 55, "Base sólida": 85, Taper: 100 } as Record<string, number>)[data.readiness.status] ?? 35;
  return (
    <div className="page-wrap">
      <header className="page-header">
        <div>
          <span className="eyebrow">Training intelligence · Semana {data.next_week?.number ?? "—"}</span>
          <h1>{name ? `Estado de entrenamiento de ${name}.` : "Estado de entrenamiento."}</h1>
          <p>Carga, consistencia, recuperación y próximos pasos en una sola lectura.</p>
        </div>
        <div className={hasTrainingData ? "connection connected" : "connection"}>
          <span />{hasTrainingData ? `${data.activity_count} actividades cargadas` : "Historial pendiente"}
        </div>
      </header>

      {!hasTrainingData && (
        <div className="onboarding-banner">
          <div><strong>Conecta tus datos para empezar</strong><span>Apple Health es la fuente principal; también puedes importar un archivo histórico.</span></div>
          <Link href="/settings">Importar historial <ArrowRight size={16} /></Link>
        </div>
      )}

      <TrainingNow agenda={data.daily_agenda} completedDates={data.recent_activities.map((activity) => activity.date)} />

      <section className="metric-grid" aria-label="Resumen del entrenamiento">
        <article className="metric-card">
          <div className="metric-icon"><Route size={19} /></div>
          <span>Esta semana</span>
          <strong>{data.metrics.distance_current_week}<small> km</small></strong>
          <p>{data.metrics.average_weekly_28d} km de media semanal</p>
        </article>
        <article className="metric-card">
          <div className="metric-icon"><Gauge size={19} /></div>
          <span>Tirada más larga</span>
          <strong>{data.metrics.longest_42d}<small> km</small></strong>
          <p>En las últimas seis semanas</p>
        </article>
        <article className="metric-card accent-card">
          <span>Ritmo objetivo</span>
          <strong>{goalPace}<small> min/km</small></strong>
          <p>Maratón aproximada: {goalFinish}</p>
        </article>
      </section>

      <DeviceInsights devices={data.devices} />

      <section className="dashboard-grid">
        <article className="panel volume-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">Consistencia</span><h2>Volumen semanal</h2></div>
            <span className="unit-label">kilómetros</span>
          </div>
          <VolumeChart data={data.weeks} />
        </article>

        <article className="panel coach-panel">
          <span className="eyebrow">PaceOS Coach</span>
          <h2>{data.readiness.status}</h2>
          <div className="status-track"><span style={{ width: hasTrainingData ? `${readinessWidth}%` : "12%" }} /></div>
          <ul className="coach-notes">{data.readiness.notes.slice(0, 3).map((note) => <li key={note}>{note}</li>)}</ul>
          <Link href="/coach">Preguntar al entrenador <ArrowRight size={15} /></Link>
        </article>
      </section>

      <section className="recent-section">
        <div className="section-heading"><div><span className="eyebrow">Últimos entrenamientos</span><h2>Actividad reciente</h2></div><Link href="/activities">Ver todo</Link></div>
        {data.recent_activities.length ? (
          <div className="activity-list">
            {data.recent_activities.slice(0, 3).map((activity) => (
              <Link href={`/activities/${activity.id}`} className="activity-row" key={activity.id}>
                <div className="activity-date"><strong>{dateFormat.format(new Date(`${activity.date}T12:00:00`)).split(" ")[0]}</strong><span>{dateFormat.format(new Date(`${activity.date}T12:00:00`)).split(" ")[1]}</span></div>
                <div className="activity-name"><strong>{activity.name}</strong><span>{activity.pace}{activity.average_heartrate ? ` · ${activity.average_heartrate} bpm` : ""}</span></div>
                <strong className="activity-distance">{activity.distance_km} km</strong>
                <ChevronRight size={17} />
              </Link>
            ))}
          </div>
        ) : <div className="empty-row">Sin actividades todavía. Tu historial aparecerá aquí.</div>}
      </section>
    </div>
  );
}
