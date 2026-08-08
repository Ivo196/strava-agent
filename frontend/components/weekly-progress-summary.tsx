import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarRange,
  CircleMinus,
  Footprints,
  Route,
  Target,
} from "lucide-react";
import { getWeeklyProgress } from "@/lib/weekly-progress";
import type { DashboardData } from "@/lib/types";

function Comparison({ percent }: { percent: number | null }) {
  if (percent == null) return <><CircleMinus size={15} /><strong>Sin base</strong></>;
  if (percent > 0) return <><ArrowUpRight size={15} /><strong>+{percent}%</strong></>;
  if (percent < 0) return <><ArrowDownRight size={15} /><strong>{percent}%</strong></>;
  return <><CircleMinus size={15} /><strong>Igual</strong></>;
}

export function WeeklyProgressSummary({ data }: { data: DashboardData }) {
  const progress = getWeeklyProgress(data);

  return (
    <section className={`weekly-progress weekly-progress-${progress.status}`} aria-labelledby="weekly-progress-title">
      <header className="weekly-progress-head">
        <div>
          <span className="apex-section-index" aria-hidden="true">02</span>
          <div>
            <small>Tu semana · {progress.rangeLabel}</small>
            <h2 id="weekly-progress-title">Cómo va tu progreso</h2>
          </div>
        </div>
        <Link href="/activities">Ver carreras <ArrowRight size={16} /></Link>
      </header>

      <div className="weekly-progress-layout">
        <div className="weekly-progress-main">
          <div className="weekly-progress-score">
            <span>Volumen</span>
            <div><strong>{progress.currentKm}</strong><small>km</small><i>{progress.percent}%</i></div>
            <p>de {progress.targetKm} km · {progress.targetLabel}</p>
          </div>
          <div
            className="weekly-progress-track"
            role="progressbar"
            aria-label={`Progreso semanal: ${progress.currentKm} de ${progress.targetKm} kilómetros`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
          >
            <i style={{ width: `${progress.percent}%` }} />
            <span aria-hidden="true" style={{ left: `${progress.percent}%` }} />
          </div>
          <p className="weekly-progress-insight">{progress.insight}</p>

          <div className="weekly-progress-stats">
            <span><Footprints size={16} /><small>Carreras</small><strong>{progress.runs}{progress.plannedRuns ? ` / ${progress.plannedRuns}` : ""}</strong></span>
            <span><Target size={16} /><small>Por completar</small><strong>{progress.remainingKm} km</strong></span>
            <span className={progress.comparisonPercent != null && progress.comparisonPercent < 0 ? "is-down" : ""}>
              <Comparison percent={progress.comparisonPercent} />
              <small>vs. semana anterior</small>
            </span>
          </div>
        </div>

        <aside className="weekly-history" aria-label="Volumen de las últimas cuatro semanas">
          <header><span><CalendarRange size={15} /> Últimas 4 semanas</span><Route size={16} /></header>
          <div className="weekly-history-chart">
            {progress.history.map((item) => (
              <span className={item.isCurrent ? "is-current" : ""} key={item.week}>
                <strong>{item.distanceKm}<small>km</small></strong>
                <i aria-hidden="true"><b style={{ height: `${item.heightPercent}%` }} /></i>
                <small>{item.isCurrent ? "Ahora" : item.label}</small>
              </span>
            ))}
          </div>
          <Link href="/plan">Abrir plan semanal <ArrowRight size={15} /></Link>
        </aside>
      </div>
    </section>
  );
}
