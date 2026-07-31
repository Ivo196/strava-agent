import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  BatteryCharging,
  Bike,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Dumbbell,
  Footprints,
  Gauge,
  HeartPulse,
  MoonStar,
  Route,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import { activityDisplayName } from "@/lib/activity-display";
import type { DailyAgendaItem, DashboardData } from "@/lib/types";

const weekday = new Intl.DateTimeFormat("es-ES", { weekday: "short" });

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

function categoryIcon(category: DailyAgendaItem["category"], size = 20) {
  if (category === "run") return <Footprints size={size} />;
  if (category === "strength") return <Dumbbell size={size} />;
  if (category === "bike") return <Bike size={size} />;
  return <MoonStar size={size} />;
}

function StatusGauge({
  label,
  value,
  suffix,
  percent,
  caption,
  tone,
  icon,
}: {
  label: string;
  value: string | number;
  suffix: string;
  percent: number;
  caption: string;
  tone: "recovery" | "stress" | "load" | "sleep";
  icon: ReactNode;
}) {
  return (
    <article className={`pulse-gauge-card tone-${tone}`}>
      <div
        className="pulse-gauge"
        style={{ "--pulse-value": `${clamp(percent)}%` } as CSSProperties}
        role="progressbar"
        aria-label={`${label}: ${value} ${suffix}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamp(percent))}
      >
        <span>{icon}</span>
        <strong>{value}</strong>
        <small>{suffix}</small>
      </div>
      <div className="pulse-gauge-copy">
        <span>{label}</span>
        <p>{caption}</p>
      </div>
    </article>
  );
}

export function HomeCommandCenter({ data }: { data: DashboardData }) {
  const state = data.daily_state;
  const recovery = state.morning_recovery;
  const load = state.load_7d;
  const stress = state.physiological_stress ?? {
    score: null, label: "", latest_bpm: null, date: null, timeline: [],
    source: "", confidence: "Baja" as const, note: "",
  };
  const energy = state.energy ?? {
    score: recovery.score ?? 50, label: "", recharged: recovery.score ?? 50,
    used: 0, explanation: "Construyendo el balance", method: "",
  };
  const today = data.daily_agenda[0];
  const latestRun = data.recent_activities[0];
  const weeklyTarget = data.next_week?.target_km || data.metrics.average_weekly_28d || 1;
  const weeklyPercent = clamp((data.metrics.distance_current_week / weeklyTarget) * 100);
  const recoveryPercent = recovery.score ?? clamp(
    (state.calibration.nights / state.calibration.required) * 100,
  );
  const currentLoad = load.current_today ?? 0;
  const targetMin = load.target_min ?? 0;
  const targetMax = load.target_max ?? Math.max(load.total, 1);
  const loadPercent = clamp((currentLoad / Math.max(targetMax, 1)) * 100);
  const availableRecoveryFactors = recovery.factors.filter(
    (factor) => factor.value !== "Sin dato",
  );
  const maxDailyLoad = Math.max(...load.trend.map((day) => day.total), 1);

  return (
    <section className="pulse-dashboard" aria-label="Resumen de rendimiento de hoy">
      <section className="pulse-overview" aria-labelledby="pulse-overview-title">
        <div className="pulse-section-heading">
          <div>
            <span className="pace-kicker">Lectura rápida</span>
            <h2 id="pulse-overview-title">Tu estado en cuatro indicadores</h2>
          </div>
          <span className="pulse-confidence">
            Confianza {state.confidence.level.toLowerCase()} · {state.confidence.available_signals}/{state.confidence.expected_signals}
          </span>
        </div>

        <div className="pulse-gauge-grid">
          <StatusGauge
            label="Recuperación"
            value={recovery.score ?? state.calibration.nights}
            suffix={recovery.score == null ? `de ${state.calibration.required} noches` : "de 100"}
            percent={recoveryPercent}
            caption={recovery.score == null ? "Construyendo tu base" : recovery.label}
            tone="recovery"
            icon={<HeartPulse size={16} />}
          />
          {stress.score != null && (
            <StatusGauge
              label="Activación"
              value={stress.score}
              suffix="de 100"
              percent={stress.score}
              caption={`${stress.label} · ${stress.confidence.toLowerCase()}`}
              tone="stress"
              icon={<Zap size={16} />}
            />
          )}
          <StatusGauge
            label="Energía"
            value={energy.score}
            suffix="de 100"
            percent={energy.score}
            caption={energy.explanation}
            tone="sleep"
            icon={<BatteryCharging size={16} />}
          />
          <StatusGauge
            label="Carga · hoy"
            value={currentLoad}
            suffix="puntos"
            percent={loadPercent}
            caption={`Objetivo ${targetMin}–${targetMax}`}
            tone="load"
            icon={<Gauge size={16} />}
          />
        </div>

        <article className="pulse-action-card">
          <span className={`pulse-action-icon category-${today?.category ?? "rest"}`}>
            {categoryIcon(today?.category ?? "rest", 24)}
          </span>
          <div className="pulse-action-copy">
            <span>Recomendación de hoy</span>
            <h3>{state.recommendation.title}</h3>
            <p>{state.recommendation.body}</p>
            <div className="pulse-session-line">
              <strong>{today?.title ?? "Recuperación"}</strong>
              <small>{today?.detail ?? "Mantén el día flexible."}</small>
            </div>
          </div>
          <Link href="/plan" aria-label="Abrir el plan completo">
            Ver plan <ChevronRight size={17} />
          </Link>
        </article>

        {stress.timeline.length >= 4 && (
          <article className="pulse-stress-timeline" aria-labelledby="stress-timeline-title">
            <div>
              <span className="pace-kicker">Pulso pasivo disponible</span>
              <h3 id="stress-timeline-title">Activación fisiológica del día</h3>
              <p>{stress.note}</p>
            </div>
            <div className="stress-timeline-bars" aria-label="Activación fisiológica por hora">
              {stress.timeline.map((point, index) => (
                <span key={`${point.time}-${point.bpm}-${index}`} title={`${point.time} · ${point.bpm} bpm · activación ${point.score}`}>
                  <i style={{ height: `${Math.max(8, point.score)}%` }} />
                  <small>{point.time}</small>
                </span>
              ))}
            </div>
            <footer><span>{stress.source}</span><strong>Confianza {stress.confidence.toLowerCase()}</strong></footer>
          </article>
        )}
      </section>

      <section className="pulse-load-card" aria-labelledby="pulse-load-title">
        <div className="pulse-section-heading">
          <div>
            <span className="pace-kicker">Tendencia</span>
            <h2 id="pulse-load-title">Carga de lunes a domingo</h2>
          </div>
          <span className={`pulse-risk risk-${load.risk.toLowerCase().replace(" ", "-")}`}>
            {load.risk === "Sin base" ? "Base en construcción" : `Riesgo ${load.risk.toLowerCase()}`}
          </span>
        </div>

        <div className="pulse-load-layout">
          <div className="pulse-bars" aria-label="Carga diaria durante siete días">
            {load.trend.map((day) => (
              <div className={day.date === data.current_date ? "is-current" : ""} key={day.date}>
                <span title={`${day.total} puntos de carga`}>
                  <i style={{ height: `${Math.max(3, (day.total / maxDailyLoad) * 100)}%` }} />
                </span>
                <strong>{day.total}</strong>
                <small>{weekday.format(new Date(`${day.date}T12:00:00`))}</small>
              </div>
            ))}
          </div>

          <div className="pulse-load-context">
            <div className="pulse-category-bar" aria-label="Distribución de carga por deporte">
              {load.categories.running > 0 && <i className="cat-run" style={{ flex: load.categories.running }} />}
              {load.categories.cycling > 0 && <i className="cat-bike" style={{ flex: load.categories.cycling }} />}
              {load.categories.strength > 0 && <i className="cat-strength" style={{ flex: load.categories.strength }} />}
              {load.categories.general > 0 && <i className="cat-general" style={{ flex: load.categories.general }} />}
            </div>
            <div className="pulse-category-legend">
              <span><i className="cat-run" /> Carrera <strong>{load.categories.running}</strong></span>
              <span><i className="cat-bike" /> Bici <strong>{load.categories.cycling}</strong></span>
              <span><i className="cat-strength" /> Fuerza <strong>{load.categories.strength}</strong></span>
              <span><i className="cat-general" /> Actividad <strong>{load.categories.general}</strong></span>
            </div>
            <p>{load.recommendation}</p>
          </div>
        </div>
      </section>

      <section className="pulse-progress-row" aria-label="Progreso y última carrera">
        <article className="pulse-progress-card">
          <div>
            <span>Semana de carrera</span>
            <strong>{data.metrics.distance_current_week} <small>de {weeklyTarget} km</small></strong>
          </div>
          <div className="pulse-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(weeklyPercent)}>
            <i style={{ width: `${weeklyPercent}%` }} />
          </div>
          <Link href="/plan"><CalendarDays size={16} /> Plan completo</Link>
        </article>

        {latestRun ? (
          <Link className="pulse-latest-run" href={`/activities/${latestRun.id}`}>
            <span><Route size={20} /></span>
            <div>
              <small>Última carrera</small>
              <strong>{activityDisplayName(latestRun)}</strong>
            </div>
            <p><strong>{latestRun.distance_km}</strong> km <b>{latestRun.pace}</b></p>
            <ChevronRight size={18} />
          </Link>
        ) : (
          <Link className="pulse-latest-run" href="/settings">
            <span><Route size={20} /></span>
            <div><small>Carreras</small><strong>Conecta Apple Health</strong></div>
            <ChevronRight size={18} />
          </Link>
        )}
      </section>

      {availableRecoveryFactors.length > 0 && (
        <details className="pulse-disclosure">
          <summary>
            <span><Activity size={18} /><strong>¿Qué explica tu recuperación?</strong></span>
            <small>{availableRecoveryFactors.length} señales disponibles</small>
            <ChevronDown size={18} />
          </summary>
          <div className="pulse-signal-grid">
            {availableRecoveryFactors.map((factor) => (
              <article key={factor.key}>
                <div><span>{factor.label}</span><strong>{factor.value}</strong></div>
                {factor.score != null && (
                  <div className={`pulse-signal-bar state-${factor.state}`}>
                    <i style={{ width: `${factor.score}%` }} />
                  </div>
                )}
                <small>{factor.detail}</small>
              </article>
            ))}
          </div>
        </details>
      )}

      <Link className="pulse-coach-link" href="/coach">
        <Sparkles size={18} />
        <span><strong>¿Necesitas contexto?</strong> Pregunta al Coach sobre sueño, carga o la sesión de hoy.</span>
        Abrir Coach <ArrowRight size={17} />
      </Link>
    </section>
  );
}
