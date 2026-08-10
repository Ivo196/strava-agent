"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  BedDouble,
  BrainCircuit,
  ChevronDown,
  CircleGauge,
  Gauge,
  HeartPulse,
  Info,
  Minus,
  MoonStar,
  ShieldCheck,
  Thermometer,
  TrendingDown,
  TrendingUp,
  Wind,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  activationLabel,
  activationTone,
  clampPercent,
  dateLabel,
  formatDuration,
  formatMetric,
  groupRecoveryFactors,
  loadTone,
  recoveryTone,
  type RecoveryFactor,
  type RecoveryTone,
} from "@/lib/recovery";
import type { DashboardData } from "@/lib/types";

type RangeDays = 7 | 28;
type TrendPoint = { date: string; value: number };

function factorIcon(key: RecoveryFactor["key"]) {
  if (key === "sleep") return <BedDouble aria-hidden="true" />;
  if (key === "hrv") return <HeartPulse aria-hidden="true" />;
  if (key === "resting_hr") return <Activity aria-hidden="true" />;
  if (key === "respiratory_rate") return <Wind aria-hidden="true" />;
  if (key === "temperature") return <Thermometer aria-hidden="true" />;
  return <ShieldCheck aria-hidden="true" />;
}

function RecoveryGauge({ score, label, provisional }: { score: number | null; label: string; provisional?: boolean }) {
  const progress = score == null ? 0 : clampPercent(score);
  const tone = recoveryTone(score);
  return (
    <div className={`recovery-main-gauge gauge-${tone}`}>
      <svg
        viewBox="0 0 240 142"
        role="img"
        aria-label={`Recuperación ${score == null ? "sin lectura" : `${score} de 100`}. ${label}`}
      >
        <defs>
          <linearGradient id="recoveryGaugeGradient" x1="0" x2="1">
            <stop offset="0" stopColor="#5b8cff" />
            <stop offset="1" stopColor="#24c8f2" />
          </linearGradient>
        </defs>
        <path className="gauge-track" d="M24 120a96 96 0 0 1 192 0" pathLength="100" />
        <path
          className="gauge-value"
          d="M24 120a96 96 0 0 1 192 0"
          pathLength="100"
          style={{ strokeDasharray: `${progress} 100` }}
        />
      </svg>
      <div className="recovery-main-value">
        <span>Recuperación</span>
        <strong>{score ?? "—"}{score != null && <small>/100</small>}</strong>
        <b>{provisional ? "Lectura provisional" : label}</b>
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  title,
  value,
  status,
  tone,
  progress,
  children,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  status: string;
  tone: RecoveryTone;
  progress: number;
  children: ReactNode;
}) {
  return (
    <article className={`recovery-summary-card gauge-${tone}`}>
      <header><span>{icon}{title}</span><b>{status}</b></header>
      <strong>{value}</strong>
      <div
        className="recovery-summary-track"
        role="progressbar"
        aria-label={`${title}: ${value}. ${status}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clampPercent(progress))}
      ><i style={{ width: `${clampPercent(progress)}%` }} /></div>
      <p>{children}</p>
    </article>
  );
}

function KeySignalItem({ factor }: { factor: RecoveryFactor }) {
  const isBrake = factor.impact === "brake";
  return (
    <li className={isBrake ? "signal-brake" : "signal-help"}>
      <span className="recovery-factor-icon">{factorIcon(factor.key)}</span>
      <div><strong>{factor.label}</strong><small>{factor.difference_text}</small></div>
      <span className="recovery-signal-status">
        {isBrake ? <TrendingDown aria-hidden="true" /> : <TrendingUp aria-hidden="true" />}
        {isBrake ? "Atención" : "A favor"}
      </span>
    </li>
  );
}

function TrendCard({
  title,
  unit,
  color,
  items,
  range,
  baseline,
  normalMin,
  normalMax,
}: {
  title: string;
  unit: string;
  color: string;
  items: TrendPoint[];
  range: RangeDays;
  baseline?: number | null;
  normalMin?: number | null;
  normalMax?: number | null;
}) {
  const visible = items.slice(-range);
  const latest = visible.at(-1);
  const values = visible.map((item) => item.value);
  const allReferenceValues = [baseline, normalMin, normalMax].filter((value): value is number => value != null);
  const allValues = [...values, ...allReferenceValues];
  const minimum = allValues.length ? Math.min(...allValues) : 0;
  const maximum = allValues.length ? Math.max(...allValues) : 1;
  const padding = Math.max((maximum - minimum) * 0.18, maximum * 0.04, 1);
  const domain: [number, number] = [Math.max(0, minimum - padding), maximum + padding];

  return (
    <article className="recovery-trend-card">
      <header>
        <div><span>{title}</span><small>{range} días</small></div>
        <strong>{latest ? formatMetric(latest.value, unit) : "—"}</strong>
      </header>
      {visible.length >= 2 ? (
        <div
          className="recovery-line-chart"
          role="img"
          aria-label={`${title}, tendencia de ${range} días. Último valor ${latest ? formatMetric(latest.value, unit) : "sin dato"}${baseline != null ? `; base ${formatMetric(baseline, unit)}` : ""}.`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={visible} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="rgba(148,163,184,.10)" vertical={false} />
              <XAxis dataKey="date" hide />
              <YAxis hide domain={domain} />
              {normalMin != null && normalMax != null && (
                <ReferenceArea y1={normalMin} y2={normalMax} fill={color} fillOpacity={0.08} strokeOpacity={0} />
              )}
              {baseline != null && (
                <ReferenceLine y={baseline} stroke="rgba(226,232,240,.46)" strokeDasharray="4 5" />
              )}
              <Tooltip
                cursor={{ stroke: "rgba(226,232,240,.24)", strokeDasharray: "3 3" }}
                contentStyle={{ background: "#07111f", border: "1px solid rgba(148,163,184,.24)", borderRadius: 8, fontSize: 11 }}
                labelFormatter={(date) => dateLabel(String(date))}
                formatter={(value) => [formatMetric(Number(value), unit), title]}
              />
              <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2.4} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : <div className="recovery-trend-empty">Aún no hay suficientes datos para mostrar una tendencia.</div>}
      {visible.length > 0 && (
        <div className="sr-only">
          <table>
            <caption>{title}, valores de los últimos {range} días disponibles</caption>
            <thead><tr><th>Fecha</th><th>Valor</th></tr></thead>
            <tbody>{visible.map((item) => <tr key={item.date}><td>{dateLabel(item.date)}</td><td>{formatMetric(item.value, unit)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      <footer>
        <span>{visible[0] ? dateLabel(visible[0].date) : "—"}</span>
        {baseline != null && <small><Minus aria-hidden="true" /> Base {formatMetric(baseline, unit)}</small>}
        <span>{latest ? dateLabel(latest.date) : "—"}</span>
      </footer>
    </article>
  );
}

export function RecoveryDashboard({ data }: { data: DashboardData }) {
  const [range, setRange] = useState<RangeDays>(7);
  const [showDetails, setShowDetails] = useState(false);
  const state = data.daily_state;
  const recovery = state.morning_recovery;
  const activation = state.physiological_stress;
  const sleep = state.sleep_utility;
  const load = state.load_7d;
  const latestSleep = data.devices.fitbit.sleep.latest;
  const sleepHours = latestSleep?.hours ?? recovery.sleep_hours ?? sleep.average_hours;
  const sleepProgress = sleepHours == null ? 0 : sleepHours / sleep.goal_hours * 100;
  const groups = groupRecoveryFactors(recovery.factors);
  const highlightedFactors = [...groups.braking, ...groups.helping];
  const factorsByKey = useMemo(
    () => Object.fromEntries(recovery.factors.map((factor) => [factor.key, factor])) as Partial<Record<RecoveryFactor["key"], RecoveryFactor>>,
    [recovery.factors],
  );
  const vitalFactors = recovery.factors.filter((factor) => factor.key !== "sleep");
  const stages = [
    { label: "Profundo", value: latestSleep?.deep_minutes ?? 0, className: "stage-deep" },
    { label: "REM", value: latestSleep?.rem_minutes ?? 0, className: "stage-rem" },
    { label: "Ligero", value: latestSleep?.light_minutes ?? 0, className: "stage-light" },
    { label: "Despierto", value: latestSleep?.awake_minutes ?? 0, className: "stage-awake" },
  ];
  const stageTotal = stages.reduce((total, stage) => total + stage.value, 0);
  const sleepTrend = state.trends.sleep.map((item) => ({ date: item.date, value: item.hours }));
  const hrvTrend = state.trends.recovery.filter((item) => item.hrv != null).map((item) => ({ date: item.date, value: item.hrv! }));
  const restingTrend = state.trends.recovery.filter((item) => item.resting_hr != null).map((item) => ({ date: item.date, value: item.resting_hr! }));
  const loadTrend = state.trends.load.map((item) => ({ date: item.date, value: item.total }));
  const hasTrainingToday = state.today_load.activities_count > 0 || load.current_today > 0;
  const loadProgress = hasTrainingToday && load.target_max > 0 ? load.current_today / load.target_max * 100 : 0;
  const confidenceNeedsExplanation = state.confidence.level !== "Alta";

  return (
    <div className="page-wrap recovery-page recovery-page-v3">
      <header className="simple-header section-page-header recovery-v3-head">
        <div>
          <span className="eyebrow">Fitbit + Apple Watch</span>
          <h1>Recuperación</h1>
          <p>Tu estado de hoy, comparado con tu base personal.</p>
        </div>
      </header>

      <section className="recovery-decision" aria-label="Estado y recomendación de recuperación">
        <div className="recovery-gauge-panel">
          <RecoveryGauge score={recovery.score} label={recovery.label} provisional={recovery.provisional} />
          <details className={`recovery-confidence ${confidenceNeedsExplanation ? "needs-context" : ""}`}>
            <summary><Info aria-hidden="true" /> Confianza {state.confidence.level}</summary>
            <p>{state.confidence.note}</p>
          </details>
        </div>
        <article className={`recovery-action action-${state.recovery_guidance.level}`}>
          <span><BrainCircuit aria-hidden="true" /> Recomendación de hoy</span>
          <h2>{state.recovery_guidance.title}</h2>
          <p>{state.recovery_guidance.body}</p>
          {state.recovery_guidance.reasons.length > 0 && (
            <small>{state.recovery_guidance.reasons.join(" · ")}</small>
          )}
        </article>
      </section>

      <section className="recovery-summary-grid" aria-label="Resumen de recuperación">
        <SummaryCard
          icon={<MoonStar aria-hidden="true" />}
          title="Sueño"
          value={formatDuration(sleepHours)}
          status={sleepHours == null ? "Sin dato" : sleepHours >= sleep.goal_hours - 0.5 ? "En objetivo" : "Por debajo"}
          tone={sleepHours == null ? "neutral" : sleepHours >= sleep.goal_hours - 0.5 ? "good" : sleepHours >= 6 ? "warning" : "bad"}
          progress={sleepProgress}
        >
          Objetivo {formatDuration(sleep.goal_hours)}{sleep.debt_hours != null ? ` · deuda ${formatDuration(sleep.debt_hours)}` : ""}
        </SummaryCard>
        <SummaryCard
          icon={<CircleGauge aria-hidden="true" />}
          title="Activación fisiológica"
          value={activation.score == null ? "—" : `${activation.score}/100`}
          status={activationLabel(activation.score)}
          tone={activationTone(activation.score)}
          progress={activation.score ?? 0}
        >
          Estima la respuesta corporal; no cómo te sientes.
        </SummaryCard>
        <SummaryCard
          icon={<Gauge aria-hidden="true" />}
          title="Entrenamiento hoy"
          value={hasTrainingToday ? `${load.current_today.toLocaleString("es-ES", { maximumFractionDigits: 1 })} pts` : "Sin sesión"}
          status={hasTrainingToday ? load.today_status : "Descanso"}
          tone={hasTrainingToday ? loadTone(load.today_status) : "neutral"}
          progress={loadProgress}
        >
          {hasTrainingToday
            ? `Rango orientativo ${load.target_min}–${load.target_max} pts`
            : "La actividad cotidiana no cuenta como entrenamiento."}
        </SummaryCard>
      </section>

      {highlightedFactors.length > 0 && (
        <section className="recovery-key-signals" aria-labelledby="recovery-signals-title">
          <div className="recovery-section-heading">
            <div><span className="eyebrow">Comparado con tu base</span><h2 id="recovery-signals-title">Qué explica tu recuperación</h2></div>
            <small>
              {groups.braking.length > 0 ? `${groups.braking.length} en atención` : "Sin alertas"}
              {groups.helping.length > 0 ? ` · ${groups.helping.length} a favor` : ""}
            </small>
          </div>
          <ul>{highlightedFactors.map((factor) => <KeySignalItem key={factor.key} factor={factor} />)}</ul>
        </section>
      )}

      <details className="recovery-deep-dive" onToggle={(event) => setShowDetails(event.currentTarget.open)}>
        <summary>
          <span><HeartPulse aria-hidden="true" /><b>Ver sueño, señales vitales y tendencias</b><small>Detalle opcional</small></span>
          <ChevronDown aria-hidden="true" />
        </summary>
        {showDetails && <div className="recovery-deep-dive-body">
          <section className="recovery-vitals recovery-vitals-static" aria-labelledby="recovery-vitals-title">
            <div className="recovery-section-heading">
              <div><span className="eyebrow">Base personal</span><h2 id="recovery-vitals-title">Señales vitales</h2></div>
            </div>
            <div className="recovery-vitals-table-wrap">
              <table>
                <thead><tr><th>Señal</th><th>Hoy</th><th>Base</th><th>Diferencia</th><th>Estado</th></tr></thead>
                <tbody>
                  {vitalFactors.map((factor) => (
                    <tr key={factor.key}>
                      <th scope="row" aria-label={factor.label}><span>{factorIcon(factor.key)}{factor.label}</span></th>
                      <td data-label="Hoy">{formatMetric(factor.numeric_value, factor.unit)}</td>
                      <td data-label="Base">{factor.baseline == null ? "Construyendo" : formatMetric(factor.baseline, factor.unit)}</td>
                      <td data-label="Diferencia">{factor.difference_text}</td>
                      <td data-label="Estado"><b className={`factor-status status-${factor.impact}`}>{factor.status_label}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="sleep-architecture-v3" aria-labelledby="sleep-architecture-title">
            <header>
              <div><span className="eyebrow">Última noche</span><h2 id="sleep-architecture-title">Arquitectura del sueño</h2></div>
              <time>{dateLabel(latestSleep?.date ?? null)}</time>
            </header>
            {stageTotal > 0 ? (
              <>
                <div className="sleep-architecture-track" aria-label={`Etapas del sueño: ${stages.map((stage) => `${stage.label} ${stage.value} minutos`).join(", ")}`}>
                  {stages.map((stage) => <i key={stage.label} className={stage.className} style={{ width: `${stage.value / stageTotal * 100}%` }} />)}
                </div>
                <div className="sleep-architecture-legend">
                  {stages.map((stage) => <span key={stage.label}><i className={stage.className} /><small>{stage.label}</small></span>)}
                </div>
              </>
            ) : <p className="recovery-inline-empty">Fitbit todavía no envió las etapas de esta noche.</p>}
            <div className="sleep-architecture-stats">
              <span><small>Profundo</small><strong>{latestSleep?.deep_minutes ?? "—"}<b>{latestSleep?.deep_minutes != null ? " min" : ""}</b></strong></span>
              <span><small>REM</small><strong>{latestSleep?.rem_minutes ?? "—"}<b>{latestSleep?.rem_minutes != null ? " min" : ""}</b></strong></span>
              <span><small>Despierto</small><strong>{latestSleep?.awake_minutes ?? "—"}<b>{latestSleep?.awake_minutes != null ? " min" : ""}</b></strong></span>
              <span><small>Eficiencia</small><strong>{latestSleep?.efficiency ?? "—"}<b>{latestSleep?.efficiency != null ? "%" : ""}</b></strong></span>
            </div>
          </section>

          <section className="recovery-trends-v3" aria-labelledby="recovery-trends-title">
            <div className="recovery-section-heading">
              <div><span className="eyebrow">Tendencias</span><h2 id="recovery-trends-title">Mira la dirección, no un solo día</h2></div>
              <div className="recovery-range-toggle" aria-label="Rango de las tendencias">
                {([7, 28] as RangeDays[]).map((days) => (
                  <button key={days} type="button" className={range === days ? "active" : ""} aria-pressed={range === days} onClick={() => setRange(days)}>{days} días</button>
                ))}
              </div>
            </div>
            <div className="recovery-trend-grid-v3">
              <TrendCard title="Sueño" unit="h" color="#a98bff" items={sleepTrend} range={range} baseline={sleep.goal_hours} />
              <TrendCard title="HRV" unit="ms" color="#24c8f2" items={hrvTrend} range={range} baseline={factorsByKey.hrv?.baseline} />
              <TrendCard title="Pulso en reposo" unit="bpm" color="#78c6ff" items={restingTrend} range={range} baseline={factorsByKey.resting_hr?.baseline} />
              <TrendCard title="Carga" unit="pts" color="#5b8cff" items={loadTrend} range={range} baseline={load.baseline == null ? null : load.baseline / 7} normalMin={load.target_min} normalMax={load.target_max} />
            </div>
          </section>
        </div>}
      </details>
    </div>
  );
}
