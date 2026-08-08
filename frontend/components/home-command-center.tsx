import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BatteryCharging,
  Bike,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDashed,
  Clock3,
  Dumbbell,
  Footprints,
  Gauge,
  HeartPulse,
  MoonStar,
  Route,
  Sparkles,
  Watch,
  Zap,
} from "lucide-react";
import { activityDisplayName } from "@/lib/activity-display";
import type { DailyAgendaItem, DashboardData } from "@/lib/types";
import { WeeklyProgressSummary } from "@/components/weekly-progress-summary";

const weekday = new Intl.DateTimeFormat("es-ES", { weekday: "short" });
const dayNumber = new Intl.DateTimeFormat("es-ES", { day: "numeric" });

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

function categoryIcon(category: DailyAgendaItem["category"], size = 20) {
  if (category === "run") return <Footprints size={size} />;
  if (category === "strength") return <Dumbbell size={size} />;
  if (category === "bike") return <Bike size={size} />;
  return <MoonStar size={size} />;
}

function MetricTile({
  label,
  value,
  unit,
  caption,
  percent,
  icon,
  tone,
}: {
  label: string;
  value: string | number;
  unit?: string;
  caption: string;
  percent: number;
  icon: ReactNode;
  tone: "lime" | "violet" | "amber" | "blue";
}) {
  return (
    <article className={`apex-metric apex-tone-${tone}`}>
      <header>
        <span>{icon}{label}</span>
        <i aria-hidden="true" />
      </header>
      <strong>{value}<small>{unit}</small></strong>
      <div className="apex-metric-track" aria-hidden="true"><i style={{ width: `${clamp(percent)}%` }} /></div>
      <p>{caption}</p>
    </article>
  );
}

export function HomeCommandCenter({ data }: { data: DashboardData }) {
  const state = data.daily_state;
  const recovery = state.morning_recovery;
  const stress = state.physiological_stress;
  const energy = state.energy;
  const today = data.daily_agenda.find((item) => item.date === data.current_date) ?? data.daily_agenda[0];
  const week = data.daily_agenda.slice(0, 7);
  const sleepHours = recovery.sleep_hours ?? state.sleep_utility.average_hours;
  const recoveryPercent = recovery.score ?? clamp((state.calibration.nights / state.calibration.required) * 100);
  const todayAppleRun = today?.actual_activities.find(
    (activity) => activity.source === "Apple Watch" && activity.type === "RUNNING",
  );
  const todayRunDetail = data.recent_activities.find((activity) => activity.date.startsWith(data.current_date));
  const todayCompleted = today?.completed || Boolean(todayAppleRun);
  const hrv = recovery.factors.find((factor) => factor.key === "hrv");
  const restingHr = recovery.factors.find((factor) => factor.key === "resting_hr");

  return (
    <section className="apex-dashboard" aria-label="Resumen de entrenamiento y recuperación">
      <section className="apex-today" aria-labelledby="apex-today-title">
        <div className="apex-section-index" aria-hidden="true">01</div>
        <div className="apex-today-main">
          <div className="apex-section-label"><span>Hoy</span><i />{todayCompleted ? "Completado" : "Por hacer"}</div>
          <div className="apex-session-icon">{categoryIcon(today?.category ?? "rest", 29)}</div>
          <div className="apex-session-copy">
            <p>{today?.relative_label ?? "Sesión del día"}</p>
            <h2 id="apex-today-title">{today?.title ?? "Recuperación"}</h2>
            <span>{today?.detail ?? "Mantén el día flexible y escucha al cuerpo."}</span>
          </div>
          <Link className="apex-primary-action" href="/plan">
            Abrir sesión <ArrowRight size={17} />
          </Link>
        </div>
        <aside className="apex-coach-note">
          <Sparkles size={17} />
          <div className="apex-coach-content">
            <span>Decisión de hoy</span>
            <strong>{state.recommendation.title}</strong>
            <p>{state.recommendation.body}</p>
            <div className="apex-today-signals" aria-label="Señales principales de hoy">
              <span><small>Recuperación</small><b>{recovery.score ?? "—"}{recovery.score != null ? "/100" : ""}</b></span>
              <span><small>Sueño</small><b>{sleepHours ?? "—"}{sleepHours != null ? " h" : ""}</b></span>
              <span><small>Carga</small><b>{state.load_7d.current_today} pts</b></span>
            </div>
            <Link className="apex-today-recovery-link" href="/sleep">Datos de Fitbit <ArrowRight size={14} /></Link>
          </div>
        </aside>
        {todayAppleRun && (
          <div className="apex-today-result" aria-label="Carrera de hoy recibida del Apple Watch">
            <div className="apex-run-mark"><Route size={22} /></div>
            <div className="apex-run-copy">
              <span>Recibida del Apple Watch</span>
              <h3>{todayRunDetail ? activityDisplayName(todayRunDetail) : todayAppleRun.label}</h3>
            </div>
            <div className="apex-run-stats">
              <span><strong>{todayAppleRun.distance_km ?? data.today_activity.distance_km}</strong><small>km</small></span>
              <span><strong>{todayRunDetail?.pace.replace(" min/km", "") ?? "—"}</strong><small>/km</small></span>
              <span><strong>{todayAppleRun.average_heartrate ?? data.today_activity.average_heartrate ?? "—"}</strong><small>bpm</small></span>
              <span><strong>{todayAppleRun.duration_minutes ?? data.today_activity.moving_minutes}</strong><small>min</small></span>
            </div>
            <Link href={todayRunDetail ? `/activities/${todayRunDetail.id}` : "/activities"} aria-label="Abrir detalles de la carrera de hoy"><ChevronRight size={19} /></Link>
          </div>
        )}
      </section>

      <WeeklyProgressSummary data={data} />

      <section className="apex-week" aria-labelledby="apex-week-title">
        <div className="apex-section-head">
          <div><span className="apex-section-index" aria-hidden="true">03</span><div><small>Esta semana</small><h2 id="apex-week-title">El plan, de un vistazo</h2></div></div>
          <Link href="/plan">Calendario <ChevronRight size={16} /></Link>
        </div>
        <div className="apex-week-days">
          {week.map((item) => (
            <article className={`${item.date === data.current_date ? "is-today" : ""}${item.completed ? " is-done" : ""}`} key={item.date}>
              <header><span>{weekday.format(new Date(`${item.date}T12:00:00`))}</span><strong>{dayNumber.format(new Date(`${item.date}T12:00:00`))}</strong></header>
              <i>{item.completed ? <Check size={15} /> : categoryIcon(item.category, 15)}</i>
              <p>{item.title}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="apex-vitals" aria-labelledby="apex-vitals-title">
        <div className="apex-section-head">
          <div><span className="apex-section-index" aria-hidden="true">04</span><div><small>Señales del cuerpo</small><h2 id="apex-vitals-title">Detalle de recuperación</h2></div></div>
          <span className="apex-source"><Watch size={14} /> Recuperación · Fitbit</span>
        </div>
        <div className="apex-metric-grid">
          <MetricTile
            label="Sueño"
            value={sleepHours ?? "—"}
            unit={sleepHours != null ? "h" : undefined}
            percent={sleepHours == null ? 0 : (sleepHours / state.sleep_utility.goal_hours) * 100}
            caption={state.sleep_utility.debt_hours != null ? `${state.sleep_utility.debt_hours} h de deuda` : "Esperando datos de Fitbit"}
            tone="violet"
            icon={<MoonStar size={16} />}
          />
          <MetricTile
            label="Estrés"
            value={stress.score ?? "—"}
            unit={stress.score != null ? "/100" : undefined}
            percent={stress.score ?? 0}
            caption={stress.score == null ? "Sin señal suficiente" : stress.label}
            tone="amber"
            icon={<Zap size={16} />}
          />
          <MetricTile
            label="Recuperación"
            value={recovery.score ?? state.calibration.nights}
            unit={recovery.score == null ? `/${state.calibration.required}` : "/100"}
            percent={recoveryPercent}
            caption={recovery.score == null ? "Calibrando tu base" : recovery.label}
            tone="lime"
            icon={<HeartPulse size={16} />}
          />
          <MetricTile
            label="Energía"
            value={energy.score}
            unit="/100"
            percent={energy.score}
            caption={energy.label}
            tone="blue"
            icon={<BatteryCharging size={16} />}
          />
        </div>
        <div className="apex-signal-strip">
          <span><HeartPulse size={15} /><small>HRV</small><strong>{hrv?.value ?? "—"}</strong></span>
          <span><Gauge size={15} /><small>Pulso reposo</small><strong>{restingHr?.value ?? "—"}</strong></span>
          <span><Clock3 size={15} /><small>Carga hoy</small><strong>{state.load_7d.current_today} pts</strong></span>
          <Link href="/sleep">Ver recuperación <ArrowRight size={15} /></Link>
        </div>
      </section>

      <Link className="apex-coach-link" href="/coach">
        <CircleDashed size={18} />
        <span><strong>Coach</strong> · pregunta por tu sesión, carga o recuperación</span>
        <ArrowRight size={16} />
      </Link>
    </section>
  );
}
