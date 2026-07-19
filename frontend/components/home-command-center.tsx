"use client";

import Link from "next/link";
import { useMemo, useState, type CSSProperties } from "react";
import {
  ArrowRight,
  BatteryMedium,
  BedDouble,
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
const weekdayLabel = new Intl.DateTimeFormat("es", { weekday: "short" });

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

function readinessLabel(score: number) {
  if (score >= 82) return "Listo para cargar";
  if (score >= 62) return "Recuperación aceptable";
  if (score >= 42) return "Cuidar intensidad";
  return "Priorizar descanso";
}

function shortMetric(value: number | null | undefined, unit = "") {
  if (value == null) return "—";
  return `${value}${unit ? ` ${unit}` : ""}`;
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
  const fitbitSleep = fitbit.sleep.latest;
  const sleep = fitbitSleep
    ? { value: fitbitSleep.hours, unit: "h", date: fitbitSleep.date }
    : fitbit.recovery.sleep;
  const restingHr = fitbit.recovery.resting_hr ?? data.recovery.resting_hr;
  const hrv = fitbit.recovery.hrv ?? data.recovery.hrv;
  const activeEnergy = fitbit.active_energy.latest;
  const sleepHours = sleep?.value ?? null;
  const sleepPercent = sleepHours ? clampPercent((sleepHours / 8) * 100) : 0;
  const stepPercent = steps ? clampPercent((steps.count / fitbit.steps.goal) * 100) : 0;
  const activeEnergyPercent = activeEnergy ? clampPercent((activeEnergy.kcal / fitbit.active_energy.goal) * 100) : 0;
  const restingScore = restingHr?.value ? clampPercent(((70 - restingHr.value) / 28) * 100) : 50;
  const recoveryScore = Math.round(
    (sleep ? sleepPercent * 0.45 : 30) +
    (hrv ? clampPercent((hrv.value / 95) * 100) * 0.25 : 12) +
    (restingHr ? restingScore * 0.2 : 10) +
    (steps ? Math.min(100, 100 - Math.max(0, stepPercent - 100) * 0.35) * 0.1 : 6),
  );
  const sleepDays = fitbit.sleep.days;

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
          <strong>{recoveryScore}<small>/100</small></strong>
          <p>{readinessLabel(recoveryScore)}</p>
        </div>
      </div>

      <div className="command-shell">
        <div className="command-main">
          <div className="command-tabs" role="tablist" aria-label="Vista principal">
            <button className={mode === "today" ? "active" : ""} onClick={() => setMode("today")} role="tab" type="button"><CalendarDays size={16} />Hoy</button>
            <button className={mode === "run" ? "active" : ""} onClick={() => setMode("run")} role="tab" type="button"><BatteryMedium size={16} />Recuperación</button>
            <button className={mode === "progress" ? "active" : ""} onClick={() => setMode("progress")} role="tab" type="button"><Gauge size={16} />Semana</button>
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
              <div className="today-recovery-strip">
                <div>
                  <span><BedDouble size={15} />Descanso</span>
                  <strong>{shortMetric(sleep?.value, sleep?.unit)}</strong>
                  <small>{sleep ? `último registro ${sleep.date}` : "Fitbit necesita noches suficientes"}</small>
                </div>
                <div>
                  <span><HeartPulse size={15} />FC reposo</span>
                  <strong>{shortMetric(restingHr?.value, restingHr?.unit)}</strong>
                  <small>{restingHr ? "señal de recuperación" : "calibrando"}</small>
                </div>
                <div>
                  <span><Footprints size={15} />Día a día</span>
                  <strong>{steps ? steps.count.toLocaleString("es-ES") : "—"}</strong>
                  <small>{steps ? `${Math.round(stepPercent)}% de pasos` : "sin pasos hoy"}</small>
                </div>
              </div>
            </div>
          )}

          {mode === "run" && (
            <div className="focus-panel focus-recovery">
              <div className="focus-kicker"><span>Recuperación Fitbit · hoy y semana</span><Link href="/settings">Datos <ArrowRight size={15} /></Link></div>
              <div className="recovery-hero">
                <div className="recovery-ring" style={{ "--score": `${recoveryScore}%` } as CSSProperties}>
                  <strong>{recoveryScore}</strong>
                  <span>/100</span>
                </div>
                <div>
                  <span className="eyebrow">Estado del cuerpo</span>
                  <h2>{readinessLabel(recoveryScore)}</h2>
                  <p>{sleep ? `Dormiste ${sleep.value} ${sleep.unit}. ` : "Aún falta historial de sueño. "}{steps ? `Hoy llevas ${steps.count.toLocaleString("es-ES")} pasos.` : "Fitbit seguirá completando el día."}</p>
                </div>
              </div>
              <div className="recovery-signal-list">
                <div>
                  <span><BedDouble size={15} />Sueño</span>
                  <strong>{shortMetric(sleep?.value, sleep?.unit)}</strong>
                  <i><b style={{ width: `${sleepPercent}%` }} /></i>
                  <small>objetivo 8 h</small>
                </div>
                <div>
                  <span><HeartPulse size={15} />FC reposo</span>
                  <strong>{shortMetric(restingHr?.value, restingHr?.unit)}</strong>
                  <i><b style={{ width: `${restingScore}%` }} /></i>
                  <small>{restingHr ? restingHr.date : "calibrando"}</small>
                </div>
                <div>
                  <span><BatteryMedium size={15} />HRV</span>
                  <strong>{shortMetric(hrv?.value, hrv?.unit)}</strong>
                  <i><b style={{ width: `${hrv ? clampPercent((hrv.value / 95) * 100) : 0}%` }} /></i>
                  <small>{hrv ? hrv.date : "calibrando"}</small>
                </div>
                <div>
                  <span><Footprints size={15} />Pasos</span>
                  <strong>{steps ? steps.count.toLocaleString("es-ES") : "—"}</strong>
                  <i><b style={{ width: `${stepPercent}%` }} /></i>
                  <small>meta {fitbit.steps.goal.toLocaleString("es-ES")}</small>
                </div>
                <div>
                  <span><Flame size={15} />Kcal activas</span>
                  <strong>{activeEnergy ? `${activeEnergy.kcal}` : "—"}</strong>
                  <i><b style={{ width: `${activeEnergyPercent}%` }} /></i>
                  <small>meta {fitbit.active_energy.goal}</small>
                </div>
              </div>
              <div className="sleep-week-card">
                <div className="sleep-week-heading">
                  <strong>Descanso semanal</strong>
                  <span>{sleepDays.length ? `${sleepDays.length} noches registradas` : "sin noches suficientes"}</span>
                </div>
                <div className="sleep-week-bars" aria-label="Horas de sueño por día">
                  {sleepDays.length ? sleepDays.map((night) => {
                    const percent = clampPercent((night.hours / fitbit.sleep.goal) * 100);
                    return (
                      <div key={night.date}>
                        <i><b style={{ height: `${Math.max(8, percent)}%` }} /></i>
                        <strong>{night.hours}h</strong>
                        <span>{weekdayLabel.format(new Date(`${night.date}T12:00:00`))}</span>
                      </div>
                    );
                  }) : (
                    <p>Cuando entren más noches de Fitbit, vas a ver barras por día acá.</p>
                  )}
                </div>
              </div>
              <div className="weekly-recovery-note">
                <strong>Semana Fitbit</strong>
                <span>{sleepDays.length > 1 ? "Ya estás viendo tendencia real de descanso; la lectura mejora con cada noche nueva." : "Cuando Fitbit mande más noches, acá vas a ver tendencia de descanso semanal."}</span>
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
                <div><span>Descanso</span><strong>{shortMetric(sleep?.value, sleep?.unit)}</strong><small>{readinessLabel(recoveryScore)}</small></div>
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
              <div>
                <span>Fitbit hoy</span>
                <strong>{recoveryScore}<small>/100</small></strong>
              </div>
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
