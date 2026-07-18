import Link from "next/link";
import { ArrowRight, BatteryMedium, ChevronRight, Gauge, HeartPulse, Route, ShieldCheck, TrendingUp } from "lucide-react";
import { OfflineState } from "@/components/offline-state";
import { TrainingNow } from "@/components/training-now";
import { VolumeChart } from "@/components/volume-chart";
import { DeviceInsights } from "@/components/device-insights";
import { getDashboard } from "@/lib/api";
import type { RecoveryMetric } from "@/lib/types";

export const dynamic = "force-dynamic";

const dateFormat = new Intl.DateTimeFormat("es", { day: "numeric", month: "short" });

function formatLoadDelta(current: number, previous: number) {
  if (!previous) return "Sin comparación previa";
  const delta = Math.round(((current - previous) / previous) * 100);
  if (delta === 0) return "Igual que la semana anterior";
  return `${delta > 0 ? "+" : ""}${delta}% vs 7 días previos`;
}

function latestRecovery(metrics: { hrv: RecoveryMetric; resting_hr: RecoveryMetric; vo2_max: RecoveryMetric; sleep: RecoveryMetric }) {
  return [
    { label: "HRV", metric: metrics.hrv, tone: "good" },
    { label: "FC reposo", metric: metrics.resting_hr, tone: "calm" },
    { label: "VO₂ máx.", metric: metrics.vo2_max, tone: "strong" },
    { label: "Sueño", metric: metrics.sleep, tone: "sleep" },
  ];
}

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
  const loadDelta = data.metrics.load_7d - data.metrics.load_previous_7d;
  const loadTrend = formatLoadDelta(data.metrics.load_7d, data.metrics.load_previous_7d);
  const recovery = latestRecovery(data.recovery);

  return (
    <div className="page-wrap dashboard-page">
      <header className="page-header dashboard-hero">
        <div>
          <span className="eyebrow">Training intelligence · Semana {data.next_week?.number ?? "—"}</span>
          <h1>{name ? `Estado de entrenamiento de ${name}.` : "Estado de entrenamiento."}</h1>
          <p>Carga, consistencia, recuperación y próximos pasos en una sola lectura.</p>
        </div>
        <div className="hero-status-stack">
          <div className={hasTrainingData ? "connection connected" : "connection"}>
            <span />{hasTrainingData ? `${data.activity_count} actividades cargadas` : "Historial pendiente"}
          </div>
          <div className="race-countdown">
            <span>{data.days_to_race}</span>
            <small>días a carrera</small>
          </div>
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
          <p>{data.metrics.runs_current_week} salidas · {data.metrics.average_weekly_28d} km de media</p>
        </article>
        <article className="metric-card">
          <div className="metric-icon"><Gauge size={19} /></div>
          <span>Carga 7 días</span>
          <strong>{data.metrics.load_7d}<small> pts</small></strong>
          <p>{loadTrend}</p>
        </article>
        <article className="metric-card">
          <div className="metric-icon"><TrendingUp size={19} /></div>
          <span>Últimos 28 días</span>
          <strong>{data.metrics.distance_28d}<small> km</small></strong>
          <p>{data.metrics.runs_28d} entrenamientos registrados</p>
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
            <div><span className="eyebrow">Consistencia</span><h2>Volumen y carga semanal</h2></div>
            <span className="unit-label">km + carga</span>
          </div>
          <VolumeChart data={data.weeks} />
        </article>

        <article className="panel coach-panel">
          <div className="coach-panel-top">
            <span className="coach-badge"><ShieldCheck size={15} />PaceOS Coach</span>
            <strong className={loadDelta > 0 ? "load-delta positive" : "load-delta"}>{loadDelta > 0 ? "+" : ""}{loadDelta}</strong>
          </div>
          <span className="eyebrow">Preparación</span>
          <h2>{data.readiness.status}</h2>
          <div className="status-track" aria-label={`Preparación ${readinessWidth}%`}><span style={{ width: hasTrainingData ? `${readinessWidth}%` : "12%" }} /></div>
          <ul className="coach-notes">{data.readiness.notes.slice(0, 3).map((note) => <li key={note}>{note}</li>)}</ul>
          <Link href="/coach">Preguntar al entrenador <ArrowRight size={15} /></Link>
        </article>
      </section>

      <section className="insight-grid" aria-label="Estadísticas semanales y recuperación">
        <article className="panel weekly-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">Semana actual</span><h2>Estadísticas clave</h2></div>
            <span className="unit-label">últimos 7/28 días</span>
          </div>
          <div className="bullet-list">
            <div className="bullet-row">
              <div><span>Volumen semanal</span><strong>{data.metrics.distance_current_week} km</strong></div>
              <div className="bullet-track"><span style={{ width: `${Math.min(100, (data.metrics.distance_current_week / Math.max(data.metrics.average_weekly_28d || 1, 1)) * 100)}%` }} /></div>
              <small>vs media 28d</small>
            </div>
            <div className="bullet-row">
              <div><span>Tirada larga</span><strong>{data.metrics.longest_42d} km</strong></div>
              <div className="bullet-track"><span style={{ width: `${Math.min(100, (data.metrics.longest_42d / 32) * 100)}%` }} /></div>
              <small>base maratón</small>
            </div>
            <div className="bullet-row">
              <div><span>Cobertura FC</span><strong>{data.metrics.hr_coverage}%</strong></div>
              <div className="bullet-track"><span style={{ width: `${Math.min(100, data.metrics.hr_coverage)}%` }} /></div>
              <small>calidad de datos</small>
            </div>
          </div>
        </article>

        <article className="panel recovery-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">Recuperación</span><h2>Señales disponibles</h2></div>
            <span className="recovery-icon"><BatteryMedium size={18} /></span>
          </div>
          <div className="recovery-grid">
            {recovery.map((item) => (
              <div className={`recovery-card ${item.tone}`} key={item.label}>
                <span>{item.label}</span>
                <strong>{item.metric ? item.metric.value : "—"}<small>{item.metric ? ` ${item.metric.unit}` : ""}</small></strong>
                <p>{item.metric ? item.metric.date : "Calibrando"}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="recent-section panel">
        <div className="section-heading"><div><span className="eyebrow">Últimos entrenamientos</span><h2>Actividad reciente</h2></div><Link href="/activities">Ver todo</Link></div>
        {data.recent_activities.length ? (
          <div className="activity-list activity-list-enhanced">
            {data.recent_activities.slice(0, 3).map((activity) => (
              <Link href={`/activities/${activity.id}`} className="activity-row" key={activity.id}>
                <div className="activity-date"><strong>{dateFormat.format(new Date(`${activity.date}T12:00:00`)).split(" ")[0]}</strong><span>{dateFormat.format(new Date(`${activity.date}T12:00:00`)).split(" ")[1]}</span></div>
                <div className="activity-name"><strong>{activity.name}</strong><span>{activity.pace}{activity.average_heartrate ? ` · ${activity.average_heartrate} bpm` : ""}</span></div>
                <span className="activity-load"><HeartPulse size={14} />{activity.training_load ?? "—"}</span>
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
