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
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DeviceInsights as DeviceInsightsData, DeviceMetric, RecoveryMetric } from "@/lib/types";

const axis = { fill: "var(--muted)", fontSize: 9 };

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
              <ResponsiveContainer width="100%" height={190}>
                <LineChart accessibilityLayer data={heartRate.series} margin={{ top: 12, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid vertical={false} stroke="var(--line)" />
                  <XAxis dataKey="time" minTickGap={34} tick={axis} axisLine={false} tickLine={false} />
                  <YAxis domain={["dataMin - 5", "dataMax + 5"]} tick={axis} axisLine={false} tickLine={false} width={42} />
                  <Tooltip
                    formatter={(value) => [`${value} bpm`, "Pulso"]}
                    labelFormatter={(value) => String(value)}
                    contentStyle={{ background: "var(--popover)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 12 }}
                  />
                  <Line type="monotone" dataKey="bpm" stroke="var(--viz-series-2)" strokeWidth={2.3} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
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
