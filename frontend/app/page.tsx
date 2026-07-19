import Link from "next/link";
import {
  ArrowRight,
  BatteryMedium,
  CalendarDays,
  ChevronRight,
  Flame,
  Footprints,
  Gauge,
  HeartPulse,
  Route,
  ShieldCheck,
  TrendingUp,
  Watch,
} from "lucide-react";
import { OfflineState } from "@/components/offline-state";
import { TrainingNow } from "@/components/training-now";
import { VolumeChart } from "@/components/volume-chart";
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

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ today?: string }> }) {
  const { today } = await searchParams;
  const simulatedToday = today && /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : undefined;
  const data = await getDashboard(simulatedToday).catch(() => null);
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
  const loadDeltaLabel = Math.round(loadDelta);
  const loadTrend = formatLoadDelta(data.metrics.load_7d, data.metrics.load_previous_7d);
  const recovery = latestRecovery(data.recovery);
  const latestRun = data.devices.apple_watch.latest_run;
  const fitbit = data.devices.fitbit;
  const apple = data.devices.apple_watch;
  const sleep = fitbit.recovery.sleep;
  const steps = fitbit.steps.latest;
  const activeEnergy = fitbit.active_energy.latest;

  return (
    <div className="page-wrap dashboard-page">
      <header className="home-topbar">
        <div>
          <span className="eyebrow">PaceOS · Semana {data.next_week?.number ?? "—"}</span>
          <h1>{name ? `Hola, ${name}.` : "Tu entrenamiento de hoy."}</h1>
          <p>{data.metrics.distance_current_week} km esta semana · {data.days_to_race} días para Chicago</p>
        </div>
        <div className={hasTrainingData ? "connection connected" : "connection"}>
          <span />{hasTrainingData ? `${data.activity_count} actividades` : "Historial pendiente"}
        </div>
      </header>

      {!hasTrainingData && (
        <div className="onboarding-banner">
          <div><strong>Conecta tus datos para empezar</strong><span>Apple Health es la fuente principal; también puedes importar un archivo histórico.</span></div>
          <Link href="/settings">Importar historial <ArrowRight size={16} /></Link>
        </div>
      )}

      <section className="home-layout" aria-label="Resumen principal">
        <div className="home-feed">
          <TrainingNow agenda={data.daily_agenda} completedDates={data.recent_activities.map((activity) => activity.date)} />

          <section className="feed-card latest-run-card">
            <div className="feed-card-header">
              <div>
                <span className="eyebrow">Última carrera</span>
                <h2>{latestRun ? latestRun.date : "Todavía sin carrera"}</h2>
              </div>
              {latestRun && <Link href={`/activities/${latestRun.id}`}>Ver detalle <ChevronRight size={16} /></Link>}
            </div>
            {latestRun ? (
              <>
                <div className="latest-run-primary">
                  <strong>{latestRun.distance_km}<small> km</small></strong>
                  <div>
                    <span>{latestRun.pace}</span>
                    <small>{latestRun.average_heartrate ?? "—"} bpm · {latestRun.calories ?? "—"} kcal</small>
                  </div>
                </div>
                <div className="latest-run-stats">
                  <div><Gauge size={15} /><span>Potencia</span><strong>{latestRun.dynamics.power_w ?? "—"}<small> W</small></strong></div>
                  <div><Footprints size={15} /><span>Zancada</span><strong>{latestRun.dynamics.stride_m ?? "—"}<small> m</small></strong></div>
                  <div><Flame size={15} /><span>Energía</span><strong>{latestRun.calories ?? "—"}<small> kcal</small></strong></div>
                </div>
              </>
            ) : (
              <div className="empty-row">Cuando entre una carrera, este será el primer bloque que vas a leer.</div>
            )}
          </section>

          <section className="feed-card recent-feed-card">
            <div className="feed-card-header">
              <div><span className="eyebrow">Feed</span><h2>Actividad reciente</h2></div>
              <Link href="/activities">Ver historial <ArrowRight size={15} /></Link>
            </div>
            {data.recent_activities.length ? (
              <div className="strava-feed-list">
                {data.recent_activities.slice(0, 5).map((activity) => (
                  <Link href={`/activities/${activity.id}`} className="strava-feed-item" key={activity.id}>
                    <div className="feed-avatar"><Route size={18} /></div>
                    <div className="feed-body">
                      <div className="feed-meta">{dateFormat.format(new Date(`${activity.date}T12:00:00`))}</div>
                      <strong>{activity.name}</strong>
                      <div className="feed-stats">
                        <span>{activity.distance_km} km</span>
                        <span>{activity.pace}</span>
                        <span>{activity.average_heartrate ? `${activity.average_heartrate} bpm` : "FC —"}</span>
                        <span>Carga {activity.training_load ?? "—"}</span>
                      </div>
                    </div>
                    <ChevronRight size={17} />
                  </Link>
                ))}
              </div>
            ) : <div className="empty-row">Sin actividades todavía. Tu historial aparecerá aquí.</div>}
          </section>

          <article className="panel volume-panel compact-volume-panel">
            <div className="panel-heading">
              <div><span className="eyebrow">Progreso</span><h2>Volumen y carga semanal</h2></div>
              <span className="unit-label">km + carga</span>
            </div>
            <VolumeChart data={data.weeks} />
          </article>
        </div>

        <aside className="home-rail" aria-label="Contexto de entrenamiento">
          <section className="rail-card goal-card">
            <span className="eyebrow">Objetivo Chicago</span>
            <strong>{goalPace}<small> min/km</small></strong>
            <p>Maratón aproximada: {goalFinish}</p>
            <div className="race-mini"><CalendarDays size={15} /><span>{data.days_to_race} días restantes</span></div>
          </section>

          <section className="rail-card weekly-score-card">
            <div className="rail-card-title"><Route size={16} /><strong>Semana actual</strong></div>
            <div className="rail-metric-row"><span>Distancia</span><strong>{data.metrics.distance_current_week} km</strong></div>
            <div className="rail-track"><span style={{ width: `${Math.min(100, (data.metrics.distance_current_week / Math.max(data.metrics.average_weekly_28d || 1, 1)) * 100)}%` }} /></div>
            <div className="rail-metric-row"><span>Carga 7 días</span><strong>{data.metrics.load_7d} pts</strong></div>
            <small>{loadTrend}</small>
          </section>

          <section className="rail-card coach-panel rail-coach-card">
            <div className="coach-panel-top">
              <span className="coach-badge"><ShieldCheck size={15} />Coach</span>
              <strong className={loadDelta > 0 ? "load-delta positive" : "load-delta"}>{loadDeltaLabel > 0 ? "+" : ""}{loadDeltaLabel}</strong>
            </div>
            <span className="eyebrow">Preparación</span>
            <h2>{data.readiness.status}</h2>
            <div className="status-track" aria-label={`Preparación ${readinessWidth}%`}><span style={{ width: hasTrainingData ? `${readinessWidth}%` : "12%" }} /></div>
            <ul className="coach-notes">{data.readiness.notes.slice(0, 2).map((note) => <li key={note}>{note}</li>)}</ul>
            <Link href="/coach">Preguntar <ArrowRight size={15} /></Link>
          </section>

          <section className="rail-card source-rail-card">
            <div className="rail-card-title"><Watch size={16} /><strong>Fuentes</strong></div>
            <div className="source-pill-row">
              <div><span>Apple</span><strong>{apple.week.distance_km} km</strong><small>{apple.week.calories} kcal semana</small></div>
              <div><span>Fitbit</span><strong>{steps ? steps.count.toLocaleString("es-ES") : "—"}</strong><small>pasos hoy</small></div>
            </div>
            <div className="source-pill-row">
              <div><span>Sueño</span><strong>{sleep ? `${sleep.value} ${sleep.unit}` : "—"}</strong><small>última señal</small></div>
              <div><span>Kcal</span><strong>{activeEnergy ? `${activeEnergy.kcal}` : "—"}</strong><small>activas Fitbit</small></div>
            </div>
          </section>

          <section className="rail-card recovery-rail-card">
            <div className="rail-card-title"><BatteryMedium size={16} /><strong>Recuperación</strong></div>
            <div className="recovery-mini-list">
              {recovery.map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.metric ? item.metric.value : "—"}<small>{item.metric ? ` ${item.metric.unit}` : ""}</small></strong>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}
