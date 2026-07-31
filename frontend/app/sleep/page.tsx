import { Activity, BedDouble, Clock3, Droplets, Gauge, HeartPulse, MoonStar, Thermometer, Wind, Zap } from "lucide-react";
import { MetricTrend } from "@/components/metric-trend";
import { OfflineState } from "@/components/offline-state";
import { getDashboard } from "@/lib/api";
import type { DeviceMetric } from "@/lib/types";

export const dynamic = "force-dynamic";

function metricValue(metric: DeviceMetric) {
  if (!metric) return "—";
  return `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`;
}

export default async function SleepPage() {
  const data = await getDashboard().catch(() => null);
  if (!data) return <OfflineState />;
  const sleep = data.daily_state.sleep_utility;
  const fitbit = data.devices.fitbit;
  const latest = fitbit.sleep.latest;
  const sleepTrend = sleep.trend.map((day) => ({ date: day.date, value: day.hours }));
  const hrvTrend = fitbit.recovery_history.filter((day) => day.hrv != null).map((day) => ({ date: day.date, value: day.hrv! }));
  const restingTrend = fitbit.recovery_history.filter((day) => day.resting_hr != null).map((day) => ({ date: day.date, value: day.resting_hr! }));
  const stages = [
    { label: "Profundo", value: latest?.deep_minutes ?? 0, className: "sleep-deep" },
    { label: "REM", value: latest?.rem_minutes ?? 0, className: "sleep-rem" },
    { label: "Ligero", value: latest?.light_minutes ?? 0, className: "sleep-light" },
    { label: "Despierto", value: latest?.awake_minutes ?? 0, className: "sleep-awake" },
  ];
  const stageTotal = stages.reduce((sum, stage) => sum + stage.value, 0);
  const recoveryScore = data.daily_state.morning_recovery.score;
  const stress = data.daily_state.physiological_stress;

  return (
    <div className="page-wrap recovery-page">
      <header className="simple-header section-page-header">
        <div><span className="eyebrow">Fitbit · Última sincronización {fitbit.last_seen ? "activa" : "pendiente"}</span><h1>Sueño y recuperación</h1><p>Lo que tu cuerpo hizo mientras descansabas.</p></div>
        <div className="recovery-score"><HeartPulse size={20} /><span><strong>{recoveryScore ?? "—"}</strong><small>recuperación</small></span></div>
      </header>

      <section className="recovery-hero-grid" aria-label="Resumen de sueño y recuperación">
        <article className="night-card">
          <header><span><MoonStar size={16} /> Última noche</span><time>{latest?.date ?? "Sin datos"}</time></header>
          <div className="night-total"><strong>{latest?.hours ?? sleep.average_hours ?? "—"}</strong><small>horas</small></div>
          {stageTotal > 0 && (
            <>
              <div className="sleep-stage-track" aria-label="Etapas del sueño">
                {stages.map((stage) => <i className={stage.className} key={stage.label} style={{ width: `${(stage.value / stageTotal) * 100}%` }} />)}
              </div>
              <div className="sleep-stage-legend">
                {stages.map((stage) => <span key={stage.label}><i className={stage.className} /><small>{stage.label}</small><strong>{stage.value} min</strong></span>)}
              </div>
            </>
          )}
          <footer><span><Gauge size={14} /> Eficiencia</span><strong>{latest?.efficiency != null ? `${latest.efficiency}%` : "—"}</strong></footer>
        </article>

        <article className="recovery-decision-card">
          <span>Lectura de hoy</span>
          <h2>{sleep.debt_hours != null && sleep.debt_hours >= 5 ? "Prioriza recuperar" : "Puedes seguir el plan"}</h2>
          <p>{sleep.guidance}</p>
          <div><span><Clock3 size={15} /> Deuda <strong>{sleep.debt_hours != null ? `${sleep.debt_hours} h` : "—"}</strong></span><span><Zap size={15} /> Estrés <strong>{stress.score ?? "—"}</strong></span></div>
        </article>
      </section>

      <section className="body-signals" aria-labelledby="body-signals-title">
        <div className="section-title-line"><div><span className="eyebrow">Señales nocturnas</span><h2 id="body-signals-title">Tu línea base</h2></div><small>Datos disponibles en Fitbit</small></div>
        <div className="body-signal-grid">
          <article><HeartPulse /><span>HRV</span><strong>{metricValue(fitbit.recovery.hrv)}</strong><small>Variabilidad cardiaca</small></article>
          <article><Activity /><span>Pulso en reposo</span><strong>{metricValue(fitbit.recovery.resting_hr)}</strong><small>Frente a tu línea base</small></article>
          <article><Droplets /><span>Oxígeno</span><strong>{metricValue(fitbit.recovery.oxygen)}</strong><small>Saturación nocturna</small></article>
          <article><Wind /><span>Respiración</span><strong>{metricValue(fitbit.recovery.respiratory_rate)}</strong><small>Durante el sueño</small></article>
          <article><Thermometer /><span>Temperatura</span><strong>{metricValue(fitbit.recovery.temperature)}</strong><small>Variación cutánea</small></article>
          <article><Gauge /><span>VO₂ máx</span><strong>{metricValue(fitbit.recovery.vo2_max)}</strong><small>Capacidad aeróbica</small></article>
        </div>
      </section>

      <section className="recovery-trends" aria-labelledby="recovery-trends-title">
        <div className="section-title-line"><div><span className="eyebrow">Tendencias</span><h2 id="recovery-trends-title">Noches, no anécdotas</h2></div><small>{sleep.nights} noches analizadas</small></div>
        <div className="metric-trend-grid">
          <MetricTrend title="Duración nocturna" unit="h" items={sleepTrend} tone="purple" />
          <MetricTrend title="HRV" unit="ms" items={hrvTrend} tone="cyan" />
          <MetricTrend title="Pulso en reposo" unit="bpm" items={restingTrend} tone="amber" />
        </div>
      </section>
    </div>
  );
}
