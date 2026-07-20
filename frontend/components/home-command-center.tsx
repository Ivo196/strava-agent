import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import {
  ArrowRight,
  BatteryMedium,
  BedDouble,
  Bike,
  CalendarDays,
  Check,
  ChevronRight,
  CircleGauge,
  Dumbbell,
  Flame,
  Footprints,
  HeartPulse,
  MoonStar,
  Route,
  ShieldCheck,
  Sparkles,
  Thermometer,
  Wind,
} from "lucide-react";
import type { DailyAgendaItem, DashboardData, DeviceMetric } from "@/lib/types";

const shortDate = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" });
const weekday = new Intl.DateTimeFormat("es-ES", { weekday: "short" });
const longDate = new Intl.DateTimeFormat("es-ES", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Europe/Paris",
});

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

function metric(value: number | null | undefined, unit = "") {
  if (value == null) return "Sin dato";
  return `${value}${unit ? ` ${unit}` : ""}`;
}

function readinessLabel(score: number, trainedToday: boolean) {
  if (trainedToday && score >= 62) return "Entrenamiento hecho";
  if (trainedToday) return "Ahora toca recuperar";
  if (score >= 82) return "Listo para entrenar";
  if (score >= 62) return "Puedes entrenar";
  if (score >= 42) return "Ve con calma";
  return "Prioriza descanso";
}

function readinessCopy(score: number, trainedToday: boolean) {
  if (trainedToday) return "La carga de hoy ya está descontada. Hidrátate, come bien y deja que Fitbit mida la recuperación.";
  if (score >= 82) return "Tus señales de descanso acompañan. Puedes realizar la sesión prevista.";
  if (score >= 62) return "Estado correcto: mantén el plan y controla cómo te sientes al comenzar.";
  if (score >= 42) return "Hay señales mixtas. Baja la intensidad si el cuerpo no responde al calentar.";
  return "Hoy gana la recuperación. Sueño, hidratación y movimiento suave tienen prioridad.";
}

function categoryIcon(category: DailyAgendaItem["category"], size = 18) {
  if (category === "run") return <Footprints size={size} />;
  if (category === "strength") return <Dumbbell size={size} />;
  if (category === "bike") return <Bike size={size} />;
  return <MoonStar size={size} />;
}

function SignalBar({
  icon,
  label,
  value,
  help,
  percent,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  help: string;
  percent: number;
}) {
  return (
    <div className="plain-signal">
      <div className="plain-signal-head">
        <span>{icon}{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="blue-progress" aria-label={`${label}: ${Math.round(clamp(percent))}%`}>
        <i style={{ width: `${clamp(percent)}%` }} />
      </div>
      <small>{help}</small>
    </div>
  );
}

function RecoverySignal({
  metricValue,
  label,
  description,
  icon,
  score,
}: {
  metricValue: DeviceMetric;
  label: string;
  description: string;
  icon: ReactNode;
  score: number;
}) {
  return (
    <SignalBar
      icon={icon}
      label={label}
      value={metric(metricValue?.value, metricValue?.unit)}
      help={metricValue ? description : "Fitbit todavía está calibrando esta señal"}
      percent={metricValue ? score : 0}
    />
  );
}

export function HomeCommandCenter({ data }: { data: DashboardData }) {
  const fitbit = data.devices.fitbit;
  const apple = data.devices.apple_watch;
  const today = data.daily_agenda[0];
  const trainedToday = data.today_activity.count > 0;
  const todayRun = data.recent_activities.find((activity) => activity.date === data.current_date);
  const steps = fitbit.steps.latest;
  const sleep = fitbit.sleep.latest;
  const activeEnergy = fitbit.active_energy.latest;
  const totalCalories = fitbit.total_calories?.latest;
  const dailyActivity = fitbit.daily_activity?.latest;
  const restingHr = fitbit.recovery.resting_hr ?? data.recovery.resting_hr;
  const hrv = fitbit.recovery.hrv ?? data.recovery.hrv;
  const sleepPercent = sleep ? clamp((sleep.hours / fitbit.sleep.goal) * 100) : 0;
  const stepsPercent = steps ? clamp((steps.count / fitbit.steps.goal) * 100) : 0;
  const activeEnergyPercent = activeEnergy ? clamp((activeEnergy.kcal / fitbit.active_energy.goal) * 100) : 0;
  const activeMinutesPercent = dailyActivity
    ? clamp((dailyActivity.active_minutes / (fitbit.daily_activity?.active_minutes_goal ?? 30)) * 100)
    : 0;
  const zoneMinutesPercent = dailyActivity
    ? clamp((dailyActivity.zone_minutes / (fitbit.daily_activity?.zone_minutes_goal ?? 22)) * 100)
    : 0;
  const restingScore = restingHr ? clamp(((70 - restingHr.value) / 28) * 100) : 50;
  const hrvScore = hrv ? clamp((hrv.value / 95) * 100) : 50;
  const baseScore =
    (sleep ? sleepPercent * 0.46 : 28) +
    (hrv ? hrvScore * 0.27 : 13) +
    (restingHr ? restingScore * 0.27 : 13);
  const workoutPenalty = trainedToday
    ? Math.min(38, data.today_activity.distance_km * 1.1 + data.today_activity.training_load * 0.35)
    : 0;
  const recoveryScore = Math.round(clamp(baseScore - workoutPenalty));
  const recoveryStatus = readinessLabel(recoveryScore, trainedToday);
  const weeklyTarget = data.next_week?.target_km || data.metrics.average_weekly_28d || 1;
  const weeklyPercent = clamp((data.metrics.distance_current_week / weeklyTarget) * 100);
  const weeklyRunTarget = 3;
  const runsPercent = clamp((data.metrics.runs_current_week / weeklyRunTarget) * 100);
  const loadDelta = data.metrics.load_previous_7d
    ? Math.round(((data.metrics.load_7d - data.metrics.load_previous_7d) / data.metrics.load_previous_7d) * 100)
    : 0;

  return (
    <section className="blue-dashboard" aria-label="Resumen de entrenamiento, recuperación y calendario">
      <section className="readiness-banner">
        <div className="readiness-score" style={{ "--score": `${recoveryScore}%` } as CSSProperties}>
          <strong>{recoveryScore}</strong>
          <span>recuperación</span>
        </div>
        <div className="readiness-message">
          <span className="eyebrow">Cómo estás ahora</span>
          <h2>{recoveryStatus}</h2>
          <p>{readinessCopy(recoveryScore, trainedToday)}</p>
          <div className="readiness-chips">
            <span><BedDouble size={15} />{sleep ? `${sleep.hours} h de sueño` : "Sueño pendiente"}</span>
            <span><HeartPulse size={15} />{restingHr ? `${restingHr.value} bpm en reposo` : "Pulso calibrando"}</span>
            <span><BatteryMedium size={15} />{hrv ? `${hrv.value} ms HRV` : "HRV calibrando"}</span>
          </div>
        </div>
        <div className="readiness-source">
          <ShieldCheck size={20} />
          <div><strong>Fitbit decide tu recuperación</strong><span>Apple Watch solo analiza tus carreras</span></div>
        </div>
      </section>

      <div className="today-dashboard-grid">
        <section className={`today-training-card agenda-${today?.category ?? "rest"}`}>
          <div className="section-title-row">
            <div>
              <span className="eyebrow">Hoy · {today ? longDate.format(new Date(`${today.date}T12:00:00+02:00`)) : ""}</span>
              <h2>{trainedToday ? "Entrenamiento completado" : "Tu día de entrenamiento"}</h2>
            </div>
            {trainedToday && <span className="done-pill"><Check size={15} />Hecho</span>}
          </div>
          <div className="today-session">
            <span className="session-icon">{categoryIcon(trainedToday ? "run" : today?.category ?? "rest", 25)}</span>
            <div>
              <small>{trainedToday ? "Apple Watch · carrera" : "Lo que toca"}</small>
              <h3>{trainedToday ? `${data.today_activity.distance_km} km registrados` : today?.title}</h3>
              <p>
                {trainedToday
                  ? `${Math.round(data.today_activity.moving_minutes)} min · ${data.today_activity.average_heartrate ?? "—"} bpm · ${data.today_activity.calories ?? "—"} kcal`
                  : today?.detail}
              </p>
            </div>
            <Link href={todayRun ? `/activities/${todayRun.id}` : "/plan"}>
              {todayRun ? "Ver carrera" : "Abrir plan"}<ChevronRight size={17} />
            </Link>
          </div>
          <div className="next-two">
            {data.daily_agenda.slice(1, 3).map((item) => (
              <article key={item.date}>
                <span className={`mini-day-icon category-${item.category}`}>{categoryIcon(item.category)}</span>
                <div>
                  <small>{item.relative_label} · {shortDate.format(new Date(`${item.date}T12:00:00`))}</small>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="day-health-card">
          <div className="section-title-row">
            <div><span className="eyebrow">Fitbit · en vivo</span><h2>Cómo va tu día</h2></div>
            <span className="live-dot">Actualizando</span>
          </div>
          <div className="daily-numbers">
            <div><Footprints size={18} /><span>Pasos</span><strong>{steps ? steps.count.toLocaleString("es-ES") : "—"}</strong></div>
            <div><Flame size={18} /><span>{totalCalories ? "Gasto total" : "Gasto activo"}</span><strong>{totalCalories ? `${totalCalories.kcal}` : activeEnergy ? `${activeEnergy.kcal}` : "—"}<small> kcal</small></strong></div>
            <div><Route size={18} /><span>Distancia</span><strong>{dailyActivity?.distance_km ?? "—"}<small> km</small></strong></div>
          </div>
          <div className="daily-bars">
            <SignalBar icon={<Footprints size={15} />} label="Pasos" value={steps ? steps.count.toLocaleString("es-ES") : "—"} help={`Meta ${fitbit.steps.goal.toLocaleString("es-ES")}`} percent={stepsPercent} />
            <SignalBar icon={<Flame size={15} />} label="Calorías activas" value={activeEnergy ? `${activeEnergy.kcal} kcal` : "—"} help="Movimiento, sin metabolismo basal" percent={activeEnergyPercent} />
            <SignalBar icon={<CircleGauge size={15} />} label="Actividad moderada" value={dailyActivity ? `${dailyActivity.active_minutes} min` : "—"} help={`Meta diaria ${fitbit.daily_activity?.active_minutes_goal ?? 30} min`} percent={activeMinutesPercent} />
            <SignalBar icon={<HeartPulse size={15} />} label="Minutos de zona" value={dailyActivity ? `${dailyActivity.zone_minutes} min` : "—"} help="El esfuerzo que suma para tu salud" percent={zoneMinutesPercent} />
          </div>
        </section>
      </div>

      <section className="weekly-overview-card">
        <div className="section-title-row">
          <div><span className="eyebrow">Esta semana</span><h2>Progreso fácil de leer</h2></div>
          <Link href="/activities">Ver historial <ArrowRight size={16} /></Link>
        </div>
        <div className="week-progress-layout">
          <div className="week-progress-main">
            <div className="week-big-number">
              <strong>{data.metrics.distance_current_week}</strong><span>de {weeklyTarget} km</span>
              <small>{Math.round(weeklyPercent)}% del objetivo semanal</small>
            </div>
            <div className="week-long-track"><i style={{ width: `${weeklyPercent}%` }} /></div>
            <div className="week-support-bars">
              <SignalBar icon={<Footprints size={15} />} label="Carreras" value={`${data.metrics.runs_current_week} de ${weeklyRunTarget}`} help="Apple Watch" percent={runsPercent} />
              <SignalBar icon={<CircleGauge size={15} />} label="Carga" value={`${data.metrics.load_7d} pts`} help={`${loadDelta >= 0 ? "+" : ""}${loadDelta}% frente a la semana anterior`} percent={clamp((data.metrics.load_7d / Math.max(data.metrics.load_previous_7d, 1)) * 70)} />
              <SignalBar icon={<Route size={15} />} label="Tirada larga" value={`${data.metrics.longest_42d} km`} help="Mejor de los últimos 42 días" percent={clamp((data.metrics.longest_42d / Math.max(data.next_week?.long_run_km ?? 12, 1)) * 100)} />
            </div>
          </div>
          <div className="mini-week-calendar">
            {data.daily_agenda.map((item) => (
              <article className={`${item.date === data.current_date ? "is-today" : ""} category-${item.category}`} key={item.date}>
                <span>{weekday.format(new Date(`${item.date}T12:00:00`))}</span>
                <i>{categoryIcon(item.category, 16)}</i>
                <strong>{new Date(`${item.date}T12:00:00`).getDate()}</strong>
                <small>{item.category === "run" ? "Correr" : item.category === "strength" ? "Fuerza" : item.category === "bike" ? "Bici" : "Descanso"}</small>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="recovery-week-grid">
        <section className="recovery-signals-card">
          <div className="section-title-row">
            <div><span className="eyebrow">Recuperación Fitbit</span><h2>Qué significa cada señal</h2></div>
            <Link href="/settings">Ver datos <ArrowRight size={16} /></Link>
          </div>
          <div className="explained-signals">
            <RecoverySignal metricValue={fitbit.recovery.hrv} label="HRV" description="Más alto que tu normal suele indicar mejor recuperación" icon={<BatteryMedium size={15} />} score={hrvScore} />
            <RecoverySignal metricValue={fitbit.recovery.resting_hr} label="Pulso en reposo" description="Más bajo que tu normal suele ser una buena señal" icon={<HeartPulse size={15} />} score={restingScore} />
            <RecoverySignal metricValue={fitbit.recovery.oxygen} label="Oxígeno" description="Saturación nocturna; mira la tendencia, no un día aislado" icon={<Wind size={15} />} score={fitbit.recovery.oxygen ? clamp((fitbit.recovery.oxygen.value - 90) * 10) : 0} />
            <RecoverySignal metricValue={fitbit.recovery.respiratory_rate} label="Respiración" description="Importa si cambia respecto de tus noches habituales" icon={<Wind size={15} />} score={fitbit.recovery.respiratory_rate ? 78 : 0} />
            <RecoverySignal metricValue={fitbit.recovery.temperature} label="Temperatura" description="Útil cuando se desvía de tu línea personal" icon={<Thermometer size={15} />} score={fitbit.recovery.temperature ? 76 : 0} />
          </div>
        </section>

        <section className="sleep-card">
          <div className="section-title-row">
            <div><span className="eyebrow">Última noche</span><h2>Sueño</h2></div>
            <strong className="sleep-total">{sleep ? `${sleep.hours} h` : "—"}</strong>
          </div>
          <div className="sleep-stage-track" aria-label="Etapas de sueño">
            <i className="stage-deep" style={{ flex: sleep?.deep_minutes ?? 0 }} />
            <i className="stage-rem" style={{ flex: sleep?.rem_minutes ?? 0 }} />
            <i className="stage-light" style={{ flex: sleep?.light_minutes ?? 0 }} />
            <i className="stage-awake" style={{ flex: sleep?.awake_minutes ?? 0 }} />
          </div>
          <div className="sleep-legend">
            <span><i className="stage-deep" />Profundo<strong>{sleep?.deep_minutes ?? "—"} min</strong></span>
            <span><i className="stage-rem" />REM<strong>{sleep?.rem_minutes ?? "—"} min</strong></span>
            <span><i className="stage-light" />Ligero<strong>{sleep?.light_minutes ?? "—"} min</strong></span>
            <span><i className="stage-awake" />Despierto<strong>{sleep?.awake_minutes ?? "—"} min</strong></span>
          </div>
          <div className="sleep-week-bars" aria-label="Sueño de los últimos siete días">
            {fitbit.sleep.days.map((night) => (
              <div key={night.date}>
                <i><b style={{ height: `${Math.max(7, clamp((night.hours / fitbit.sleep.goal) * 100))}%` }} /></i>
                <strong>{night.hours}h</strong>
                <span>{weekday.format(new Date(`${night.date}T12:00:00`))}</span>
              </div>
            ))}
            {!fitbit.sleep.days.length && <p>Las barras aparecerán después de tus primeras noches completas.</p>}
          </div>
        </section>
      </div>

      <section className="future-calendar-card">
        <div className="section-title-row">
          <div><span className="eyebrow">Calendario</span><h2>Hoy y los próximos días</h2></div>
          <Link href="/plan">Calendario completo <CalendarDays size={16} /></Link>
        </div>
        <div className="future-calendar-grid">
          {data.daily_agenda.map((item, index) => (
            <article className={`future-day category-${item.category}${index === 0 ? " is-today" : ""}`} key={item.date}>
              <div className="future-day-head">
                <div><span>{item.relative_label}</span><strong>{shortDate.format(new Date(`${item.date}T12:00:00`))}</strong></div>
                <i>{categoryIcon(item.category)}</i>
              </div>
              <h3>{item.title}</h3>
              <p>{item.detail}</p>
              <small>{item.day} · Semana {item.week_number}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="sources-feed">
        <div className="source-rule">
          <div><span className="source-logo fitbit-logo">F</span><strong>Fitbit</strong><p>Vida diaria, sueño, calorías, pasos y recuperación.</p></div>
          <ArrowRight size={19} />
          <div><span className="source-logo apple-logo">A</span><strong>Apple Watch</strong><p>Única fuente para carreras, ritmo y carga de entrenamiento.</p></div>
        </div>
        <div className="compact-feed">
          <div className="section-title-row"><div><span className="eyebrow">Apple Watch</span><h2>Carreras recientes</h2></div><Link href="/activities">Ver todas</Link></div>
          {data.recent_activities.slice(0, 3).map((activity) => (
            <Link href={`/activities/${activity.id}`} key={activity.id}>
              <span className="feed-route"><Route size={17} /></span>
              <div><small>{shortDate.format(new Date(`${activity.date}T12:00:00`))}</small><strong>{activity.name}</strong></div>
              <span>{activity.distance_km} km</span><span>{activity.pace}</span><ChevronRight size={16} />
            </Link>
          ))}
          {!data.recent_activities.length && <p className="empty-copy">Tus carreras aparecerán aquí cuando Apple Watch las sincronice.</p>}
        </div>
      </section>

      <Link className="coach-callout" href="/coach">
        <span><Sparkles size={20} /></span>
        <div><strong>¿No sabes cómo adaptar el esfuerzo?</strong><p>Pregunta al coach usando tu recuperación, tu semana y el calendario.</p></div>
        <ChevronRight size={20} />
      </Link>
    </section>
  );
}
