"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  BatteryCharging,
  BedDouble,
  Flame,
  Footprints,
  Gauge,
  HeartPulse,
  Moon,
  Timer,
  Watch,
} from "lucide-react";
import type { DeviceInsights as DeviceInsightsData, DeviceMetric, RecoveryMetric } from "@/lib/types";

function Metric({
  label,
  metric,
  pending = "Calibrando",
}: {
  label: string;
  metric: RecoveryMetric | DeviceMetric;
  pending?: string;
}) {
  return (
    <div className="source-metric">
      <span>{label}</span>
      {metric ? (
        <strong>{metric.value}<small> {metric.unit}</small></strong>
      ) : (
        <strong className="metric-pending">{pending}</strong>
      )}
    </div>
  );
}

function sparkPath(points: { x: number; y: number }[]) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}

function HeartRateChart({ series }: { series: { time: string; bpm: number }[] }) {
  const width = 520;
  const height = 190;
  const top = 18;
  const right = 14;
  const bottom = 28;
  const left = 34;
  const values = series.map((point) => point.bpm);
  const min = Math.min(...values) - 5;
  const max = Math.max(...values) + 5;
  const range = max - min || 1;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const points = series.map((point, index) => ({
    x: left + (index / Math.max(series.length - 1, 1)) * plotWidth,
    y: top + plotHeight - ((point.bpm - min) / range) * plotHeight,
  }));
  const fillPath = `${sparkPath(points)} L ${left + plotWidth} ${top + plotHeight} L ${left} ${top + plotHeight} Z`;

  return (
    <svg className="fitbit-sparkline" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path className="chart-grid-line" d={`M ${left} ${top + plotHeight} H ${left + plotWidth} M ${left} ${top + plotHeight / 2} H ${left + plotWidth} M ${left} ${top} H ${left + plotWidth}`} />
      <path className="sparkline-fill" d={fillPath} />
      <path className="sparkline-line" d={sparkPath(points)} />
      <text className="chart-axis-label" x="2" y={top + 4}>{Math.round(max)}</text>
      <text className="chart-axis-label" x="2" y={top + plotHeight + 4}>{Math.round(min)}</text>
      <text className="chart-x-label" x={left} y={height - 6}>{series[0]?.time}</text>
      <text className="chart-x-label" x={left + plotWidth} y={height - 6}>{series[series.length - 1]?.time}</text>
    </svg>
  );
}

function metricValue(metric: RecoveryMetric | DeviceMetric) {
  return metric?.value ?? null;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function ProgressSignal({
  icon,
  label,
  value,
  detail,
  percent,
  tone = "cyan",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  percent: number;
  tone?: "cyan" | "blue" | "amber";
}) {
  return (
    <div className={`progress-signal progress-signal-${tone}`}>
      <span className="progress-signal-icon">{icon}</span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
        <div className="progress-track" aria-hidden="true"><i style={{ width: `${clampPercent(percent)}%` }} /></div>
      </div>
    </div>
  );
}

function StepBars({ days, goal }: { days: { date: string; count: number }[]; goal: number }) {
  const labels = new Intl.DateTimeFormat("es", { weekday: "short" });
  return (
    <div className="step-bars" aria-label="Pasos por día Fitbit">
      {days.length ? days.map((day) => {
        const percent = clampPercent((day.count / goal) * 100);
        return (
          <div className="step-day" key={day.date}>
            <div><i style={{ height: `${Math.max(8, percent)}%` }} /></div>
            <strong>{Math.round(day.count / 100) / 10}k</strong>
            <span>{labels.format(new Date(`${day.date}T12:00:00`))}</span>
          </div>
        );
      }) : (
        <div className="step-empty">Sin pasos todavía</div>
      )}
    </div>
  );
}

function EnergyBars({ days, goal }: { days: { date: string; kcal: number }[]; goal: number }) {
  const labels = new Intl.DateTimeFormat("es", { weekday: "short" });
  return (
    <div className="step-bars energy-bars" aria-label="Calorías activas Fitbit por día">
      {days.length ? days.map((day) => {
        const percent = clampPercent((day.kcal / goal) * 100);
        return (
          <div className="step-day energy-day" key={day.date}>
            <div><i style={{ height: `${Math.max(8, percent)}%` }} /></div>
            <strong>{day.kcal}</strong>
            <span>{labels.format(new Date(`${day.date}T12:00:00`))}</span>
          </div>
        );
      }) : (
        <div className="step-empty">Sin calorías activas todavía</div>
      )}
    </div>
  );
}

export function DeviceInsights({ devices }: { devices: DeviceInsightsData }) {
  const apple = devices.apple_watch;
  const fitbit = devices.fitbit;
  const run = apple.latest_run;
  const dynamics = run?.dynamics ?? {};
  const heartRate = fitbit.heart_rate;
  const sleepHours = metricValue(fitbit.recovery.sleep);
  const restingHr = metricValue(fitbit.recovery.resting_hr);
  const appleHrv = metricValue(apple.recovery.hrv);
  const appleVo2 = metricValue(apple.recovery.vo2_max);
  const sleepPercent = sleepHours ? (sleepHours / 8) * 100 : 0;
  const restingPercent = restingHr ? ((70 - restingHr) / 30) * 100 : 0;
  const stepsLatest = fitbit.steps.latest;
  const stepsPercent = stepsLatest ? (stepsLatest.count / fitbit.steps.goal) * 100 : 0;
  const activeEnergyLatest = fitbit.active_energy.latest;
  const activeEnergyPercent = activeEnergyLatest ? (activeEnergyLatest.kcal / fitbit.active_energy.goal) * 100 : 0;

  return (
    <section className="device-section" aria-labelledby="device-insights-title">
      <div className="section-heading device-heading">
        <div>
          <span className="eyebrow">Fuentes separadas</span>
          <h2 id="device-insights-title">Rendimiento y recuperación</h2>
        </div>
        <span className="unit-label">cada dato conserva su origen</span>
      </div>

      <div className="device-grid">
        <article className="device-panel apple-panel">
          <header className="device-panel-header">
            <div className="device-identity">
              <span className="device-icon"><Watch size={18} /></span>
              <div><span>Apple Watch</span><strong>Carrera y técnica</strong></div>
            </div>
            <span className="device-status active">{apple.status}</span>
          </header>

          <div className="device-primary-stats">
            <div>
              <span>Esta semana</span>
              <strong>{apple.week.distance_km}<small> km</small></strong>
              <p>{apple.week.runs} {apple.week.runs === 1 ? "carrera" : "carreras"} · {apple.week.calories} kcal</p>
            </div>
            <div>
              <span>Última carrera</span>
              <strong>{run?.pace ?? "—"}</strong>
              <p>{run ? `${run.distance_km} km · ${run.average_heartrate ?? "—"} bpm · ${run.calories ?? "—"} kcal` : "Esperando entrenamiento"}</p>
            </div>
          </div>

          <div className="apple-readiness-strip">
            <ProgressSignal
              icon={<Activity size={15} />}
              label="Técnica"
              value={run ? `${run.distance_km} km` : "Sin carrera"}
              detail={run?.average_heartrate ? `${run.average_heartrate} bpm en la última salida` : "esperando nueva salida"}
              percent={run ? Math.min(100, (run.distance_km / 12) * 100) : 0}
              tone="blue"
            />
            <ProgressSignal
              icon={<BatteryCharging size={15} />}
              label="Motor"
              value={appleVo2 ? `${appleVo2}` : "Calibrando"}
              detail="VO₂ máx. Apple"
              percent={appleVo2 ? (appleVo2 / 60) * 100 : 0}
              tone="cyan"
            />
            <ProgressSignal
              icon={<Flame size={15} />}
              label="Energía"
              value={run?.calories ? `${run.calories} kcal` : "Sin dato"}
              detail="calorías activas última carrera"
              percent={run?.calories ? (run.calories / 800) * 100 : 0}
              tone="amber"
            />
            <ProgressSignal
              icon={<HeartPulse size={15} />}
              label="Variabilidad"
              value={appleHrv ? `${appleHrv} ms` : "Sin dato"}
              detail="HRV reciente"
              percent={appleHrv ? (appleHrv / 100) * 100 : 0}
              tone="amber"
            />
          </div>

          <div className="device-subheading"><span>Dinámica de la última carrera</span><small>medida por el reloj</small></div>
          <div className="dynamics-compact">
            <div><Gauge size={14} /><span>Potencia</span><strong>{dynamics.power_w ?? "—"}<small> W</small></strong></div>
            <div><Timer size={14} /><span>Contacto</span><strong>{dynamics.ground_contact_ms ?? "—"}<small> ms</small></strong></div>
            <div><Footprints size={14} /><span>Zancada</span><strong>{dynamics.stride_m ?? "—"}<small> m</small></strong></div>
            <div><Activity size={14} /><span>Oscilación</span><strong>{dynamics.vertical_oscillation_cm ?? "—"}<small> cm</small></strong></div>
          </div>

          <div className="device-subheading"><span>Capacidad medida por Apple</span><small>últimos 7 días</small></div>
          <div className="source-metrics">
            <Metric label="HRV" metric={apple.recovery.hrv} />
            <Metric label="FC reposo" metric={apple.recovery.resting_hr} />
            <Metric label="VO₂ máx." metric={apple.recovery.vo2_max} />
          </div>

          {run && (
            <Link className="device-link" href={`/activities/${run.id}`}>
              Ver análisis de la carrera <ArrowRight size={14} />
            </Link>
          )}
        </article>

        <article className="device-panel fitbit-panel">
          <header className="device-panel-header">
            <div className="device-identity">
              <span className="device-icon fitbit-icon"><HeartPulse size={18} /></span>
              <div><span>Fitbit</span><strong>Pulso y recuperación</strong></div>
            </div>
            <span className={`device-status ${fitbit.status === "Activo" ? "active" : "calibrating"}`}>{fitbit.status}</span>
          </header>

          <div className="fitbit-chart-heading">
            <div><span>Pulso continuo</span><strong>{heartRate.date ? `Último día · ${heartRate.date}` : "Esperando muestras"}</strong></div>
            {heartRate.latest != null && <strong>{heartRate.latest}<small> bpm</small></strong>}
          </div>

          {heartRate.series.length ? (
            <div className="fitbit-chart" role="img" aria-label={`Pulso Fitbit del ${heartRate.date}, entre ${heartRate.minimum} y ${heartRate.maximum} pulsaciones por minuto`}>
              <HeartRateChart series={heartRate.series} />
            </div>
          ) : (
            <div className="fitbit-empty"><HeartPulse size={22} /><span>El gráfico aparecerá con las primeras muestras de pulso.</span></div>
          )}

          <div className="heart-rate-summary">
            <div><span>Media</span><strong>{heartRate.average ?? "—"}<small> bpm</small></strong></div>
            <div><span>Rango</span><strong>{heartRate.minimum ?? "—"}–{heartRate.maximum ?? "—"}<small> bpm</small></strong></div>
            <div><span>Cobertura</span><strong>{heartRate.coverage_hours}<small> h</small></strong></div>
          </div>

          <div className="fitbit-live-grid">
            <ProgressSignal
              icon={<BedDouble size={15} />}
              label="Descanso"
              value={sleepHours ? `${sleepHours} h` : "Primera noche"}
              detail={sleepHours ? "objetivo 8 h" : "Fitbit necesita una noche completa"}
              percent={sleepPercent}
              tone="blue"
            />
            <ProgressSignal
              icon={<HeartPulse size={15} />}
              label="FC reposo"
              value={restingHr ? `${restingHr} bpm` : "Calibrando"}
              detail={restingHr ? "menor suele indicar recuperación" : "aparece con más noches"}
              percent={restingPercent}
              tone="cyan"
            />
            <ProgressSignal
              icon={<Footprints size={15} />}
              label="Pasos hoy"
              value={stepsLatest ? stepsLatest.count.toLocaleString("es-ES") : "Sin pasos"}
              detail={`meta ${fitbit.steps.goal.toLocaleString("es-ES")}`}
              percent={stepsPercent}
              tone="amber"
            />
            <ProgressSignal
              icon={<Flame size={15} />}
              label="Kcal activas"
              value={activeEnergyLatest ? `${activeEnergyLatest.kcal} kcal` : "Sin calorías"}
              detail={`meta ${fitbit.active_energy.goal} kcal`}
              percent={activeEnergyPercent}
              tone="amber"
            />
          </div>

          <div className="device-subheading"><span>Pasos por día</span><small>Fitbit · últimos 7 días</small></div>
          <StepBars days={fitbit.steps.days} goal={fitbit.steps.goal} />

          <div className="device-subheading"><span>Calorías activas</span><small>Fitbit · kcal por día</small></div>
          <EnergyBars days={fitbit.active_energy.days} goal={fitbit.active_energy.goal} />

          <div className="device-subheading"><span>Recuperación de la pulsera</span><small>se completa al dormir</small></div>
          <div className="source-metrics fitbit-recovery">
            <Metric label="Sueño" metric={fitbit.recovery.sleep} pending="Primera noche" />
            <Metric label="HRV Fitbit" metric={fitbit.recovery.hrv} />
            <Metric label="FC reposo" metric={fitbit.recovery.resting_hr} />
          </div>

          <div className="calibration-note">
            <Moon size={15} />
            <div>
              <strong>La recuperación todavía está calibrándose</strong>
              <span>Hay {fitbit.sensor_samples.toLocaleString("es-ES")} muestras directas. Sueño, HRV y FC en reposo aparecerán cuando Fitbit tenga noches suficientes.</span>
            </div>
          </div>

          {fitbit.recovery.vo2_max && (
            <p className="derived-note">VO₂ estimado por Google: <strong>{fitbit.recovery.vo2_max.value} {fitbit.recovery.vo2_max.unit}</strong>. Es un cálculo derivado, no historial directo de la pulsera.</p>
          )}
        </article>
      </div>
    </section>
  );
}
