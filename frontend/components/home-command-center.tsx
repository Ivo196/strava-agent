import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  BedDouble,
  Bike,
  CalendarDays,
  ChevronRight,
  CircleGauge,
  Clock3,
  Dumbbell,
  Flame,
  Footprints,
  Gauge,
  HeartPulse,
  MoonStar,
  Route,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import type { DailyAgendaItem, DashboardData } from "@/lib/types";
import { InteractiveWeek } from "@/components/interactive-week";
import { activityDisplayName, activityDisplaySource } from "@/lib/activity-display";

const weekday = new Intl.DateTimeFormat("es-ES", { weekday: "short" });
const time = new Intl.DateTimeFormat("es-ES", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

function categoryIcon(category: DailyAgendaItem["category"], size = 18) {
  if (category === "run") return <Footprints size={size} />;
  if (category === "strength") return <Dumbbell size={size} />;
  if (category === "bike") return <Bike size={size} />;
  return <MoonStar size={size} />;
}

function MetricTile({
  icon,
  label,
  value,
  unit,
  percent,
  caption,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  unit?: string;
  percent: number;
  caption: string;
}) {
  return (
    <article className="pace-metric">
      <div className="pace-metric-head">
        <span className="pace-icon">{icon}</span>
        <span>{label}</span>
      </div>
      <strong>
        {value}
        {unit && <small>{unit}</small>}
      </strong>
      <div
        className="pace-bullet"
        role="progressbar"
        aria-label={`${label}: ${value}${unit ? ` ${unit}` : ""}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamp(percent))}
      >
        <i style={{ width: `${clamp(percent)}%` }} />
        <b aria-hidden="true" />
      </div>
      <p>{caption}</p>
    </article>
  );
}

function EmptyLoad({ today }: { today: DailyAgendaItem | undefined }) {
  return (
    <div className="pace-load-empty">
      <span className={`pace-activity-icon category-${today?.category ?? "rest"}`}>
        {categoryIcon(today?.category ?? "rest", 22)}
      </span>
      <div>
        <small>Plan de hoy</small>
        <strong>{today?.title ?? "Día de recuperación"}</strong>
        <p>{today?.detail ?? "Sin una sesión exigente programada."}</p>
      </div>
      <Link href="/plan" aria-label="Abrir el plan de entrenamiento">
        Abrir plan <ChevronRight size={17} />
      </Link>
    </div>
  );
}

export function HomeCommandCenter({ data }: { data: DashboardData }) {
  const fitbit = data.devices.fitbit;
  const state = data.daily_state;
  const recovery = state.morning_recovery;
  const load = state.today_load;
  const today = data.daily_agenda[0];
  const steps = fitbit.steps.latest;
  const sleep = fitbit.sleep.latest;
  const activeEnergy = fitbit.active_energy.latest;
  const totalCalories = fitbit.total_calories?.latest;
  const dailyActivity = fitbit.daily_activity?.latest;
  const weeklyTarget = data.next_week?.target_km || data.metrics.average_weekly_28d || 1;
  const weeklyPercent = clamp((data.metrics.distance_current_week / weeklyTarget) * 100);
  const calibrationPercent = clamp(
    (state.calibration.nights / state.calibration.required) * 100,
  );
  const gaugeValue = recovery.score ?? calibrationPercent;
  const hasLoad = load.activities_count > 0;
  const todayRun = data.recent_activities.find((activity) => activity.date === data.current_date);

  return (
    <section className="pace-dashboard" aria-label="Estado de entrenamiento y recuperación">
      <section className={`pace-recovery-hero recovery-${load.level}`}>
        <div className="pace-hero-topline">
          <div>
            <span className="pace-kicker">Estado de hoy</span>
            <span className="pace-data-time">Fitbit actualizado en vivo</span>
          </div>
          <div className="pace-source-pills" aria-label="Fuentes de datos">
            <span><ShieldCheck size={15} /> Salud: Fitbit</span>
            <span><Footprints size={15} /> Carreras: Apple Watch</span>
          </div>
        </div>

        <div className="pace-hero-grid">
          <div
            className="pace-recovery-gauge"
            style={{ "--gauge": `${gaugeValue}%` } as CSSProperties}
            aria-label={
              recovery.score == null
                ? `${state.calibration.nights} de ${state.calibration.required} noches de calibración`
                : `Recuperación ${recovery.score} de 100`
            }
          >
            <div>
              <strong>{recovery.score ?? state.calibration.nights}</strong>
              <span>
                {recovery.score == null
                  ? `de ${state.calibration.required} noches`
                  : "de 100"}
              </span>
            </div>
          </div>

          <div className="pace-recovery-copy">
            <span className={`pace-status status-${recovery.factors[0]?.state ?? "neutral"}`}>
              {recovery.score == null ? "Calibrando" : "Recuperación matinal"}
            </span>
            <h2>{recovery.label}</h2>
            <p>{recovery.summary}</p>
            <div className="pace-recommendation">
              <Sparkles size={19} />
              <div>
                <strong>{state.recommendation.title}</strong>
                <p>{state.recommendation.body}</p>
              </div>
              <span>{state.recommendation.remaining}</span>
            </div>
          </div>

          <div className="pace-factor-list" aria-label="Factores de recuperación">
            {recovery.factors.map((factor) => (
              <article className={`pace-factor factor-${factor.state}`} key={factor.key}>
                <span className="pace-factor-icon">
                  {factor.key === "sleep" ? (
                    <BedDouble size={18} />
                  ) : factor.key === "hrv" ? (
                    <Activity size={18} />
                  ) : (
                    <HeartPulse size={18} />
                  )}
                </span>
                <div>
                  <small>{factor.label}</small>
                  <strong>{factor.value}</strong>
                  <p>{factor.detail}</p>
                </div>
                {factor.state === "low" && <span className="pace-impact">Limita</span>}
                {factor.state === "good" && <span className="pace-impact">A favor</span>}
                {factor.state === "neutral" && <span className="pace-impact">Calibrando</span>}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="pace-today-load">
        <div className="pace-section-head">
          <div>
            <span className="pace-kicker">Carga de hoy</span>
            <h2>{hasLoad ? load.label : "Todavía sin actividad"}</h2>
          </div>
          {hasLoad && (
            <div className="pace-load-summary" aria-label="Resumen de carga de hoy">
              <span><Clock3 size={15} /><strong>{load.duration_minutes}</strong> min</span>
              <span><CircleGauge size={15} /><strong>{load.zone_minutes}</strong> min zona</span>
              <span><Flame size={15} /><strong>{load.calories}</strong> kcal</span>
            </div>
          )}
        </div>

        {hasLoad ? (
          <div className="pace-activity-row">
            {load.fitbit_exercises.map((exercise) => (
              <article className="pace-activity-card" key={exercise.start_time}>
                <span className="pace-activity-icon">
                  {exercise.type === "BIKING" ? <Bike size={22} /> : <Footprints size={22} />}
                </span>
                <div>
                  <small>
                    Fitbit · {time.format(new Date(exercise.start_time))}
                  </small>
                  <strong>{exercise.label}</strong>
                  <p>
                    {exercise.duration_minutes} min
                    {exercise.average_heartrate ? ` · ${exercise.average_heartrate} bpm` : ""}
                    {exercise.calories ? ` · ${exercise.calories} kcal` : ""}
                  </p>
                </div>
                <span className="pace-zone-badge">{exercise.zone_minutes} min zona</span>
              </article>
            ))}
            {load.apple_runs > 0 && (
              <Link className="pace-activity-card apple-run-card" href={todayRun ? `/activities/${todayRun.id}` : "/activities"}>
                <span className="pace-activity-icon"><Footprints size={22} /></span>
                <div>
                  <small>Apple Watch</small>
                  <strong>{load.apple_runs > 1 ? `${load.apple_runs} carreras` : "Carrera"}</strong>
                  <p>
                    {data.today_activity.distance_km} km · {Math.round(data.today_activity.moving_minutes)} min
                  </p>
                </div>
                <ChevronRight size={18} />
              </Link>
            )}
          </div>
        ) : (
          <EmptyLoad today={today} />
        )}
      </section>

      <section className="pace-day-metrics" aria-label="Cómo va el día">
        <div className="pace-section-head compact">
          <div>
            <span className="pace-kicker">Cómo va tu día</span>
            <h2>Movimiento y energía</h2>
          </div>
          <span className="pace-live"><i /> En vivo</span>
        </div>
        <div className="pace-metric-grid">
          <MetricTile
            icon={<Footprints size={18} />}
            label="Pasos"
            value={steps?.count.toLocaleString("es-ES") ?? "—"}
            percent={steps ? (steps.count / fitbit.steps.goal) * 100 : 0}
            caption={`Objetivo ${fitbit.steps.goal.toLocaleString("es-ES")}`}
          />
          <MetricTile
            icon={<CircleGauge size={18} />}
            label="Zona activa"
            value={dailyActivity?.zone_minutes ?? "—"}
            unit="min"
            percent={
              dailyActivity
                ? (dailyActivity.zone_minutes / (fitbit.daily_activity?.zone_minutes_goal ?? 22)) * 100
                : 0
            }
            caption={`Objetivo ${fitbit.daily_activity?.zone_minutes_goal ?? 22} min`}
          />
          <MetricTile
            icon={<Flame size={18} />}
            label="Energía activa"
            value={activeEnergy?.kcal ?? "—"}
            unit="kcal"
            percent={activeEnergy ? (activeEnergy.kcal / fitbit.active_energy.goal) * 100 : 0}
            caption={totalCalories ? `${totalCalories.kcal} kcal totales hoy` : "Sin metabolismo basal"}
          />
          <MetricTile
            icon={<Route size={18} />}
            label="Distancia diaria"
            value={dailyActivity?.distance_km ?? "—"}
            unit="km"
            percent={dailyActivity ? (dailyActivity.distance_km / 8) * 100 : 0}
            caption="Caminatas y desplazamientos"
          />
        </div>
      </section>

      <div className="pace-main-grid">
        <section className="pace-week-card">
          <div className="pace-section-head">
            <div>
              <span className="pace-kicker">Esta semana</span>
              <h2>Entrenamiento y próximos días</h2>
            </div>
            <Link href="/plan">Abrir calendario <CalendarDays size={16} /></Link>
          </div>

          <div className="pace-week-score">
            <div>
              <strong>{data.metrics.distance_current_week}</strong>
              <span>de {weeklyTarget} km</span>
              <small>{Math.round(weeklyPercent)}% del objetivo</small>
            </div>
            <div className="pace-week-track" role="progressbar" aria-valuenow={Math.round(weeklyPercent)} aria-valuemin={0} aria-valuemax={100}>
              <i style={{ width: `${weeklyPercent}%` }} />
            </div>
            <div className="pace-week-kpis">
              <span><Footprints size={16} /><strong>{data.metrics.runs_current_week}</strong> carreras</span>
              <span><Gauge size={16} /><strong>{data.metrics.load_7d}</strong> carga 7 d</span>
              <span><TrendingUp size={16} /><strong>{data.metrics.longest_42d}</strong> km tirada larga</span>
            </div>
          </div>

          <InteractiveWeek agenda={data.daily_agenda} />
        </section>

        <section className="pace-sleep-card">
          <div className="pace-section-head">
            <div>
              <span className="pace-kicker">Última noche</span>
              <h2>Sueño</h2>
            </div>
            <strong className={sleep && sleep.hours < 6 ? "sleep-low" : ""}>
              {sleep ? `${sleep.hours} h` : "—"}
            </strong>
          </div>

          <div className="pace-sleep-message">
            <BedDouble size={20} />
            <p>
              {sleep && sleep.hours < 5
                ? `Te faltaron ${(fitbit.sleep.goal - sleep.hours).toFixed(1)} horas para tu objetivo. Hoy el sueño es el principal limitante.`
                : sleep
                  ? `${sleep.efficiency ?? "—"}% de eficiencia. Mira la tendencia semanal, no una noche aislada.`
                  : "Fitbit todavía no entregó el sueño de esta noche."}
            </p>
          </div>

          <div className="pace-sleep-stages" aria-label="Etapas del sueño">
            <i className="sleep-deep" style={{ flex: sleep?.deep_minutes ?? 0 }} />
            <i className="sleep-rem" style={{ flex: sleep?.rem_minutes ?? 0 }} />
            <i className="sleep-light" style={{ flex: sleep?.light_minutes ?? 0 }} />
            <i className="sleep-awake" style={{ flex: sleep?.awake_minutes ?? 0 }} />
          </div>
          <div className="pace-sleep-legend">
            <span><i className="sleep-deep" />Profundo <strong>{sleep?.deep_minutes ?? "—"} min</strong></span>
            <span><i className="sleep-rem" />REM <strong>{sleep?.rem_minutes ?? "—"} min</strong></span>
            <span><i className="sleep-light" />Ligero <strong>{sleep?.light_minutes ?? "—"} min</strong></span>
            <span><i className="sleep-awake" />Despierto <strong>{sleep?.awake_minutes ?? "—"} min</strong></span>
          </div>

          <div className="pace-sleep-week" aria-label="Horas de sueño de los últimos siete días">
            {fitbit.sleep.days.map((night) => (
              <div key={night.date}>
                <span><i style={{ height: `${Math.max(8, clamp((night.hours / fitbit.sleep.goal) * 100))}%` }} /></span>
                <strong>{night.hours}h</strong>
                <small>{weekday.format(new Date(`${night.date}T12:00:00`))}</small>
              </div>
            ))}
          </div>
          <div className="pace-calibration">
            <span>
              Línea personal Fitbit
              <strong>{state.calibration.nights}/{state.calibration.required} noches</strong>
            </span>
            <div><i style={{ width: `${calibrationPercent}%` }} /></div>
          </div>
        </section>
      </div>

      <section className="pace-recent">
        <div className="pace-section-head">
          <div>
            <span className="pace-kicker">Apple Watch</span>
            <h2>Carreras recientes</h2>
          </div>
          <Link href="/activities">Ver historial <ArrowRight size={16} /></Link>
        </div>
        <div className="pace-recent-list">
          {data.recent_activities.slice(0, 4).map((activity) => (
            <Link href={`/activities/${activity.id}`} key={activity.id}>
              <span className="pace-activity-icon"><Route size={19} /></span>
              <div>
                <small>{activityDisplaySource(activity)}</small>
                <strong>{activityDisplayName(activity)}</strong>
              </div>
              <span><strong>{activity.distance_km}</strong> km</span>
              <span><strong>{activity.pace}</strong> /km</span>
              <ChevronRight size={18} />
            </Link>
          ))}
        </div>
        <Link className="pace-coach-link" href="/coach">
          <span><Sparkles size={20} /></span>
          <div>
            <strong>¿Quieres entender por qué cambió tu estado?</strong>
            <p>El coach puede cruzar sueño, carga, calendario y tus carreras.</p>
          </div>
          Preguntar al coach <ArrowRight size={17} />
        </Link>
      </section>
    </section>
  );
}
