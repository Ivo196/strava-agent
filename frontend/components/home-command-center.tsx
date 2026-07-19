"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  BatteryMedium,
  Bike,
  CalendarDays,
  Check,
  ChevronRight,
  Dumbbell,
  Flame,
  Footprints,
  Gauge,
  HeartPulse,
  MoonStar,
  Route,
  ShieldCheck,
  Sparkles,
  Watch,
} from "lucide-react";
import { VolumeChart } from "@/components/volume-chart";
import type { DailyAgendaItem, DashboardData, RecoveryMetric } from "@/lib/types";

type FocusMode = "today" | "run" | "progress";

const dateFormat = new Intl.DateTimeFormat("es", { day: "numeric", month: "short" });
const fullDate = new Intl.DateTimeFormat("es-ES", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Europe/Paris",
});

function formatLoadDelta(current: number, previous: number) {
  if (!previous) return "Sin comparación previa";
  const delta = Math.round(((current - previous) / previous) * 100);
  if (delta === 0) return "Igual que la semana anterior";
  return `${delta > 0 ? "+" : ""}${delta}% vs 7 días previos`;
}

function latestRecovery(metrics: { hrv: RecoveryMetric; resting_hr: RecoveryMetric; vo2_max: RecoveryMetric; sleep: RecoveryMetric }) {
  return [
    { label: "HRV", metric: metrics.hrv },
    { label: "FC reposo", metric: metrics.resting_hr },
    { label: "Sueño", metric: metrics.sleep },
  ];
}

function AgendaIcon({ category, size = 21 }: { category: DailyAgendaItem["category"]; size?: number }) {
  if (category === "run") return <Footprints size={size} />;
  if (category === "strength") return <Dumbbell size={size} />;
  if (category === "bike") return <Bike size={size} />;
  return <MoonStar size={size} />;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function HomeCommandCenter({ data }: { data: DashboardData }) {
  const [mode, setMode] = useState<FocusMode>("today");
  const primary = data.daily_agenda[0];
  const following = data.daily_agenda.slice(1, 4);
  const latestRun = data.devices.apple_watch.latest_run;
  const fitbit = data.devices.fitbit;
  const apple = data.devices.apple_watch;
  const recovery = latestRecovery(data.recovery);
  const completedDates = useMemo(() => data.recent_activities.map((activity) => activity.date), [data.recent_activities]);
  const primaryComplete = primary?.category === "run" && completedDates.includes(primary.date);
  const goalSeconds = data.profile.goal_pace_seconds_km;
  const goalPace = goalSeconds ? `${Math.floor(goalSeconds / 60)}:${String(goalSeconds % 60).padStart(2, "0")}` : "—";
  const goalFinishMinutes = goalSeconds ? goalSeconds * 42.195 / 60 : null;
  const goalFinish = goalFinishMinutes
    ? `${Math.floor(goalFinishMinutes / 60)} h ${String(Math.floor(goalFinishMinutes % 60)).padStart(2, "0")} min`
    : "Meta sin configurar";
  const readinessWidth = ({ "Base inicial": 25, "En construcción": 55, "Base sólida": 85, Taper: 100 } as Record<string, number>)[data.readiness.status] ?? 35;
  const loadDelta = Math.round(data.metrics.load_7d - data.metrics.load_previous_7d);
  const weekTarget = data.next_week?.target_km ?? data.metrics.average_weekly_28d ?? 1;
  const weekPercent = clampPercent((data.metrics.distance_current_week / Math.max(weekTarget, 1)) * 100);
  const steps = fitbit.steps.latest;
  const sleep = fitbit.recovery.sleep;

  return (
    <section className="command-center" aria-label="Panel principal de entrenamiento">
      <div className="command-scoreboard">
        <div>
          <span className="eyebrow">Objetivo Chicago</span>
          <strong>{goalPace}<small> min/km</small></strong>
          <p>{goalFinish} · {data.days_to_race} días</p>
        </div>
        <div>
          <span>Semana</span>
          <strong>{data.metrics.distance_current_week}<small> km</small></strong>
          <p>{data.metrics.runs_current_week} salidas · {Math.round(weekPercent)}%</p>
        </div>
        <div>
          <span>Recuperación</span>
          <strong>{sleep ? `${sleep.value}` : "—"}<small>{sleep ? ` ${sleep.unit}` : ""}</small></strong>
          <p>{steps ? `${steps.count.toLocaleString("es-ES")} pasos` : "Fitbit calibrando"}</p>
        </div>
      </div>

      <div className="command-shell">
        <div className="command-main">
          <div className="command-tabs" role="tablist" aria-label="Vista principal">
            <button className={mode === "today" ? "active" : ""} onClick={() => setMode("today")} role="tab" type="button"><CalendarDays size={16} />Hoy</button>
            <button className={mode === "run" ? "active" : ""} onClick={() => setMode("run")} role="tab" type="button"><Route size={16} />Carrera</button>
            <button className={mode === "progress" ? "active" : ""} onClick={() => setMode("progress")} role="tab" type="button"><Gauge size={16} />Progreso</button>
          </div>

          {mode === "today" && primary && (
            <div className={`focus-panel focus-today agenda-${primary.category}`}>
              <div className="focus-kicker">
                <span>{fullDate.format(new Date(`${primary.date}T12:00:00+02:00`))}</span>
                {primaryComplete && <strong><Check size={15} />Hecho</strong>}
              </div>
              <div className="focus-hero-row">
                <div className="focus-icon"><AgendaIcon category={primary.category} /></div>
                <div>
                  <span className="eyebrow">{primaryComplete ? "Sesión completada" : "Lo que toca hoy"}</span>
                  <h2>{primary.title}</h2>
                  <p>{primary.detail}</p>
                </div>
                <Link href="/plan" className="focus-action">Plan <ChevronRight size={17} /></Link>
              </div>
              <div className="mini-agenda">
                {following.map((item) => (
                  <article key={item.date}>
                    <small>{item.relative_label} · {item.day}</small>
                    <strong><AgendaIcon category={item.category} size={15} />{item.title}</strong>
                    <p>{item.detail}</p>
                  </article>
                ))}
              </div>
            </div>
          )}

          {mode === "run" && (
            <div className="focus-panel focus-run">
              {latestRun ? (
                <>
                  <div className="focus-kicker"><span>Última carrera · {latestRun.date}</span><Link href={`/activities/${latestRun.id}`}>Detalle <ArrowRight size={15} /></Link></div>
                  <div className="run-spotlight">
                    <strong>{latestRun.distance_km}<small> km</small></strong>
                    <div>
                      <h2>{latestRun.pace}</h2>
                      <p>{latestRun.average_heartrate ?? "—"} bpm · {latestRun.calories ?? "—"} kcal</p>
                    </div>
                  </div>
                  <div className="run-detail-strip">
                    <span><Gauge size={15} />{latestRun.dynamics.power_w ?? "—"} W</span>
                    <span><Footprints size={15} />{latestRun.dynamics.stride_m ?? "—"} m zancada</span>
                    <span><Flame size={15} />{latestRun.calories ?? "—"} kcal</span>
                  </div>
                </>
              ) : (
                <div className="empty-row">La próxima carrera aparecerá acá con ritmo, pulso y calorías.</div>
              )}
              <div className="activity-mini-feed">
                {data.recent_activities.slice(0, 3).map((activity) => (
                  <Link href={`/activities/${activity.id}`} key={activity.id}>
                    <span>{dateFormat.format(new Date(`${activity.date}T12:00:00`))}</span>
                    <strong>{activity.name}</strong>
                    <small>{activity.distance_km} km · {activity.pace}</small>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {mode === "progress" && (
            <div className="focus-panel focus-progress">
              <div className="focus-kicker"><span>Progreso semanal</span><Link href="/activities">Historial <ArrowRight size={15} /></Link></div>
              <VolumeChart data={data.weeks} />
              <div className="progress-facts">
                <div><span>Tirada larga</span><strong>{data.metrics.longest_42d} km</strong></div>
                <div><span>Carga</span><strong>{data.metrics.load_7d} pts</strong><small>{formatLoadDelta(data.metrics.load_7d, data.metrics.load_previous_7d)}</small></div>
                <div><span>Cobertura FC</span><strong>{data.metrics.hr_coverage}%</strong></div>
              </div>
            </div>
          )}
        </div>

        <aside className="command-rail">
          <div className="rail-card coach-panel rail-coach-card">
            <div className="coach-panel-top">
              <span className="coach-badge"><ShieldCheck size={15} />Coach</span>
              <strong className={loadDelta > 0 ? "load-delta positive" : "load-delta"}>{loadDelta > 0 ? "+" : ""}{loadDelta}</strong>
            </div>
            <span className="eyebrow">Preparación</span>
            <h2>{data.readiness.status}</h2>
            <div className="status-track" aria-label={`Preparación ${readinessWidth}%`}><span style={{ width: `${readinessWidth}%` }} /></div>
            <p>{data.readiness.notes[0]}</p>
            <Link href="/coach">Preguntar <Sparkles size={15} /></Link>
          </div>

          <details className="rail-card quiet-details">
            <summary><Watch size={16} />Fuentes y señales</summary>
            <div className="quiet-signal-grid">
              <div><span>Apple</span><strong>{apple.week.distance_km} km</strong><small>{apple.week.calories} kcal semana</small></div>
              <div><span>Fitbit</span><strong>{steps ? steps.count.toLocaleString("es-ES") : "—"}</strong><small>pasos hoy</small></div>
              <div><span>Kcal</span><strong>{fitbit.active_energy.latest?.kcal ?? "—"}</strong><small>activas Fitbit</small></div>
            </div>
          </details>

          <details className="rail-card quiet-details">
            <summary><BatteryMedium size={16} />Recuperación</summary>
            <div className="recovery-mini-list">
              {recovery.map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.metric ? item.metric.value : "—"}<small>{item.metric ? ` ${item.metric.unit}` : ""}</small></strong>
                </div>
              ))}
            </div>
          </details>
        </aside>
      </div>

      <section className="strava-lite-feed" aria-label="Actividad reciente">
        <div className="feed-card-header">
          <div><span className="eyebrow">Feed</span><h2>Actividad reciente</h2></div>
          <Link href="/activities">Ver todo <ArrowRight size={15} /></Link>
        </div>
        <div className="strava-feed-list">
          {data.recent_activities.slice(0, 4).map((activity) => (
            <Link href={`/activities/${activity.id}`} className="strava-feed-item" key={activity.id}>
              <div className="feed-avatar"><Route size={18} /></div>
              <div className="feed-body">
                <div className="feed-meta">{dateFormat.format(new Date(`${activity.date}T12:00:00`))}</div>
                <strong>{activity.name}</strong>
                <div className="feed-stats">
                  <span>{activity.distance_km} km</span>
                  <span>{activity.pace}</span>
                  <span>{activity.average_heartrate ? `${activity.average_heartrate} bpm` : "FC —"}</span>
                </div>
              </div>
              <ChevronRight size={17} />
            </Link>
          ))}
        </div>
      </section>
    </section>
  );
}
