import { Activity as ActivityIcon, CalendarCheck2, ChevronDown, HeartPulse, Route, TrendingUp } from "lucide-react";
import { OfflineState } from "@/components/offline-state";
import { RunAnalytics } from "@/components/run-analytics";
import { RunHistory } from "@/components/run-history";
import { getActivities, getActivitiesProgress } from "@/lib/api";
import type { RunPeriodComparison, RunPeriodMetrics } from "@/lib/types";

export const dynamic = "force-dynamic";

const oneDecimal = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function formatPace(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  const minutes = Math.floor(value);
  const rawSeconds = Math.round((value - minutes) * 60);
  const seconds = rawSeconds === 60 ? 0 : rawSeconds;
  return `${minutes + (rawSeconds === 60 ? 1 : 0)}:${String(seconds).padStart(2, "0")}`;
}

function changeLabel(value: number | null) {
  if (value === null) return "Sin base previa suficiente";
  if (value === 0) return "Sin cambios vs. período anterior";
  return `${value > 0 ? "+" : ""}${value} % vs. período anterior`;
}

function periodDetail(metrics: RunPeriodMetrics, weeklyAverage = false) {
  const runs = weeklyAverage ? `${oneDecimal.format(metrics.runs)} carreras/sem` : `${metrics.runs} ${metrics.runs === 1 ? "carrera" : "carreras"}`;
  const duration = metrics.average_duration_minutes === null ? null : `${metrics.average_duration_minutes} min de media`;
  const longest = metrics.longest_run_km > 0 ? `tirada ${oneDecimal.format(metrics.longest_run_km)} km` : null;
  const comparable = metrics.comparable_pace_min_km === null
    ? null
    : `${formatPace(metrics.comparable_pace_min_km)} min/km · ${metrics.comparable_average_heartrate} bpm`;
  return [runs, duration, longest, comparable].filter(Boolean).join(" · ");
}

function PeriodRow({ label, comparison, weeklyAverage = false }: { label: string; comparison: RunPeriodComparison; weeklyAverage?: boolean }) {
  return (
    <tr>
      <th scope="row"><strong>{label}</strong><small>{weeklyAverage ? "media semanal" : `vs. ${comparison.days} días anteriores`}</small></th>
      <td><strong>{oneDecimal.format(comparison.current.distance_km)} km{weeklyAverage ? "/sem" : ""}</strong><span>{periodDetail(comparison.current, weeklyAverage)}</span></td>
      <td><strong>{oneDecimal.format(comparison.previous.distance_km)} km{weeklyAverage ? "/sem" : ""}</strong><span>{periodDetail(comparison.previous, weeklyAverage)}</span></td>
      <td><span className={comparison.distance_change_percent !== null && comparison.distance_change_percent > 0 ? "positive" : ""}>{changeLabel(comparison.distance_change_percent)}</span></td>
    </tr>
  );
}

export default async function ActivitiesPage() {
  const result = await Promise.all([getActivities(), getActivitiesProgress()]).catch(() => null);
  if (!result) return <OfflineState />;
  const [data, progress] = result;
  const period28 = progress.periods.days_28;
  const aerobicCurrent = progress.aerobic.current;
  const longRun = progress.long_run;

  return (
    <div className="page-wrap runs-page runs-progress-page">
      <header className="simple-header section-page-header runs-page-header">
        <div>
          <span className="eyebrow">Camino a Chicago</span>
          <h1>Carreras</h1>
          <p>Tu progreso primero; cada carrera, siempre disponible.</p>
        </div>
        <div className="runs-summary" aria-label="Totales históricos contabilizados">
          <span>{progress.lifetime.runs}<small>carreras contabilizadas</small></span>
          <span>{progress.lifetime.distance_km.toFixed(0)}<small>km históricos</small></span>
        </div>
      </header>

      <section className="runs-progress-hero" aria-labelledby="runs-progress-title">
        <header>
          <div className="runs-progress-mark"><TrendingUp aria-hidden="true" size={20} /></div>
          <div>
            <span className="eyebrow">Así venís</span>
            <h2 id="runs-progress-title">{progress.summary.state}</h2>
          </div>
          <span className={`runs-state-badge state-${progress.summary.state.toLowerCase().replaceAll(" ", "-")}`}>{progress.summary.state}</span>
        </header>
        <p className="runs-progress-copy">{progress.summary.text}</p>

        <div className="run-progress-card-grid">
          <article className="run-progress-card">
            <header><span><ActivityIcon aria-hidden="true" size={16} />Volumen reciente</span></header>
            <strong>{oneDecimal.format(period28.current.distance_km)}<small> km</small></strong>
            <p>en los últimos 28 días</p>
            <footer><span>{changeLabel(period28.distance_change_percent)}</span></footer>
          </article>

          <article className="run-progress-card">
            <header><span><CalendarCheck2 aria-hidden="true" size={16} />Frecuencia</span></header>
            <strong>{oneDecimal.format(progress.consistency.runs_per_week)}<small> carreras/sem</small></strong>
            <p>{progress.consistency.active_weeks} semanas activas de las últimas 4</p>
            <footer><span>{progress.consistency.consecutive_active_weeks} semanas consecutivas</span></footer>
          </article>

          <article className="run-progress-card">
            <header><span><HeartPulse aria-hidden="true" size={16} />Eficiencia aeróbica</span></header>
            {aerobicCurrent.pace_min_km === null ? (
              <strong className="run-progress-card-empty">Datos insuficientes</strong>
            ) : (
              <strong>{formatPace(aerobicCurrent.pace_min_km)}<small> min/km</small></strong>
            )}
            <p>{aerobicCurrent.average_heartrate === null ? "para estimar tendencia" : `a ${aerobicCurrent.average_heartrate} bpm`}</p>
            <footer><span>{progress.aerobic.insight}</span></footer>
          </article>

          <article className="run-progress-card long-run-card">
            <header><span><Route aria-hidden="true" size={16} />Tirada larga</span></header>
            <strong>{oneDecimal.format(longRun.recent_km)}<small> km reciente</small></strong>
            <p>Máxima 12 semanas: {oneDecimal.format(longRun.maximum_12_weeks_km)} km</p>
            {longRun.planned_target_km !== null && longRun.target_progress_percent !== null && (
              <div className="long-run-target">
                <span>Objetivo actual del plan: {oneDecimal.format(longRun.planned_target_km)} km</span>
                <div aria-label={`${longRun.target_progress_percent}% del objetivo de tirada larga`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={longRun.target_progress_percent} role="progressbar">
                  <i style={{ width: `${longRun.target_progress_percent}%` }} />
                </div>
              </div>
            )}
            <footer><span>{longRun.change_km === null ? "Sin tirada previa comparable" : `${longRun.change_km > 0 ? "+" : ""}${oneDecimal.format(longRun.change_km)} km vs. anterior`}</span></footer>
          </article>
        </div>
      </section>

      <RunAnalytics progress={progress} />

      <details className="period-comparison-panel">
        <summary className="runs-panel-heading">
          <div><span className="eyebrow">Comparación secundaria</span><h2>Períodos equivalentes</h2><p>7 y 28 días contra ventanas de la misma duración.</p></div>
          <span className="period-panel-action">Ver comparación <ChevronDown aria-hidden="true" size={17} /></span>
        </summary>
        <div className="period-table-wrap">
          <table>
            <thead><tr><th>Ventana</th><th>Actual</th><th>Anterior</th><th>Cambio</th></tr></thead>
            <tbody>
              <PeriodRow comparison={progress.periods.days_7} label="7 días" />
              <PeriodRow comparison={progress.periods.days_28} label="28 días" />
              <PeriodRow comparison={progress.periods.average_4_weeks} label="Media 4 semanas" weeklyAverage />
            </tbody>
          </table>
        </div>
      </details>

      {data.activities.length ? (
        <RunHistory activities={data.activities} progress={progress} />
      ) : (
        <div className="empty-row">Todavía no hay carreras. Conectá Apple Health desde Ajustes.</div>
      )}
    </div>
  );
}
