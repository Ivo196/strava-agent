"use client";

import Link from "next/link";
import {
  Activity,
  ArrowRight,
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

export function DeviceInsights({ devices }: { devices: DeviceInsightsData }) {
  const apple = devices.apple_watch;
  const fitbit = devices.fitbit;
  const run = apple.latest_run;
  const dynamics = run?.dynamics ?? {};
  const heartRate = fitbit.heart_rate;

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
              <p>{apple.week.runs} {apple.week.runs === 1 ? "carrera" : "carreras"}</p>
            </div>
            <div>
              <span>Última carrera</span>
              <strong>{run?.pace ?? "—"}</strong>
              <p>{run ? `${run.distance_km} km · ${run.average_heartrate ?? "—"} bpm` : "Esperando entrenamiento"}</p>
            </div>
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
